import { describe, expect, it } from "vitest";
import { segmentMoment, type CoachReport } from "@/lib/coach/report";

const issue = (over: Partial<CoachReport["issues"][number]> = {}): CoachReport["issues"][number] => ({
  title: "Discovery gap",
  category: "discovery",
  turn: 3,
  quote: "it's 1,200 dollars",
  whatWasMissing: "",
  whyItMattered: "",
  betterResponse: "Before price, can I ask what the drop has cost you?",
  whyBetterWorks: "",
  principle: null,
  exercise: "",
  ...over,
});
const report = { issues: [issue(), issue({ quote: null, turn: null })], strengths: [{ turn: 1, quote: "when exactly did sales drop", why: "" }] };

describe("segmentMoment", () => {
  it("shows the quote and the better answer for an issue segment", () => {
    expect(segmentMoment(report, { label: "Discovery gap", text: "In this part you said, 'it's 1,200 dollars'.", ref: { type: "issue", index: 0 } })).toEqual({
      kind: "fix",
      quote: "it's 1,200 dollars",
      turn: 3,
      better: "Before price, can I ask what the drop has cost you?",
    });
  });

  it("marks strengths as keep, without a better answer", () => {
    expect(segmentMoment(report, { label: "Good question", text: "Nice.", ref: { type: "strength", index: 0 } })).toMatchObject({ kind: "keep", quote: "when exactly did sales drop", better: null });
  });

  it("handles a missing-entirely issue with no quote", () => {
    expect(segmentMoment(report, { label: "Closing", text: "You never asked for a next step.", ref: { type: "issue", index: 1 } })).toMatchObject({ quote: null, better: expect.any(String) });
  });

  it("falls back to the quote in the spoken text, and to nothing for intro lines", () => {
    expect(segmentMoment(report, { label: "Coach", text: "Here you said, \"we use GPT\" and stopped.", ref: null })?.quote).toBe("we use GPT");
    expect(segmentMoment(report, { label: "Call ended", text: "The conversation has now ended.", ref: null })).toBeNull();
  });
});
