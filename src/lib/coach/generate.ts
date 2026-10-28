import type { ReasoningProvider } from "@/lib/providers/types";
import { demoCoachReport, DEMO_LABEL } from "@/lib/providers/reasoning/demo";
import { AppError } from "@/lib/server/errors";
import type { Scenario } from "@/lib/scenario/schema";
import { buildDossier } from "@/lib/sim/persona";
import { learnerTurnCount, validateTranscript } from "@/lib/sim/state";
import type { ClientState, Turn } from "@/lib/sim/types";
import type { VoiceMetrics } from "@/lib/voice/delivery";
import { computeDeliveryMetrics } from "./metrics";
import { buildCoachSystemPrompt, buildCoachUserMessage } from "./prompts";
import { CoachReportWireSchema, finalizeReport, type CoachReport } from "./report";

export async function generateCoachReport(
  reasoner: ReasoningProvider | null,
  scenario: Scenario,
  turns: Turn[],
  state: ClientState,
  voice: VoiceMetrics | null = null,
): Promise<CoachReport> {
  validateTranscript(turns, "learner-last");
  if (learnerTurnCount(turns) === 0) {
    throw new AppError("bad_request", "Say at least one thing to the client before requesting coaching.");
  }
  const dossier = buildDossier(scenario);
  const englishDebrief = scenario.learner.coachingLanguage === "en";

  if (!reasoner) {
    const wire = demoCoachReport(scenario, dossier, turns, state);
    return finalizeReport(wire, turns, state, { generatedBy: DEMO_LABEL, isDemo: true, voice, englishDebrief: true });
  }

  const metrics = computeDeliveryMetrics(turns, voice);
  const wire = await reasoner.generateJSON({
    purpose: "coach-report",
    system: buildCoachSystemPrompt(scenario),
    messages: [{ role: "user", content: buildCoachUserMessage(scenario, dossier, turns, state, metrics) }],
    schema: CoachReportWireSchema,
    schemaName: "coach_report",
    maxTokens: 12_000,
  });
  return finalizeReport(wire, turns, state, { generatedBy: reasoner.label, isDemo: false, voice, englishDebrief });
}
