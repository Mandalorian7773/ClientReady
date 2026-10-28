import { cn } from "./ui";

/** The ClientReady wordmark: the orange dot and the spaced uppercase name. Used on every screen. */
export function Wordmark({ className }: { className?: string }) {
  return (
    <span className={cn("inline-flex items-center gap-2.5", className)}>
      <span aria-hidden className="h-2.5 w-2.5 shrink-0 rounded-full bg-accent-bright" />
      <span className="text-[13px] font-medium leading-none tracking-[0.22em]">CLIENTREADY</span>
    </span>
  );
}
