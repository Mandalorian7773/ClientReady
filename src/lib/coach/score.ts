import { CATEGORIES, type CategoryId } from "./rubric";

export interface CategoryScore {
  id: CategoryId;
  /** null = not observed in this session; excluded from the overall score. */
  score: number | null;
}

/**
 * Weighted overall score. Categories that were not exercised in the session
 * (e.g. no negotiation happened) are excluded and the remaining weights are
 * renormalised, so a short discovery call is not punished for skipping
 * negotiation. Returns null if nothing was observed.
 *
 *   overall = Σ(weight_i × score_i) / Σ(weight_i)   over observed categories
 */
export function overallScore(scores: CategoryScore[]): number | null {
  let num = 0;
  let den = 0;
  for (const c of CATEGORIES) {
    const s = scores.find((x) => x.id === c.id)?.score;
    if (s === null || s === undefined || !Number.isFinite(s)) continue;
    const clamped = Math.max(0, Math.min(100, s));
    num += c.weight * clamped;
    den += c.weight;
  }
  return den === 0 ? null : Math.round(num / den);
}

export function scoreBand(score: number | null): { label: string; tone: "low" | "mid" | "good" | "great" } {
  if (score === null) return { label: "Not enough data", tone: "low" };
  if (score >= 85) return { label: "Client-ready", tone: "great" };
  if (score >= 70) return { label: "Strong", tone: "good" };
  if (score >= 50) return { label: "Developing", tone: "mid" };
  return { label: "Needs practice", tone: "low" };
}
