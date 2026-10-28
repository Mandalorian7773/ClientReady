import { BrandMark } from "./brand-mark";
import { cn } from "./ui";

/** The ClientReady wordmark: the ring mark and the spaced uppercase name. Used on every screen. */
export function Wordmark({ className }: { className?: string }) {
  return (
    <span className={cn("inline-flex items-center gap-2", className)}>
      <BrandMark size={22} className="-my-1 shrink-0" />
      <span className="text-[13px] font-medium leading-none tracking-[0.22em]">CLIENTREADY</span>
    </span>
  );
}
