import { cn } from "./ui";

/** Small bar meter driven by the recorder's 0..1 input level. */
export function LevelMeter({ level, active, bars = 12, className }: { level: number; active: boolean; bars?: number; className?: string }) {
  return (
    <div className={cn("flex h-6 items-end gap-[3px]", className)} aria-hidden>
      {Array.from({ length: bars }, (_, i) => {
        const shape = 0.35 + 0.65 * Math.sin(((i + 1) / (bars + 1)) * Math.PI);
        const h = active ? Math.max(0.12, Math.min(1, level * 1.6 * shape)) : 0.12;
        return <span key={i} className={cn("w-[3px] rounded-full transition-[height] duration-75", active ? "bg-signal" : "bg-border-strong")} style={{ height: `${h * 100}%` }} />;
      })}
    </div>
  );
}
