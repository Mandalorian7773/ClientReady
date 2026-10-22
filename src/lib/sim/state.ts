import { AppError } from "@/lib/server/errors";
import type { Scenario } from "@/lib/scenario/schema";
import type { ClientState, ClientTurnOutput, PersonaDossier, Turn } from "./types";
import { ClientStateSchema, MAX_CLIENT_REPLY_WORDS } from "./types";

export function initialClientState(s: Scenario): ClientState {
  const base = { low: 40, medium: 50, high: 58 }[s.client.urgency];
  const mod = { friendly: 5, neutral: 0, sceptical: -8, demanding: -5 }[s.settings.friendliness];
  return ClientStateSchema.parse({ interest: base + mod });
}

export function learnerTurnCount(turns: Turn[]): number {
  return turns.filter((t) => t.role === "learner").length;
}

/**
 * Validate the transcript the browser sends back. Turns must be contiguous,
 * start with the client, and alternate. This prevents duplicated or
 * reordered turns from being sent to the model.
 */
export function validateTranscript(turns: Turn[], expect: "client-next" | "learner-last" | "any"): void {
  turns.forEach((t, i) => {
    if (t.index !== i) throw new AppError("bad_request", `Transcript turn ${i} has index ${t.index}.`);
    const role = i % 2 === 0 ? "client" : "learner";
    if (t.role !== role) throw new AppError("bad_request", `Transcript turn ${i} should be from the ${role}.`);
  });
  if (expect === "client-next" && turns.length > 0 && turns[turns.length - 1].role !== "learner") {
    throw new AppError("duplicate_turn", "The client has already replied to this turn.", 409);
  }
  if (expect === "learner-last" && turns.length === 0) {
    throw new AppError("bad_request", "Transcript is empty.");
  }
}

/** Hard cap so a session can never run away (and burn credits). */
export function hardTurnLimit(s: Scenario): number {
  return s.settings.maxTurns + 2;
}

export function limitWords(text: string, maxWords: number): string {
  const words = text.trim().split(/\s+/);
  if (words.length <= maxWords) return text.trim();
  const cut = words.slice(0, maxWords).join(" ");
  const lastStop = Math.max(cut.lastIndexOf("."), cut.lastIndexOf("?"), cut.lastIndexOf("!"));
  return lastStop > cut.length * 0.5 ? cut.slice(0, lastStop + 1) : `${cut}…`;
}

/**
 * Merge a model's structured output into client state, distrusting the
 * model: clamp numbers, drop unknown concern IDs, limit interest swings,
 * and force an ending at the hard turn limit.
 */
export function applyClientOutput(
  s: Scenario,
  dossier: PersonaDossier,
  prev: ClientState,
  out: ClientTurnOutput,
  turnIndex: number,
  learnerTurns: number,
): { state: ClientState; reply: string } {
  const known = new Set(dossier.concerns.map((c) => c.id));
  const newIds = [...new Set(out.newConcernIds)].filter((id) => known.has(id) && !prev.raisedConcernIds.includes(id));
  const rawInterest = Number.isFinite(out.interest) ? out.interest : prev.interest;
  const interest = Math.round(Math.max(0, Math.min(100, Math.max(prev.interest - 25, Math.min(prev.interest + 25, rawInterest)))));

  let ended = out.endConversation || out.phase === "ended";
  let outcome = ended ? (out.outcome ?? "follow-up-later") : null;
  if (!ended && learnerTurns >= hardTurnLimit(s)) {
    ended = true;
    outcome = "time-up";
  }

  const reply = limitWords(out.reply.replace(/\s+/g, " ").trim(), MAX_CLIENT_REPLY_WORDS + 20);
  if (!reply) throw new AppError("model_output_invalid", "The client response was empty. Please retry.", 502, true);

  return {
    reply,
    state: {
      interest,
      phase: ended ? "ended" : out.phase,
      raisedConcernIds: [...prev.raisedConcernIds, ...newIds],
      ended,
      outcome,
      notes: out.coachNote?.trim()
        ? [...prev.notes, { turn: turnIndex, note: out.coachNote.trim().slice(0, 400) }].slice(-40)
        : prev.notes,
    },
  };
}
