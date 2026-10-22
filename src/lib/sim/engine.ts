import type { ReasoningProvider } from "@/lib/providers/types";
import { demoClientTurn, demoOpening, DEMO_LABEL } from "@/lib/providers/reasoning/demo";
import { needsEnglishBridge } from "@/lib/languages";
import { AppError } from "@/lib/server/errors";
import type { Scenario } from "@/lib/scenario/schema";
import { buildDossier } from "./persona";
import { buildClientSystemPrompt, toChatMessages } from "./prompts";
import { applyClientOutput, hardTurnLimit, initialClientState, learnerTurnCount, validateTranscript } from "./state";
import { ClientTurnOutputSchema, type ClientState, type ClientTurnOutput, type Turn } from "./types";

export interface ClientTurnResult {
  reply: string;
  state: ClientState;
  /** English rendering of the learner's last turn when they did not speak English. */
  learnerEnglish?: string;
  generatedBy: string;
  isDemo: boolean;
}

/**
 * Generate the client's next line. `turns` must end with a learner turn,
 * or be empty for the opening line.
 */
export async function runClientTurn(
  reasoner: ReasoningProvider | null,
  scenario: Scenario,
  turns: Turn[],
  prevState: ClientState | null,
): Promise<ClientTurnResult> {
  validateTranscript(turns, turns.length === 0 ? "any" : "client-next");
  const state = prevState ?? initialClientState(scenario);
  if (state.ended) throw new AppError("session_limit", "This conversation has already ended.", 409);

  const learnerTurns = learnerTurnCount(turns);
  if (learnerTurns > hardTurnLimit(scenario)) throw new AppError("session_limit", "This session has reached its turn limit.", 409);

  const dossier = buildDossier(scenario);
  const turnIndex = turns.length;

  if (!reasoner) {
    if (turns.length === 0) {
      return { reply: demoOpening(scenario), state: { ...state, phase: "opening" }, generatedBy: DEMO_LABEL, isDemo: true };
    }
    const out = demoClientTurn(scenario, dossier, turns, state);
    const applied = applyClientOutput(scenario, dossier, state, out, turnIndex, learnerTurns);
    return { ...applied, generatedBy: DEMO_LABEL, isDemo: true };
  }

  const out: ClientTurnOutput = await reasoner.generateJSON({
    purpose: "client-turn",
    system: buildClientSystemPrompt(scenario, dossier),
    messages: toChatMessages(scenario, turns, state),
    schema: ClientTurnOutputSchema,
    schemaName: "client_turn",
    maxTokens: 1200,
  });

  if (turns.length === 0) {
    const applied = applyClientOutput(
      scenario,
      dossier,
      state,
      { ...out, endConversation: false, outcome: null, phase: "opening", newConcernIds: [] },
      turnIndex,
      0,
    );
    return { reply: applied.reply, state: applied.state, generatedBy: reasoner.label, isDemo: false };
  }

  const applied = applyClientOutput(scenario, dossier, state, out, turnIndex, learnerTurns);
  const learnerEnglish =
    needsEnglishBridge(scenario.learner.speechLanguage) && out.learnerEnglish?.trim() ? out.learnerEnglish.trim().slice(0, 3000) : undefined;
  return { ...applied, learnerEnglish, generatedBy: reasoner.label, isDemo: false };
}
