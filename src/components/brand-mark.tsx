import { ACCENT, ringMarkLines } from "@/lib/brand/ring-mark";

const LINES = ringMarkLines(64);

/** The ClientReady mark (a still of the call ring around the orange dot), inline for crisp rendering. */
export function BrandMark({ size = 20, className }: { size?: number; className?: string }) {
  return (
    <svg viewBox="0 0 64 64" width={size} height={size} aria-hidden className={className}>
      {LINES.map((l, i) => (
        <line key={i} x1={l.x1} y1={l.y1} x2={l.x2} y2={l.y2} stroke={l.color} strokeOpacity={l.opacity} strokeWidth={2.6} strokeLinecap="round" />
      ))}
      <circle cx={32} cy={32} r={6} fill={ACCENT} />
    </svg>
  );
}
