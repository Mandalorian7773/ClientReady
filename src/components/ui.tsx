import { clsx } from "clsx";
import Link from "next/link";
import type { ComponentProps, ReactNode } from "react";

export const cn = clsx;

type Variant = "primary" | "secondary" | "ghost" | "danger";
type Size = "sm" | "md" | "lg";

const variants: Record<Variant, string> = {
  primary: "bg-signal text-signal-ink hover:bg-signal-strong shadow-[0_0_0_1px_rgba(255,184,74,0.4),0_8px_24px_-8px_rgba(245,165,36,0.55)]",
  secondary: "bg-surface-2 text-fg border border-border-strong hover:border-fg-subtle",
  ghost: "text-fg-muted hover:text-fg hover:bg-surface-2",
  danger: "text-low border border-low/40 hover:bg-low/10",
};
const sizes: Record<Size, string> = {
  sm: "h-8 px-3 text-sm gap-1.5",
  md: "h-10 px-4 text-sm gap-2",
  lg: "h-12 px-6 text-base gap-2",
};

export function buttonClass(variant: Variant = "primary", size: Size = "md", extra?: string) {
  return cn(
    "inline-flex items-center justify-center rounded-lg font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50 select-none",
    variants[variant],
    sizes[size],
    extra,
  );
}

export function Button({ variant = "primary", size = "md", className, ...props }: ComponentProps<"button"> & { variant?: Variant; size?: Size }) {
  return <button type="button" className={buttonClass(variant, size, className)} {...props} />;
}

export function ButtonLink({ variant = "primary", size = "md", className, ...props }: ComponentProps<typeof Link> & { variant?: Variant; size?: Size }) {
  return <Link className={buttonClass(variant, size, className)} {...props} />;
}

export function Card({ className, ...props }: ComponentProps<"div">) {
  return <div className={cn("rounded-2xl border border-border bg-surface/80 backdrop-blur-sm", className)} {...props} />;
}

export function Badge({ tone = "neutral", className, children }: { tone?: "neutral" | "signal" | "client" | "good" | "mid" | "low"; className?: string; children: ReactNode }) {
  const tones = {
    neutral: "border-border-strong text-fg-muted",
    signal: "border-signal/40 text-signal bg-signal/10",
    client: "border-client/40 text-client bg-client/10",
    good: "border-good/40 text-good bg-good/10",
    mid: "border-mid/40 text-mid bg-mid/10",
    low: "border-low/40 text-low bg-low/10",
  };
  return <span className={cn("inline-flex items-center gap-1 whitespace-nowrap rounded-full border px-2 py-0.5 text-xs font-medium", tones[tone], className)}>{children}</span>;
}

export function Eyebrow({ children, className }: { children: ReactNode; className?: string }) {
  return <p className={cn("font-mono text-[11px] uppercase tracking-[0.18em] text-fg-subtle", className)}>{children}</p>;
}

export function Field({ label, hint, htmlFor, children, className }: { label: string; hint?: string; htmlFor: string; children: ReactNode; className?: string }) {
  return (
    <div className={cn("flex flex-col gap-1.5", className)}>
      <label htmlFor={htmlFor} className="text-sm font-medium text-fg">
        {label}
      </label>
      {children}
      {hint && <p className="text-xs text-fg-subtle">{hint}</p>}
    </div>
  );
}

const inputBase =
  "w-full rounded-lg border border-border-strong bg-bg-raised px-3 text-sm text-fg placeholder:text-fg-subtle transition-colors hover:border-fg-subtle focus:border-signal focus:outline-none";

export function Input(props: ComponentProps<"input">) {
  return <input {...props} className={cn(inputBase, "h-10", props.className)} />;
}

export function Textarea(props: ComponentProps<"textarea">) {
  return <textarea {...props} className={cn(inputBase, "min-h-20 py-2 leading-relaxed", props.className)} />;
}

export function Select({ options, ...props }: ComponentProps<"select"> & { options: Array<{ value: string; label: string }> }) {
  return (
    <select {...props} className={cn(inputBase, "h-10 appearance-none bg-[length:12px] bg-[right_12px_center] bg-no-repeat pr-8", props.className)}
      style={{ backgroundImage: "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 12 12'%3E%3Cpath d='M3 4.5l3 3 3-3' stroke='%236e7586' fill='none' stroke-width='1.5'/%3E%3C/svg%3E\")" }}>
      {options.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  );
}

export function Segmented<T extends string>({
  value,
  onChange,
  options,
  name,
}: {
  value: T;
  onChange: (v: T) => void;
  options: Array<{ value: T; label: string }>;
  name: string;
}) {
  return (
    <div role="radiogroup" aria-label={name} className="flex flex-wrap gap-1.5">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="radio"
          aria-checked={value === o.value}
          onClick={() => onChange(o.value)}
          className={cn(
            "rounded-lg border px-3 py-1.5 text-sm transition-colors",
            value === o.value ? "border-signal bg-signal/12 text-fg" : "border-border-strong text-fg-muted hover:border-fg-subtle hover:text-fg",
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function Notice({ tone = "info", title, children, action }: { tone?: "info" | "warn" | "error"; title?: string; children: ReactNode; action?: ReactNode }) {
  const tones = {
    info: "border-client/30 bg-client/5",
    warn: "border-mid/40 bg-mid/5",
    error: "border-low/40 bg-low/5",
  };
  return (
    <div role={tone === "error" ? "alert" : "status"} className={cn("flex flex-col gap-2 rounded-xl border px-4 py-3 text-sm sm:flex-row sm:items-center sm:justify-between", tones[tone])}>
      <div>
        {title && <p className="font-medium text-fg">{title}</p>}
        <div className="text-fg-muted">{children}</div>
      </div>
      {action}
    </div>
  );
}

export function Thinking({ label }: { label: string }) {
  return (
    <span className="inline-flex items-center gap-2 text-sm text-fg-muted" role="status">
      <span className="inline-flex gap-0.5" aria-hidden>
        <span className="dot h-1.5 w-1.5 rounded-full bg-current" />
        <span className="dot h-1.5 w-1.5 rounded-full bg-current" />
        <span className="dot h-1.5 w-1.5 rounded-full bg-current" />
      </span>
      {label}
    </span>
  );
}
