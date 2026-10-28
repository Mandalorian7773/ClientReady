"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { cn } from "@/components/ui";
import { VoiceRing, type VoiceRingHandle } from "@/components/voice-ring";
import { useProviderStatus } from "@/components/provider-status";
import { ApiError, requestReport } from "@/lib/client/api";
import { newSessionId, saveSession } from "@/lib/client/storage";
import type { CallEngine, CallMode } from "@/lib/client/voice/engine";
import { LiveCall } from "@/lib/client/voice/live-call";
import { SampleCall } from "@/lib/client/voice/sample-call";
import type { CoachReport } from "@/lib/coach/report";
import { getLanguage } from "@/lib/languages";
import { buildSampleReport } from "@/lib/sample/sample-call";
import type { Scenario } from "@/lib/scenario/schema";
import type { ClientState } from "@/lib/sim/types";

type Screen = "ready" | "call" | "debrief";

function shortName(name: string) {
  const parts = name.trim().split(/\s+/);
  if (/^(dr|mr|ms|mrs|prof)\.?$/i.test(parts[0]) && parts.length > 1) return `${parts[0]} ${parts[parts.length - 1]}`;
  return parts[0] || "The client";
}

/** "Family dental clinic in Austin" -> "a family dental clinic in Austin". */
function withArticle(business: string) {
  const b = business.replace(/\s*\(fictional\)/i, "").trim();
  const lower = b.charAt(0).toLowerCase() + b.slice(1);
  return /^(a|an|the)\s/i.test(lower) ? lower : `${/^[aeiou]/i.test(lower) ? "an" : "a"} ${lower}`;
}

const fmt = (ms: number) => {
  const s = Math.max(0, Math.floor(ms / 1000));
  return `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
};

const Ink = ({ children }: { children: ReactNode }) => <span className="text-fg">{children}</span>;
const Accent = ({ children }: { children: ReactNode }) => <span className="text-signal-strong">{children}</span>;

/** Pill buttons in the board's style. */
function Pill({ children, onClick, primary, pressed, disabled }: { children: ReactNode; onClick: () => void; primary?: boolean; pressed?: boolean; disabled?: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-pressed={pressed}
      className={cn(
        "label rounded-full border transition-colors disabled:cursor-default disabled:opacity-40",
        primary
          ? "border-fg bg-fg px-6 py-3.5 text-bg hover:border-signal-strong hover:bg-signal-strong"
          : pressed
            ? "border-signal-strong px-5 py-2.5 text-signal"
            : "border-rule px-5 py-2.5 text-fg hover:border-fg hover:bg-fg hover:text-bg",
      )}
    >
      {children}
    </button>
  );
}

export function Studio({ scenario, sample }: { scenario: Scenario; sample: boolean }) {
  const router = useRouter();
  const { status } = useProviderStatus();
  const ring = useRef<VoiceRingHandle>(null);
  const engine = useRef<CallEngine | null>(null);
  const sessionId = useRef(newSessionId());
  const skip = useRef(false);
  const callStart = useRef(0);

  const [screen, setScreen] = useState<Screen>("ready");
  const [mode, setMode] = useState<CallMode>("idle");
  const [time, setTime] = useState("00:00");
  const [muted, setMuted] = useState(false);
  const [captions, setCaptions] = useState(false);
  const [speaking, setSpeaking] = useState<{ who: "client" | "coach"; text: string } | null>(null);
  const [hint, setHint] = useState<{ text: string; error?: boolean; retry?: () => void } | null>(null);
  const [typing, setTyping] = useState(false);
  const [typed, setTyped] = useState("");
  const [seg, setSeg] = useState<{ i: number; n: number; label: string } | null>(null);
  const [startError, setStartError] = useState<string | null>(null);
  const [micBlocked, setMicBlocked] = useState(false);
  const [debriefError, setDebriefError] = useState<string | null>(null);

  const who = shortName(scenario.client.name);
  const voiceless = !sample && status !== null && !status.tts.configured;

  // Ring level and call timer, every frame.
  useEffect(() => {
    let raf = 0;
    const loop = (now: number) => {
      const e = engine.current;
      if (e && (screen === "call" || screen === "debrief")) ring.current?.setLevel(e.level());
      else ring.current?.setLevel(0.05 + 0.04 * Math.sin(now / 900));
      if (screen === "call") setTime(fmt(now - callStart.current));
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [screen]);

  useEffect(() => () => engine.current?.destroy(), []);

  useEffect(() => {
    ring.current?.setMode(mode === "ended" ? "thinking" : mode === "idle" ? "idle" : mode);
  }, [mode]);

  const runDebrief = useCallback(async () => {
    const e = engine.current;
    if (!e) return;
    setScreen("debrief");
    setDebriefError(null);
    setSeg(null);
    ring.current?.setMode("thinking");
    const turns = e.turns;
    if (!turns.some((t) => t.role === "learner")) {
      setDebriefError("You didn't answer the client, so there's nothing to coach yet.");
      return;
    }
    const state: ClientState = e.clientState ?? { interest: 50, phase: "ended", raisedConcernIds: [], ended: true, outcome: null, notes: [] };
    const base = { id: sessionId.current, createdAt: Date.now(), scenario, turns, clientState: state, generatedBy: e.generatedBy?.label ?? "", isDemo: e.generatedBy?.isDemo ?? false, sample };
    saveSession({ ...base, report: null });

    let report: CoachReport;
    try {
      report = sample
        ? (await new Promise((r) => setTimeout(r, 1800)), buildSampleReport())
        : await requestReport({ sessionId: sessionId.current, scenario, turns, clientState: state, voice: e.voiceMetrics() });
    } catch (err) {
      setDebriefError(`${err instanceof ApiError ? err.message : "The review failed."} Your call is saved in History.`);
      return;
    }
    saveSession({ ...base, report });

    skip.current = false;
    const ttsLang = getLanguage(scenario.learner.coachingLanguage).ttsCode ?? "en-IN";
    const canSpeak = sample || status?.tts.configured;
    if (canSpeak) {
      ring.current?.setMode("coach");
      for (let i = 0; i < report.spoken.length && !skip.current; i++) {
        setSeg({ i, n: report.spoken.length, label: report.spoken[i].label });
        await e.speakCoach(report.spoken[i].text, ttsLang);
        if (!skip.current) await new Promise((r) => setTimeout(r, 350));
      }
    }
    router.push(`/report/${sessionId.current}`);
  }, [router, sample, scenario, status]);

  const start = useCallback(async (typeOnly = false) => {
    if (engine.current) engine.current.destroy();
    setStartError(null);
    setHint(null);
    setTyping(false);
    setMuted(false);
    sessionId.current = newSessionId();
    const e: CallEngine = sample
      ? new SampleCall()
      : new LiveCall({
          sessionId: sessionId.current,
          scenario,
          sttAvailable: !typeOnly && !!status?.stt.configured,
          ttsAvailable: !!status?.tts.configured,
          typingReason: typeOnly ? "No microphone, so type your answers. They are marked as typed in your report." : undefined,
        });
    engine.current = e;
    e.on("mode", (m) => {
      setMode(m);
      if (m === "thinking") setSpeaking(null);
    });
    e.on("speaking", setSpeaking);
    e.on("notice", (text) => setHint({ text }));
    e.on("error", ({ message, retry }) => setHint({ text: message, error: true, retry }));
    e.on("needsTyping", (text) => {
      setTyping(true);
      setCaptions(true);
      setHint({ text });
    });
    e.on("end", () => void runDebrief());
    if (!sample && status && !status.tts.configured) setCaptions(true);

    setScreen("call");
    setMode("thinking");
    callStart.current = performance.now();
    try {
      await e.start();
    } catch (err) {
      e.destroy();
      engine.current = null;
      setScreen("ready");
      setMode("idle");
      const name = (err as DOMException)?.name;
      const micProblem = name === "NotAllowedError" || name === "SecurityError" || name === "NotFoundError";
      setMicBlocked(micProblem);
      setStartError(
        micProblem
          ? "The microphone isn't available. Allow it in your browser's site settings and start again, or type your answers instead."
          : `The call couldn't start: ${(err as Error)?.message ?? "unknown error"}.`,
      );
    }
  }, [runDebrief, sample, scenario, status]);

  const end = () => void engine.current?.end();
  const skipDebrief = () => {
    skip.current = true;
    engine.current?.stopSpeaking();
  };
  const toggleMute = () => {
    const next = !muted;
    setMuted(next);
    engine.current?.setMuted(next);
  };
  const sendTyped = () => {
    if (!typed.trim() || mode !== "user") return;
    engine.current?.submitTyped(typed);
    setTyped("");
  };

  // ---------- copy for each state ----------
  let display: ReactNode = `Meet ${who}`;
  let lede: ReactNode = sample ? (
    <>
      <Ink>A freelancer pitches {scenario.offer.name} to {who}.</Ink> Listen to the scripted call, then hear <Accent>what to fix.</Accent>
    </>
  ) : (
    <>
      <Ink>
        {scenario.client.name} runs {withArticle(scenario.client.businessType)}.
      </Ink>{" "}
      Pitch {scenario.offer.name} out loud, then hear <Accent>what to fix.</Accent>
    </>
  );
  let caption = sample ? "SAMPLE CALL" : "READY";
  if (screen === "call") {
    if (mode === "user") {
      display = "Your turn";
      lede = typing ? (
        <>
          <Ink>Type your answer</Ink> the way you would say it. Send it and <Accent>the client will reply.</Accent>
        </>
      ) : (
        <>
          <Ink>Answer out loud,</Ink> the way you would on a real call. Pause when you are done and <Accent>the client will reply.</Accent>
        </>
      );
      caption = sample ? "YOU, SCRIPTED SAMPLE" : muted ? "MIC MUTED" : "YOUR TURN";
    } else if (mode === "client") {
      display = who;
      lede = (
        <>
          <Ink>{who} is speaking.</Ink> Listen for the real question underneath, then <Accent>answer that one.</Accent>
        </>
      );
      caption = "CLIENT SPEAKING";
    } else {
      display = who;
      lede = (
        <>
          <Ink>{who} is thinking</Ink> about what you said. <Accent>Stay with it.</Accent>
        </>
      );
      caption = mode === "ended" ? "CALL ENDED" : "CLIENT THINKING";
    }
  } else if (screen === "debrief") {
    display = "Debrief";
    caption = seg ? `COACH: ${seg.label.toUpperCase()}` : debriefError ? "REVIEW FAILED" : "COACH REVIEWING";
    lede = debriefError ? (
      <>
        <Ink>The review didn&apos;t finish.</Ink> {debriefError}
      </>
    ) : seg && seg.i > 0 ? (
      <>
        <Ink>On {seg.label.toLowerCase()}.</Ink> Listen to the better version, then <Accent>say it back to yourself.</Accent>
      </>
    ) : (
      <>
        <Ink>The call has ended.</Ink> Your coach is going through what you said. <Accent>Listen first, read after.</Accent>
      </>
    );
  }

  const navB = { ready: "SCENARIO", call: "ON CALL", debrief: "DEBRIEF" }[screen];
  const navC = { ready: sample ? "SAMPLE CALL, SCRIPTED" : "MIC CHECK ON START", call: captions ? "CAPTIONS ON" : "NO TRANSCRIPT DURING THE CALL", debrief: "COACH SPEAKING" }[screen];

  return (
    <main className="relative grid min-h-dvh grid-cols-1 bg-bg text-fg md:grid-cols-[34fr_14fr_52fr] md:grid-rows-[minmax(110px,18vh)_minmax(340px,1fr)_auto]">
      {/* Dotted column rules */}
      <span aria-hidden className="rule-l pointer-events-none absolute inset-y-0 left-[34%] hidden md:block" />
      <span aria-hidden className="rule-l pointer-events-none absolute inset-y-0 left-[48%] hidden md:block" />

      {/* Top row */}
      <div className="rule-b flex flex-col justify-between gap-4 px-4 py-4 md:col-start-1 md:row-start-1 md:px-[max(16px,1.3vw)]">
        <Link href="/" className="text-[13px] font-medium tracking-[0.22em]" aria-label="ClientReady home">
          CLIENTREADY
        </Link>
        <span className="label hidden md:block">
          Practise the call
          <br />
          before it counts
        </span>
      </div>
      <div className="rule-b hidden px-[max(16px,1.3vw)] py-4 md:col-start-2 md:row-start-1 md:block">
        <span className="label">{navB}</span>
      </div>
      <div className="rule-b flex flex-wrap items-start justify-between gap-3 px-4 py-4 md:col-start-3 md:row-start-1 md:px-[max(16px,1.3vw)]">
        <span className={cn("label", sample && "text-signal")}>{sample ? "SAMPLE CALL, SCRIPTED · BROWSER VOICE, NOT GNANI" : navC}</span>
        <span className="label tabular" aria-live="off">
          {screen === "ready" ? (
            <Link href="/practice/briefing" className="hover:text-signal">
              ← BRIEFING
            </Link>
          ) : (
            time
          )}
        </span>
      </div>

      {/* Middle row: ring + working area */}
      <div className="rule-b relative h-[min(78vw,420px)] overflow-hidden md:col-span-2 md:col-start-1 md:row-start-2 md:h-auto">
        <VoiceRing ref={ring} className="absolute inset-0 h-full w-full" />
        <span className="label absolute bottom-4 left-4 text-fg-muted md:left-[max(16px,1.3vw)]" role="status">
          {caption}
        </span>
      </div>
      <div className="rule-b flex flex-col justify-center gap-4 px-4 py-6 md:col-start-3 md:row-start-2 md:px-[max(16px,1.3vw)]">
        {screen === "ready" ? (
          <ReadyPanel scenario={scenario} sample={sample} voiceless={voiceless} sttReady={!!status?.stt.configured} reasoning={status?.reasoning.label} isDemo={!!status?.reasoning.isDemo} />
        ) : (
          <div className="flex max-w-[520px] flex-col gap-3.5">
            <Row label="Who">
              {scenario.client.name}, {scenario.client.businessType.replace(/\s*\(fictional\)/i, "").split(/[,(]/)[0]}
            </Row>
            <Row label="Time">
              <span className="tabular">{time}</span>
            </Row>
            {screen === "debrief" && seg && (
              <Row label="Coaching">
                <span className="tabular">
                  {seg.i + 1} of {seg.n}
                </span>
              </Row>
            )}

            {captions && speaking && (
              <p className="rise rule-t pt-3 text-[17px] leading-snug tracking-[-0.01em]">
                <span className="label mr-2 text-fg-muted">{speaking.who === "client" ? who : "Coach"}</span>
                {speaking.text}
              </p>
            )}

            {screen === "call" && typing && mode === "user" && (
              <form
                className="flex items-end gap-3"
                onSubmit={(ev) => {
                  ev.preventDefault();
                  sendTyped();
                }}
              >
                <textarea
                  aria-label="Type your answer"
                  value={typed}
                  maxLength={1500}
                  onChange={(ev) => setTyped(ev.target.value)}
                  onKeyDown={(ev) => {
                    if (ev.key === "Enter" && !ev.shiftKey) {
                      ev.preventDefault();
                      sendTyped();
                    }
                  }}
                  rows={2}
                  autoFocus
                  placeholder="What you'd say to the client (marked as typed)"
                  className="min-h-14 flex-1 resize-none border-0 border-b border-dotted border-fg-subtle bg-transparent py-1.5 text-[17px] tracking-[-0.01em] placeholder:text-fg-subtle/80 focus:border-solid focus:border-signal-strong focus:outline-none"
                />
                <Pill onClick={sendTyped} disabled={!typed.trim()}>
                  Send
                </Pill>
              </form>
            )}

            <div className="mt-2 flex flex-wrap gap-2.5">
              {screen === "call" && !sample && !typing && (
                <Pill onClick={toggleMute} pressed={muted}>
                  {muted ? "Unmute mic" : "Mute mic"}
                </Pill>
              )}
              {screen === "call" && (
                <Pill onClick={() => setCaptions((c) => !c)} pressed={captions}>
                  Captions
                </Pill>
              )}
              {screen === "call" && (
                <Pill onClick={end} primary disabled={mode === "ended"}>
                  End call
                </Pill>
              )}
              {screen === "debrief" && !debriefError && (
                <Pill onClick={skipDebrief} disabled={!seg}>
                  Skip to report
                </Pill>
              )}
              {screen === "debrief" && debriefError && (
                <>
                  <Pill onClick={() => void runDebrief()} primary>
                    Try again
                  </Pill>
                  <Pill onClick={() => router.push("/history")}>History</Pill>
                </>
              )}
            </div>

            <p className={cn("max-w-[44ch] text-[13px]", hint?.error ? "text-low" : "text-fg-muted")} role={hint?.error ? "alert" : "status"}>
              {hint?.text ??
                (screen === "debrief"
                  ? "The written report follows the spoken debrief."
                  : sample
                    ? "Sample call: both sides are scripted and voiced by your browser. Turn sound on."
                    : typing
                      ? "Typed answers are marked as typed in your report."
                      : "Headphones work best. Speak over the client to interrupt.")}
              {hint?.retry && (
                <button
                  type="button"
                  className="ml-2 underline underline-offset-2 hover:text-fg"
                  onClick={() => {
                    const r = hint.retry;
                    setHint(null);
                    r?.();
                  }}
                >
                  Retry
                </button>
              )}
            </p>
          </div>
        )}
      </div>

      {/* Bottom row: display line + sentence */}
      <div className="rule-b flex items-end px-4 pb-6 pt-8 md:col-span-2 md:col-start-1 md:row-start-3 md:border-b-0 md:px-[max(16px,1.3vw)] md:pt-9">
        <h1 className="font-display text-[clamp(52px,7.2vw,124px)]" aria-live="polite">
          {display}
        </h1>
      </div>
      <div className="flex flex-col justify-end gap-5 px-4 pb-6 pt-6 md:col-start-3 md:row-start-3 md:px-[max(16px,1.3vw)] md:pt-9">
        <p className="max-w-[30em] text-[clamp(19px,1.75vw,26px)] leading-[1.24] tracking-[-0.012em] text-fg-muted">{lede}</p>
        {screen === "ready" && (
          <div className="flex flex-col items-start gap-3">
            {startError && (
              <p role="alert" className="max-w-[44ch] text-[13px] text-low">
                {startError}
              </p>
            )}
            <div className="flex flex-wrap gap-2.5">
              <Pill onClick={() => void start()} primary disabled={!sample && !status}>
                {sample ? "Play the sample call" : "Start the call"}
              </Pill>
              {micBlocked && !sample && <Pill onClick={() => void start(true)}>Type my answers instead</Pill>}
            </div>
          </div>
        )}
      </div>
    </main>
  );
}

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="grid grid-cols-[96px_1fr] items-baseline gap-3 text-[17px] tracking-[-0.01em]">
      <span className="label text-fg-muted">{label}</span>
      <span>{children}</span>
    </div>
  );
}

function ReadyPanel({
  scenario,
  sample,
  voiceless,
  sttReady,
  reasoning,
  isDemo,
}: {
  scenario: Scenario;
  sample: boolean;
  voiceless: boolean;
  sttReady: boolean;
  reasoning?: string;
  isDemo: boolean;
}) {
  const lang = getLanguage(scenario.learner.speechLanguage);
  const rows: Array<[string, ReactNode]> = sample
    ? [
        ["Client", `${scenario.client.name}, ${scenario.client.country}`],
        ["What it is", "A scripted example call, then a spoken debrief and report."],
        ["Voices", "Your browser's speech synthesis. No mic, no Gnani, no model."],
      ]
    : [
        ["Client", `${scenario.client.name}, ${scenario.client.country}`],
        ["Offer", `${scenario.offer.name} · ${scenario.offer.currency} ${scenario.offer.price.toLocaleString("en-US")}`],
        ["You speak", sttReady ? `${lang.label} → Gnani Prisma` : "Typing (Prisma not configured)"],
        ["Client voice", voiceless ? "Captions only (Timbre not configured)" : "Gnani Timbre, English (India)"],
        ["Client & coach", reasoning ?? "…"],
      ];
  return (
    <div className="flex max-w-[560px] flex-col gap-3.5">
      {rows.map(([k, v]) => (
        <Row key={k} label={k}>
          {v}
        </Row>
      ))}
      {!sample && isDemo && (
        <p className="text-[13px] text-mid">Demo mode: the client and coach are a rule-based engine, not an AI model.</p>
      )}
      {!sample && (
        <p className="text-[13px] text-fg-muted">
          There is no transcript during the call. Turn on Captions if you need them. The client stops talking when you talk over it. The call ends by itself after 10 minutes.
        </p>
      )}
    </div>
  );
}
