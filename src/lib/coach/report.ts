import { z } from "zod";
import { CATEGORY_IDS, CATEGORIES, PRINCIPLES, type CategoryId } from "./rubric";
import { overallScore } from "./score";
import { computeDeliveryMetrics, scoreDelivery, type DeliveryMetrics } from "./metrics";
import type { Turn, ClientState } from "@/lib/sim/types";

/** What the reasoning model returns. No numeric constraints here; we clamp afterwards. */
const EvidenceWire = z.object({
  turn: z.number().describe("Index of the freelancer turn being quoted."),
  quote: z.string().describe("Exact words copied from that freelancer turn (max ~25 words)."),
});

export const CoachReportWireSchema = z.object({
  summary: z.string().describe("3-4 sentence overall assessment, in the coaching language."),
  categories: z.array(
    z.object({
      id: z.enum(CATEGORY_IDS),
      observed: z.boolean().describe("false if the session gave no opportunity to show this skill"),
      score: z.number().describe("0-100 using the rubric anchors; use 0 when observed is false"),
      rationale: z.string().describe("1-2 sentences in the coaching language explaining the score"),
      evidence: z.array(EvidenceWire),
    }),
  ),
  strengths: z.array(
    z.object({ turn: z.number(), quote: z.string(), why: z.string().describe("Why this worked, in the coaching language") }),
  ),
  issues: z.array(
    z.object({
      title: z.string(),
      category: z.enum(CATEGORY_IDS),
      turn: z.number().describe("Freelancer turn index, or -1 if the issue is something that was missing entirely"),
      quote: z.string().describe("Exact words from that turn, or empty string"),
      whatWasMissing: z.string(),
      whyItMattered: z.string().describe("Why it mattered to THIS client"),
      betterResponse: z.string().describe("A stronger answer in English, specific to the learner's offer, price and client"),
      whyBetterWorks: z.string(),
      principleId: z.string(),
      exercise: z.string().describe("A short practice exercise"),
    }),
  ),
  plan: z.array(
    z.object({
      title: z.string(),
      why: z.string(),
      exercise: z.string(),
      successMetric: z.string().describe("How the learner will know they improved next session"),
    }),
  ),
  languageBridge: z.array(
    z.object({
      turn: z.number(),
      original: z.string().describe("Learner's original words (copy exactly)"),
      clearerEnglish: z.string().describe("A clearer, professional English version preserving all details"),
      note: z.string().describe("What changed and why, in the coaching language"),
    }),
  ),
});
export type CoachReportWire = z.infer<typeof CoachReportWireSchema>;

export interface Evidence {
  turn: number;
  quote: string;
}

export interface CategoryResult {
  id: CategoryId;
  name: string;
  weight: number;
  score: number | null;
  rationale: string;
  evidence: Evidence[];
}

export interface CoachReport {
  version: 1;
  generatedBy: string;
  isDemo: boolean;
  createdAt: number;
  overall: number | null;
  summary: string;
  outcome: ClientState["outcome"];
  categories: CategoryResult[];
  strengths: Array<Evidence & { why: string }>;
  issues: Array<{
    title: string;
    category: CategoryId;
    turn: number | null;
    quote: string | null;
    whatWasMissing: string;
    whyItMattered: string;
    betterResponse: string;
    whyBetterWorks: string;
    principle: { id: string; name: string; source: string; basis: string } | null;
    exercise: string;
  }>;
  plan: Array<{ title: string; why: string; exercise: string; successMetric: string }>;
  languageBridge: Array<{ turn: number; original: string; clearerEnglish: string; note: string }>;
  metrics: DeliveryMetrics;
  /** Number of model-cited quotes we could not find in the transcript and removed. */
  droppedQuotes: number;
}

function norm(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFKC")
    .replace(/[“”"‘’'`.,!?;:()\-–—…]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Locate a quote in the learner's turns. Returns the verified turn index or
 * null. We accept the quote if it appears in the cited turn, or (to forgive an
 * off-by-one turn index) in any learner turn. Original or English rendering both count.
 */
export function verifyQuote(turns: Turn[], turn: number, quote: string): number | null {
  const q = norm(quote);
  if (q.length < 3) return null;
  const learner = turns.filter((t) => t.role === "learner");
  const matches = (t: Turn) => norm(t.text).includes(q) || (t.englishText ? norm(t.englishText).includes(q) : false);
  const cited = learner.find((t) => t.index === turn);
  if (cited && matches(cited)) return cited.index;
  const other = learner.find(matches);
  return other ? other.index : null;
}

const clampScore = (n: number) => Math.round(Math.max(0, Math.min(100, Number.isFinite(n) ? n : 0)));

/**
 * Turn the model's wire output into a trusted report:
 *  - every quote is verified against the transcript (unverifiable ones are dropped)
 *  - scores are clamped; delivery is replaced by our measured score
 *  - the overall score is computed here, never taken from the model
 *  - missing categories are filled as "not observed"
 */
export function finalizeReport(
  wire: CoachReportWire,
  turns: Turn[],
  state: ClientState,
  meta: { generatedBy: string; isDemo: boolean; now?: number },
): CoachReport {
  let dropped = 0;
  const keep = (e: { turn: number; quote: string }): Evidence | null => {
    const t = verifyQuote(turns, Math.round(e.turn), e.quote);
    if (t === null) {
      dropped++;
      return null;
    }
    return { turn: t, quote: e.quote.trim() };
  };

  const metrics = computeDeliveryMetrics(turns);
  const deliveryScore = scoreDelivery(metrics);

  const categories: CategoryResult[] = CATEGORIES.map((c) => {
    const w = wire.categories.find((x) => x.id === c.id);
    const evidence = (w?.evidence ?? []).map(keep).filter((e): e is Evidence => e !== null).slice(0, 3);
    let score: number | null = w && w.observed ? clampScore(w.score) : null;
    if (c.id === "delivery") score = deliveryScore;
    const notObserved =
      c.id === "delivery" && metrics.spokenTurns === 0 ? "No spoken answers in this session, so delivery wasn't assessed." : "Not exercised in this session.";
    return {
      id: c.id,
      name: c.name,
      weight: c.weight,
      score,
      rationale: score === null ? notObserved : w?.rationale?.trim() || "",
      evidence: score === null ? [] : evidence,
    };
  });

  const strengths = wire.strengths
    .map((s) => {
      const e = keep(s);
      return e ? { ...e, why: s.why.trim() } : null;
    })
    .filter((s): s is Evidence & { why: string } => s !== null)
    .slice(0, 4);

  const issues = wire.issues.slice(0, 6).map((i) => {
    let turn: number | null = null;
    let quote: string | null = null;
    if (i.turn >= 0 && i.quote.trim()) {
      const t = verifyQuote(turns, Math.round(i.turn), i.quote);
      if (t === null) dropped++;
      else {
        turn = t;
        quote = i.quote.trim();
      }
    }
    const p = PRINCIPLES.find((x) => x.id === i.principleId);
    return {
      title: i.title.trim(),
      category: i.category,
      turn,
      quote,
      whatWasMissing: i.whatWasMissing.trim(),
      whyItMattered: i.whyItMattered.trim(),
      betterResponse: i.betterResponse.trim(),
      whyBetterWorks: i.whyBetterWorks.trim(),
      principle: p ? { id: p.id, name: p.name, source: p.source, basis: p.basis } : null,
      exercise: i.exercise.trim(),
    };
  });

  const learnerByIndex = new Map(turns.filter((t) => t.role === "learner").map((t) => [t.index, t]));
  const languageBridge = wire.languageBridge
    .filter((b) => learnerByIndex.has(Math.round(b.turn)))
    .map((b) => ({
      turn: Math.round(b.turn),
      // Always show the learner's real words, not the model's copy of them.
      original: learnerByIndex.get(Math.round(b.turn))!.text,
      clearerEnglish: b.clearerEnglish.trim(),
      note: b.note.trim(),
    }))
    .slice(0, 6);

  return {
    version: 1,
    generatedBy: meta.generatedBy,
    isDemo: meta.isDemo,
    createdAt: meta.now ?? Date.now(),
    overall: overallScore(categories),
    summary: wire.summary.trim(),
    outcome: state.outcome,
    categories,
    strengths,
    issues,
    plan: wire.plan.slice(0, 3).map((p) => ({
      title: p.title.trim(),
      why: p.why.trim(),
      exercise: p.exercise.trim(),
      successMetric: p.successMetric.trim(),
    })),
    languageBridge,
    metrics,
    droppedQuotes: dropped,
  };
}
