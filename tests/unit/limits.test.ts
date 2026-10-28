import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MemoryStore, setStoreForTests } from "@/lib/server/counter-store";
import { istDay, secondsUntilIstMidnight } from "@/lib/server/ist-day";
import { addUsage, availability, claimSession, SESSION_CAPS, usageReport, chargeSession, visitorId } from "@/lib/server/live-gate";
import { resetRateLimits } from "@/lib/server/rate-limit";
import { toneWav } from "../helpers/fixtures";

const ENV = ["LIVE_MODE", "LIVE_SESSIONS_PER_DAY", "LIVE_SESSIONS_PER_VISITOR_PER_DAY", "VISITOR_HASH_SALT", "ADMIN_TOKEN", "GNANI_API_KEY"];
let saved: Record<string, string | undefined>;
let clock: number;
let store: MemoryStore;

const req = (ip = "203.0.113.7") => new Request("http://localhost/api/session", { headers: { "x-forwarded-for": `${ip}, 10.0.0.1` } });
const code = async (p: Promise<unknown>) => {
  try {
    await p;
    return "ok";
  } catch (e) {
    return (e as { code: string }).code;
  }
};

beforeEach(() => {
  saved = Object.fromEntries(ENV.map((k) => [k, process.env[k]]));
  for (const k of ENV) delete process.env[k];
  clock = Date.UTC(2026, 9, 29, 6, 0, 0); // 11:30 IST, 29 Oct
  store = new MemoryStore(() => clock);
  setStoreForTests(store);
  resetRateLimits();
});
afterEach(() => {
  for (const k of ENV) {
    if (saved[k] === undefined) delete process.env[k];
    else process.env[k] = saved[k];
  }
  setStoreForTests(null);
});

describe("IST day rollover", () => {
  it("changes day at 18:30 UTC (midnight IST), not at UTC midnight", () => {
    expect(istDay(Date.UTC(2026, 9, 29, 18, 29, 59))).toBe("2026-10-29");
    expect(istDay(Date.UTC(2026, 9, 29, 18, 30, 0))).toBe("2026-10-30");
    expect(istDay(Date.UTC(2026, 9, 29, 23, 0, 0))).toBe("2026-10-30");
  });

  it("counts seconds until the next IST midnight", () => {
    expect(secondsUntilIstMidnight(Date.UTC(2026, 9, 29, 18, 29, 0))).toBe(60);
    expect(secondsUntilIstMidnight(Date.UTC(2026, 9, 29, 18, 30, 0))).toBe(86_400);
  });
});

describe("MemoryStore", () => {
  it("increments, expires keys and handles flags", async () => {
    expect(await store.incr("a", 2, 10)).toBe(2);
    expect(await store.incr("a", 3, 10)).toBe(5);
    expect(await store.setFlag("f", 10)).toBe(true);
    expect(await store.setFlag("f", 10)).toBe(false);
    clock += 11_000;
    expect(await store.get("a")).toBe(0);
    expect(await store.hasFlag("f")).toBe(false);
  });
});

describe("visitor id", () => {
  it("is a salted hash of the first forwarded IP and never contains the IP", () => {
    process.env.VISITOR_HASH_SALT = "s1";
    const a = visitorId(req("198.51.100.4"));
    expect(a).toMatch(/^[0-9a-f]{32}$/);
    expect(a).not.toContain("198");
    expect(visitorId(req("198.51.100.4"))).toBe(a);
    expect(visitorId(req("198.51.100.5"))).not.toBe(a);
    process.env.VISITOR_HASH_SALT = "s2";
    expect(visitorId(req("198.51.100.4"))).not.toBe(a);
  });
});

describe("live session gate", () => {
  it("allows 3 calls per visitor per IST day by default, then resets at midnight IST", async () => {
    for (let i = 0; i < 3; i++) expect(await code(claimSession(req(), `s_visit000${i}`, clock))).toBe("ok");
    expect(await code(claimSession(req(), "s_visit0004", clock))).toBe("live_visitor_limit");
    expect((await availability(req(), clock)).live_reason).toBe("visitor_limit");
    expect((await availability(req("192.0.2.9"), clock)).live_available).toBe(true);
    clock = Date.UTC(2026, 9, 29, 18, 30, 1); // just after midnight IST
    expect(await code(claimSession(req(), "s_visit0005", clock))).toBe("ok");
  });

  it("is idempotent per session id and doesn't use up slots on retry", async () => {
    expect(await code(claimSession(req(), "s_same00001", clock))).toBe("ok");
    expect(await code(claimSession(req(), "s_same00001", clock))).toBe("ok");
    expect(await code(claimSession(req(), "s_same00002", clock))).toBe("ok");
    expect(await code(claimSession(req(), "s_same00003", clock))).toBe("ok");
  });

  it("enforces the global daily limit across visitors without counting refused calls", async () => {
    process.env.LIVE_SESSIONS_PER_DAY = "2";
    expect(await code(claimSession(req("192.0.2.1"), "s_global001", clock))).toBe("ok");
    expect(await code(claimSession(req("192.0.2.2"), "s_global002", clock))).toBe("ok");
    expect(await code(claimSession(req("192.0.2.3"), "s_global003", clock))).toBe("live_daily_limit");
    expect((await availability(req("192.0.2.4"), clock)).live_reason).toBe("daily_limit");
    // The refused visitor kept their own allowance.
    process.env.LIVE_SESSIONS_PER_DAY = "3";
    expect(await code(claimSession(req("192.0.2.3"), "s_global004", clock))).toBe("ok");
  });

  it("LIVE_MODE=off blocks every new call", async () => {
    process.env.LIVE_MODE = "off";
    expect(await code(claimSession(req(), "s_paused001", clock))).toBe("live_paused");
    expect(await availability(req(), clock)).toMatchObject({ live_available: false, live_reason: "paused" });
  });

  it("counts sessions in the usage report", async () => {
    await claimSession(req(), "s_usage0001", clock);
    await addUsage("stt_seconds_x10", 125, clock);
    await addUsage("tts_chars", 300, clock);
    const r = await usageReport(2, clock);
    expect(r.days[0]).toEqual({ day: "2026-10-29", live_sessions_started: 1, stt_audio_seconds: 12.5, tts_characters: 300 });
    expect(r.durable).toBe(false);
  });
});

describe("per-session caps", () => {
  it("rejects requests without a claimed session", async () => {
    expect(await code(chargeSession(undefined, "turn"))).toBe("session_required");
    expect(await code(chargeSession("bad id", "turn"))).toBe("session_required");
    expect(await code(chargeSession("s_unclaimed1", "turn"))).toBe("session_required");
  });

  it("caps requests and budgets per session", async () => {
    await claimSession(req(), "s_capped001", clock);
    for (let i = 0; i < SESSION_CAPS.report; i++) expect(await code(chargeSession("s_capped001", "report"))).toBe("ok");
    expect(await code(chargeSession("s_capped001", "report"))).toBe("session_limit");
    expect(await code(chargeSession("s_capped001", "tts", { budget: "ttsChars", value: SESSION_CAPS.ttsChars - 10 }))).toBe("ok");
    expect(await code(chargeSession("s_capped001", "ttsStream", { budget: "ttsChars", value: 20 }))).toBe("session_limit");
    expect(await code(chargeSession("s_capped001", "stt", { budget: "sttSeconds", value: SESSION_CAPS.sttSeconds + 1 }))).toBe("session_limit");
  });
});

describe("routes", () => {
  const post = (url: string, body: unknown, ip?: string) =>
    new Request(`http://localhost${url}`, { method: "POST", headers: { "Content-Type": "application/json", ...(ip ? { "x-forwarded-for": ip } : {}) }, body: JSON.stringify(body) });

  it("/api/session claims and refuses with a true reason", async () => {
    const { POST } = await import("@/app/api/session/route");
    expect((await POST(post("/api/session", { sessionId: "s_route0001" }, "192.0.2.50"))).status).toBe(200);
    process.env.LIVE_MODE = "off";
    const res = await POST(post("/api/session", { sessionId: "s_route0002" }, "192.0.2.50"));
    expect(res.status).toBe(429);
    const body = await res.json();
    expect(body.error.code).toBe("live_paused");
    expect(body.error.message).toBe("Live calls are paused for today to protect API credits. You can still hear the full sample call.");
  });

  it("/api/status reports live availability", async () => {
    const { GET } = await import("@/app/api/status/route");
    process.env.LIVE_MODE = "off";
    const body = await (await GET(new Request("http://localhost/api/status"))).json();
    expect(body).toMatchObject({ live_available: false, live_reason: "paused" });
  });

  it("paid routes answer 429 without a claimed session", async () => {
    const turn = (await import("@/app/api/turn/route")).POST;
    const tts = (await import("@/app/api/tts/route")).POST;
    const stream = (await import("@/app/api/tts/stream/route")).POST;
    const report = (await import("@/app/api/report/route")).POST;
    const stt = (await import("@/app/api/stt/route")).POST;
    expect((await turn(post("/api/turn", { sessionId: "s_nosession1", scenario: {}, turns: [], clientState: null }))).status).toBe(429);
    expect((await tts(post("/api/tts", { text: "Hi" }))).status).toBe(429);
    expect((await stream(post("/api/tts/stream", { text: "Hi", sessionId: "s_nosession1" }))).status).toBe(429);
    expect((await report(post("/api/report", { sessionId: "s_nosession1", scenario: {}, turns: [{ index: 0, role: "client", text: "a" }, { index: 1, role: "learner", text: "b" }], clientState: {} }))).status).toBe(429);
    const form = new FormData();
    form.append("audio", new Blob([toneWav(1.5) as BlobPart], { type: "audio/wav" }), "a.wav");
    form.append("language", "en");
    expect((await stt(new Request("http://localhost/api/stt", { method: "POST", body: form }))).status).toBe(429);
  });

  it("counts STT seconds and TTS characters when credits are spent", async () => {
    process.env.GNANI_API_KEY = "k";
    await claimSession(req(), "s_count0001", clock);
    vi.spyOn(globalThis, "fetch").mockImplementation(async (url) =>
      String(url).includes("/stt/")
        ? new Response(JSON.stringify({ success: true, transcript: "hello" }), { status: 200 })
        : new Response(toneWav(0.5) as BodyInit, { status: 200, headers: { "Content-Type": "audio/wav" } }),
    );
    const form = new FormData();
    form.append("audio", new Blob([toneWav(2) as BlobPart], { type: "audio/wav" }), "a.wav");
    form.append("language", "en");
    form.append("sessionId", "s_count0001");
    expect((await (await import("@/app/api/stt/route")).POST(new Request("http://localhost/api/stt", { method: "POST", body: form }))).status).toBe(200);
    expect((await (await import("@/app/api/tts/route")).POST(post("/api/tts", { text: "Hello there", sessionId: "s_count0001" }))).status).toBe(200);
    const day = (await usageReport(1, Date.now())).days[0];
    expect(day.stt_audio_seconds).toBe(2);
    expect(day.tts_characters).toBe(11);
    vi.restoreAllMocks();
  });

  it("/api/usage requires the admin token", async () => {
    const { GET } = await import("@/app/api/usage/route");
    expect((await GET(new Request("http://localhost/api/usage"))).status).toBe(401);
    process.env.ADMIN_TOKEN = "secret-token";
    expect((await GET(new Request("http://localhost/api/usage", { headers: { "x-admin-token": "wrong" } }))).status).toBe(401);
    const ok = await GET(new Request("http://localhost/api/usage", { headers: { "x-admin-token": "secret-token" } }));
    expect(ok.status).toBe(200);
    const body = await ok.json();
    expect(body.days).toHaveLength(7);
    expect(body.timezone).toMatch(/IST/);
  });
});
