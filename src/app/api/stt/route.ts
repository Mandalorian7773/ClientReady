import { NextResponse } from "next/server";
import { getTranscriber } from "@/lib/providers";
import { handler } from "@/lib/server/route";
import { validateUtteranceAudio } from "@/lib/audio/validate";
import { AppError } from "@/lib/server/errors";
import { getLanguage, LANGUAGE_IDS } from "@/lib/languages";

export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * POST multipart/form-data: audio (16 kHz mono PCM WAV), language (language id),
 * bias (optional JSON array of words to boost). Audio is held in memory only
 * for the duration of the request and never stored.
 */
export const POST = handler("stt", async (req) => {
  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    throw new AppError("bad_audio", "Expected an audio upload.");
  }
  const file = form.get("audio");
  const languageId = String(form.get("language") ?? "en");
  if (!LANGUAGE_IDS.includes(languageId)) throw new AppError("bad_request", "Unsupported speech language.");
  if (!(file instanceof Blob)) throw new AppError("bad_audio", "No audio was uploaded.");

  const bytes = new Uint8Array(await file.arrayBuffer());
  const info = validateUtteranceAudio(bytes, file.type);

  let bias: string[] = [];
  const rawBias = form.get("bias");
  if (typeof rawBias === "string" && rawBias.length < 4000) {
    try {
      const parsed = JSON.parse(rawBias);
      if (Array.isArray(parsed)) bias = parsed.filter((x): x is string => typeof x === "string").slice(0, 100);
    } catch {
      /* ignore malformed bias list */
    }
  }

  const lang = getLanguage(languageId);
  const stt = getTranscriber();
  const { transcript, requestId } = await stt.transcribe({ audio: bytes, mimeType: "audio/wav", languageCode: lang.sttCode!, biasWords: bias });
  if (!transcript) {
    throw new AppError("empty_transcript", "Prisma could not hear any words. Try speaking a little closer to the microphone.", 422);
  }
  return NextResponse.json({
    transcript,
    durationSec: Math.round(info.durationSec * 10) / 10,
    provider: stt.label,
    languageCode: lang.sttCode,
    requestId,
  });
});
