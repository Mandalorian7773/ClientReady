import { NextResponse } from "next/server";
import { z } from "zod";
import { handler, readJson } from "@/lib/server/route";
import { claimSession } from "@/lib/server/live-gate";

export const runtime = "nodejs";

const Body = z.object({ sessionId: z.string().regex(/^[a-zA-Z0-9_-]{8,64}$/) });

/**
 * Claims a live-call slot before any paid API is used. 429 with code
 * live_paused, live_daily_limit or live_visitor_limit when none is available.
 */
export const POST = handler("session", async (req) => {
  const { sessionId } = Body.parse(await readJson(req, 2_000));
  await claimSession(req, sessionId);
  return NextResponse.json({ ok: true });
});
