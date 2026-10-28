"use client";

import { ArrowRight, Mic, Pencil, Square } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Badge, Button, ButtonLink, Card, Eyebrow, Notice } from "@/components/ui";
import { ProviderStatus, useProviderStatus } from "@/components/provider-status";
import { LevelMeter } from "@/components/level-meter";
import { loadDraft } from "@/lib/client/storage";
import { useRecorder, type Recording } from "@/lib/client/recorder";
import { getLanguage } from "@/lib/languages";
import { LABELS, type Scenario } from "@/lib/scenario/schema";
import { OBJECTIVES, TIPS } from "@/lib/scenario/objectives";

export default function BriefingPage() {
  const router = useRouter();
  const [s, setS] = useState<Scenario | null>(null);
  const [loaded, setLoaded] = useState(false);
  const { status } = useProviderStatus();

  useEffect(() => {
    setS(loadDraft());
    setLoaded(true);
  }, []);

  if (!loaded) return null;
  if (!s) {
    return (
      <div className="mx-auto max-w-xl px-4 py-20 text-center">
        <p className="text-fg-muted">No scenario yet.</p>
        <ButtonLink href="/practice" className="mt-4">Build a scenario</ButtonLink>
      </div>
    );
  }

  const lang = getLanguage(s.learner.speechLanguage);

  return (
    <div className="mx-auto max-w-6xl px-4 py-10 sm:px-6 lg:py-14">
      <Eyebrow>Pre-call briefing</Eyebrow>
      <div className="mt-2 flex flex-wrap items-end justify-between gap-4">
        <h1 className="font-display text-4xl leading-tight sm:text-5xl">You&apos;re about to call {s.client.name.split(" ")[0] === "Dr." ? s.client.name : s.client.name.split(" ")[0]}.</h1>
        <Link href="/practice" className="inline-flex items-center gap-1.5 text-sm text-fg-muted hover:text-fg">
          <Pencil className="h-3.5 w-3.5" /> Edit scenario
        </Link>
      </div>

      <div className="mt-8 grid gap-6 lg:grid-cols-[1fr_380px]">
        <div className="grid gap-6">
          <Card className="p-6">
            <div className="flex items-start gap-4">
              <div className="grid h-12 w-12 shrink-0 place-items-center rounded-full bg-client/15 font-semibold text-client">
                {s.client.name.replace(/^Dr\.?\s*/, "").split(" ").map((p) => p[0]).slice(0, 2).join("")}
              </div>
              <div>
                <p className="text-lg font-medium">{s.client.name}</p>
                <p className="text-fg-muted">{s.client.role} · {s.client.businessType}</p>
                <div className="mt-3 flex flex-wrap gap-1.5">
                  <Badge tone="client">{s.client.country}</Badge>
                  <Badge>{s.client.industry}</Badge>
                  <Badge>{LABELS.companySize[s.client.companySize]}</Badge>
                  <Badge>{LABELS.techFamiliarity[s.client.techFamiliarity]}</Badge>
                </div>
              </div>
            </div>
            <dl className="mt-6 grid gap-4 text-sm sm:grid-cols-2">
              <div>
                <dt className="text-fg-subtle">What you know about their situation</dt>
                <dd className="mt-1 leading-relaxed">{s.client.problem || "Not much. You'll need to find out on the call."}</dd>
              </div>
              <div>
                <dt className="text-fg-subtle">What you&apos;ve heard about them</dt>
                <dd className="mt-1 leading-relaxed">{s.client.personality}. {s.client.communication}.</dd>
              </div>
            </dl>
            <p className="mt-5 text-xs text-fg-subtle">Fictional client. They have concerns they won&apos;t mention until the conversation gets there.</p>
          </Card>

          <Card className="p-6">
            <Eyebrow>Your offer</Eyebrow>
            <p className="mt-3 text-lg font-medium">{s.offer.name}</p>
            <p className="mt-1 text-sm leading-relaxed text-fg-muted">{s.offer.description || "No description yet."}</p>
            <dl className="mt-5 grid gap-4 text-sm sm:grid-cols-3">
              <div>
                <dt className="text-fg-subtle">Price</dt>
                <dd className="mt-1 font-mono">{s.offer.currency} {s.offer.price.toLocaleString("en-US")}</dd>
                <dd className="text-xs text-fg-muted">{s.offer.pricingModel}</dd>
              </div>
              <div>
                <dt className="text-fg-subtle">Duration</dt>
                <dd className="mt-1">{s.offer.duration}</dd>
              </div>
              <div>
                <dt className="text-fg-subtle">Outcome</dt>
                <dd className="mt-1">{s.offer.outcome || "Not defined"}</dd>
              </div>
            </dl>
          </Card>

          <Card className="p-6">
            <Eyebrow>Your objective</Eyebrow>
            <p className="mt-3 text-lg leading-snug">{OBJECTIVES[s.settings.focus]}</p>
            <ul className="mt-4 space-y-1.5 text-sm text-fg-muted">
              {TIPS[s.settings.focus].map((t) => (
                <li key={t} className="flex gap-2"><span className="text-signal">→</span>{t}</li>
              ))}
            </ul>
            <div className="mt-5 flex flex-wrap gap-1.5">
              <Badge tone="signal">{LABELS.difficulty[s.settings.difficulty]}</Badge>
              <Badge>{LABELS.friendliness[s.settings.friendliness]} client</Badge>
              <Badge>~{s.settings.maxTurns} answers</Badge>
              <Badge>{LABELS.opening[s.settings.opening]}</Badge>
            </div>
          </Card>
        </div>

        <aside className="grid content-start gap-6 lg:sticky lg:top-20">
          <MicCheck languageLabel={lang.label} />
          <Card className="p-5">
            <Eyebrow>Engines</Eyebrow>
            <div className="mt-3"><ProviderStatus status={status} /></div>
            {status?.reasoning.isDemo && (
              <p className="mt-3 text-xs leading-relaxed text-mid">
                Demo mode: the client and coach are a simple rule-based engine, not an AI model. Add an LLM key to get adaptive conversations.
              </p>
            )}
          </Card>
          <Button size="lg" onClick={() => router.push("/practice/session")}>
            Go to the call <ArrowRight className="h-4 w-4" />
          </Button>
          <Link href="/practice/session?sample" className="label -mt-3 text-center text-fg-muted hover:text-signal">
            Or hear a scripted sample call first
          </Link>
        </aside>
      </div>
    </div>
  );
}

/** A local mic check: it never sends audio anywhere, so it spends no credits. */
function MicCheck({ languageLabel }: { languageLabel: string }) {
  const [rec, setRec] = useState<Recording | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const r = useRecorder({ maxSeconds: 6, onComplete: (x) => { setRec(x); setErr(null); }, onError: setErr });

  return (
    <Card className="p-5">
      <Eyebrow>Microphone check</Eyebrow>
      <p className="mt-2 text-sm text-fg-muted">Say a sentence in {languageLabel}, for example your name and what you do.</p>
      <div className="mt-4 flex items-center gap-3">
        {r.state === "recording" ? (
          <Button variant="secondary" onClick={r.stop}><Square className="h-3.5 w-3.5" /> Stop</Button>
        ) : (
          <Button variant="secondary" onClick={r.start} disabled={r.state === "requesting" || r.state === "processing"}>
            <Mic className="h-4 w-4" /> {rec ? "Test again" : "Test mic"}
          </Button>
        )}
        <LevelMeter level={r.level} active={r.state === "recording"} />
      </div>
      {rec && r.state !== "recording" && (
        <p className="mt-3 text-sm text-good">Mic works: heard {rec.durationSec.toFixed(1)}s of audio.</p>
      )}
      {err && <div className="mt-3"><Notice tone="warn">{err}</Notice></div>}
    </Card>
  );
}
