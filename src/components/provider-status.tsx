"use client";

import { useEffect, useState } from "react";
import { getStatus } from "@/lib/client/api";
import type { PublicStatus } from "@/lib/server/env";
import { cn } from "./ui";

export function useProviderStatus() {
  const [status, setStatus] = useState<PublicStatus | null>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    let alive = true;
    getStatus()
      .then((s) => alive && setStatus(s))
      .catch(() => alive && setFailed(true));
    return () => {
      alive = false;
    };
  }, []);
  return { status, failed };
}

function Dot({ ok, demo }: { ok: boolean; demo?: boolean }) {
  return <span aria-hidden className={cn("h-2 w-2 shrink-0 rounded-full", demo ? "bg-mid" : ok ? "bg-good" : "bg-low")} />;
}

/** Live, honest view of which engines are wired up on this deployment. */
export function ProviderStatus({ compact = false, status: given }: { compact?: boolean; status?: PublicStatus | null }) {
  const { status: fetched, failed } = useProviderStatus();
  const status = given ?? fetched;
  if (failed) return <p className="text-xs text-fg-subtle">Provider status unavailable.</p>;
  if (!status) return <p className="text-xs text-fg-subtle">Checking providers…</p>;

  const rows = [
    {
      k: "Speech → text",
      v: status.stt.provider,
      ok: status.stt.configured,
      note: status.stt.configured ? "live" : "not configured: typing only",
    },
    {
      k: "Client voice",
      v: status.tts.provider,
      ok: status.tts.configured,
      note: status.tts.configured ? "live" : "not configured: text only",
    },
    {
      k: "Reasoning",
      v: status.reasoning.label,
      ok: status.reasoning.configured,
      demo: status.reasoning.isDemo,
      note: status.reasoning.isDemo ? "demo mode" : status.reasoning.configured ? "live" : "misconfigured",
    },
  ];

  return (
    <ul className={cn("grid gap-2 text-sm", compact ? "sm:grid-cols-3" : "")}>
      {rows.map((r) => (
        <li key={r.k} className="flex items-start gap-2.5 rounded-lg border border-border bg-bg-raised px-3 py-2">
          <span className="mt-1.5">
            <Dot ok={r.ok} demo={r.demo} />
          </span>
          <span className="min-w-0">
            <span className="block text-[11px] uppercase tracking-wider text-fg-subtle">{r.k}</span>
            <span className="block truncate text-fg">{r.v}</span>
            <span className={cn("block text-xs", r.demo ? "text-mid" : r.ok ? "text-good" : "text-low")}>{r.note}</span>
          </span>
        </li>
      ))}
    </ul>
  );
}
