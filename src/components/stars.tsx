import { Star } from "lucide-react";
import { cn } from "./ui";

export function Stars({ value, max = 3, size = "h-4 w-4", className }: { value: number; max?: number; size?: string; className?: string }) {
  return (
    <span className={cn("inline-flex gap-0.5", className)} role="img" aria-label={`${value} of ${max} stars`}>
      {Array.from({ length: max }, (_, i) => (
        <Star key={i} aria-hidden className={cn(size, i < value ? "fill-accent-bright text-accent-bright" : "text-rule")} />
      ))}
    </span>
  );
}
