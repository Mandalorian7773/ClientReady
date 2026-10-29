import { z } from "zod";
import { CATEGORY_IDS, CATEGORIES, PRINCIPLES, type CategoryId } from "./rubric";
import { overallScore } from "./score";
import { computeDeliveryMetrics, scoreDelivery, type DeliveryMetrics } from "./metrics";
import type { Turn, ClientState } from "@/lib/sim/types";
import type { VoiceMetrics } from "@/lib/voice/delivery";

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
  deliveryNotes: z.array(z.string().describe("A delivery observation tied to a measured metric or to the learner's wording")),
  proposalSteps: z.array(z.string().describe("One step of how to put up a proposal to THIS client")),
  nextDrill: z.string().describe("One specific thing to practise next session"),
  spoken: z.array(
    z.object({
      label: z.string().describe("2-3 word label, e.g. Discovery"),
      text: z.string().describe("What the coach says aloud for this segment"),
      refType: z.enum(["issue", "strength", "none"]),
      refIndex: z.number().describe("Index into issues or strengths; -1 when refType is none"),
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
  deliveryNotes: string[];
  proposalSteps: string[];
  nextDrill: string;
  /** The spoken debrief, read aloud by the coach voice before the written report. */
  spoken: SpokenSegment[];
}

export interface SpokenSegment {
  label: string;
  text: string;
  ref: { type: "issue" | "strength"; index: number } | null;
}

/** The fixed first line of every English spoken debrief. */
export const DEBRIEF_OPENING =
  "The conversation between you and the client has now ended. Here are the areas where you could have done better.";
export const DEBRIEF_CLOSING = "Your written report is on screen now.";
const MAX_SEGMENTS = 9;
const MAX_SEGMENT_CHARS = 700;

/** What a spoken segment is about, for showing on screen while the coach talks. */
export interface SegmentMoment {
  kind: "fix" | "keep";
  /** The learner's exact words (verified against the transcript), if the moment has a quote. */
  quote: string | null;
  turn: number | null;
  /** For a fix: the stronger English answer to say back. */
  better: string | null;
}

export function segmentMoment(report: Pick<CoachReport, "issues" | "strengths">, seg: SpokenSegment): SegmentMoment | null {
  if (seg.ref?.type === "issue") {
    const i = report.issues[seg.ref.index];
    if (i) return { kind: "fix", quote: i.quote || spokenQuote(seg.text), turn: i.turn, better: i.betterResponse || null };
  } else if (seg.ref?.type === "strength") {
    const s = report.strengths[seg.ref.index];
    if (s) return { kind: "keep", quote: s.quote || spokenQuote(seg.text), turn: s.turn, better: null };
  }
  const q = spokenQuote(seg.text);
  return q ? { kind: "fix", quote: q, turn: null, better: null } : null;
}

/** Pull the quoted words out of "In this part you said, '...'" so they can be verified. */
export function spokenQuote(text: string): string | null {
  const m = text.match(/you said,?\s*["'‘“]([^"“”]+?)["'’”](?=[\s.,;!?]|$)/i);
  return m ? m[1].trim() : null;
}

function trimTo(text: string, max: number): string {
  if (text.length <= max) return text;
  const cut = text.slice(0, max);
  const stop = Math.max(cut.lastIndexOf(". "), cut.lastIndexOf("? "), cut.lastIndexOf("! "));
  return stop > max * 0.5 ? cut.slice(0, stop + 1) : `${cut.trim()}…`;
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
  meta: { generatedBy: string; isDemo: boolean; now?: number; voice?: VoiceMetrics | null; englishDebrief?: boolean },
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

  const metrics = computeDeliveryMetrics(turns, meta.voice ?? null);
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

  const strengths: Array<Evidence & { why: string }> = [];
  const strengthIndex = new Map<number, number>();
  wire.strengths.forEach((s, i) => {
    const e = keep(s);
    if (e && strengths.length < 4) {
      strengthIndex.set(i, strengths.length);
      strengths.push({ ...e, why: s.why.trim() });
    }
  });

  const unverifiedIssues = new Set<number>();
  const issues = wire.issues.slice(0, 6).map((i, idx) => {
    let turn: number | null = null;
    let quote: string | null = null;
    if (i.turn >= 0 && i.quote.trim()) {
      const t = verifyQuote(turns, Math.round(i.turn), i.quote);
      if (t === null) {
        dropped++;
        unverifiedIssues.add(idx);
      } else {
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

  const spoken = buildSpoken(wire, turns, issues.length, unverifiedIssues, strengthIndex, meta.englishDebrief ?? true);

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
    deliveryNotes: wire.deliveryNotes.map((n) => n.trim()).filter(Boolean).slice(0, 5),
    proposalSteps: wire.proposalSteps.map((n) => n.trim()).filter(Boolean).slice(0, 6),
    nextDrill: wire.nextDrill.trim(),
    spoken,
  };
}

/**
 * Keep only spoken segments that point at verified moments, re-check any
 * "you said, '…'" quote against the transcript, and make sure the English
 * debrief opens and closes with the fixed lines.
 */
function buildSpoken(
  wire: CoachReportWire,
  turns: Turn[],
  issueCount: number,
  unverifiedIssues: Set<number>,
  strengthIndex: Map<number, number>,
  english: boolean,
): SpokenSegment[] {
  const out: SpokenSegment[] = [];
  for (const seg of wire.spoken) {
    const text = trimTo(seg.text.replace(/\s+/g, " ").trim(), MAX_SEGMENT_CHARS);
    if (!text) continue;
    let ref: SpokenSegment["ref"] = null;
    const idx = Math.round(seg.refIndex);
    if (seg.refType === "issue") {
      if (idx < 0 || idx >= issueCount || unverifiedIssues.has(idx)) continue;
      ref = { type: "issue", index: idx };
    } else if (seg.refType === "strength") {
      const mapped = strengthIndex.get(idx);
      if (mapped === undefined) continue;
      ref = { type: "strength", index: mapped };
    }
    const q = spokenQuote(text);
    if (q && verifyQuote(turns, -1, q) === null) continue;
    out.push({ label: seg.label.trim().slice(0, 40) || "Coach", text, ref });
  }

  if (english) {
    if (!out[0]?.text.startsWith(DEBRIEF_OPENING)) out.unshift({ label: "Call ended", text: DEBRIEF_OPENING, ref: null });
    if (!/report/i.test(out[out.length - 1]?.text ?? "")) out.push({ label: "Report", text: DEBRIEF_CLOSING, ref: null });
  }
  if (out.length > MAX_SEGMENTS) out.splice(MAX_SEGMENTS - 1, out.length - MAX_SEGMENTS);
  return out;
}
