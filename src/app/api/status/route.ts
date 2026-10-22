import { NextResponse } from "next/server";
import { publicStatus } from "@/lib/server/env";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Which providers are configured. Booleans and labels only; never secrets. */
export async function GET() {
  return NextResponse.json(publicStatus(), { headers: { "Cache-Control": "no-store" } });
}
