import { clsx } from "clsx";
import Link from "next/link";
import type { ComponentProps, ReactNode } from "react";

export const cn = clsx;

type Variant = "primary" | "secondary" | "ghost" | "danger";
type Size = "sm" | "md" | "lg";

// Optikka buttons: pill-shaped, small uppercase type, ink on paper.
const variants: Record<Variant, string> = {
  primary: "bg-fg text-bg border border-fg hover:bg-signal-strong hover:border-signal-strong",
  secondary: "border border-fg text-fg hover:bg-fg hover:text-bg",
  ghost: "border border-transparent text-fg-muted hover:text-fg hover:border-rule",
  danger: "border border-low/60 text-low hover:bg-low hover:text-bg",
};
const sizes: Record<Size, string> = {
  sm: "h-8 px-3.5 text-[11px] gap-1.5",
  md: "h-10 px-5 text-[11px] gap-2",
  lg: "h-12 px-6 text-xs gap-2",
};

export function buttonClass(variant: Variant = "primary", size: Size = "md", extra?: string) {
  return cn(
    "inline-flex items-center justify-center rounded-full font-medium uppercase tracking-[0.06em] transition-colors disabled:cursor-not-allowed disabled:opacity-40 select-none",
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
  return <div className={cn("rounded-sm border border-dotted border-rule bg-bg-raised/40", className)} {...props} />;
}

export function Badge({ tone = "neutral", className, children }: { tone?: "neutral" | "signal" | "client" | "good" | "mid" | "low"; className?: string; children: ReactNode }) {
  const tones = {
    neutral: "border-border-strong text-fg-muted",
    signal: "border-signal/50 text-signal",
    client: "border-client/50 text-client",
    good: "border-good/50 text-good",
    mid: "border-mid/50 text-mid",
    low: "border-low/50 text-low",
  };
  return <span className={cn("inline-flex items-center gap-1 whitespace-nowrap rounded-full border px-2 py-0.5 text-[11px] font-medium uppercase tracking-[0.04em]", tones[tone], className)}>{children}</span>;
}

export function Eyebrow({ children, className }: { children: ReactNode; className?: string }) {
  return <p className={cn("label text-fg-subtle", className)}>{children}</p>;
}

export function Field({ label, hint, htmlFor, children, className }: { label: string; hint?: string; htmlFor: string; children: ReactNode; className?: string }) {
  return (
    <div className={cn("flex flex-col gap-1.5", className)}>
      <label htmlFor={htmlFor} className="label text-fg-muted">
        {label}
      </label>
      {children}
      {hint && <p className="text-xs text-fg-subtle">{hint}</p>}
    </div>
  );
}

// Optikka fields: no box, a dotted underline that turns orange on focus.
const inputBase =
  "w-full rounded-none border-0 border-b border-dotted border-fg-subtle bg-transparent px-0 text-[17px] tracking-[-0.01em] text-fg placeholder:text-fg-subtle/80 transition-colors focus:border-solid focus:border-signal-strong focus:outline-none focus-visible:outline-none";

export function Input(props: ComponentProps<"input">) {
  return <input {...props} className={cn(inputBase, "h-10", props.className)} />;
}

export function Textarea(props: ComponentProps<"textarea">) {
  return <textarea {...props} className={cn(inputBase, "min-h-16 resize-y py-1.5 leading-snug", props.className)} />;
}

export function Select({ options, ...props }: ComponentProps<"select"> & { options: Array<{ value: string; label: string }> }) {
  return (
    <select {...props} className={cn(inputBase, "themed-select h-10 bg-[length:12px] bg-[right_12px_center] bg-no-repeat pr-8", props.className)}
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
            "rounded-full border px-3 py-1 text-sm transition-colors",
            value === o.value ? "border-fg bg-fg text-bg" : "border-rule text-fg-muted hover:border-fg hover:text-fg",
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
    info: "border-client/40 bg-bg-raised/60",
    warn: "border-mid/50 bg-bg-raised/60",
    error: "border-low/60 bg-bg-raised/60",
  };
  return (
    <div role={tone === "error" ? "alert" : "status"} className={cn("flex flex-col gap-2 rounded-sm border border-dotted px-4 py-3 text-sm sm:flex-row sm:items-center sm:justify-between", tones[tone])}>
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
