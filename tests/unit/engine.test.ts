import { describe, expect, it } from "vitest";
import { runClientTurn } from "@/lib/sim/engine";
import { generateCoachReport } from "@/lib/coach/generate";
import { initialClientState } from "@/lib/sim/state";
import { AppError } from "@/lib/server/errors";
import { CATEGORIES } from "@/lib/coach/rubric";
import { parseModelJSON } from "@/lib/providers/reasoning/json";
import { ClientTurnOutputSchema, type Turn } from "@/lib/sim/types";
import { clientOutput, hindiScenario, mockReasoner, sampleTurns, scenario, turn } from "../helpers/fixtures";

describe("runClientTurn with a reasoning model", () => {
  it("generates the opening line without ending or raising concerns", async () => {
    const { provider, calls } = mockReasoner([clientOutput({ reply: "Hi, I'm Sarah.", endConversation: true, newConcernIds: ["roi"] })]);
    const res = await runClientTurn(provider, scenario, [], null);
    expect(res.reply).toBe("Hi, I'm Sarah.");
    expect(res.state.ended).toBe(false);
    expect(res.state.raisedConcernIds).toEqual([]);
    expect(calls[0].messages).toHaveLength(1);
    expect(res.isDemo).toBe(false);
  });

  it("keeps state consistent across turns", async () => {
    const { provider } = mockReasoner([clientOutput({ newConcernIds: ["roi"], interest: 60 }), clientOutput({ newConcernIds: ["price"], interest: 65 })]);
    const r1 = await runClientTurn(provider, scenario, sampleTurns.slice(0, 2), initialClientState(scenario));
    const turns: Turn[] = [...sampleTurns.slice(0, 2), turn(2, r1.reply), turn(3, "It costs $2,000.")];
    const r2 = await runClientTurn(provider, scenario, turns, r1.state);
    expect(r2.state.raisedConcernIds).toEqual(["roi", "price"]);
    expect(r2.state.interest).toBe(65);
  });

  it("refuses to generate a second reply for the same learner turn", async () => {
    const { provider, calls } = mockReasoner([clientOutput()]);
    const err = await runClientTurn(provider, scenario, sampleTurns.slice(0, 3), null).catch((e) => e);
    expect((err as AppError).code).toBe("duplicate_turn");
    expect(calls).toHaveLength(0);
  });

  it("refuses to continue an ended conversation", async () => {
    const { provider } = mockReasoner([clientOutput()]);
    const err = await runClientTurn(provider, scenario, sampleTurns, { ...initialClientState(scenario), ended: true }).catch((e) => e);
    expect((err as AppError).code).toBe("session_limit");
  });

  it("returns an English rendering only when the learner speaks another language", async () => {
    const out = clientOutput({ learnerEnglish: "My price is two thousand dollars." });
    const en = await runClientTurn(mockReasoner([out]).provider, scenario, sampleTurns.slice(0, 2), null);
    expect(en.learnerEnglish).toBeUndefined();
    const hi = await runClientTurn(mockReasoner([out]).provider, hindiScenario(), [turn(0, "Hi"), turn(1, "मेरा दाम दो हज़ार डॉलर है")], null);
    expect(hi.learnerEnglish).toBe("My price is two thousand dollars.");
  });

  it("surfaces provider failures as errors (no fake reply)", async () => {
    const { provider } = mockReasoner([new AppError("timeout", "slow", 504, true)]);
    await expect(runClientTurn(provider, scenario, sampleTurns.slice(0, 2), null)).rejects.toMatchObject({ code: "timeout" });
  });

  it("rejects structurally invalid model output", async () => {
    const { provider } = mockReasoner([{ reply: "hi" }]);
    await expect(runClientTurn(provider, scenario, sampleTurns.slice(0, 2), null)).rejects.toBeTruthy();
  });
});

describe("parseModelJSON (OpenAI-compatible / Evon path)", () => {
  const good = JSON.stringify(clientOutput());
  it("accepts raw JSON, fenced JSON and JSON with surrounding prose", () => {
    expect(parseModelJSON(good, ClientTurnOutputSchema).reply).toContain("pays for itself");
    expect(parseModelJSON("```json\n" + good + "\n```", ClientTurnOutputSchema).interest).toBe(55);
    expect(parseModelJSON(`Sure! ${good} Hope that helps.`, ClientTurnOutputSchema).phase).toBe("objections");
  });
  it("rejects malformed or incomplete JSON with a typed error", () => {
    expect(() => parseModelJSON("{not json", ClientTurnOutputSchema)).toThrow(AppError);
    expect(() => parseModelJSON("no braces here", ClientTurnOutputSchema)).toThrow(AppError);
    expect(() => parseModelJSON('{"reply":"hi"}', ClientTurnOutputSchema)).toThrow(/missing required fields/);
  });
});

describe("generateCoachReport", () => {
  const state = initialClientState(scenario);

  it("requires at least one learner turn", async () => {
    await expect(generateCoachReport(null, scenario, [turn(0, "Hi")], state)).rejects.toMatchObject({ code: "bad_request" });
  });

  it("builds a verified report from model output", async () => {
    const { provider, calls } = mockReasoner([
      {
        summary: "Good start.",
        categories: CATEGORIES.map((c) => ({ id: c.id, observed: true, score: 65, rationale: "ok", evidence: [{ turn: 1, quote: "How many calls do you miss" }] })),
        strengths: [{ turn: 1, quote: "How many calls do you miss in a typical week", why: "Discovery." }],
        issues: [],
        plan: [{ title: "Close", why: "No date", exercise: "Practise", successMetric: "Date agreed" }],
        languageBridge: [],
        deliveryNotes: ["No fillers."],
        proposalSteps: ["Restate the problem."],
        nextDrill: "Close with a date.",
        spoken: [{ label: "Strength", text: "In this part you said, 'How many calls do you miss in a typical week'. Good question.", refType: "strength", refIndex: 0 }],
      },
    ]);
    const r = await generateCoachReport(provider, scenario, sampleTurns, state);
    expect(r.overall).toBeGreaterThan(0);
    expect(r.strengths).toHaveLength(1);
    expect(r.isDemo).toBe(false);
    expect(calls[0].purpose).toBe("coach-report");
    expect(calls[0].messages[0].content).toContain("[1] FREELANCER (spoken, 6.0s)");
    expect(r.spoken[0].text.startsWith("The conversation between you and the client has now ended.")).toBe(true);
    expect(r.spoken[1].ref).toEqual({ type: "strength", index: 0 });
    expect(r.spoken.at(-1)!.text).toMatch(/report/i);
    expect(r.nextDrill).toBe("Close with a date.");
  });

  it("writes the coach prompt in the learner's coaching language", async () => {
    const { provider, calls } = mockReasoner(() => new AppError("timeout", "x", 504));
    await generateCoachReport(provider, hindiScenario(), sampleTurns, state).catch(() => undefined);
    expect(calls[0].system).toContain("in Hindi");
  });
});
