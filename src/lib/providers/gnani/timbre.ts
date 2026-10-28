import type { SynthesisProvider } from "../types";
import { AppError, gnaniStatusToError } from "@/lib/server/errors";
import { fetchWithRetry, readUpstreamMessage } from "@/lib/server/http";
import { isKnownVoice } from "./voices";

/**
 * Gnani Timbre text-to-speech, REST.
 * POST {base}/api/v1/tts/inference  application/json
 *   headers: X-API-Key-ID
 *   body:    { text, model, voice, language, speed, audio_config }
 * Response: raw binary audio; Content-Type matches the container.
 * Docs: https://docs.gnani.ai/api/TTS/tts-inference
 */
export const TIMBRE_LANGUAGES = ["auto", "hi-IN", "en-IN", "ta-IN", "te-IN", "kn-IN", "ml-IN", "mr-IN", "pa-IN", "bn-IN", "gu-IN", "hi-en"];
export const MAX_TTS_CHARS = 900;
export const STREAM_SAMPLE_RATE = 24_000;

export class GnaniTimbreTTS implements SynthesisProvider {
  readonly id = "gnani-timbre";
  readonly label: string;

  constructor(
    private opts: { apiKey: string; baseUrl: string; model: string; timeoutMs: number; fetchImpl?: typeof fetch },
  ) {
    this.label = `Gnani Timbre (${opts.model})`;
  }

  private validate(text: string, voice: string, language: string): string {
    const clean = cleanForSpeech(text);
    if (!clean) throw new AppError("bad_request", "Nothing to speak.");
    if (clean.length > MAX_TTS_CHARS) throw new AppError("bad_request", `Text is too long to synthesize (max ${MAX_TTS_CHARS} characters).`);
    if (!TIMBRE_LANGUAGES.includes(language)) throw new AppError("bad_request", `Timbre does not support language "${language}".`);
    if (!isKnownVoice(this.opts.model, voice)) {
      throw new AppError("bad_request", `Voice "${voice}" is not in the ${this.opts.model} catalog.`);
    }
    return clean;
  }

  /**
   * Streaming synthesis over SSE: POST {base}/api/v1/tts/sse. Events are
   * `start`, `chunk` ({ audio: base64 }), `complete` and `error`. We request
   * raw 16-bit PCM so the browser can play chunks as they arrive.
   * Docs: https://docs.gnani.ai/api/TTS/tts-sse
   */
  async stream({ text, voice, language, speed = 1.0 }: { text: string; voice: string; language: string; speed?: number }) {
    const clean = this.validate(text, voice, language);
    const res = await fetchWithRetry(
      `${this.opts.baseUrl}/api/v1/tts/sse`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-API-Key-ID": this.opts.apiKey, Accept: "text/event-stream" },
        body: JSON.stringify({
          text: clean,
          model: this.opts.model,
          voice,
          language,
          speed: Math.max(0.85, Math.min(1.15, speed)),
          audio_config: { sample_rate: STREAM_SAMPLE_RATE, num_channels: 1, sample_width: 2, encoding: "linear_pcm", container: "raw" },
        }),
      },
      // Only connection setup is retried; once streaming starts the body is passed through.
      { timeoutMs: this.opts.timeoutMs, attempts: 2, retryOn: [500, 502, 503, 504], fetchImpl: this.opts.fetchImpl },
    );
    if (!res.ok) {
      const msg = await readUpstreamMessage(res);
      throw gnaniStatusToError("Timbre", res.status, msg);
    }
    if (!res.body) throw new AppError("upstream_error", "Gnani Timbre returned an empty stream.", 502, true);
    return { body: res.body, sampleRate: STREAM_SAMPLE_RATE };
  }

  async synthesize({ text, voice, language, speed = 1.0 }: { text: string; voice: string; language: string; speed?: number }) {
    const clean = this.validate(text, voice, language);

    const res = await fetchWithRetry(
      `${this.opts.baseUrl}/api/v1/tts/inference`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-API-Key-ID": this.opts.apiKey },
        body: JSON.stringify({
          text: clean,
          model: this.opts.model,
          voice,
          language,
          speed: Math.max(0.85, Math.min(1.15, speed)),
          audio_config: { sample_rate: 24000, num_channels: 1, sample_width: 2, encoding: "linear_pcm", container: "wav" },
        }),
      },
      { timeoutMs: this.opts.timeoutMs, attempts: 2, retryOn: [500, 502, 503, 504], fetchImpl: this.opts.fetchImpl },
    );

    if (!res.ok) {
      const msg = await readUpstreamMessage(res);
      throw gnaniStatusToError("Timbre", res.status, msg);
    }
    const contentType = res.headers.get("content-type") ?? "audio/wav";
    if (contentType.includes("json")) {
      const msg = await readUpstreamMessage(res);
      throw new AppError("upstream_error", `Gnani Timbre returned JSON instead of audio${msg ? `: ${msg}` : ""}.`, 502);
    }
    const audio = new Uint8Array(await res.arrayBuffer());
    if (audio.byteLength < 100) throw new AppError("upstream_error", "Gnani Timbre returned empty audio.", 502, true);
    return { audio, contentType };
  }
}

/** Strip markdown, emoji and stage directions that a TTS engine would read aloud. */
export function cleanForSpeech(text: string): string {
  return text
    .replace(/\*\*?|__|`+|#+\s/g, "")
    .replace(/\[[^\]]*\]|\([^)]*(sighs|laughs|pause)[^)]*\)/gi, "")
    .replace(/[\p{Extended_Pictographic}‍️]/gu, "")
    .replace(/\s+/g, " ")
    .trim();
}
