import type { Turn } from "@/lib/sim/types";
import type { VoiceMetrics } from "@/lib/voice/delivery";

/**
 * Delivery metrics computed only from things we actually measured: recorded
 * duration, the Prisma transcript, and word counts. We do not analyse
 * accent, pitch or pronunciation, and we say so in the report.
 */

const FILLERS_EN = ["um", "uh", "erm", "uhh", "umm", "like", "basically", "actually", "you know", "i mean", "sort of", "kind of"];
const FILLERS_HI = ["matlab", "toh", "na", "haan", "accha"];
/** Hedges weaken a claim or a price ("I think it's a good price"). */
const HEDGES = ["i think", "maybe", "probably", "i guess", "i'm not sure", "hopefully", "try to", "kind of", "sort of", "i feel like"];

export interface DeliveryMetrics {
  learnerTurns: number;
  spokenTurns: number;
  typedTurns: number;
  totalWords: number;
  avgWordsPerTurn: number;
  /** Words per minute across spoken turns, or null when no turn has audio duration. */
  wordsPerMinute: number | null;
  fillerCount: number;
  fillersPer100Words: number;
  longestTurnWords: number;
  questionsAsked: number;
  /** Learner share of words in the conversation, 0..1. */
  talkShare: number;
  hedgeCount: number;
  hedgesPer100Words: number;
  /** Timing signals measured from the microphone during a live call, if any. */
  voice: VoiceMetrics | null;
}

export function countWords(text: string): number {
  return text.trim().split(/\s+/).filter(Boolean).length;
}

function countFillers(text: string): number {
  const t = ` ${text.toLowerCase().replace(/[^\p{L}\s]/gu, " ")} `;
  let n = 0;
  for (const f of [...FILLERS_EN, ...FILLERS_HI]) {
    // "like" and "actually" are often legitimate; only count clear filler usages.
    if (f === "like") {
      n += (t.match(/\s(like,|like\s+um|like\s+uh)\s/g) ?? []).length;
      continue;
    }
    const re = new RegExp(`\\s${f.replace(/\s/g, "\\s+")}\\s`, "g");
    n += (t.match(re) ?? []).length;
  }
  return n;
}

export function countHedges(text: string): number {
  const t = ` ${text.toLowerCase().replace(/[^\p{L}'\s]/gu, " ").replace(/\s+/g, " ")} `;
  return HEDGES.reduce((n, h) => n + (t.split(` ${h} `).length - 1), 0);
}

export function computeDeliveryMetrics(turns: Turn[], voice: VoiceMetrics | null = null): DeliveryMetrics {
  const learner = turns.filter((t) => t.role === "learner");
  const client = turns.filter((t) => t.role === "client");
  const words = learner.map((t) => countWords(t.englishText || t.text));
  const totalWords = words.reduce((a, b) => a + b, 0);
  const spoken = learner.filter((t) => t.source === "prisma" && (t.audioSeconds ?? 0) > 0.5);
  const spokenWords = spoken.reduce((a, t) => a + countWords(t.text), 0);
  const spokenSecs = spoken.reduce((a, t) => a + (t.audioSeconds ?? 0), 0);
  const fillerCount = learner.reduce((a, t) => a + countFillers(t.text), 0);
  const hedgeCount = learner.reduce((a, t) => a + countHedges(t.englishText || t.text), 0);
  const clientWords = client.reduce((a, t) => a + countWords(t.text), 0);

  return {
    learnerTurns: learner.length,
    spokenTurns: spoken.length,
    typedTurns: learner.filter((t) => t.source === "typed").length,
    totalWords,
    avgWordsPerTurn: learner.length ? Math.round(totalWords / learner.length) : 0,
    wordsPerMinute: spokenSecs > 3 ? Math.round((spokenWords / spokenSecs) * 60) : null,
    fillerCount,
    fillersPer100Words: totalWords ? Math.round((fillerCount / totalWords) * 1000) / 10 : 0,
    longestTurnWords: words.length ? Math.max(...words) : 0,
    questionsAsked: learner.reduce((a, t) => a + ((t.englishText || t.text).match(/\?/g) ?? []).length, 0),
    talkShare: totalWords + clientWords ? Math.round((totalWords / (totalWords + clientWords)) * 100) / 100 : 0,
    hedgeCount,
    hedgesPer100Words: totalWords ? Math.round((hedgeCount / totalWords) * 1000) / 10 : 0,
    voice,
  };
}

/**
 * Deterministic delivery score from measured signals. Ranges are ClientReady
 * design heuristics, not research-derived thresholds.
 *  - pace: 110–170 wpm comfortable for international listeners
 *  - fillers: under 3 per 100 words
 *  - answer size: 15–110 words per turn on average, no 200+ word monologues
 *  - hedges: under 3 per 100 words; answer delay under 3 s (when measured)
 * Returns null when there is nothing to assess.
 */
export function scoreDelivery(m: DeliveryMetrics): number | null {
  // Delivery is about speech; an all-typed session gives nothing to assess.
  if (m.learnerTurns === 0 || m.spokenTurns === 0) return null;
  let score = 70;

  if (m.wordsPerMinute !== null) {
    const w = m.wordsPerMinute;
    if (w >= 110 && w <= 170) score += 12;
    else if (w >= 90 && w <= 190) score += 4;
    else score -= 10;
  }

  if (m.fillersPer100Words < 1.5) score += 10;
  else if (m.fillersPer100Words < 3) score += 4;
  else if (m.fillersPer100Words < 6) score -= 6;
  else score -= 14;

  if (m.avgWordsPerTurn >= 15 && m.avgWordsPerTurn <= 110) score += 8;
  else if (m.avgWordsPerTurn < 6) score -= 15;
  else score -= 6;
  if (m.longestTurnWords > 200) score -= 8;
  if (m.hedgesPer100Words >= 3) score -= 5;
  if (m.voice?.medianAnswerDelayMs != null && m.voice.medianAnswerDelayMs > 3000) score -= 4;

  return Math.max(0, Math.min(100, Math.round(score)));
}
