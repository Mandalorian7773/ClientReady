import "server-only";
import { createHash } from "node:crypto";
import { AppError } from "./errors";
import { getStore } from "./counter-store";
import { istDay, secondsUntilIstMidnight } from "./ist-day";
import { liveBlockedMessage, type LiveReason } from "@/lib/live-messages";

/**
 * Credit protection for the public demo.
 *
 * Every live call claims a session slot first (per visitor and global daily
 * limits, plus a kill switch). Every paid API route then checks that its
 * session was claimed and stays within per-session caps sized to the 10-minute
 * call. Usage is counted per IST day so it can be compared with the Gnani
 * dashboard. Raw IPs are never stored: visitors are a salted SHA-256.
 */

export type { LiveReason };

/** Per-session caps for one call of at most 10 minutes (plus the report page afterwards). */
export const SESSION_CAPS = {
  stt: 150, // requests: one per utterance segment
  sttSeconds: 660, // audio seconds sent to Prisma (10-minute call + margin)
  turn: 40, // client turns, incl. opening and retries (max 22 answers)
  tts: 40, // REST synthesis: "Listen" buttons and debrief replay on the report
  ttsStream: 80, // streamed client lines + spoken debrief segments
  ttsChars: 30_000, // characters sent to Timbre across both TTS routes
  report: 4,
} as const;

export type CapKind = "stt" | "turn" | "tts" | "ttsStream" | "report";

/** A claimed session stays usable for a day, so the report page can replay audio. */
const SESSION_TTL_SECONDS = 24 * 60 * 60;
/** Usage counters are kept for two weeks for comparison with the Gnani dashboard. */
const USAGE_TTL_SECONDS = 14 * 24 * 60 * 60;
const SESSION_ID = /^[a-zA-Z0-9_-]{8,64}$/;

export function liveConfig() {
  const num = (name: string, def: number) => {
    const v = Number(process.env[name]);
    return Number.isFinite(v) && v >= 0 ? Math.floor(v) : def;
  };
  return {
    paused: (process.env.LIVE_MODE ?? "").trim().toLowerCase() === "off",
    perVisitor: num("LIVE_SESSIONS_PER_VISITOR_PER_DAY", 3),
    global: num("LIVE_SESSIONS_PER_DAY", 60),
  };
}

let warnedSalt = false;
/** Salted SHA-256 of the client IP. The raw IP is never stored or logged. */
export function visitorId(req: Request): string {
  const fwd = req.headers.get("x-forwarded-for");
  const ip = (fwd?.split(",")[0] ?? req.headers.get("x-real-ip") ?? "local").trim();
  let salt = process.env.VISITOR_HASH_SALT?.trim();
  if (!salt) {
    if (!warnedSalt) {
      console.warn("[limits] VISITOR_HASH_SALT not set: using a built-in salt. Set your own secret salt in production.");
      warnedSalt = true;
    }
    salt = "clientready-default-salt";
  }
  return createHash("sha256").update(`${salt}:${ip}`).digest("hex").slice(0, 32);
}

const keys = {
  visitor: (day: string, v: string) => `cr:live:${day}:v:${v}`,
  global: (day: string) => `cr:live:${day}:all`,
  session: (id: string) => `cr:sess:${id}`,
  cap: (id: string, kind: string) => `cr:sess:${id}:${kind}`,
  usage: (day: string, metric: UsageMetric) => `cr:usage:${day}:${metric}`,
};

export type UsageMetric = "sessions" | "stt_seconds_x10" | "tts_chars";

export interface Availability {
  live_available: boolean;
  live_reason: LiveReason | null;
  per_visitor_limit: number;
}

export async function availability(req: Request, now = Date.now()): Promise<Availability> {
  const cfg = liveConfig();
  const base = { per_visitor_limit: cfg.perVisitor };
  if (cfg.paused) return { ...base, live_available: false, live_reason: "paused" };
  const store = getStore();
  const day = istDay(now);
  if ((await store.get(keys.global(day))) >= cfg.global) return { ...base, live_available: false, live_reason: "daily_limit" };
  if ((await store.get(keys.visitor(day, visitorId(req)))) >= cfg.perVisitor) {
    return { ...base, live_available: false, live_reason: "visitor_limit" };
  }
  return { ...base, live_available: true, live_reason: null };
}

/**
 * Claim a live session. Idempotent per session id. Throws a 429 AppError whose
 * code says why when no slot is available.
 */
export async function claimSession(req: Request, sessionId: string, now = Date.now()): Promise<void> {
  if (!SESSION_ID.test(sessionId)) throw new AppError("bad_request", "Invalid session id.");
  const store = getStore();
  if (await store.hasFlag(keys.session(sessionId))) return;

  const cfg = liveConfig();
  if (cfg.paused) throw liveError("paused");
  const day = istDay(now);
  const ttl = secondsUntilIstMidnight(now) + 60;

  const vKey = keys.visitor(day, visitorId(req));
  if ((await store.incr(vKey, 1, ttl)) > cfg.perVisitor) {
    await store.incr(vKey, -1, ttl);
    throw liveError("visitor_limit");
  }
  const gKey = keys.global(day);
  if ((await store.incr(gKey, 1, ttl)) > cfg.global) {
    await store.incr(gKey, -1, ttl);
    await store.incr(vKey, -1, ttl);
    throw liveError("daily_limit");
  }
  await store.setFlag(keys.session(sessionId), SESSION_TTL_SECONDS);
  await addUsage("sessions", 1, now);
}

export function liveError(reason: LiveReason): AppError {
  return new AppError(`live_${reason}`, liveBlockedMessage(reason, liveConfig().perVisitor), 429);
}

/**
 * Check a paid request against its session: the session must have been
 * claimed, and the per-session cap for `kind` must not be exceeded.
 * `amount` adds to a second budget (audio seconds or characters).
 */
let warnedClaims = false;

export async function chargeSession(
  sessionId: unknown,
  kind: CapKind,
  amount?: { budget: "sttSeconds" | "ttsChars"; value: number },
): Promise<void> {
  if (typeof sessionId !== "string" || !SESSION_ID.test(sessionId)) {
    throw new AppError("session_required", "This request needs an active practice session. Start a call first.", 429);
  }
  const store = getStore();
  // The claim check needs storage shared by every route. On Vercel each route
  // is a separate function, so in-memory claims made by /api/session are
  // invisible here; without Upstash we skip this check rather than refuse
  // every call. Per-session caps below still apply (per instance).
  if (store.durable) {
    if (!(await store.hasFlag(keys.session(sessionId)))) {
      throw new AppError("session_required", "This practice session isn't active. Start a new call to continue.", 429);
    }
  } else if (!warnedClaims) {
    warnedClaims = true;
    console.warn("[limits] No shared store: session claims can't be checked across routes. Set UPSTASH_REDIS_REST_URL/TOKEN to enforce them.");
  }
  if ((await store.incr(keys.cap(sessionId, kind), 1, SESSION_TTL_SECONDS)) > SESSION_CAPS[kind]) {
    throw new AppError("session_limit", "This session has reached its usage limit. Start a new call to keep practising.", 429);
  }
  if (amount && amount.value > 0) {
    const used = await store.incr(keys.cap(sessionId, amount.budget), Math.ceil(amount.value), SESSION_TTL_SECONDS);
    if (used > SESSION_CAPS[amount.budget]) {
      throw new AppError("session_limit", "This session has reached its usage limit. Start a new call to keep practising.", 429);
    }
  }
}

export async function addUsage(metric: UsageMetric, by: number, now = Date.now()) {
  if (by <= 0) return;
  await getStore().incr(keys.usage(istDay(now), metric), Math.round(by), USAGE_TTL_SECONDS);
}

export async function usageReport(days = 7, now = Date.now()) {
  const store = getStore();
  const out = [];
  for (let i = 0; i < days; i++) {
    const day = istDay(now - i * 86_400_000);
    const [sessions, sttX10, ttsChars] = await Promise.all([
      store.get(keys.usage(day, "sessions")),
      store.get(keys.usage(day, "stt_seconds_x10")),
      store.get(keys.usage(day, "tts_chars")),
    ]);
    out.push({ day, live_sessions_started: sessions, stt_audio_seconds: sttX10 / 10, tts_characters: ttsChars });
  }
  return { timezone: "Asia/Kolkata (IST)", durable: store.durable, limits: liveConfig(), days: out };
}
