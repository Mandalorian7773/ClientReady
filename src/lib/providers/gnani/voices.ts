/**
 * Timbre voice catalog subset (docs.gnani.ai/api/TTS/available-voices, checked 2026-10-22).
 * Voices are model-specific: a v2.5 voice sent with timbre-v3.0 returns 400.
 *
 * All Timbre voices are Indian voices. ClientReady does NOT claim to produce a
 * US/UK/AU accent; the client's nationality is simulated through role,
 * context and dialogue only.
 */

export type VoiceGender = "female" | "male";

interface VoiceSet {
  /** English (en-IN) voices by gender, in preference order. */
  english: Record<VoiceGender, string[]>;
  /** Hinglish (hi-en) voice, used for "listen to the better answer in Hinglish". */
  hinglish?: string;
  /** Best voice per Indian language for coaching playback. v3.0 voices speak all languages. */
  byLanguage: Record<string, string>;
}

export const TIMBRE_VOICES: Record<string, VoiceSet> = {
  "timbre-v2.5": {
    english: { female: ["Kaveri", "Devika", "Trupti"], male: ["Pranav", "Girish", "Shlok"] },
    hinglish: "Poorvi",
    byLanguage: {
      "en-IN": "Kaveri",
      "hi-IN": "Ambuja",
      "hi-en": "Poorvi",
      "ta-IN": "Asmita",
      "te-IN": "Lavanya",
      "kn-IN": "Kavin",
      "ml-IN": "Reshma",
      "mr-IN": "Ishaan",
      "pa-IN": "Mehuli",
      "bn-IN": "Kirra",
      "gu-IN": "Falak",
    },
  },
  "timbre-v3.0": {
    english: { female: ["Riyaa", "Kalpana", "Shivani"], male: ["Avinash", "Prakash", "Devansh"] },
    byLanguage: {},
  },
};

export const ALL_V25_VOICES = [
  "Ambuja", "Asmita", "Bhavna", "Brinda", "Chitra", "Deepak", "Devika", "Dhruva", "Falak", "Girish", "Hemraj",
  "Ishaan", "Jalaj", "Jwala", "Kaveri", "Kavin", "Kirra", "Lavanya", "Lehara", "Mehuli", "Nalini", "Noopur",
  "Omkar", "Poorvi", "Pranav", "Reshma", "Riyaan", "Roopesh", "Saanvi", "Shlok", "Suhana", "Trisha", "Trupti",
  "Urmila", "Varuni", "Vedika", "Veera", "Vikrant", "Yashvi", "Yukti", "Zahira", "Zayan",
];

export const ALL_V30_VOICES = [
  "Avinash", "Chetana", "Devansh", "Kalpana", "Lakshmi", "Prakash", "Riyaa", "Shivani", "Shubham", "Tarika",
  "Vasudha", "Yashraj", "Harshad",
];

export function isKnownVoice(model: string, voice: string): boolean {
  if (model === "timbre-v3.0") return ALL_V30_VOICES.includes(voice);
  return ALL_V25_VOICES.includes(voice);
}

/** Pick a stable English client voice for a persona. */
export function clientVoice(model: string, gender: VoiceGender, seed = 0): string {
  const set = TIMBRE_VOICES[model] ?? TIMBRE_VOICES["timbre-v2.5"];
  const list = set.english[gender];
  return list[Math.abs(seed) % list.length];
}

/** Voice for coaching playback in a given TTS language code. */
export function coachingVoice(model: string, ttsLanguage: string): string {
  const set = TIMBRE_VOICES[model] ?? TIMBRE_VOICES["timbre-v2.5"];
  if (model === "timbre-v3.0") return set.english.female[0];
  return set.byLanguage[ttsLanguage] ?? set.english.female[0];
}
