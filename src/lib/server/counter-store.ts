import "server-only";
import { Redis } from "@upstash/redis";

/**
 * Durable counters for credit protection. Uses Upstash Redis when
 * UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN are set, so limits hold
 * across Vercel instances. Otherwise falls back to process memory (per
 * instance) and logs one warning. A store error never crashes a request: the
 * memory store takes over for that call.
 */
export interface CounterStore {
  readonly durable: boolean;
  /** Add `by` to a counter and return the new value. Sets the TTL when the key is new. */
  incr(key: string, by: number, ttlSeconds: number): Promise<number>;
  get(key: string): Promise<number>;
  /** Set a flag if absent. Returns true when this call created it. */
  setFlag(key: string, ttlSeconds: number): Promise<boolean>;
  hasFlag(key: string): Promise<boolean>;
}

export class MemoryStore implements CounterStore {
  readonly durable = false;
  private data = new Map<string, { value: number; expiresAt: number }>();
  constructor(private now: () => number = Date.now) {}

  private live(key: string) {
    const e = this.data.get(key);
    if (e && e.expiresAt <= this.now()) {
      this.data.delete(key);
      return undefined;
    }
    return e;
  }

  async incr(key: string, by: number, ttlSeconds: number) {
    const e = this.live(key);
    const value = (e?.value ?? 0) + by;
    this.data.set(key, { value, expiresAt: e?.expiresAt ?? this.now() + ttlSeconds * 1000 });
    if (this.data.size > 20_000) {
      for (const [k] of this.data) if (!this.live(k)) this.data.delete(k);
    }
    return value;
  }

  async get(key: string) {
    return this.live(key)?.value ?? 0;
  }

  async setFlag(key: string, ttlSeconds: number) {
    if (this.live(key)) return false;
    this.data.set(key, { value: 1, expiresAt: this.now() + ttlSeconds * 1000 });
    return true;
  }

  async hasFlag(key: string) {
    return !!this.live(key);
  }

  clear() {
    this.data.clear();
  }
}

export class UpstashStore implements CounterStore {
  readonly durable = true;
  constructor(
    private redis: Redis,
    private fallback: MemoryStore,
  ) {}

  private async safe<T>(op: () => Promise<T>, alt: () => Promise<T>): Promise<T> {
    try {
      return await op();
    } catch (e) {
      console.warn("[limits] Upstash request failed, using in-memory counters for this call:", e instanceof Error ? e.message.slice(0, 120) : e);
      return alt();
    }
  }

  incr(key: string, by: number, ttlSeconds: number) {
    return this.safe(
      async () => {
        const v = await this.redis.incrby(key, by);
        if (v === by) await this.redis.expire(key, ttlSeconds);
        return v;
      },
      () => this.fallback.incr(key, by, ttlSeconds),
    );
  }

  get(key: string) {
    return this.safe(
      async () => Number((await this.redis.get<number | string>(key)) ?? 0),
      () => this.fallback.get(key),
    );
  }

  setFlag(key: string, ttlSeconds: number) {
    return this.safe(
      async () => (await this.redis.set(key, 1, { ex: ttlSeconds, nx: true })) === "OK",
      () => this.fallback.setFlag(key, ttlSeconds),
    );
  }

  hasFlag(key: string) {
    return this.safe(
      async () => (await this.redis.exists(key)) === 1,
      () => this.fallback.hasFlag(key),
    );
  }
}

let store: CounterStore | null = null;
const memory = new MemoryStore();

export function getStore(): CounterStore {
  if (store) return store;
  const url = process.env.UPSTASH_REDIS_REST_URL?.trim();
  const token = process.env.UPSTASH_REDIS_REST_TOKEN?.trim();
  if (url && token) {
    store = new UpstashStore(new Redis({ url, token }), memory);
  } else {
    console.warn("[limits] UPSTASH_REDIS_REST_URL/TOKEN not set: using in-memory counters (per instance, reset on restart).");
    store = memory;
  }
  return store;
}

/** Tests only. */
export function setStoreForTests(s: CounterStore | null) {
  store = s;
}
