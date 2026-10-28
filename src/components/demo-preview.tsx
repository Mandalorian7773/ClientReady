"use client";

import { useEffect, useRef, useState } from "react";
import { cn } from "./ui";
import { VoiceRing, type VoiceRingHandle } from "./voice-ring";

type PreviewState = "client" | "user";

/**
 * Landing-page preview of the call screen: the real voice ring, driven by a
 * synthetic level (never the mic), cycling between the client speaking and
 * your turn. Labelled as an illustrative sample. With reduced motion it holds
 * still on one state.
 */
export function DemoPreview() {
  const [tab, setTab] = useState<"call" | "coach">("call");
  const [state, setState] = useState<PreviewState>("client");
  const ring = useRef<VoiceRingHandle>(null);

  useEffect(() => {
    if (tab !== "call") return;
    const reduced = typeof matchMedia !== "undefined" && matchMedia("(prefers-reduced-motion: reduce)").matches;
    let current: PreviewState = "client";
    ring.current?.setMode("client");
    setState("client");
    const cycle = reduced
      ? null
      : setInterval(() => {
          current = current === "client" ? "user" : "client";
          ring.current?.setMode(current);
          setState(current);
        }, 4200);

    // Synthetic speech envelope: syllable pulses under slower phrase swells.
    let raf = 0;
    const t0 = performance.now();
    const tick = (now: number) => {
      const t = (now - t0) / 1000;
      if (reduced) ring.current?.setLevel(0.12);
      else {
        const syl = 0.5 + 0.5 * Math.sin(t * (current === "client" ? 24 : 27));
        const phrase = 0.55 + 0.45 * Math.sin(t * 2.3) * Math.sin(t * 5.1 + 1);
        ring.current?.setLevel(Math.max(0, Math.min(1, 0.18 + 0.6 * syl * phrase)));
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => {
      if (cycle) clearInterval(cycle);
      cancelAnimationFrame(raf);
    };
  }, [tab]);

  return (
    <div className="rounded-sm border border-dotted border-rule bg-bg-raised/40">
      <div className="rule-b flex flex-wrap items-center justify-between gap-2 px-4 py-3">
        <div role="tablist" aria-label="Preview" className="flex gap-4">
          {(["call", "coach"] as const).map((t) => (
            <button
              key={t}
              role="tab"
              aria-selected={tab === t}
              onClick={() => setTab(t)}
              className={cn("label min-h-11 border-b transition-colors", tab === t ? "border-signal-strong text-fg" : "border-transparent text-fg-muted hover:text-fg")}
            >
              {t === "call" ? "The call" : "The coaching"}
            </button>
          ))}
        </div>
        <span className="label text-fg-muted">Illustrative sample, not a live call</span>
      </div>

      {tab === "call" ? (
        <div role="tabpanel">
          <div className="relative h-72 sm:h-80">
            <VoiceRing ref={ring} className="absolute inset-0 h-full w-full" />
            <span className={cn("label absolute bottom-3 left-4", state === "client" ? "text-fg-muted" : "text-signal")} aria-live="polite">
              {state === "client" ? "Client speaking" : "Your turn"}
            </span>
          </div>
          <div className="rule-t flex items-baseline justify-between gap-3 px-4 py-3">
            <span className="text-[15px] tracking-[-0.01em]">Dr. Sarah Mitchell · Clinic owner, Austin, US</span>
            <span className="label text-fg-muted">No transcript</span>
          </div>
        </div>
      ) : (
        <div className="space-y-4 px-4 py-5 text-sm" role="tabpanel">
          <div className="flex items-baseline justify-between">
            <span className="label">Value proposition</span>
            <span className="tabular text-[28px] font-medium leading-none tracking-[-0.03em] text-low">42</span>
          </div>
          <span className="flex gap-1" aria-hidden>
            {[1, 2, 3, 4, 5].map((n) => (
              <i key={n} className={cn("h-[3px] flex-1", n <= 2 ? "bg-accent-bright" : "bg-surface-2")} />
            ))}
          </span>
          <p className="text-[17px] leading-snug tracking-[-0.01em]">“…integrates with your calendar. It uses the latest voice AI.”</p>
          <p className="text-fg-muted">
            <span className="text-fg">Missing:</span> a result in her numbers. She told you about 20 to 30 missed calls a week.
          </p>
          <div className="rule-t pt-3">
            <span className="label text-signal">Say this instead</span>
            <p className="mt-1.5 leading-relaxed">
              “If even five of those thirty missed calls are new patients, that&apos;s more than the setup fee in a month. I&apos;d show you the exact number of after-hours
              bookings every week, so you can judge it yourself.”
            </p>
          </div>
          <p className="text-xs text-fg-subtle">Principle: Benefits over features (Rackham, SPIN Selling)</p>
        </div>
      )}
    </div>
  );
}
