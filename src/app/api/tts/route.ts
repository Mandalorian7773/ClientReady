import { z } from "zod";
import { getSynthesizer } from "@/lib/providers";
import { handler, readJson } from "@/lib/server/route";
import { addUsage, chargeSession } from "@/lib/server/live-gate";
import { getEnv } from "@/lib/server/env";
import { clientVoice, coachingVoice } from "@/lib/providers/gnani/voices";
import { MAX_TTS_CHARS } from "@/lib/providers/gnani/timbre";

export const runtime = "nodejs";
export const maxDuration = 60;

const Body = z.object({
  text: z.string().trim().min(1).max(MAX_TTS_CHARS),
  /** client = the simulated client's English voice; coach = playback of a suggested answer. */
  kind: z.enum(["client", "coach"]).default("client"),
  gender: z.enum(["female", "male"]).default("female"),
  /** Timbre language code. Client speech is always en-IN. */
  language: z.enum(["en-IN", "hi-IN", "hi-en", "ta-IN", "te-IN", "kn-IN", "ml-IN", "mr-IN", "pa-IN", "bn-IN", "gu-IN"]).default("en-IN"),
  seed: z.number().int().min(0).max(1000).default(0),
  sessionId: z.string().optional(),
});

/** Returns raw audio bytes from Gnani Timbre. The browser caches them for replay. */
export const POST = handler("tts", async (req) => {
  const body = Body.parse(await readJson(req, 10_000));
  await chargeSession(body.sessionId, "tts", { budget: "ttsChars", value: body.text.length });
  const model = getEnv().gnani.ttsModel;
  const language = body.kind === "client" ? "en-IN" : body.language;
  const voice = body.kind === "client" ? clientVoice(model, body.gender, body.seed) : coachingVoice(model, language);
  const tts = getSynthesizer();
  await addUsage("tts_chars", body.text.length);
  const { audio, contentType } = await tts.synthesize({ text: body.text, voice, language });
  return new Response(audio as BodyInit, {
    headers: {
      "Content-Type": contentType,
      "Cache-Control": "no-store",
      "X-TTS-Provider": tts.label,
      "X-TTS-Voice": voice,
    },
  });
});
