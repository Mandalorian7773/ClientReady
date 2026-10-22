import { AppError } from "@/lib/server/errors";
import { MAX_UPLOAD_BYTES, MAX_UTTERANCE_SECONDS, MIN_UTTERANCE_SECONDS, parseWav, pcm16Rms, type WavInfo } from "./wav";

/** Below this RMS the clip is effectively silence (mic muted or no speech). */
export const SILENCE_RMS = 0.0025;

/** Server-side validation of an uploaded utterance before spending STT credits. */
export function validateUtteranceAudio(bytes: Uint8Array, mimeType: string): WavInfo {
  if (bytes.byteLength === 0) throw new AppError("bad_audio", "The recording was empty.");
  if (bytes.byteLength > MAX_UPLOAD_BYTES) {
    throw new AppError("audio_too_long", `Recordings are limited to ${MAX_UTTERANCE_SECONDS} seconds per turn.`, 413);
  }
  if (mimeType && !/wav/i.test(mimeType)) {
    throw new AppError("bad_audio", "Audio must be uploaded as WAV (the app converts your recording automatically).", 415);
  }
  const info = parseWav(bytes);
  if (!info) throw new AppError("bad_audio", "The recording is not a valid 16-bit PCM WAV file.", 415);
  if (info.channels !== 1) throw new AppError("bad_audio", "Audio must be mono.", 415);
  if (info.durationSec > MAX_UTTERANCE_SECONDS + 0.5) {
    throw new AppError("audio_too_long", `Recordings are limited to ${MAX_UTTERANCE_SECONDS} seconds per turn. Try a shorter answer.`, 413);
  }
  if (info.durationSec < MIN_UTTERANCE_SECONDS) throw new AppError("bad_audio", "That recording was too short. Hold the button while you speak.");
  if (pcm16Rms(bytes, info) < SILENCE_RMS) {
    throw new AppError("empty_transcript", "We couldn't hear anything. Check that your microphone is not muted.", 422);
  }
  return info;
}
