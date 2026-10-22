import { encodeWavPcm16 } from "@/lib/audio/wav";
import { parseScenario, type Scenario } from "@/lib/scenario/schema";
import { DEFAULT_SCENARIO } from "@/lib/scenario/presets";
import type { ClientTurnOutput, Turn } from "@/lib/sim/types";
import type { ChatMessage, ReasoningProvider } from "@/lib/providers/types";
import type { z } from "zod";

export const scenario: Scenario = DEFAULT_SCENARIO;

export function hindiScenario(): Scenario {
  return parseScenario({ ...scenario, learner: { ...scenario.learner, speechLanguage: "hi", coachingLanguage: "hi" } });
}

export function turn(index: number, text: string, extra: Partial<Turn> = {}): Turn {
  return { index, role: index % 2 === 0 ? "client" : "learner", text, source: index % 2 === 0 ? "model" : "prisma", audioSeconds: index % 2 ? 6 : undefined, ...extra };
}

export const sampleTurns: Turn[] = [
  turn(0, "Hi, I'm Sarah. We miss lots of calls after five. How could you help?"),
  turn(1, "How many calls do you miss in a typical week, and what happens to those patients?"),
  turn(2, "Maybe twenty or thirty. Some of them book elsewhere, I assume."),
  turn(3, "Our AI receptionist answers every call 24/7 and books into your calendar. It costs $2,000 for setup and we can start with a two week pilot next Monday."),
];

export function clientOutput(overrides: Partial<ClientTurnOutput> = {}): ClientTurnOutput {
  return {
    learnerEnglish: "",
    reply: "Okay. How do I know it pays for itself?",
    interest: 55,
    phase: "objections",
    newConcernIds: ["roi"],
    endConversation: false,
    outcome: null,
    coachNote: "Asked a good discovery question.",
    ...overrides,
  };
}

/** A mock reasoning provider that records calls and returns queued outputs. */
export function mockReasoner(outputs: unknown[] | ((purpose: string) => unknown)) {
  const calls: Array<{ purpose: string; system: string; messages: ChatMessage[] }> = [];
  let i = 0;
  const provider: ReasoningProvider = {
    id: "mock",
    label: "Mock model",
    isDemo: false,
    async generateJSON<T>(input: { purpose: "client-turn" | "coach-report"; system: string; messages: ChatMessage[]; schema: z.ZodType<T> }) {
      calls.push({ purpose: input.purpose, system: input.system, messages: input.messages });
      const out = typeof outputs === "function" ? outputs(input.purpose) : outputs[i++];
      if (out instanceof Error) throw out;
      return input.schema.parse(out);
    },
  };
  return { provider, calls };
}

/** Synthetic 16 kHz mono WAV: a sine tone (or silence) of the given length. */
export function toneWav(seconds: number, amplitude = 0.3, rate = 16000): Uint8Array {
  const n = Math.floor(seconds * rate);
  const s = new Float32Array(n);
  for (let i = 0; i < n; i++) s[i] = amplitude * Math.sin((2 * Math.PI * 220 * i) / rate);
  return encodeWavPcm16(s, rate);
}
