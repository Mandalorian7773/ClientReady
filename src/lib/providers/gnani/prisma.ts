import type { TranscriptionProvider } from "../types";
import { AppError, gnaniStatusToError } from "@/lib/server/errors";
import { fetchWithRetry, readUpstreamMessage } from "@/lib/server/http";
import { PRISMA_LANGUAGE_CODES, type PrismaLanguage } from "@/lib/languages";

/**
 * Gnani Prisma v2.5 speech-to-text, REST.
 * POST {base}/stt/v3  multipart/form-data
 *   headers: X-API-Key-ID
 *   fields:  audio_file (file), language_code, format, bias_list, bias_score
 * Response: { success, request_id, timestamp, transcript }
 * Docs: https://docs.gnani.ai/api/STT/speech-to-text
 */
export class GnaniPrismaSTT implements TranscriptionProvider {
  readonly id = "gnani-prisma";
  readonly label = "Gnani Prisma v2.5";

  constructor(
    private opts: { apiKey: string; baseUrl: string; timeoutMs: number; fetchImpl?: typeof fetch },
  ) {}

  async transcribe({
    audio,
    mimeType,
    languageCode,
    biasWords,
  }: {
    audio: Uint8Array;
    mimeType: string;
    languageCode: string;
    biasWords?: string[];
  }) {
    if (!PRISMA_LANGUAGE_CODES.includes(languageCode as PrismaLanguage)) {
      throw new AppError("bad_request", `Prisma does not support language "${languageCode}".`);
    }
    const form = new FormData();
    const ext = mimeType.includes("wav") ? "wav" : mimeType.includes("mp4") || mimeType.includes("m4a") ? "m4a" : "ogg";
    form.append("audio_file", new Blob([audio as BlobPart], { type: mimeType }), `utterance.${ext}`);
    form.append("language_code", languageCode);
    // ITN writes prices and numbers as digits ("$2,000"), which the coach relies on.
    form.append("format", "transcribe");

    const bias = sanitizeBiasWords(biasWords ?? []);
    if (bias.length > 0) {
      form.append("bias_list", JSON.stringify(bias));
      form.append("bias_score", "1.0");
    }

    const res = await fetchWithRetry(
      `${this.opts.baseUrl}/stt/v3`,
      { method: "POST", headers: { "X-API-Key-ID": this.opts.apiKey }, body: form },
      { timeoutMs: this.opts.timeoutMs, attempts: 2, retryOn: [500, 502, 503, 504], fetchImpl: this.opts.fetchImpl },
    );

    if (!res.ok) {
      const msg = await readUpstreamMessage(res);
      throw gnaniStatusToError("Prisma", res.status, msg);
    }

    let body: { success?: boolean; transcript?: string; request_id?: string; error?: { message?: string } };
    try {
      body = await res.json();
    } catch {
      throw new AppError("upstream_error", "Gnani Prisma returned an unreadable response.", 502, true);
    }
    if (body.success === false) {
      throw new AppError("upstream_error", `Gnani Prisma could not transcribe: ${body.error?.message ?? "unknown error"}`, 502);
    }
    const transcript = (body.transcript ?? "").trim();
    return { transcript, requestId: body.request_id };
  }
}

/**
 * Prisma bias_list entries must be single words of letters only, max 100.
 * We feed it product names and domain words so "Shopify" or "Zendesk" survive.
 */
export function sanitizeBiasWords(words: string[]): string[] {
  const out = new Set<string>();
  for (const w of words) {
    for (const part of w.split(/[^\p{L}]+/u)) {
      if (part.length >= 3 && part.length <= 30) out.add(part);
      if (out.size >= 100) return [...out];
    }
  }
  return [...out];
}
