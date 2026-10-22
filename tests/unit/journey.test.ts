import { describe, expect, it } from "vitest";
import { runClientTurn } from "@/lib/sim/engine";
import { generateCoachReport } from "@/lib/coach/generate";
import { PRESETS } from "@/lib/scenario/presets";
import type { ClientState, Turn } from "@/lib/sim/types";

/**
 * End-to-end user journey through the demo engine (no network): open the
 * call, answer several times, reach an outcome, and produce a valid report.
 */
const ANSWERS = [
  "Thanks for the time. Before I suggest anything, how many calls or requests do you miss in a typical week, and what happens to them?",
  "That's useful. So if even five of those turn into customers, that's real revenue. We would set up the system, integrate it, and test it for two weeks with human fallback.",
  "The price is the quoted fixed fee. It includes setup, integration, training and 30 days of support.",
  "I'd suggest a two week pilot. I can send a one-page proposal by Thursday and we book a call on Friday. Does that work?",
];

describe.each(PRESETS.map((p) => [p.id, p] as const))("demo journey: %s", (_id, preset) => {
  it("completes a conversation and a coaching report", async () => {
    const s = preset.scenario;
    let turns: Turn[] = [];
    let state: ClientState | null = null;

    const open = await runClientTurn(null, s, turns, state);
    expect(open.isDemo).toBe(true);
    turns = [{ index: 0, role: "client", text: open.reply, source: "model" }];
    state = open.state;

    for (const answer of ANSWERS) {
      if (state!.ended) break;
      turns = [...turns, { index: turns.length, role: "learner", text: answer, source: "prisma", audioSeconds: 12 }];
      const res = await runClientTurn(null, s, turns, state);
      turns = [...turns, { index: turns.length, role: "client", text: res.reply, source: "model" }];
      state = res.state;
      expect(res.reply.length).toBeGreaterThan(5);
    }

    expect(state!.ended).toBe(true);
    const report = await generateCoachReport(null, s, turns.slice(0, turns.at(-1)!.role === "client" ? -1 : undefined), state!);
    expect(report.isDemo).toBe(true);
    expect(report.categories).toHaveLength(9);
    expect(report.overall).not.toBeNull();
    expect(report.droppedQuotes).toBe(0); // demo engine only quotes real turns
    expect(report.summary).toMatch(/Demo engine/);
  });
});
