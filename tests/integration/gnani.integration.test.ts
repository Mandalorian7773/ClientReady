import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { GnaniPrismaSTT } from "@/lib/providers/gnani/prisma";
import { GnaniTimbreTTS } from "@/lib/providers/gnani/timbre";
import { parseWav } from "@/lib/audio/wav";

/**
 * REAL Gnani API tests. They spend a few credits (1 TTS + 1 STT per language),
 * so they only run when GNANI_API_KEY is set:
 *
 *   GNANI_API_KEY=... npm run test:integration
 *
 * Synthesised audio is cached in tests/fixtures/ and reused on later runs, so
 * repeat runs only spend STT credits.
 */
try {
  process.loadEnvFile?.(".env.local");
} catch {
  /* no .env.local */
}

const key = process.env.GNANI_API_KEY;
const base = process.env.GNANI_BASE_URL ?? "https://api.vachana.ai";
const model = process.env.GNANI_TTS_MODEL ?? "timbre-v2.5";
const FIXTURES = path.resolve(__dirname, "../fixtures");

const CASES = [
  { name: "English", text: "Hello, my name is Ravi and I build websites for clinics.", ttsLang: "en-IN", voice: "Pranav", sttLang: "en-IN", expect: /website|clinic|ravi/i },
  { name: "Hindi", text: "नमस्ते, मैं क्लिनिक के लिए वेबसाइट बनाता हूँ।", ttsLang: "hi-IN", voice: "Deepak", sttLang: "hi-IN", expect: /क्लिनिक|वेबसाइट|नमस्ते/ },
  { name: "Hinglish", text: "Main aapke clinic ke liye ek AI receptionist bana sakta hoon.", ttsLang: "hi-en", voice: "Poorvi", sttLang: "en-IN", expect: /clinic|receptionist|AI/i },
];

describe.skipIf(!key)("Gnani live API", () => {
  const tts = new GnaniTimbreTTS({ apiKey: key!, baseUrl: base, model, timeoutMs: 30_000 });
  const stt = new GnaniPrismaSTT({ apiKey: key!, baseUrl: base, timeoutMs: 30_000 });

  for (const c of CASES) {
    it(`${c.name}: Timbre synthesises audio and Prisma transcribes it back`, async () => {
      if (model !== "timbre-v2.5" && c.voice) return; // voices below are from the v2.5 catalog
      mkdirSync(FIXTURES, { recursive: true });
      const file = path.join(FIXTURES, `${c.name.toLowerCase()}-${model}.wav`);
      let audio: Uint8Array;
      if (existsSync(file)) {
        audio = new Uint8Array(readFileSync(file));
      } else {
        const out = await tts.synthesize({ text: c.text, voice: c.voice, language: c.ttsLang });
        expect(out.contentType).toMatch(/audio|octet/);
        audio = out.audio;
        writeFileSync(file, audio);
      }
      const info = parseWav(audio);
      expect(info, "Timbre should return a PCM WAV").not.toBeNull();
      expect(info!.durationSec).toBeGreaterThan(1);

      const { transcript } = await stt.transcribe({ audio, mimeType: "audio/wav", languageCode: c.sttLang });
      console.log(`[${c.name}] Prisma transcript: ${transcript}`);
      expect(transcript.length).toBeGreaterThan(5);
      expect(transcript).toMatch(c.expect);
    });
  }

  it("returns a clear auth error for a bad key", async () => {
    const bad = new GnaniTimbreTTS({ apiKey: "invalid-key-for-test", baseUrl: base, model, timeoutMs: 15_000 });
    await expect(bad.synthesize({ text: "Hi", voice: "Kaveri", language: "en-IN" })).rejects.toMatchObject({
      code: expect.stringMatching(/auth_failed|credits_exhausted|bad_request/),
    });
  });
});

describe.runIf(!key)("Gnani live API (skipped)", () => {
  it("is skipped because GNANI_API_KEY is not set", () => {
    console.warn("GNANI_API_KEY not set: live Gnani integration tests were skipped.");
    expect(key).toBeUndefined();
  });
});
