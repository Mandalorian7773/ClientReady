import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { usageReport } from "@/lib/server/live-gate";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function tokenMatches(given: string | null, expected: string | undefined): boolean {
  if (!given || !expected) return false;
  const a = Buffer.from(given);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

/**
 * Usage per IST day (live sessions, Prisma audio seconds, Timbre characters),
 * to compare with the Gnani dashboard. Requires header x-admin-token = ADMIN_TOKEN.
 */
export async function GET(req: Request) {
  const expected = process.env.ADMIN_TOKEN?.trim();
  if (!tokenMatches(req.headers.get("x-admin-token"), expected)) {
    return NextResponse.json({ error: { code: "unauthorized", message: "Not authorised.", retryable: false } }, { status: 401, headers: { "Cache-Control": "no-store" } });
  }
  return NextResponse.json(await usageReport(), { headers: { "Cache-Control": "no-store" } });
}
