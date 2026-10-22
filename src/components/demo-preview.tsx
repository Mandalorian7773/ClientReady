"use client";

import { useState } from "react";
import { cn, Badge } from "./ui";

/**
 * Illustrative, hand-written sample. Labelled as such in the UI: it is not a
 * recording of a live model or Gnani call.
 */
const LINES: Array<{ who: "client" | "you"; text: string }> = [
  { who: "client", text: "We miss maybe twenty, thirty calls a week after five. Why should I pay two thousand dollars for an AI to answer them?" },
  { who: "you", text: "Our AI receptionist answers 24/7, books appointments and integrates with your calendar. It uses the latest voice AI." },
  { who: "client", text: "That's a list of features. How do I know it actually brings in patients?" },
];

export function DemoPreview() {
  const [tab, setTab] = useState<"call" | "coach">("call");
  return (
    <div className="relative overflow-hidden rounded-2xl border border-border bg-surface/90 shadow-2xl shadow-black/40">
      <div className="flex items-center justify-between border-b border-border px-4 py-3">
        <div className="flex items-center gap-2">
          <span className="h-2.5 w-2.5 rounded-full bg-low/70" />
          <span className="h-2.5 w-2.5 rounded-full bg-mid/70" />
          <span className="h-2.5 w-2.5 rounded-full bg-good/70" />
        </div>
        <Badge tone="neutral">Illustrative sample, not a live call</Badge>
      </div>
      <div role="tablist" aria-label="Preview" className="flex gap-1 px-4 pt-3">
        {(["call", "coach"] as const).map((t) => (
          <button
            key={t}
            role="tab"
            aria-selected={tab === t}
            onClick={() => setTab(t)}
            className={cn("rounded-md px-3 py-1.5 text-sm transition-colors", tab === t ? "bg-surface-2 text-fg" : "text-fg-muted hover:text-fg")}
          >
            {t === "call" ? "The call" : "The coaching"}
          </button>
        ))}
      </div>

      {tab === "call" ? (
        <div className="space-y-3 p-4" role="tabpanel">
          <div className="flex items-center gap-3 rounded-xl bg-bg-raised px-3 py-2.5">
            <div className="grid h-9 w-9 place-items-center rounded-full bg-client/15 text-sm font-semibold text-client">SM</div>
            <div className="text-sm">
              <p className="font-medium">Dr. Sarah Mitchell</p>
              <p className="text-fg-subtle">Clinic owner · Austin, US · sceptical</p>
            </div>
            <Badge tone="client" className="ml-auto">Speaking</Badge>
          </div>
          {LINES.map((l, i) => (
            <div key={i} className={cn("rise flex", l.who === "you" && "justify-end")} style={{ animationDelay: `${i * 120}ms` }}>
              <p
                className={cn(
                  "max-w-[85%] rounded-2xl px-3.5 py-2.5 text-sm leading-relaxed",
                  l.who === "client" ? "rounded-tl-sm bg-surface-2 text-fg" : "rounded-tr-sm bg-signal/15 text-fg ring-1 ring-signal/30",
                )}
              >
                {l.text}
              </p>
            </div>
          ))}
        </div>
      ) : (
        <div className="space-y-3 p-4 text-sm" role="tabpanel">
          <div className="flex items-baseline justify-between">
            <p className="font-medium">Value proposition</p>
            <span className="font-mono text-mid">42 / 100</span>
          </div>
          <div className="h-1.5 overflow-hidden rounded-full bg-surface-2">
            <div className="h-full w-[42%] rounded-full bg-mid" />
          </div>
          <blockquote className="border-l-2 border-low/60 pl-3 text-fg-muted">“…integrates with your calendar. It uses the latest voice AI.”</blockquote>
          <p className="text-fg-muted">
            <span className="text-fg">Missing:</span> a result in <em>her</em> numbers. She told you about 20–30 missed calls a week.
          </p>
          <div className="rounded-xl border border-good/30 bg-good/5 p-3">
            <p className="mb-1 text-xs uppercase tracking-wider text-good">Stronger answer</p>
            <p className="leading-relaxed">
              “If even five of those thirty missed calls are new patients, that&apos;s more than the setup fee in a month. I&apos;d show you
              the exact number of after-hours bookings every week, so you can judge it yourself.”
            </p>
          </div>
          <p className="text-xs text-fg-subtle">Principle: Benefits over features (Rackham, SPIN Selling)</p>
        </div>
      )}
    </div>
  );
}
