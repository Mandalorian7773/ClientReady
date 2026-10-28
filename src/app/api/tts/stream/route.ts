import { z } from "zod";
import { getEnv } from "@/lib/server/env";
import { handler, readJson } from "@/lib/server/route";
import { addUsage, chargeSession } from "@/lib/server/live-gate";
import { MAX_TTS_CHARS } from "@/lib/providers/gnani/timbre";
import { clientVoice, debriefVoice } from "@/lib/providers/gnani/voices";
import { getSynthesizer } from "@/lib/providers";
import { AppError } from "@/lib/server/errors";

export const runtime = "nodejs";
export const maxDuration = 60;

const Body = z.object({
  text: z.string().trim().min(1).max(MAX_TTS_CHARS),
  /** client = the simulated client (English); coach = the spoken debrief. */
  kind: z.enum(["client", "coach"]).default("client"),
  gender: z.enum(["female", "male"]).default("female"),
  language: z.enum(["en-IN", "hi-IN", "hi-en", "ta-IN", "te-IN", "kn-IN", "ml-IN", "mr-IN", "pa-IN", "bn-IN", "gu-IN"]).default("en-IN"),
  seed: z.number().int().min(0).max(1000).default(0),
  sessionId: z.string().optional(),
});

/**
 * Streams Gnani Timbre speech to the browser as Server-Sent Events (raw
 * 16-bit PCM in base64 chunks), so playback starts before synthesis finishes.
 * The upstream event stream is passed through unchanged.
 */
export const POST = handler("tts", async (req) => {
  const body = Body.parse(await readJson(req, 10_000));
  await chargeSession(body.sessionId, "ttsStream", { budget: "ttsChars", value: body.text.length });
  const env = getEnv();
  const model = env.gnani.ttsModel;
  const language = body.kind === "client" ? "en-IN" : body.language;
  const voice = body.kind === "client" ? clientVoice(model, body.gender, body.seed) : debriefVoice(model, language, env.gnani.coachVoice);
  const tts = getSynthesizer();
  if (!tts.stream) throw new AppError("not_configured", "The configured voice provider does not support streaming.", 501);
  await addUsage("tts_chars", body.text.length);
  const { body: stream, sampleRate } = await tts.stream({ text: body.text, voice, language });
  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-store, no-transform",
      "X-Sample-Rate": String(sampleRate),
      "X-TTS-Voice": voice,
      "X-TTS-Provider": tts.label,
    },
  });
});
