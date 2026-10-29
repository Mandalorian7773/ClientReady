"use client";

import { ArrowRight, Flame, Languages, Lock, Unlock, Volume2, Zap } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { Stars } from "@/components/stars";
import { Button, ButtonLink, cn, Notice, Select, Thinking } from "@/components/ui";
import { ApiError, requestExplanation, requestReport, synthesize } from "@/lib/client/api";
import { saveDraft, saveSession, type SavedSession } from "@/lib/client/storage";
import { reportToMarkdown } from "@/lib/coach/markdown";
import { CATEGORIES, PRINCIPLES } from "@/lib/coach/rubric";
import { scoreBand } from "@/lib/coach/score";
import type { CoachReport } from "@/lib/coach/report";
import { getLanguage, LANGUAGES } from "@/lib/languages";
import type { Explanation } from "@/lib/coach/explain";
import { getSessionResult, loadProgress } from "@/lib/client/progress";
import { getLevel, levelIndex, levelScenario, PASS_SCORE, streak, type SessionResult } from "@/lib/levels/path";

const OUTCOME_LABEL: Record<string, string> = {
  "deal-agreed": "Deal agreed",
  "next-step-agreed": "Next step agreed",
  "follow-up-later": "Client will follow up",
  "not-interested": "Client passed",
  "time-up": "Ran out of time",
};

const SHORT: Record<string, string> = {
  discovery: "Discovery",
  value: "Value",
  clarity: "Clarity",
  offer: "Offer & price",
  technical: "Technical",
  objections: "Objections",
  negotiation: "Negotiation",
  closing: "Closing",
  delivery: "Delivery",
};

const tone = (score: number | null) => (score === null ? "text-fg-subtle" : score >= 70 ? "text-good" : score >= 50 ? "text-mid" : "text-low");

function shortName(name: string) {
  const parts = name.trim().split(/\s+/);
  if (/^(dr|mr|ms|mrs|prof)\.?$/i.test(parts[0]) && parts.length > 1) return `${parts[0]} ${parts[parts.length - 1]}`;
  return parts[0] || "Client";
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
        <p className="font-display text-4xl">Your call is saved.</p>
        <p className="mt-3 text-fg-muted">The coaching report hasn&apos;t been generated yet.</p>
        {err && (
          <div className="mt-4 text-left">
            <Notice tone="error">{err}</Notice>
          </div>
        )}
        <Button className="mt-6" size="lg" onClick={generate} disabled={generating}>
          {generating ? <Thinking label="Generating…" /> : "Generate coaching report"}
        </Button>
      </div>
    );
  }
  return <Report session={session} report={session.report} onUpdate={onUpdate} />;
}

/** Two-column section with a dotted rule, after the Optikka board. */
function Section({ label, title, children }: { label: string; title: string; children: ReactNode }) {
  return (
    <section className="rule-b grid md:grid-cols-[34fr_66fr]">
      <div className="flex flex-col justify-between gap-2.5 px-4 py-5 md:rule-r md:px-[max(16px,1.3vw)]">
        <span className="label text-fg-muted">{label}</span>
        <h2 className="text-[clamp(24px,2.4vw,34px)] font-medium leading-[1.05] tracking-[-0.03em]">{title}</h2>
      </div>
      <div className="min-w-0">{children}</div>
    </section>
  );
}

function Report({ session, report, onUpdate }: { session: SavedSession; report: CoachReport; onUpdate: (s: SavedSession) => void }) {
  const { scenario, turns } = session;
  const band = scoreBand(report.overall);
  const coachLang = getLanguage(scenario.learner.coachingLanguage);
  const client = shortName(scenario.client.name);
  const [copied, setCopied] = useState(false);
  const d = report.metrics;
  const v = d.voice;

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

  const secs = (ms: number | null | undefined) => (ms == null ? "n/a" : `${(ms / 1000).toFixed(1)}s`);
  const metrics: Array<[string, string]> = [
    [d.wordsPerMinute === null ? "n/a" : String(d.wordsPerMinute), "Words per minute (≈110–170 is comfortable)"],
    [String(d.fillerCount), "Fillers"],
    [String(d.hedgeCount), "Hedges (I think, maybe…)"],
    [secs(v?.medianAnswerDelayMs), "Median delay before answering"],
    [secs(v ? v.longestPauseMs : null), "Longest pause mid-answer"],
    [v?.talkTimeSharePct != null ? `${v.talkTimeSharePct}%` : `${Math.round(d.talkShare * 100)}%`, v?.talkTimeSharePct != null ? "Your share of talk time" : "Your share of words"],
  ];

  const moments = [
    ...report.issues.map((i) => ({ kind: "fix" as const, ...i })),
    ...report.strengths.map((s) => ({ kind: "keep" as const, ...s })),
  ];

  const fine = session.sample
    ? "This is a scripted sample call. The scores and delivery figures are illustrative, not measured."
    : `Quotes come from the speech-to-text transcript and are checked against it.${report.droppedQuotes ? ` ${report.droppedQuotes} point(s) could not be matched to your exact words, so they were left out.` : ""} Timing figures are measured from your microphone on this device; accent is never scored.`;

  return (
    <div className="pb-10">
      {/* Hero */}
      <div className="rule-b grid md:grid-cols-[48fr_52fr]">
        <div className="px-4 pb-8 pt-10 md:rule-r md:px-[max(16px,1.3vw)]">
          <span className="label text-fg-muted">
            {scenario.client.name}, {scenario.client.country} · {new Date(report.createdAt).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}
          </span>
          <h1 id="repTitle" className="mt-7 font-display text-[clamp(48px,7.4vw,116px)]">
            Your debrief
          </h1>
          <div className="mt-8 flex items-end gap-4">
            <span className={cn("font-display text-[clamp(56px,6vw,96px)]", tone(report.overall))}>{report.overall ?? "–"}</span>
            <span className="label mb-3 text-fg-muted">
              / 100 · {band.label}
              {report.outcome ? ` · ${OUTCOME_LABEL[report.outcome] ?? report.outcome}` : ""}
            </span>
          </div>
        </div>
        <div className="flex flex-col justify-end gap-5 px-4 pb-8 pt-6 md:px-[max(16px,1.3vw)]">
          {(report.isDemo || session.sample) && (
            <Notice tone="warn" title={session.sample ? "Sample report" : "Demo engine report"}>
              {session.sample
                ? "A scripted example. Nothing here was produced by Gnani or a language model."
                : "This report was produced by ClientReady's rule-based demo engine, not a language model. Scores are rough keyword heuristics. Configure an LLM provider for real coaching."}
            </Notice>
          )}
          <p className="max-w-[30em] text-[clamp(19px,1.75vw,26px)] leading-[1.24] tracking-[-0.012em] text-fg-muted">
            <span className="text-fg">{report.summary}</span> <span className="text-signal-strong">Here is what to fix.</span>
          </p>
          <p className="text-xs text-fg-subtle">
            Coaching by {report.generatedBy}
            {coachLang.id !== "en" ? ` · explained in ${coachLang.label}` : ""}
          </p>
          <div className="no-print flex flex-wrap gap-2">
            {report.spoken.length > 0 && <DebriefReplay report={report} sample={!!session.sample} ttsLanguage={coachLang.ttsCode ?? "en-IN"} sessionId={session.id} />}
            <Button variant="ghost" size="sm" onClick={copy}>
              {copied ? "Copied" : "Copy"}
            </Button>
            <Button variant="ghost" size="sm" onClick={download}>
              Markdown
            </Button>
            <Button variant="ghost" size="sm" onClick={() => window.print()}>
              Print / PDF
            </Button>
          </div>
        </div>
      </div>

      {!session.sample && !report.isDemo && <ExplainPanel session={session} report={report} onUpdate={onUpdate} />}

      {!session.sample && <LevelResult session={session} />}

      <Section label="Scores" title="How the call went">
        <div className="grid sm:grid-cols-2 lg:grid-cols-3">
          {report.categories.map((c) => (
            <div key={c.id} className="rule-b flex flex-col gap-2.5 px-4 py-4 sm:rule-r md:px-[max(16px,1.3vw)]">
              <span className="label">{c.name}</span>
              <span className={cn("text-[40px] font-medium leading-none tracking-[-0.04em]", tone(c.score))}>
                {c.score ?? "–"}
                {c.score !== null && <small className="ml-1 text-base tracking-normal text-fg-subtle">/100</small>}
              </span>
              <span className="flex gap-1" aria-hidden>
                {[20, 40, 60, 80, 100].map((t) => (
                  <i key={t} className={cn("h-[3px] flex-1", c.score !== null && c.score >= t - 10 ? (c.score < 50 ? "bg-accent-bright" : "bg-fg") : "bg-surface-2")} />
                ))}
              </span>
              <span className="text-[13px] text-fg-muted">{c.score === null ? "Not exercised in this call." : c.rationale}</span>
              {c.evidence.map((e, i) => (
                <span key={i} className="text-[13px] text-fg-muted">
                  “{e.quote}” <span className="text-fg-subtle">· turn {e.turn}</span>
                </span>
              ))}
            </div>
          ))}
        </div>
      </Section>

      {moments.length > 0 && (
        <Section label="Moments" title="What you said, and what to say instead">
          {moments.map((m, i) => (
            <article key={i} className="rule-b grid last:border-b-0 md:grid-cols-[14fr_52fr]">
              <div className="flex justify-between gap-2 px-4 pt-5 md:flex-col md:justify-start md:rule-r md:px-[max(16px,1.3vw)] md:py-5">
                <span className="label">{m.kind === "fix" ? (SHORT[m.category] ?? m.category) : "Strength"}</span>
                <span className={cn("label", m.kind === "fix" ? "text-signal" : "text-fg-muted")}>{m.kind === "fix" ? "Fix this" : "Keep this"}</span>
              </div>
              <div className="min-w-0 px-4 py-5 md:px-[max(16px,1.3vw)]">
                {m.quote ? (
                  <p className="mb-3.5 text-[clamp(20px,1.9vw,27px)] leading-[1.2] tracking-[-0.02em]">
                    “{m.quote}”{m.turn !== null && <span className="label ml-2 align-middle text-fg-subtle">turn {m.turn}</span>}
                  </p>
                ) : (
                  <p className="mb-3.5 text-[clamp(20px,1.9vw,27px)] leading-[1.2] tracking-[-0.02em]">{m.kind === "fix" ? m.title : ""}</p>
                )}
                {m.kind === "fix" ? (
                  <>
                    <p className="mb-2 max-w-[62ch] text-fg-muted">{m.whatWasMissing}</p>
                    <p className="mb-2 max-w-[62ch] text-fg-muted">{m.whyItMattered}</p>
                    <div className="rule-t mt-3.5 pt-3">
                      <span className="label mb-1.5 block text-signal">Say this instead</span>
                      <q className="text-[17px]">{m.betterResponse}</q>
                      <ListenButton text={m.betterResponse} sample={!!session.sample} sessionId={session.id} />
                      <p className="mt-2 max-w-[62ch] text-sm text-fg-muted">{m.whyBetterWorks}</p>
                    </div>
                    <p className="mt-3 text-sm">
                      <span className="text-fg-subtle">Practise: </span>
                      {m.exercise}
                    </p>
                    {m.principle && (
                      <p className="mt-1 text-xs text-fg-subtle">
                        Principle: {m.principle.name}
                        {m.principle.basis === "design" ? " (our recommendation)" : <span className="block">{m.principle.source}</span>}
                      </p>
                    )}
                  </>
                ) : (
                  <p className="max-w-[62ch] text-fg-muted">{m.why}</p>
                )}
              </div>
            </article>
          ))}
        </Section>
      )}

      <Section label="Delivery" title="How confident you sounded">
        <div className="grid grid-cols-2 lg:grid-cols-3">
          {metrics.map(([val, k]) => (
            <div key={k} className="rule-b rule-r px-4 py-4 md:px-[max(16px,1.3vw)]">
              <div className="tabular text-[30px] font-medium tracking-[-0.03em]">{val}</div>
              <div className="text-[13px] text-fg-muted">{k}</div>
            </div>
          ))}
        </div>
        {report.deliveryNotes.length > 0 && (
          <ul className="list-disc space-y-1.5 px-4 py-5 pl-9 md:px-[max(16px,1.3vw)] md:pl-9">
            {report.deliveryNotes.map((n, i) => (
              <li key={i} className="max-w-[72ch]">
                {n}
              </li>
            ))}
          </ul>
        )}
      </Section>

      {report.proposalSteps.length > 0 && (
        <Section label="Proposal" title="How to put up a proposal">
          <ol className="list-decimal space-y-2.5 px-4 py-5 pl-10 text-[17px] tracking-[-0.01em] marker:text-signal md:pl-10">
            {report.proposalSteps.map((s, i) => (
              <li key={i} className="max-w-[72ch] pl-1">
                {s}
              </li>
            ))}
          </ol>
        </Section>
      )}

      <Section label="Next session" title="Practise this">
        {report.nextDrill && <p className="max-w-[34em] px-4 py-5 text-[clamp(19px,1.75vw,26px)] leading-[1.24] tracking-[-0.012em] text-signal-strong md:px-[max(16px,1.3vw)]">{report.nextDrill}</p>}
        {report.plan.length > 0 && (
          <ol className="grid md:grid-cols-3">
            {report.plan.map((p, i) => (
              <li key={i} className="rule-t px-4 py-4 md:rule-r md:px-[max(16px,1.3vw)]">
                <span className="label text-signal">0{i + 1}</span>
                <p className="mt-1.5 font-medium">{p.title}</p>
                <p className="mt-1 text-sm text-fg-muted">{p.why}</p>
                <p className="mt-2 text-sm">
                  <span className="text-fg-subtle">Exercise: </span>
                  {p.exercise}
                </p>
                <p className="mt-1 text-sm">
                  <span className="text-fg-subtle">You&apos;ll know it worked when: </span>
                  {p.successMetric}
                </p>
              </li>
            ))}
          </ol>
        )}
      </Section>

      {report.languageBridge.length > 0 && (
        <Section label="Language bridge" title="Your words, in clear English">
          {report.languageBridge.map((b, i) => (
            <div key={i} className="rule-b grid gap-4 px-4 py-5 md:grid-cols-2 md:px-[max(16px,1.3vw)]">
              <div>
                <span className="label text-fg-muted">You said · turn {b.turn}</span>
                <p className="mt-1">{b.original}</p>
              </div>
              <div>
                <span className="label text-good">Clearer English</span>
                <p className="mt-1">{b.clearerEnglish}</p>
                <ListenButton text={b.clearerEnglish} sample={!!session.sample} sessionId={session.id} />
              </div>
              {b.note && <p className="text-sm text-fg-muted md:col-span-2">{b.note}</p>}
            </div>
          ))}
        </Section>
      )}

      <Section label="Conversation" title="Full call">
        <details className="px-4 pb-5 md:px-[max(16px,1.3vw)]">
          <summary className="label cursor-pointer py-4">Show the conversation</summary>
          {turns.map((t) => (
            <div key={t.index} className="rule-t grid grid-cols-[96px_1fr] gap-3 py-1.5">
              <span className={cn("label", t.role === "learner" ? "text-signal" : "text-fg-muted")}>{t.role === "learner" ? "You" : client}</span>
              <span>
                {t.text}
                {t.interrupted && <em className="text-fg-subtle"> (interrupted)</em>}
                {t.role === "learner" && t.source === "typed" && <em className="text-fg-subtle"> (typed)</em>}
                {t.englishText && <span className="mt-1 block text-sm text-fg-muted">English rendering: {t.englishText}</span>}
              </span>
            </div>
          ))}
        </details>
      </Section>

      <Section label="Method" title="How this is scored">
        <div className="space-y-4 px-4 py-5 text-sm leading-relaxed text-fg-muted md:px-[max(16px,1.3vw)]">
          <p>
            Each skill is scored 0–100 against written anchors. The overall score is a weighted average of the skills that came up in the call; skills that
            didn&apos;t come up are left out. The app computes it, not the model.
          </p>
          <ul className="grid gap-1 sm:grid-cols-2">
            {CATEGORIES.map((c) => (
              <li key={c.id}>
                {c.name}: <span className="tabular">{c.weight}%</span>
              </li>
            ))}
          </ul>
          <p>
            Delivery uses only measured signals: recording time, words, fillers, hedges, answer delay and pauses. It never considers accent. Every quote in this
            report, written or spoken, is checked against your transcript.
          </p>
          <details>
            <summary className="label cursor-pointer text-fg">Sources</summary>
            <ul className="mt-2 list-disc space-y-1 pl-5">
              {PRINCIPLES.filter((p) => p.basis === "evidence").map((p) => (
                <li key={p.id}>{p.source}</li>
              ))}
            </ul>
          </details>
        </div>
      </Section>

      <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-6 md:px-[max(16px,1.3vw)]">
        <p className="max-w-[72ch] text-xs text-fg-muted">{fine}</p>
        <div className="no-print flex flex-wrap gap-2.5">
          <ButtonLink href="/practice" variant="secondary">
            New client
          </ButtonLink>
          {session.sample ? (
            <ButtonLink href="/practice">Try it yourself</ButtonLink>
          ) : (
            <ButtonLink href="/practice/session" onClick={() => saveDraft(scenario)}>
              Practise again
            </ButtonLink>
          )}
        </div>
      </div>
    </div>
  );
}

/** Speaks text with Gnani Timbre (or the browser voice for the sample). */
function useSpeech(sample: boolean, sessionId: string) {
  const audio = useRef<HTMLAudioElement | null>(null);
  const cache = useRef(new Map<string, string>());
  const stopRef = useRef(false);

  async function say(text: string, kind: "coach", language = "en-IN"): Promise<void> {
    if (sample) {
      await new Promise<void>((resolve) => {
        const synth = window.speechSynthesis;
        if (!synth) return resolve();
        synth.cancel();
        const u = new SpeechSynthesisUtterance(text);
        u.onend = () => resolve();
        u.onerror = () => resolve();
        synth.speak(u);
      });
      return;
    }
    const key = `${language}:${text}`;
    let url = cache.current.get(key);
    if (!url) {
      url = (await synthesize({ text: text.slice(0, 900), kind, language, sessionId })).url;
      cache.current.set(key, url);
    }
    const a = audio.current ?? new Audio();
    audio.current = a;
    a.src = url;
    await new Promise<void>((resolve, reject) => {
      a.onended = () => resolve();
      a.onerror = () => reject(new Error("Playback failed"));
      a.play().catch(reject);
    });
  }

  function stop() {
    stopRef.current = true;
    audio.current?.pause();
    try {
      window.speechSynthesis?.cancel();
    } catch {
      /* ignore */
    }
  }

  return { say, stop, stopRef };
}

function ListenButton({ text, sample, sessionId }: { text: string; sample: boolean; sessionId: string }) {
  const [state, setState] = useState<"idle" | "loading" | "playing" | "error">("idle");
  const [msg, setMsg] = useState<string | null>(null);
  const { say } = useSpeech(sample, sessionId);

  async function go() {
    setState("loading");
    try {
      const p = say(text, "coach");
      setState("playing");
      await p;
      setState("idle");
    } catch (e) {
      setState("error");
      setMsg(e instanceof ApiError ? e.message : "Couldn't play audio.");
    }
  }

  return (
    <span className="no-print mt-2 block">
      <button onClick={go} disabled={state === "loading" || state === "playing"} className="label text-fg-muted hover:text-signal disabled:opacity-60">
        {state === "loading" ? "Generating voice…" : state === "playing" ? "Playing…" : sample ? "Listen (browser voice)" : "Listen (Gnani Timbre)"}
      </button>
      {state === "error" && msg && <span className="mt-1 block text-xs text-low">{msg}</span>}
    </span>
  );
}

function DebriefReplay({ report, sample, ttsLanguage, sessionId }: { report: CoachReport; sample: boolean; ttsLanguage: string; sessionId: string }) {
  const [playing, setPlaying] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const { say, stop, stopRef } = useSpeech(sample, sessionId);

  async function play() {
    setPlaying(true);
    setErr(null);
    stopRef.current = false;
    try {
      for (const seg of report.spoken) {
        if (stopRef.current) break;
        await say(seg.text, "coach", ttsLanguage);
      }
    } catch (e) {
      setErr(e instanceof ApiError ? e.message : "Couldn't play the debrief.");
    } finally {
      setPlaying(false);
    }
  }

  return (
    <>
      <Button size="sm" onClick={playing ? stop : play}>
        {playing ? "Stop" : "Hear the debrief"}
      </Button>
      {err && <span className="w-full text-xs text-low">{err}</span>}
    </>
  );
}

/** Stars, XP and unlocks earned by this session, Duolingo-style. */
function LevelResult({ session }: { session: SavedSession }) {
  const router = useRouter();
  const [result, setResult] = useState<SessionResult | null>(null);
  const [streakDays, setStreakDays] = useState(0);

  useEffect(() => {
    setResult(getSessionResult(session.id) ?? null);
    setStreakDays(streak(loadProgress()).days);
  }, [session.id, session.report]);

  if (!result) return null;
  const level = result.levelId ? getLevel(result.levelId) : undefined;
  const next = result.unlocked ? getLevel(result.unlocked) : undefined;
  const improved = result.stars > result.prevStars;

  function go(scenario: SavedSession["scenario"]) {
    saveDraft(scenario);
    router.push("/practice/briefing");
  }

  return (
    <section className="no-print rule-b px-4 py-6 md:px-[max(16px,1.3vw)]" aria-label="Level result">
      <div className="flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-4">
          {level && <Stars value={result.stars} size="h-8 w-8" />}
          <div>
            <p className="text-lg font-medium">
              {level
                ? result.stars === 0
                  ? `Level ${levelIndex(level.id) + 1} not passed yet`
                  : improved
                    ? result.prevStars === 0
                      ? `Level ${levelIndex(level.id) + 1} passed!`
                      : `New best on level ${levelIndex(level.id) + 1}!`
                    : `Level ${levelIndex(level.id) + 1} complete`
                : "Practice counted"}
            </p>
            <p className="mt-0.5 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-fg-muted">
              <span className="inline-flex items-center gap-1"><Zap className="h-4 w-4 text-mid" /> +{result.xp} XP</span>
              {streakDays > 0 && <span className="inline-flex items-center gap-1"><Flame className="h-4 w-4 text-accent-bright" /> {streakDays}-day streak</span>}
              {level && result.stars === 0 && <span className="inline-flex items-center gap-1"><Lock className="h-4 w-4" /> Score {PASS_SCORE}+ to unlock the next level</span>}
              {next && <span className="inline-flex items-center gap-1 text-good"><Unlock className="h-4 w-4" /> Unlocked: {next.title}</span>}
            </p>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          {level && <Button variant="secondary" size="sm" onClick={() => go(levelScenario(level, loadProgress().langs))}>Retry level</Button>}
          {next && (
            <Button size="sm" onClick={() => go(levelScenario(next, loadProgress().langs))}>
              Next level <ArrowRight className="h-3.5 w-3.5" />
            </Button>
          )}
          <ButtonLink href="/levels" variant={next ? "ghost" : "primary"} size="sm">All levels</ButtonLink>
        </div>
      </div>
    </section>
  );
}

/** Re-explain the summary and key fixes in another language (Hindi by default), with a spoken version. */
function ExplainPanel({ session, report, onUpdate }: { session: SavedSession; report: CoachReport; onUpdate: (s: SavedSession) => void }) {
  const coachId = session.scenario.learner.coachingLanguage;
  const choices = LANGUAGES.filter((l) => l.id !== coachId);
  const [lang, setLang] = useState(coachId === "hi" ? "en" : "hi");
  const [loading, setLoading] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const { say, stop, stopRef } = useSpeech(false, session.id);

  const option = getLanguage(lang);
  const label = option.id === "en" || option.id === "hinglish" ? option.label.replace(/ \(.*\)$/, "") : option.nativeLabel;
  const explanation: Explanation | undefined = session.explanations?.[lang];

  async function explain() {
    setLoading(true);
    setErr(null);
    try {
      const next = await requestExplanation({
        sessionId: session.id,
        languageId: lang,
        clientName: session.scenario.client.name,
        offerName: session.scenario.offer.name,
        overall: report.overall,
        summary: report.summary.slice(0, 1500),
        issues: report.issues.slice(0, 6).map((i) => ({
          title: i.title.slice(0, 200),
          whatWasMissing: i.whatWasMissing.slice(0, 600),
          whyItMattered: i.whyItMattered.slice(0, 600),
          exercise: i.exercise.slice(0, 600),
        })),
        plan: report.plan.slice(0, 4).map((p) => ({ title: p.title.slice(0, 200), why: p.why.slice(0, 600), exercise: p.exercise.slice(0, 600) })),
        nextDrill: report.nextDrill.slice(0, 600),
      });
      const updated = { ...session, explanations: { ...session.explanations, [lang]: next } };
      saveSession(updated);
      onUpdate(updated);
    } catch (e) {
      setErr(e instanceof ApiError ? e.message : "Couldn't explain the report.");
    } finally {
      setLoading(false);
    }
  }

  async function listen(text: string) {
    setPlaying(true);
    setErr(null);
    stopRef.current = false;
    try {
      await say(text, "coach", option.ttsCode ?? "en-IN");
    } catch (e) {
      setErr(e instanceof ApiError ? e.message : "Couldn't play the explanation.");
    } finally {
      setPlaying(false);
    }
  }

  return (
    <Section label="In your language" title={explanation ? `Explained in ${label}` : "Want this explained in Hindi?"}>
      <div className="no-print flex flex-col gap-3 px-4 py-5 sm:flex-row sm:items-end md:px-[max(16px,1.3vw)]">
        <div className="sm:w-64">
          <label htmlFor="explainLang" className="label text-fg-muted">Explain in</label>
          <Select
            id="explainLang"
            value={lang}
            options={choices.map((l) => ({ value: l.id, label: l.id === "en" || l.id === "hinglish" ? l.label : `${l.label} · ${l.nativeLabel}` }))}
            onChange={(e) => { stop(); setLang(e.target.value); setErr(null); }}
          />
        </div>
        <div className="flex flex-wrap gap-2">
          {!explanation && (
            <Button size="sm" onClick={explain} disabled={loading}>
              {loading ? <Thinking label="Explaining…" /> : <><Languages className="h-3.5 w-3.5" /> Explain in {label}</>}
            </Button>
          )}
          {explanation && option.ttsCode && (
            <Button size="sm" onClick={playing ? stop : () => listen(explanation.spoken || explanation.summary)}>
              <Volume2 className="h-3.5 w-3.5" /> {playing ? "Stop" : `Listen in ${label}`}
            </Button>
          )}
        </div>
      </div>
      {err && <div className="px-4 pb-4 md:px-[max(16px,1.3vw)]"><Notice tone="error">{err}</Notice></div>}
      {explanation && (
        <div lang={lang === "hinglish" ? "hi-Latn" : lang} className="px-4 pb-6 md:px-[max(16px,1.3vw)]">
          <p className="max-w-[46em] text-[17px] leading-relaxed">{explanation.summary}</p>
          {explanation.points.length > 0 && (
            <ol className="mt-5 grid gap-4 sm:grid-cols-2">
              {explanation.points.map((p, i) => (
                <li key={i} className="rounded-sm border border-dotted border-rule p-4">
                  <p className="font-medium"><span className="mr-2 text-signal">{i + 1}.</span>{p.title}</p>
                  <p className="mt-1.5 text-sm leading-relaxed text-fg-muted">{p.explanation}</p>
                </li>
              ))}
            </ol>
          )}
          {explanation.nextStep && <p className="mt-5 text-sm"><span className="label mr-2 text-fg-subtle">Next</span>{explanation.nextStep}</p>}
          <p className="mt-4 text-xs text-fg-subtle">Explained by {explanation.generatedBy}. Better answers stay in English, since that&apos;s what you&apos;ll say to the client.</p>
        </div>
      )}
    </Section>
  );
}
