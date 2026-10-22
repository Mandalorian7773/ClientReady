/**
 * Language support matrix, taken from the Gnani docs (checked 2026-10-22):
 *   - Prisma v2.5 REST STT  (docs.gnani.ai/api/STT/speech-to-text)
 *   - Timbre v2.5 TTS       (docs.gnani.ai/api/TTS/tts-inference, /available-voices)
 *
 * Only languages listed in those docs are offered. `en-IN` STT accepts
 * English–Hindi mixed audio and returns Latin script, which is how we support
 * Hinglish speech. Timbre additionally accepts `hi-en` (Hinglish) for synthesis.
 */

export type PrismaLanguage =
  | "en-IN"
  | "hi-IN"
  | "bn-IN"
  | "gu-IN"
  | "kn-IN"
  | "ml-IN"
  | "mr-IN"
  | "pa-IN"
  | "ta-IN"
  | "te-IN";

export interface LanguageOption {
  /** Stable id used in scenario config. */
  id: string;
  label: string;
  nativeLabel: string;
  /** Code sent to Prisma STT, or null if speech input is not supported. */
  sttCode: PrismaLanguage | null;
  /** Code sent to Timbre TTS, or null if not supported. */
  ttsCode: string | null;
  note?: string;
}

export const LANGUAGES: LanguageOption[] = [
  { id: "en", label: "English", nativeLabel: "English", sttCode: "en-IN", ttsCode: "en-IN" },
  {
    id: "hinglish",
    label: "Hinglish (Hindi + English)",
    nativeLabel: "Hinglish",
    sttCode: "en-IN",
    ttsCode: "hi-en",
    note: "Prisma's en-IN model accepts Hindi–English mixed speech and returns Latin script.",
  },
  { id: "hi", label: "Hindi", nativeLabel: "हिन्दी", sttCode: "hi-IN", ttsCode: "hi-IN" },
  { id: "bn", label: "Bengali", nativeLabel: "বাংলা", sttCode: "bn-IN", ttsCode: "bn-IN" },
  { id: "gu", label: "Gujarati", nativeLabel: "ગુજરાતી", sttCode: "gu-IN", ttsCode: "gu-IN" },
  { id: "kn", label: "Kannada", nativeLabel: "ಕನ್ನಡ", sttCode: "kn-IN", ttsCode: "kn-IN" },
  { id: "ml", label: "Malayalam", nativeLabel: "മലയാളം", sttCode: "ml-IN", ttsCode: "ml-IN" },
  { id: "mr", label: "Marathi", nativeLabel: "मराठी", sttCode: "mr-IN", ttsCode: "mr-IN" },
  { id: "pa", label: "Punjabi", nativeLabel: "ਪੰਜਾਬੀ", sttCode: "pa-IN", ttsCode: "pa-IN" },
  { id: "ta", label: "Tamil", nativeLabel: "தமிழ்", sttCode: "ta-IN", ttsCode: "ta-IN" },
  { id: "te", label: "Telugu", nativeLabel: "తెలుగు", sttCode: "te-IN", ttsCode: "te-IN" },
];

export const LANGUAGE_IDS = LANGUAGES.map((l) => l.id) as [string, ...string[]];

export function getLanguage(id: string): LanguageOption {
  return LANGUAGES.find((l) => l.id === id) ?? LANGUAGES[0];
}

/** True when the learner speaks something other than plain English. */
export function needsEnglishBridge(speechLanguageId: string): boolean {
  return speechLanguageId !== "en";
}

export const PRISMA_LANGUAGE_CODES: PrismaLanguage[] = [
  "en-IN",
  "hi-IN",
  "bn-IN",
  "gu-IN",
  "kn-IN",
  "ml-IN",
  "mr-IN",
  "pa-IN",
  "ta-IN",
  "te-IN",
];
