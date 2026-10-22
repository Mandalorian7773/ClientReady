/**
 * Prevents generating (and paying for) the same client turn twice. The
 * browser sends `${sessionId}:${turnIndex}`; a repeat of an in-flight or
 * completed key returns the same promise/result instead of calling the model.
 */
const MAX_ENTRIES = 500;
const TTL_MS = 15 * 60_000;

interface Entry<T> {
  at: number;
  value: Promise<T>;
}

const store = new Map<string, Entry<unknown>>();

export function once<T>(key: string, fn: () => Promise<T>, now = Date.now()): { value: Promise<T>; replayed: boolean } {
  const existing = store.get(key) as Entry<T> | undefined;
  if (existing && now - existing.at < TTL_MS) return { value: existing.value, replayed: true };

  const value = fn();
  store.set(key, { at: now, value });
  // Failed attempts must be retryable, so drop them from the cache.
  value.catch(() => store.delete(key));

  if (store.size > MAX_ENTRIES) {
    const oldest = store.keys().next().value;
    if (oldest) store.delete(oldest);
  }
  return { value, replayed: false };
}

export function clearIdempotency() {
  store.clear();
}
