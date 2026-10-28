import { NextResponse } from "next/server";
import { publicStatus } from "@/lib/server/env";
import { availability } from "@/lib/server/live-gate";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Which providers are configured and whether live calls are available. Never secrets. */
export async function GET(req: Request) {
  const avail = await availability(req);
  return NextResponse.json({ ...publicStatus(), ...avail }, { headers: { "Cache-Control": "no-store" } });
}
