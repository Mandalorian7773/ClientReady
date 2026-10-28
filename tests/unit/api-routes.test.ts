import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { scenario, sampleTurns, toneWav } from "../helpers/fixtures";
import { resetRateLimits } from "@/lib/server/rate-limit";
import { clearIdempotency } from "@/lib/server/idempotency";

const ENV_KEYS = ["GNANI_COACH_VOICE", "GNANI_API_KEY", "ANTHROPIC_API_KEY", "GEMINI_API_KEY", "GOOGLE_API_KEY", "REASONING_PROVIDER", "OPENAI_COMPAT_BASE_URL", "OPENAI_COMPAT_MODEL", "RATE_LIMIT_PER_MINUTE"];
let saved: Record<string, string | undefined>;

beforeEach(() => {
  saved = Object.fromEntries(ENV_KEYS.map((k) => [k, process.env[k]]));
  for (const k of ENV_KEYS) delete process.env[k];
  resetRateLimits();
  clearIdempotency();
});
afterEach(() => {
  for (const k of ENV_KEYS) {
    if (saved[k] === undefined) delete process.env[k];
    else process.env[k] = saved[k];
  }
});

const post = (url: string, body: unknown) =>
  new Request(`http://localhost${url}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });

describe("/api/status", () => {
  it("reports demo mode with no keys and never leaks secrets", async () => {
    process.env.GNANI_API_KEY = "gk_secret_value_123";
    const { GET } = await import("@/app/api/status/route");
    const res = await GET();
    const text = await res.text();
    expect(text).not.toContain("gk_secret_value_123");
    const body = JSON.parse(text);
    expect(body.stt.configured).toBe(true);
    expect(body.reasoning.isDemo).toBe(true);
    expect(body.reasoning.label).toMatch(/not an LLM/);
  });

  it("selects Anthropic when its key is present, OpenAI-compatible when configured", async () => {
    const { publicStatus } = await import("@/lib/server/env");
    process.env.OPENAI_COMPAT_BASE_URL = "http://localhost:8000/v1";
    process.env.OPENAI_COMPAT_MODEL = "gnani/gnani-evon-v3.3-30B-A3B";
    expect(publicStatus().reasoning.provider).toBe("openai-compatible");
    process.env.ANTHROPIC_API_KEY = "sk-test";
    expect(publicStatus().reasoning.provider).toBe("anthropic");
  });
});

describe("/api/turn", () => {
  it("returns a demo client reply with a valid payload", async () => {
    const { POST } = await import("@/app/api/turn/route");
    const res = await POST(post("/api/turn", { sessionId: "s_test12345", scenario, turns: [], clientState: null }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.isDemo).toBe(true);
    expect(body.reply).toContain("Sarah");
  });

  it("replays instead of regenerating a duplicate submission", async () => {
    const { POST } = await import("@/app/api/turn/route");
    const payload = { sessionId: "s_dup123456", scenario, turns: sampleTurns.slice(0, 2), clientState: null };
    const a = await (await POST(post("/api/turn", payload))).json();
    const b = await (await POST(post("/api/turn", payload))).json();
    expect(a.replayed).toBe(false);
    expect(b.replayed).toBe(true);
    expect(b.reply).toBe(a.reply);
  });

  it("validates input on the server", async () => {
    const { POST } = await import("@/app/api/turn/route");
    const bad = await POST(post("/api/turn", { sessionId: "x", scenario, turns: [] }));
    expect(bad.status).toBe(400);
    const tooLong = await POST(post("/api/turn", { sessionId: "s_test12345", scenario, turns: [{ ...sampleTurns[0], text: "x".repeat(5000) }] }));
    expect(tooLong.status).toBe(400);
    const notJson = await POST(new Request("http://localhost/api/turn", { method: "POST", body: "{nope" }));
    expect((await notJson.json()).error.code).toBe("bad_request");
  });

  it("rate-limits bursts", async () => {
    process.env.RATE_LIMIT_PER_MINUTE = "2";
    const { POST } = await import("@/app/api/turn/route");
    const mk = (i: number) => post("/api/turn", { sessionId: `s_rate${i}00000`, scenario, turns: [], clientState: null });
    expect((await POST(mk(1))).status).toBe(200);
    expect((await POST(mk(2))).status).toBe(200);
    const third = await POST(mk(3));
    expect(third.status).toBe(429);
    expect((await third.json()).error.retryable).toBe(true);
  });
});

describe("/api/stt and /api/tts without Gnani credentials", () => {
  it("STT explains exactly what is missing", async () => {
    const { POST } = await import("@/app/api/stt/route");
    const form = new FormData();
    form.append("audio", new Blob([toneWav(1.5) as BlobPart], { type: "audio/wav" }), "a.wav");
    form.append("language", "en");
    const res = await POST(new Request("http://localhost/api/stt", { method: "POST", body: form }));
    expect(res.status).toBe(503);
    const body = await res.json();
    expect(body.error.code).toBe("not_configured");
    expect(body.error.message).toContain("GNANI_API_KEY");
  });

  it("STT validates audio before checking credentials or spending credits", async () => {
    const { POST } = await import("@/app/api/stt/route");
    const form = new FormData();
    form.append("audio", new Blob([new Uint8Array(100)], { type: "audio/webm" }), "a.webm");
    form.append("language", "en");
    const res = await POST(new Request("http://localhost/api/stt", { method: "POST", body: form }));
    expect((await res.json()).error.code).toBe("bad_audio");
  });

  it("STT rejects unsupported languages", async () => {
    const { POST } = await import("@/app/api/stt/route");
    const form = new FormData();
    form.append("audio", new Blob([toneWav(1.5) as BlobPart], { type: "audio/wav" }), "a.wav");
    form.append("language", "fr");
    expect((await POST(new Request("http://localhost/api/stt", { method: "POST", body: form }))).status).toBe(400);
  });

  it("TTS validates input and reports missing configuration", async () => {
    const { POST } = await import("@/app/api/tts/route");
    expect((await POST(post("/api/tts", { text: "" }))).status).toBe(400);
    const res = await POST(post("/api/tts", { text: "Hello", kind: "client" }));
    expect(res.status).toBe(503);
    expect((await res.json()).error.code).toBe("not_configured");
  });
});

describe("/api/tts/stream", () => {
  it("validates input and reports missing configuration", async () => {
    const { POST } = await import("@/app/api/tts/stream/route");
    expect((await POST(post("/api/tts/stream", { text: "" }))).status).toBe(400);
    const res = await POST(post("/api/tts/stream", { text: "Hello", kind: "coach" }));
    expect(res.status).toBe(503);
    expect((await res.json()).error.code).toBe("not_configured");
  });

  it("streams the upstream SSE body with the sample rate and voice", async () => {
    process.env.GNANI_API_KEY = "test-key";
    const sse = 'event: chunk\ndata: {"audio":"AAA="}\n\nevent: complete\ndata: {"audio":""}\n\n';
    const spy = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(sse, { status: 200, headers: { "Content-Type": "text/event-stream" } }));
    const { POST } = await import("@/app/api/tts/stream/route");
    const res = await POST(post("/api/tts/stream", { text: "Here is your debrief.", kind: "coach", language: "en-IN" }));
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toBe("text/event-stream");
    expect(res.headers.get("X-Sample-Rate")).toBe("24000");
    expect(res.headers.get("X-TTS-Voice")).toBe("Trupti");
    expect(await res.text()).toBe(sse);
    expect(JSON.parse(String((spy.mock.calls[0][1] as RequestInit).body)).voice).toBe("Trupti");
  });
});

describe("/api/stt with a mocked Gnani backend", () => {
  it("returns the transcript and duration", async () => {
    process.env.GNANI_API_KEY = "test-key";
    const spy = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(JSON.stringify({ success: true, transcript: "hello client", request_id: "r" }), { status: 200 }));
    const { POST } = await import("@/app/api/stt/route");
    const form = new FormData();
    form.append("audio", new Blob([toneWav(2) as BlobPart], { type: "audio/wav" }), "a.wav");
    form.append("language", "hinglish");
    const res = await POST(new Request("http://localhost/api/stt", { method: "POST", body: form }));
    const body = await res.json();
    expect(body).toMatchObject({ transcript: "hello client", durationSec: 2, provider: "Gnani Prisma v2.5", languageCode: "en-IN" });
    expect(spy).toHaveBeenCalledOnce();
  });

  it("returns 422 when Prisma hears nothing", async () => {
    process.env.GNANI_API_KEY = "test-key";
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(JSON.stringify({ success: true, transcript: "" }), { status: 200 }));
    const { POST } = await import("@/app/api/stt/route");
    const form = new FormData();
    form.append("audio", new Blob([toneWav(2) as BlobPart], { type: "audio/wav" }), "a.wav");
    form.append("language", "en");
    const res = await POST(new Request("http://localhost/api/stt", { method: "POST", body: form }));
    expect(res.status).toBe(422);
  });
});

describe("/api/report", () => {
  it("generates a demo report and marks it as demo", async () => {
    const { POST } = await import("@/app/api/report/route");
    const res = await POST(post("/api/report", { sessionId: "s_report1234", scenario, turns: sampleTurns, clientState: { interest: 60, phase: "closing", raisedConcernIds: [], ended: true, outcome: "next-step-agreed", notes: [] } }));
    expect(res.status).toBe(200);
    const r = await res.json();
    expect(r.isDemo).toBe(true);
    expect(r.categories).toHaveLength(9);
    expect(r.spoken[0].text).toMatch(/^The conversation between you and the client has now ended/);
  });
});
