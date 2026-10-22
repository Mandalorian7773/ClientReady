"use client";

import { ArrowRight, BookOpen, Check, ChevronDown, Copy, Download, Printer, Quote, RotateCcw, Volume2 } from "lucide-react";
import { useRef, useState } from "react";
import { Badge, Button, ButtonLink, Card, cn, Eyebrow, Notice, Thinking } from "@/components/ui";
import { ApiError, requestReport, synthesize } from "@/lib/client/api";
import { saveSession, saveDraft, type SavedSession } from "@/lib/client/storage";
import { reportToMarkdown } from "@/lib/coach/markdown";
import { CATEGORIES, PRINCIPLES } from "@/lib/coach/rubric";
import { scoreBand } from "@/lib/coach/score";
import type { CoachReport } from "@/lib/coach/report";
import { getLanguage } from "@/lib/languages";

const OUTCOME_LABEL: Record<string, string> = {
  "deal-agreed": "Deal agreed",
  "next-step-agreed": "Next step agreed",
  "follow-up-later": "Client will follow up",
  "not-interested": "Client passed",
  "time-up": "Ran out of time",
};

function toneFor(score: number | null) {
  if (score === null) return "text-fg-subtle";
  if (score >= 70) return "text-good";
  if (score >= 50) return "text-mid";
  return "text-low";
}
function barFor(score: number | null) {
  if (score === null) return "bg-border-strong";
  if (score >= 70) return "bg-good";
  if (score >= 50) return "bg-mid";
  return "bg-low";
}

export function ScoreRing({ score, size = 132 }: { score: number | null; size?: number }) {
  const r = (size - 14) / 2;
  const c = 2 * Math.PI * r;
  const pct = score === null ? 0 : score / 100;
  const color = score === null ? "var(--border-strong)" : score >= 70 ? "var(--good)" : score >= 50 ? "var(--mid)" : "var(--low)";
  return (
    <div className="relative grid place-items-center" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90" aria-hidden>
        <circle cx={size / 2} cy={size / 2} r={r} stroke="var(--surface-2)" strokeWidth="10" fill="none" />
        <circle cx={size / 2} cy={size / 2} r={r} stroke={color} strokeWidth="10" fill="none" strokeLinecap="round" strokeDasharray={c} strokeDashoffset={c * (1 - pct)} style={{ transition: "stroke-dashoffset 0.8s ease" }} />
      </svg>
      <div className="absolute text-center">
        <p className="font-display text-5xl leading-none">{score ?? "–"}</p>
        <p className="mt-1 text-xs text-fg-subtle">/ 100</p>
      </div>
    </div>
  );
}

export function ReportView({ session, onUpdate }: { session: SavedSession; onUpdate: (s: SavedSession) => void }) {
  const [generating, setGenerating] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function generate() {
    setGenerating(true);
    setErr(null);
    try {
      const report = await requestReport({ sessionId: session.id, scenario: session.scenario, turns: session.turns, clientState: session.clientState });
      const next = { ...session, report };
      saveSession(next);
      onUpdate(next);
    } catch (e) {
      setErr(e instanceof ApiError ? e.message : "Couldn't generate the report.");
    } finally {
      setGenerating(false);
    }
  }

  if (!session.report) {
    return (
      <div className="mx-auto max-w-xl px-4 py-20 text-center">
        <p className="font-display text-3xl">Your transcript is saved.</p>
        <p className="mt-2 text-fg-muted">The coaching report hasn&apos;t been generated yet.</p>
        {err && <div className="mt-4 text-left"><Notice tone="error">{err}</Notice></div>}
        <Button className="mt-6" size="lg" onClick={generate} disabled={generating}>
          {generating ? <Thinking label="Generating…" /> : "Generate coaching report"}
        </Button>
      </div>
    );
  }
  return <Report session={session} report={session.report} />;
}

function Report({ session, report }: { session: SavedSession; report: CoachReport }) {
  const { scenario, turns } = session;
  const band = scoreBand(report.overall);
  const coachLang = getLanguage(scenario.learner.coachingLanguage);
  const [copied, setCopied] = useState(false);

  const md = () => reportToMarkdown(report, scenario, turns);
  const download = () => {
    const blob = new Blob([md()], { type: "text/markdown" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `clientready-report-${new Date(report.createdAt).toISOString().slice(0, 10)}.md`;
    a.click();
    URL.revokeObjectURL(a.href);
  };
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(md());
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      download();
    }
  };
  const retry = () => {
    saveDraft(scenario);
  };

  return (
    <div className="mx-auto max-w-5xl px-4 py-10 sm:px-6 lg:py-14">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <Eyebrow>Coaching report · {new Date(report.createdAt).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" })}</Eyebrow>
          <h1 className="mt-2 font-display text-4xl leading-tight sm:text-5xl">{scenario.title}</h1>
          <p className="mt-1 text-fg-muted">
            {scenario.offer.name} → {scenario.client.name}, {scenario.client.role} ({scenario.client.country})
          </p>
        </div>
        <div className="no-print flex flex-wrap gap-2">
          <Button variant="secondary" size="sm" onClick={copy}>{copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />} {copied ? "Copied" : "Copy"}</Button>
          <Button variant="secondary" size="sm" onClick={download}><Download className="h-3.5 w-3.5" /> Markdown</Button>
          <Button variant="secondary" size="sm" onClick={() => window.print()}><Printer className="h-3.5 w-3.5" /> Print / PDF</Button>
        </div>
      </div>

      {report.isDemo && (
        <div className="mt-6">
          <Notice tone="warn" title="Demo engine report">
            This report was produced by ClientReady&apos;s rule-based demo engine, not a language model. Scores are rough keyword heuristics. Configure an LLM provider for real coaching.
          </Notice>
        </div>
      )}

      {/* Overview */}
      <Card className="mt-6 grid gap-6 p-6 sm:grid-cols-[auto_1fr] sm:items-center sm:p-8">
        <div className="flex flex-col items-center gap-2">
          <ScoreRing score={report.overall} />
          <Badge tone={band.tone === "great" || band.tone === "good" ? "good" : band.tone === "mid" ? "mid" : "low"}>{band.label}</Badge>
        </div>
        <div>
          <div className="flex flex-wrap gap-1.5">
            {report.outcome && <Badge tone="client">{OUTCOME_LABEL[report.outcome] ?? report.outcome}</Badge>}
            <Badge>Final client interest {session.clientState.interest}/100</Badge>
            <Badge>{report.metrics.learnerTurns} answers</Badge>
          </div>
          <p className="mt-4 text-lg leading-relaxed">{report.summary}</p>
          <p className="mt-3 text-xs text-fg-subtle">
            Coaching by {report.generatedBy}{coachLang.id !== "en" ? ` · explained in ${coachLang.label}` : ""}
            {report.droppedQuotes > 0 ? ` · ${report.droppedQuotes} unverifiable quote(s) removed` : ""}
          </p>
        </div>
      </Card>

      {/* Scorecard */}
      <section className="mt-10">
        <h2 className="text-xl font-medium">Scorecard</h2>
        <div className="mt-4 grid gap-3 md:grid-cols-2">
          {report.categories.map((c) => (
            <Card key={c.id} className="p-4">
              <div className="flex items-baseline justify-between gap-3">
                <p className="font-medium">{c.name}</p>
                <span className={cn("font-mono text-sm", toneFor(c.score))}>{c.score === null ? "not observed" : c.score}</span>
              </div>
              <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-surface-2">
                <div className={cn("h-full rounded-full", barFor(c.score))} style={{ width: `${c.score ?? 0}%` }} />
              </div>
              {c.rationale && <p className="mt-3 text-sm leading-relaxed text-fg-muted">{c.rationale}</p>}
              {c.evidence.map((e, i) => (
                <p key={i} className="mt-2 border-l-2 border-border-strong pl-3 text-sm text-fg-muted">
                  “{e.quote}” <span className="text-xs text-fg-subtle">· turn {e.turn}</span>
                </p>
              ))}
            </Card>
          ))}
        </div>
      </section>

      {/* Strengths */}
      {report.strengths.length > 0 && (
        <section className="mt-10">
          <h2 className="text-xl font-medium">What worked</h2>
          <div className="mt-4 grid gap-3 md:grid-cols-2">
            {report.strengths.map((s, i) => (
              <Card key={i} className="border-good/25 p-4">
                <Quote className="h-4 w-4 text-good" aria-hidden />
                <p className="mt-2 leading-relaxed">“{s.quote}”</p>
                <p className="mt-2 text-sm text-fg-muted">{s.why}</p>
                <p className="mt-2 text-xs text-fg-subtle">Turn {s.turn}</p>
              </Card>
            ))}
          </div>
        </section>
      )}

      {/* Issues */}
      {report.issues.length > 0 && (
        <section className="mt-10">
          <h2 className="text-xl font-medium">What to improve</h2>
          <div className="mt-4 space-y-4">
            {report.issues.map((issue, i) => (
              <IssueCard key={i} n={i + 1} issue={issue} />
            ))}
          </div>
        </section>
      )}

      {/* Plan */}
      {report.plan.length > 0 && (
        <section className="mt-10">
          <h2 className="text-xl font-medium">Your plan for next session</h2>
          <ol className="mt-4 grid gap-3 md:grid-cols-3">
            {report.plan.map((p, i) => (
              <li key={i}>
                <Card className="h-full p-5">
                  <span className="font-mono text-xs text-signal">0{i + 1}</span>
                  <p className="mt-2 font-medium">{p.title}</p>
                  <p className="mt-2 text-sm text-fg-muted">{p.why}</p>
                  <p className="mt-3 text-sm"><span className="text-fg-subtle">Exercise: </span>{p.exercise}</p>
                  <p className="mt-2 text-sm"><span className="text-fg-subtle">You&apos;ll know it worked when: </span>{p.successMetric}</p>
                </Card>
              </li>
            ))}
          </ol>
        </section>
      )}

      {/* Language bridge */}
      {report.languageBridge.length > 0 && (
        <section className="mt-10">
          <h2 className="text-xl font-medium">Language bridge</h2>
          <p className="mt-1 text-sm text-fg-muted">What you said, and a clearer professional English version that keeps every detail.</p>
          <div className="mt-4 space-y-3">
            {report.languageBridge.map((b, i) => (
              <Card key={i} className="grid gap-4 p-4 md:grid-cols-2">
                <div>
                  <p className="text-[11px] uppercase tracking-wider text-fg-subtle">You said · turn {b.turn}</p>
                  <p className="mt-1 leading-relaxed">{b.original}</p>
                </div>
                <div>
                  <p className="text-[11px] uppercase tracking-wider text-good">Clearer English</p>
                  <p className="mt-1 leading-relaxed">{b.clearerEnglish}</p>
                  <ListenButton text={b.clearerEnglish} />
                </div>
                {b.note && <p className="text-sm text-fg-muted md:col-span-2">{b.note}</p>}
              </Card>
            ))}
          </div>
        </section>
      )}

      {/* Delivery metrics */}
      <section className="mt-10">
        <h2 className="text-xl font-medium">Delivery, measured</h2>
        <p className="mt-1 text-sm text-fg-muted">From your recordings and transcript only. We don&apos;t score accent, and pace ranges are guidelines, not rules.</p>
        <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
          {[
            ["Speaking rate", report.metrics.wordsPerMinute === null ? "n/a" : `${report.metrics.wordsPerMinute} wpm`, "Comfortable: ~110–170"],
            ["Avg answer", `${report.metrics.avgWordsPerTurn} words`, "Aim: 15–110"],
            ["Fillers", `${report.metrics.fillersPer100Words}/100 words`, `${report.metrics.fillerCount} total`],
            ["Your share of talk", `${Math.round(report.metrics.talkShare * 100)}%`, `${report.metrics.questionsAsked} question${report.metrics.questionsAsked === 1 ? "" : "s"} asked`],
          ].map(([k, v, h]) => (
            <Card key={k} className="p-4">
              <p className="text-xs text-fg-subtle">{k}</p>
              <p className="mt-1 font-mono text-lg">{v}</p>
              <p className="text-xs text-fg-subtle">{h}</p>
            </Card>
          ))}
        </div>
        {report.metrics.typedTurns > 0 && (
          <p className="mt-2 text-xs text-fg-subtle">{report.metrics.typedTurns} answer(s) were typed, so speaking rate only uses spoken turns.</p>
        )}
      </section>

      {/* Transcript */}
      <details className="group mt-10 rounded-2xl border border-border bg-surface/60">
        <summary className="flex cursor-pointer list-none items-center justify-between px-5 py-4 font-medium">
          Full transcript <ChevronDown className="h-4 w-4 transition-transform group-open:rotate-180" />
        </summary>
        <ol className="space-y-3 px-5 pb-5 text-sm">
          {turns.map((t) => (
            <li key={t.index} className="grid grid-cols-[2.5rem_1fr] gap-2">
              <span className="font-mono text-xs text-fg-subtle">[{t.index}]</span>
              <div>
                <span className={t.role === "client" ? "text-client" : "text-signal"}>{t.role === "client" ? scenario.client.name : "You"}</span>
                {t.role === "learner" && <span className="ml-2 text-xs text-fg-subtle">{t.source === "prisma" ? "Prisma" : "typed"}</span>}
                <p className="mt-0.5 leading-relaxed">{t.text}</p>
                {t.englishText && <p className="mt-1 text-fg-muted">English rendering: {t.englishText}</p>}
              </div>
            </li>
          ))}
        </ol>
      </details>

      <Methodology />

      <div className="no-print mt-10 flex flex-wrap gap-3">
        <ButtonLink href="/practice/briefing" size="lg" onClick={retry}>
          <RotateCcw className="h-4 w-4" /> Practise this scenario again
        </ButtonLink>
        <ButtonLink href="/practice" size="lg" variant="secondary">
          New scenario <ArrowRight className="h-4 w-4" />
        </ButtonLink>
        <ButtonLink href="/history" size="lg" variant="ghost">History</ButtonLink>
      </div>
    </div>
  );
}

function IssueCard({ n, issue }: { n: number; issue: CoachReport["issues"][number] }) {
  return (
    <Card className="overflow-hidden">
      <div className="flex items-center gap-3 border-b border-border px-5 py-3">
        <span className="grid h-6 w-6 place-items-center rounded-full bg-signal/15 font-mono text-xs text-signal">{n}</span>
        <p className="font-medium">{issue.title}</p>
        <Badge className="ml-auto hidden sm:inline-flex">{CATEGORIES.find((c) => c.id === issue.category)?.name ?? issue.category}</Badge>
      </div>
      <div className="grid gap-5 p-5 md:grid-cols-2">
        <div className="space-y-3 text-sm">
          {issue.quote ? (
            <div>
              <p className="text-[11px] uppercase tracking-wider text-fg-subtle">You said · turn {issue.turn}</p>
              <p className="mt-1 border-l-2 border-low/60 pl-3 leading-relaxed">“{issue.quote}”</p>
            </div>
          ) : (
            <p className="text-[11px] uppercase tracking-wider text-fg-subtle">Something that was missing from the call</p>
          )}
          <p><span className="text-fg-subtle">Missing: </span>{issue.whatWasMissing}</p>
          <p><span className="text-fg-subtle">Why it mattered to this client: </span>{issue.whyItMattered}</p>
        </div>
        <div className="space-y-3 text-sm">
          <div className="rounded-xl border border-good/30 bg-good/5 p-4">
            <p className="text-[11px] uppercase tracking-wider text-good">Stronger answer</p>
            <p className="mt-1.5 leading-relaxed text-fg">“{issue.betterResponse}”</p>
            <ListenButton text={issue.betterResponse} />
          </div>
          <p className="text-fg-muted">{issue.whyBetterWorks}</p>
        </div>
      </div>
      <div className="flex flex-col gap-2 border-t border-border bg-bg-raised/60 px-5 py-3 text-sm sm:flex-row sm:items-center sm:justify-between">
        <p><span className="text-fg-subtle">Practise: </span>{issue.exercise}</p>
        {issue.principle && (
          <p className="flex shrink-0 items-center gap-1.5 text-xs text-fg-subtle" title={issue.principle.source}>
            <BookOpen className="h-3.5 w-3.5" /> {issue.principle.name}
            {issue.principle.basis === "design" && <span>(our recommendation)</span>}
          </p>
        )}
      </div>
    </Card>
  );
}

/** Plays a suggested English answer through Gnani Timbre, cached per text. */
function ListenButton({ text }: { text: string }) {
  const [state, setState] = useState<"idle" | "loading" | "playing" | "error">("idle");
  const [msg, setMsg] = useState<string | null>(null);
  const urlRef = useRef<string | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  async function go() {
    try {
      if (!urlRef.current) {
        setState("loading");
        const { url } = await synthesize({ text: text.slice(0, 900), kind: "coach", language: "en-IN" });
        urlRef.current = url;
      }
      const a = audioRef.current ?? new Audio();
      audioRef.current = a;
      a.src = urlRef.current;
      a.onended = () => setState("idle");
      setState("playing");
      await a.play();
    } catch (e) {
      setState("error");
      setMsg(e instanceof ApiError ? e.message : "Couldn't play audio.");
    }
  }

  return (
    <div className="no-print mt-2">
      <button onClick={go} disabled={state === "loading" || state === "playing"} className="inline-flex items-center gap-1.5 text-xs text-fg-muted hover:text-fg disabled:opacity-60">
        <Volume2 className="h-3.5 w-3.5" />
        {state === "loading" ? "Generating with Gnani Timbre…" : state === "playing" ? "Playing…" : "Listen (Gnani Timbre)"}
      </button>
      {state === "error" && msg && <p className="mt-1 text-xs text-low">{msg}</p>}
    </div>
  );
}

function Methodology() {
  return (
    <details className="group mt-4 rounded-2xl border border-border bg-surface/60">
      <summary className="flex cursor-pointer list-none items-center justify-between px-5 py-4 font-medium">
        How this score is calculated <ChevronDown className="h-4 w-4 transition-transform group-open:rotate-180" />
      </summary>
      <div className="space-y-4 px-5 pb-5 text-sm leading-relaxed text-fg-muted">
        <p>
          Each skill is scored 0–100 against written anchors. The overall score is a weighted average of the skills that actually came up in the call. Skills
          that didn&apos;t come up are excluded, so a short discovery call isn&apos;t penalised for skipping negotiation. The app computes the overall score, not the
          model.
        </p>
        <ul className="grid gap-1 sm:grid-cols-2">
          {CATEGORIES.map((c) => (
            <li key={c.id}>{c.name}: <span className="font-mono">{c.weight}%</span></li>
          ))}
        </ul>
        <p>
          Delivery is measured from your audio duration and transcript (pace, fillers, answer length). It never considers accent. Every quote in this report is
          checked against your transcript; quotes that can&apos;t be found are removed.
        </p>
        <div>
          <p className="font-medium text-fg">Sources</p>
          <ul className="mt-1 list-disc space-y-1 pl-5">
            {PRINCIPLES.filter((p) => p.basis === "evidence").map((p) => (
              <li key={p.id}>{p.source}</li>
            ))}
          </ul>
          <p className="mt-2 text-xs">Principles marked “our recommendation” are ClientReady design choices informed by these sources.</p>
        </div>
      </div>
    </details>
  );
}
