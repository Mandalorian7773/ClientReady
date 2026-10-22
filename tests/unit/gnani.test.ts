import { describe, expect, it, vi } from "vitest";
import { GnaniPrismaSTT, sanitizeBiasWords } from "@/lib/providers/gnani/prisma";
import { GnaniTimbreTTS, cleanForSpeech } from "@/lib/providers/gnani/timbre";
import { clientVoice, isKnownVoice } from "@/lib/providers/gnani/voices";
import { AppError } from "@/lib/server/errors";
import { toneWav } from "../helpers/fixtures";

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

async function codeOf(p: Promise<unknown>) {
  try {
    await p;
  } catch (e) {
    return (e as AppError).code;
  }
  return "no-error";
}

describe("Gnani Prisma STT", () => {
  const make = (fetchImpl: typeof fetch) => new GnaniPrismaSTT({ apiKey: "test-key", baseUrl: "https://api.vachana.ai", timeoutMs: 1000, fetchImpl });

  it("posts multipart audio to /stt/v3 with the documented header and fields", async () => {
    const fetchImpl = vi.fn(async () => json({ success: true, request_id: "r1", transcript: " Hello there " }));
    const out = await make(fetchImpl as unknown as typeof fetch).transcribe({ audio: toneWav(1), mimeType: "audio/wav", languageCode: "en-IN", biasWords: ["Zendesk integration"] });
    expect(out).toEqual({ transcript: "Hello there", requestId: "r1" });
    const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://api.vachana.ai/stt/v3");
    expect((init.headers as Record<string, string>)["X-API-Key-ID"]).toBe("test-key");
    const form = init.body as FormData;
    expect(form.get("language_code")).toBe("en-IN");
    expect(form.get("format")).toBe("transcribe");
    expect(form.get("audio_file")).toBeInstanceOf(Blob);
    expect(JSON.parse(String(form.get("bias_list")))).toEqual(["Zendesk", "integration"]);
    expect(form.get("bias_score")).toBe("1.0");
  });

  it("rejects languages Prisma doesn't support without calling the API", async () => {
    const fetchImpl = vi.fn();
    expect(await codeOf(make(fetchImpl as unknown as typeof fetch).transcribe({ audio: toneWav(1), mimeType: "audio/wav", languageCode: "fr-FR" }))).toBe("bad_request");
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it.each([
    [401, "auth_failed"],
    [403, "credits_exhausted"],
    [400, "bad_request"],
  ])("maps HTTP %i to %s without retrying", async (status, expected) => {
    const fetchImpl = vi.fn(async () => json({ success: false, error: { type: "x", message: "nope" } }, status));
    expect(await codeOf(make(fetchImpl as unknown as typeof fetch).transcribe({ audio: toneWav(1), mimeType: "audio/wav", languageCode: "hi-IN" }))).toBe(expected);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it("retries a 503 once, then succeeds", async () => {
    const fetchImpl = vi.fn().mockResolvedValueOnce(json({}, 503)).mockResolvedValueOnce(json({ success: true, transcript: "ok" }));
    const out = await make(fetchImpl as unknown as typeof fetch).transcribe({ audio: toneWav(1), mimeType: "audio/wav", languageCode: "en-IN" });
    expect(out.transcript).toBe("ok");
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it("does not retry 429 for STT (bounded cost) and reports rate limiting", async () => {
    const fetchImpl = vi.fn(async () => json({}, 429));
    expect(await codeOf(make(fetchImpl as unknown as typeof fetch).transcribe({ audio: toneWav(1), mimeType: "audio/wav", languageCode: "en-IN" }))).toBe("rate_limited");
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it("times out instead of hanging", async () => {
    const fetchImpl = vi.fn((_url: string, init: RequestInit) => new Promise<Response>((_, reject) => init.signal?.addEventListener("abort", () => reject(Object.assign(new Error("aborted"), { name: "AbortError" })))));
    const stt = new GnaniPrismaSTT({ apiKey: "k", baseUrl: "https://x", timeoutMs: 20, fetchImpl: fetchImpl as unknown as typeof fetch });
    expect(await codeOf(stt.transcribe({ audio: toneWav(1), mimeType: "audio/wav", languageCode: "en-IN" }))).toBe("timeout");
  });

  it("treats success:false bodies and unreadable JSON as errors", async () => {
    expect(await codeOf(make((async () => json({ success: false, error: { message: "bad" } })) as unknown as typeof fetch).transcribe({ audio: toneWav(1), mimeType: "audio/wav", languageCode: "en-IN" }))).toBe("upstream_error");
    expect(await codeOf(make((async () => new Response("<html>", { status: 200 })) as unknown as typeof fetch).transcribe({ audio: toneWav(1), mimeType: "audio/wav", languageCode: "en-IN" }))).toBe("upstream_error");
  });

  it("keeps bias words to letters-only single words", () => {
    expect(sanitizeBiasWords(["AI-Receptionist 2.0", "Dr. Sarah", "ok"])).toEqual(["Receptionist", "Sarah"]);
    expect(sanitizeBiasWords(Array.from({ length: 300 }, (_, i) => `word${"abc"[i % 3]}${String.fromCharCode(97 + (i % 26))}x${i}`)).length).toBeLessThanOrEqual(100);
  });
});

describe("Gnani Timbre TTS", () => {
  const make = (fetchImpl: typeof fetch, model = "timbre-v2.5") => new GnaniTimbreTTS({ apiKey: "test-key", baseUrl: "https://api.vachana.ai", model, timeoutMs: 1000, fetchImpl });
  const wav = () => new Response(toneWav(0.5) as BodyInit, { status: 200, headers: { "Content-Type": "audio/wav" } });

  it("posts the documented JSON body and returns audio bytes", async () => {
    const fetchImpl = vi.fn(async () => wav());
    const out = await make(fetchImpl as unknown as typeof fetch).synthesize({ text: "**Hello** there 👋", voice: "Kaveri", language: "en-IN" });
    expect(out.contentType).toBe("audio/wav");
    expect(out.audio.byteLength).toBeGreaterThan(1000);
    const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://api.vachana.ai/api/v1/tts/inference");
    expect((init.headers as Record<string, string>)["X-API-Key-ID"]).toBe("test-key");
    const body = JSON.parse(String(init.body));
    expect(body).toMatchObject({ text: "Hello there", model: "timbre-v2.5", voice: "Kaveri", language: "en-IN", speed: 1 });
    expect(body.audio_config).toEqual({ sample_rate: 24000, num_channels: 1, sample_width: 2, encoding: "linear_pcm", container: "wav" });
  });

  it("validates voice against the model's catalog before calling the API", async () => {
    const fetchImpl = vi.fn();
    expect(await codeOf(make(fetchImpl as unknown as typeof fetch).synthesize({ text: "hi", voice: "Riyaa", language: "en-IN" }))).toBe("bad_request");
    expect(await codeOf(make(fetchImpl as unknown as typeof fetch, "timbre-v3.0").synthesize({ text: "hi", voice: "Kaveri", language: "en-IN" }))).toBe("bad_request");
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("rejects empty or oversized text and unsupported languages", async () => {
    const f = vi.fn() as unknown as typeof fetch;
    expect(await codeOf(make(f).synthesize({ text: "  ", voice: "Kaveri", language: "en-IN" }))).toBe("bad_request");
    expect(await codeOf(make(f).synthesize({ text: "a".repeat(1000), voice: "Kaveri", language: "en-IN" }))).toBe("bad_request");
    expect(await codeOf(make(f).synthesize({ text: "hi", voice: "Kaveri", language: "en-US" }))).toBe("bad_request");
  });

  it("treats a JSON body or empty audio as an error", async () => {
    expect(await codeOf(make((async () => json({ success: false })) as unknown as typeof fetch).synthesize({ text: "hi", voice: "Kaveri", language: "en-IN" }))).toBe("upstream_error");
    expect(await codeOf(make((async () => new Response(new Uint8Array(10) as BodyInit, { headers: { "Content-Type": "audio/wav" } })) as unknown as typeof fetch).synthesize({ text: "hi", voice: "Kaveri", language: "en-IN" }))).toBe("upstream_error");
  });

  it("maps 403 to a friendly credits/access error", async () => {
    expect(await codeOf(make((async () => json({ success: false }, 403)) as unknown as typeof fetch).synthesize({ text: "hi", voice: "Kaveri", language: "en-IN" }))).toBe("credits_exhausted");
  });

  it("strips markdown, emoji and stage directions", () => {
    expect(cleanForSpeech("**Sure** [laughs] that's _fine_ 😀 (sighs heavily) ok")).toBe("Sure that's _fine_ ok");
  });

  it("picks catalog voices for both models", () => {
    expect(isKnownVoice("timbre-v2.5", clientVoice("timbre-v2.5", "male", 3))).toBe(true);
    expect(isKnownVoice("timbre-v3.0", clientVoice("timbre-v3.0", "female", 7))).toBe(true);
  });
});
