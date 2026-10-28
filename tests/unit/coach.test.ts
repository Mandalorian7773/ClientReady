import { describe, expect, it } from "vitest";
import { CATEGORIES, TOTAL_WEIGHT, PRINCIPLES } from "@/lib/coach/rubric";
import { overallScore, scoreBand } from "@/lib/coach/score";
import { computeDeliveryMetrics, scoreDelivery } from "@/lib/coach/metrics";
import { CoachReportWireSchema, finalizeReport, verifyQuote, type CoachReportWire } from "@/lib/coach/report";
import { reportToMarkdown } from "@/lib/coach/markdown";
import { initialClientState } from "@/lib/sim/state";
import { sampleTurns, scenario, turn } from "../helpers/fixtures";

function wire(overrides: Partial<CoachReportWire> = {}): CoachReportWire {
  return {
    summary: "Solid discovery, weak close.",
    categories: CATEGORIES.map((c) => ({ id: c.id, observed: true, score: 60, rationale: `${c.name} ok`, evidence: [] })),
    strengths: [],
    issues: [],
    plan: [],
    languageBridge: [],
    deliveryNotes: [],
    proposalSteps: [],
    nextDrill: "",
    spoken: [],
    ...overrides,
  };
}

describe("rubric", () => {
  it("weights sum to 100", () => {
    expect(TOTAL_WEIGHT).toBe(100);
  });

  it("covers the nine required categories with four anchors each", () => {
    expect(CATEGORIES.map((c) => c.id)).toEqual(["discovery", "value", "clarity", "offer", "technical", "objections", "negotiation", "closing", "delivery"]);
    for (const c of CATEGORIES) expect(Object.keys(c.anchors)).toHaveLength(4);
  });

  it("references only defined principles, each with a source", () => {
    const ids = new Set(PRINCIPLES.map((p) => p.id));
    for (const c of CATEGORIES) for (const p of c.principleIds) expect(ids.has(p), p).toBe(true);
    for (const p of PRINCIPLES) expect(p.source.length).toBeGreaterThan(10);
  });
});

describe("overallScore", () => {
  it("computes the weighted mean", () => {
    expect(overallScore(CATEGORIES.map((c) => ({ id: c.id, score: 80 })))).toBe(80);
    const mixed = CATEGORIES.map((c) => ({ id: c.id, score: c.id === "discovery" ? 0 : 100 }));
    expect(overallScore(mixed)).toBe(86); // (100*86)/100
  });

  it("excludes unobserved categories and renormalises", () => {
    const scores = CATEGORIES.map((c) => ({ id: c.id, score: c.id === "negotiation" ? null : 70 }));
    expect(overallScore(scores)).toBe(70);
  });

  it("clamps out-of-range values and returns null when nothing observed", () => {
    expect(overallScore([{ id: "discovery", score: 250 }])).toBe(100);
    expect(overallScore(CATEGORIES.map((c) => ({ id: c.id, score: null })))).toBeNull();
  });

  it("maps bands", () => {
    expect(scoreBand(90).label).toBe("Client-ready");
    expect(scoreBand(40).tone).toBe("low");
    expect(scoreBand(null).label).toBe("Not enough data");
  });
});

describe("delivery metrics", () => {
  it("computes words per minute only from spoken turns", () => {
    const m = computeDeliveryMetrics([
      turn(0, "Hello"),
      turn(1, Array(20).fill("word").join(" "), { source: "prisma", audioSeconds: 8 }),
      turn(2, "Ok"),
      turn(3, Array(50).fill("typed").join(" "), { source: "typed", audioSeconds: undefined }),
    ]);
    expect(m.wordsPerMinute).toBe(150);
    expect(m.typedTurns).toBe(1);
    expect(m.spokenTurns).toBe(1);
  });

  it("counts filler words but not legitimate 'like'", () => {
    const m = computeDeliveryMetrics([turn(0, "Hi"), turn(1, "Um so basically I would like to, uh, build it")]);
    expect(m.fillerCount).toBe(3);
  });

  it("returns null wpm with no audio and null score with no learner turns", () => {
    expect(computeDeliveryMetrics([turn(0, "Hi"), turn(1, "Hello there", { source: "typed", audioSeconds: undefined })]).wordsPerMinute).toBeNull();
    expect(scoreDelivery(computeDeliveryMetrics([turn(0, "Hi")]))).toBeNull();
  });

  it("rewards a comfortable pace and few fillers over a rushed, padded delivery", () => {
    const good = computeDeliveryMetrics([turn(0, "Hi"), turn(1, Array(40).fill("clear").join(" "), { audioSeconds: 17 })]);
    const bad = computeDeliveryMetrics([turn(0, "Hi"), turn(1, `${"um ".repeat(10)}${Array(40).fill("fast").join(" ")}`, { audioSeconds: 9 })]);
    expect(scoreDelivery(good)!).toBeGreaterThan(scoreDelivery(bad)!);
  });
});

describe("quote verification", () => {
  it("finds exact and lightly-punctuated quotes in the cited turn", () => {
    expect(verifyQuote(sampleTurns, 1, "How many calls do you miss in a typical week")).toBe(1);
    expect(verifyQuote(sampleTurns, 1, "how many calls, do you miss")).toBe(1);
  });

  it("corrects an off-by-one turn index", () => {
    expect(verifyQuote(sampleTurns, 1, "costs $2,000 for setup")).toBe(3);
  });

  it("rejects invented quotes and client lines", () => {
    expect(verifyQuote(sampleTurns, 3, "we guarantee 100% accuracy")).toBeNull();
    expect(verifyQuote(sampleTurns, 2, "Maybe twenty or thirty")).toBeNull();
  });

  it("matches the English rendering for non-English turns", () => {
    const t = [turn(0, "Hi"), turn(1, "मैं आपकी मदद कर सकता हूँ", { englishText: "I can help you with that." })];
    expect(verifyQuote(t, 1, "I can help you")).toBe(1);
  });
});

describe("finalizeReport", () => {
  const state = { ...initialClientState(scenario), outcome: "next-step-agreed" as const };

  it("drops hallucinated quotes and counts them", () => {
    const w = wire({
      categories: CATEGORIES.map((c) => ({
        id: c.id,
        observed: true,
        score: 70,
        rationale: "",
        evidence: c.id === "discovery" ? [{ turn: 1, quote: "How many calls do you miss" }, { turn: 3, quote: "I invented this sentence" }] : [],
      })),
      strengths: [{ turn: 3, quote: "totally fake praise line", why: "x" }],
    });
    const r = finalizeReport(w, sampleTurns, state, { generatedBy: "test", isDemo: false });
    expect(r.categories.find((c) => c.id === "discovery")!.evidence).toHaveLength(1);
    expect(r.strengths).toHaveLength(0);
    expect(r.droppedQuotes).toBe(2);
  });

  it("computes the overall score itself and replaces delivery with the measured score", () => {
    const w = wire({ categories: CATEGORIES.map((c) => ({ id: c.id, observed: true, score: c.id === "delivery" ? 3 : 60, rationale: "", evidence: [] })) });
    const r = finalizeReport(w, sampleTurns, state, { generatedBy: "test", isDemo: false });
    const delivery = r.categories.find((c) => c.id === "delivery")!;
    expect(delivery.score).not.toBe(3);
    expect(r.overall).toBe(overallScore(r.categories));
  });

  it("does not score delivery for an all-typed session", () => {
    const typed = sampleTurns.map((t) => (t.role === "learner" ? { ...t, source: "typed" as const, audioSeconds: undefined } : t));
    const r = finalizeReport(wire(), typed, state, { generatedBy: "test", isDemo: false });
    const delivery = r.categories.find((c) => c.id === "delivery")!;
    expect(delivery.score).toBeNull();
    expect(delivery.rationale).toMatch(/No spoken answers/);
  });

  it("fills categories the model omitted as not observed", () => {
    const w = wire({ categories: [{ id: "discovery", observed: true, score: 120, rationale: "great", evidence: [] }] });
    const r = finalizeReport(w, sampleTurns, state, { generatedBy: "test", isDemo: false });
    expect(r.categories).toHaveLength(9);
    expect(r.categories.find((c) => c.id === "discovery")!.score).toBe(100);
    expect(r.categories.find((c) => c.id === "negotiation")!.score).toBeNull();
  });

  it("nulls an issue's quote when it can't be verified but keeps the advice", () => {
    const w = wire({
      issues: [
        {
          title: "Close", category: "closing", turn: 3, quote: "not in transcript", whatWasMissing: "a date", whyItMattered: "busy",
          betterResponse: "Can we book Friday?", whyBetterWorks: "specific", principleId: "advance", exercise: "practise",
        },
      ],
    });
    const r = finalizeReport(w, sampleTurns, state, { generatedBy: "test", isDemo: false });
    expect(r.issues[0].quote).toBeNull();
    expect(r.issues[0].turn).toBeNull();
    expect(r.issues[0].principle?.name).toBe("Agree an Advance");
  });

  it("uses the learner's real words in the language bridge", () => {
    const turns = [turn(0, "Hi"), turn(1, "मेरा दाम दो हज़ार डॉलर है", { englishText: "My price is two thousand dollars." })];
    const w = wire({ languageBridge: [{ turn: 1, original: "model-altered text", clearerEnglish: "My fee is $2,000.", note: "ok" }, { turn: 7, original: "x", clearerEnglish: "y", note: "z" }] });
    const r = finalizeReport(w, turns, state, { generatedBy: "test", isDemo: false });
    expect(r.languageBridge).toHaveLength(1);
    expect(r.languageBridge[0].original).toBe("मेरा दाम दो हज़ार डॉलर है");
  });

  it("rejects malformed model output at the schema", () => {
    expect(CoachReportWireSchema.safeParse({ summary: "x" }).success).toBe(false);
    expect(CoachReportWireSchema.safeParse({ ...wire(), categories: [{ id: "charisma", observed: true, score: 1, rationale: "", evidence: [] }] }).success).toBe(false);
  });

  it("exports to markdown with transcript and sources", () => {
    const r = finalizeReport(wire(), sampleTurns, state, { generatedBy: "test", isDemo: false });
    const md = reportToMarkdown(r, scenario, sampleTurns);
    expect(md).toContain("# ClientReady coaching report");
    expect(md).toContain("## Transcript");
    expect(md).toContain("How many calls do you miss");
  });
});

describe("spoken debrief", () => {
  const state = initialClientState(scenario);
  const issue = (quote: string, turn = 3) => ({
    title: "Price", category: "offer" as const, turn, quote, whatWasMissing: "value first", whyItMattered: "busy",
    betterResponse: "If it books two patients a month it pays for itself.", whyBetterWorks: "outcome first", principleId: "value-pricing", exercise: "drill",
  });

  it("drops segments whose moment or quote can't be verified, and remaps strengths", async () => {
    const { finalizeReport: fin, DEBRIEF_OPENING, spokenQuote } = await import("@/lib/coach/report");
    const r = fin(
      wire({
        strengths: [
          { turn: 1, quote: "invented praise line", why: "x" },
          { turn: 1, quote: "How many calls do you miss", why: "good discovery" },
        ],
        issues: [issue("costs $2,000 for setup"), issue("I promise a 100% guarantee")],
        spoken: [
          { label: "Price", text: "In this part you said, 'costs $2,000 for setup'. Lead with value.", refType: "issue", refIndex: 0 },
          { label: "Fake", text: "In this part you said, 'I promise a 100% guarantee'. Never promise that.", refType: "issue", refIndex: 1 },
          { label: "Gone", text: "Nice praise.", refType: "strength", refIndex: 0 },
          { label: "Kept", text: "In this part you said, 'How many calls do you miss'. Great question.", refType: "strength", refIndex: 1 },
          { label: "Sneaky", text: "In this part you said, 'something you never said'. Fix it.", refType: "none", refIndex: -1 },
        ],
      }),
      sampleTurns,
      state,
      { generatedBy: "t", isDemo: false },
    );
    const labels = r.spoken.map((s) => s.label);
    expect(labels).toEqual(["Call ended", "Price", "Kept", "Report"]);
    expect(r.spoken[0].text).toBe(DEBRIEF_OPENING);
    expect(r.spoken[2].ref).toEqual({ type: "strength", index: 0 });
    expect(spokenQuote("In this part you said, “ok then”. Next.")).toBe("ok then");
  });

  it("does not force English opening lines on a non-English debrief", async () => {
    const { finalizeReport: fin } = await import("@/lib/coach/report");
    const r = fin(wire({ spoken: [{ label: "शुरुआत", text: "कॉल खत्म हो गई है।", refType: "none", refIndex: -1 }] }), sampleTurns, state, {
      generatedBy: "t", isDemo: false, englishDebrief: false,
    });
    expect(r.spoken).toHaveLength(1);
  });

  it("caps segment length and count", async () => {
    const { finalizeReport: fin } = await import("@/lib/coach/report");
    const long = { label: "L", text: "Sentence one. ".repeat(100), refType: "none" as const, refIndex: -1 };
    const r = fin(wire({ spoken: Array(15).fill(long) }), sampleTurns, state, { generatedBy: "t", isDemo: false });
    expect(r.spoken.length).toBeLessThanOrEqual(9);
    for (const s of r.spoken) expect(s.text.length).toBeLessThanOrEqual(701);
  });

  it("includes hedges and microphone metrics in delivery", () => {
    const m = computeDeliveryMetrics([turn(0, "Hi"), turn(1, "I think it's a good price, maybe we can start soon")], {
      speakingSeconds: 5, clientSeconds: 10, talkTimeSharePct: 33, medianAnswerDelayMs: 4200, midAnswerPauses: 2, longestPauseMs: 1500, loudnessVariation: 0.4,
    });
    expect(m.hedgeCount).toBe(2);
    expect(m.voice?.medianAnswerDelayMs).toBe(4200);
  });
});
