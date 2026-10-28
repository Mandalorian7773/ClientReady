/**
 * Daily limits roll over at midnight India Standard Time (UTC+05:30, no DST).
 */
const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000;

/** The IST calendar day, e.g. "2026-10-29". */
export function istDay(now = Date.now()): string {
  return new Date(now + IST_OFFSET_MS).toISOString().slice(0, 10);
}

/** Seconds until the next IST midnight (at least 1). */
export function secondsUntilIstMidnight(now = Date.now()): number {
  const ist = now + IST_OFFSET_MS;
  const next = Math.floor(ist / 86_400_000 + 1) * 86_400_000;
  return Math.max(1, Math.ceil((next - ist) / 1000));
}
