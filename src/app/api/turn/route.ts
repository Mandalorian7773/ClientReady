import { NextResponse } from "next/server";
import { z } from "zod";
import { getReasoner } from "@/lib/providers";
import { handler, readJson } from "@/lib/server/route";
import { ScenarioSchema } from "@/lib/scenario/schema";
import { ClientStateSchema, TurnSchema } from "@/lib/sim/types";
import { runClientTurn } from "@/lib/sim/engine";
import { once } from "@/lib/server/idempotency";
import { chargeSession } from "@/lib/server/live-gate";

export const runtime = "nodejs";
export const maxDuration = 60;

const Body = z.object({
  sessionId: z.string().regex(/^[a-zA-Z0-9_-]{8,64}$/),
  scenario: ScenarioSchema,
  turns: z.array(TurnSchema).max(50),
  clientState: ClientStateSchema.nullable().default(null),
});

/**
 * Generate the simulated client's next line. Idempotent per
 * (sessionId, transcript length): a retried or double-submitted request
 * returns the same reply instead of generating (and paying for) a new one.
 */
export const POST = handler("turn", async (req) => {
  const body = Body.parse(await readJson(req));
  await chargeSession(body.sessionId, "turn");
  const reasoner = getReasoner();
  const key = `${body.sessionId}:${body.turns.length}:${body.turns.at(-1)?.text.length ?? 0}`;
  const { value, replayed } = once(key, () => runClientTurn(reasoner, body.scenario, body.turns, body.clientState));
  const result = await value;
  return NextResponse.json({ ...result, replayed });
});
