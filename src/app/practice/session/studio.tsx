"use client";

import { ArrowLeft, Keyboard, Mic, PhoneOff, Play, RotateCcw, Send, Square, Volume2, X } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { Badge, Button, cn, Notice, Textarea, Thinking } from "@/components/ui";
import { LevelMeter } from "@/components/level-meter";
import { useProviderStatus } from "@/components/provider-status";
import { ApiError, requestClientTurn, requestReport, synthesize, transcribe } from "@/lib/client/api";
import { useRecorder, type Recording } from "@/lib/client/recorder";
import { newSessionId, saveSession } from "@/lib/client/storage";
import { getLanguage } from "@/lib/languages";
import { OBJECTIVES } from "@/lib/scenario/objectives";
import { LABELS, type Scenario } from "@/lib/scenario/schema";
import type { ClientState, Turn } from "@/lib/sim/types";
import { MAX_UTTERANCE_CHARS } from "@/lib/sim/types";

type Phase =
  | "pre"
  | "client-thinking"
  | "client-speaking"
  | "your-turn"
  | "recording"
  | "transcribing"
  | "review"
  | "ended"
  | "reporting";

interface Pending {
  text: string;
  source: "prisma" | "typed";
  audioSeconds?: number;
}

interface ErrorState {
  message: string;
  retry?: () => void;
  retryLabel?: string;
  undo?: () => void;
}

const OUTCOME_LABEL: Record<string, string> = {
  "deal-agreed": "Deal agreed",
  "next-step-agreed": "Next step agreed",
  "follow-up-later": "Client will follow up later",
  "not-interested": "Client passed",
  "time-up": "Time's up",
};

function initials(name: string) {
  return name.replace(/^Dr\.?\s*/, "").split(/\s+/).map((p) => p[0]).slice(0, 2).join("").toUpperCase();
}

function biasWords(s: Scenario): string[] {
  return [s.offer.name, s.offer.description, s.offer.deliverables, s.client.name, s.client.industry].join(" ").split(/\s+/);
}

export function Studio({ scenario }: { scenario: Scenario }) {
  const router = useRouter();
  const { status } = useProviderStatus();
  const sessionIdRef = useRef(newSessionId());
  const [turns, setTurns] = useState<Turn[]>([]);
  const turnsRef = useRef<Turn[]>([]);
  const [clientState, setClientState] = useState<ClientState | null>(null);
  const clientStateRef = useRef<ClientState | null>(null);
  const [phase, setPhase] = useState<Phase>("pre");
  const [pending, setPending] = useState<Pending | null>(null);
  const [error, setError] = useState<ErrorState | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [typing, setTyping] = useState(false);
  const [typed, setTyped] = useState("");
  const [autoSend, setAutoSend] = useState(false);
  const [ttsOff, setTtsOff] = useState(false);
  const [sttOff, setSttOff] = useState(false);
  const [audioUrls, setAudioUrls] = useState<Record<number, string>>({});
  const [playingIdx, setPlayingIdx] = useState<number | null>(null);
  const [generatedBy, setGeneratedBy] = useState<{ label: string; isDemo: boolean } | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const inFlight = useRef(false);
  const lastWav = useRef<Recording | null>(null);
  const transcriptEnd = useRef<HTMLDivElement | null>(null);

  const lang = getLanguage(scenario.learner.speechLanguage);
  const learnerCount = turns.filter((t) => t.role === "learner").length;

  const commitTurns = useCallback((next: Turn[]) => {
    turnsRef.current = next;
    setTurns(next);
  }, []);

  useEffect(() => {
    if (status && !status.tts.configured) setTtsOff(true);
    if (status && !status.stt.configured) {
      setSttOff(true);
      setTyping(true);
    }
  }, [status]);

  useEffect(() => {
    try {
      setAutoSend(localStorage.getItem("clientready.autosend") === "1");
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    transcriptEnd.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [turns.length, phase, pending]);

  // Release audio blobs when leaving the studio.
  useEffect(() => {
    const urls = audioUrls;
    return () => Object.values(urls).forEach((u) => URL.revokeObjectURL(u));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const play = useCallback((idx: number, url: string, onDone?: () => void) => {
    const el = audioRef.current;
    if (!el) return onDone?.();
    el.pause();
    el.src = url;
    setPlayingIdx(idx);
    const finish = () => {
      setPlayingIdx(null);
      el.onended = null;
      el.onerror = null;
      onDone?.();
    };
    el.onended = finish;
    el.onerror = () => {
      setNotice("The client's audio couldn't be played. Their reply is shown as text.");
      finish();
    };
    el.play().catch(() => {
      setNotice("Your browser blocked audio playback. Use the play button on the client's message.");
      finish();
    });
  }, []);

  const speak = useCallback(
    async (idx: number, text: string, after: Phase) => {
      if (ttsOff) {
        setPhase(after);
        return;
      }
      setPhase("client-speaking");
      try {
        const { url } = await synthesize({ text, kind: "client", gender: scenario.client.voiceGender, seed: scenario.client.name.length });
        setAudioUrls((m) => ({ ...m, [idx]: url }));
        play(idx, url, () => setPhase(after));
      } catch (e) {
        const err = e instanceof ApiError ? e : null;
        if (err && ["not_configured", "credits_exhausted", "auth_failed"].includes(err.code)) setTtsOff(true);
        setNotice(`Client voice unavailable: ${err?.message ?? "synthesis failed"}. Their reply is shown as text.`);
        setPhase(after);
      }
    },
    [play, scenario.client.name.length, scenario.client.voiceGender, ttsOff],
  );

  const fetchClientTurn = useCallback(
    async (history: Turn[], prevState: ClientState | null) => {
      setPhase("client-thinking");
      setError(null);
      try {
        const res = await requestClientTurn({ sessionId: sessionIdRef.current, scenario, turns: history, clientState: prevState });
        let next = history;
        if (res.learnerEnglish && history.length > 0) {
          const last = history[history.length - 1];
          next = [...history.slice(0, -1), { ...last, englishText: res.learnerEnglish }];
        }
        const clientTurn: Turn = { index: next.length, role: "client", text: res.reply, source: "model", at: Date.now() };
        next = [...next, clientTurn];
        commitTurns(next);
        clientStateRef.current = res.state;
        setClientState(res.state);
        setGeneratedBy({ label: res.generatedBy, isDemo: res.isDemo });
        await speak(clientTurn.index, res.reply, res.state.ended ? "ended" : "your-turn");
      } catch (e) {
        const msg = e instanceof ApiError ? e.message : "The client couldn't respond. Please retry.";
        const canUndo = history.length > 0 && history[history.length - 1].role === "learner";
        setError({
          message: msg,
          retry: () => void fetchClientTurn(history, prevState),
          retryLabel: "Retry",
          undo: canUndo
            ? () => {
                const last = history[history.length - 1];
                commitTurns(history.slice(0, -1));
                setPending({ text: last.text, source: last.source === "prisma" ? "prisma" : "typed", audioSeconds: last.audioSeconds });
                setError(null);
                setPhase("review");
              }
            : undefined,
        });
        setPhase(history.length === 0 ? "pre" : "your-turn");
      } finally {
        inFlight.current = false;
      }
    },
    [commitTurns, scenario, speak],
  );

  const startCall = useCallback(() => {
    if (inFlight.current) return;
    inFlight.current = true;
    void fetchClientTurn([], null);
  }, [fetchClientTurn]);

  const submitLearner = useCallback(
    (p: Pending) => {
      const text = p.text.trim().slice(0, MAX_UTTERANCE_CHARS);
      if (!text || inFlight.current) return;
      const history = turnsRef.current;
      if (history.length === 0 || history[history.length - 1].role !== "client") return; // strict alternation
      inFlight.current = true;
      const learnerTurn: Turn = { index: history.length, role: "learner", text, source: p.source, audioSeconds: p.audioSeconds, at: Date.now() };
      const next = [...history, learnerTurn];
      commitTurns(next);
      setPending(null);
      setTyped("");
      void fetchClientTurn(next, clientStateRef.current);
    },
    [commitTurns, fetchClientTurn],
  );

  const handleRecording = useCallback(
    async (rec: Recording) => {
      lastWav.current = rec;
      setPhase("transcribing");
      setError(null);
      try {
        const out = await transcribe(rec.wav, scenario.learner.speechLanguage, biasWords(scenario));
        const p: Pending = { text: out.transcript, source: "prisma", audioSeconds: out.durationSec };
        if (autoSend) submitLearner(p);
        else {
          setPending(p);
          setPhase("review");
        }
      } catch (e) {
        const err = e instanceof ApiError ? e : null;
        if (err && ["not_configured", "credits_exhausted", "auth_failed"].includes(err.code)) {
          setSttOff(true);
          setTyping(true);
        }
        setError({
          message: err?.message ?? "Transcription failed.",
          retry: err?.retryable ? () => void handleRecording(rec) : undefined,
          retryLabel: "Retry transcription",
        });
        setPhase("your-turn");
      }
    },
    [autoSend, scenario, submitLearner],
  );

  const recorder = useRecorder({
    onComplete: (r) => void handleRecording(r),
    onError: (msg) => {
      setError({ message: msg });
      setPhase("your-turn");
    },
  });

  const startRecording = useCallback(() => {
    if (phase !== "your-turn" && phase !== "review") return;
    audioRef.current?.pause();
    setPending(null);
    setError(null);
    setPhase("recording");
    void recorder.start();
  }, [phase, recorder]);

  useEffect(() => {
    if (recorder.state === "denied" || recorder.state === "unsupported") setTyping(true);
  }, [recorder.state]);

  const stopRecording = useCallback(() => recorder.stop(), [recorder]);

  // Space bar toggles recording when not typing in a field.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName;
      if (e.code !== "Space" || tag === "TEXTAREA" || tag === "INPUT" || tag === "BUTTON" || typing) return;
      e.preventDefault();
      if (phase === "recording") stopRecording();
      else if (phase === "your-turn") startRecording();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [phase, startRecording, stopRecording, typing]);

  const skipAudio = () => {
    const el = audioRef.current;
    if (el && !el.paused) {
      el.pause();
      el.onended?.(new Event("ended"));
    }
  };

  const endSession = useCallback(async () => {
    const history = turnsRef.current;
    if (history.filter((t) => t.role === "learner").length === 0) {
      router.push("/practice");
      return;
    }
    if (inFlight.current) return;
    inFlight.current = true;
    audioRef.current?.pause();
    recorder.cancel();
    setPhase("reporting");
    setError(null);
    const state: ClientState = clientStateRef.current ?? { interest: 50, phase: "ended", raisedConcernIds: [], ended: true, outcome: null, notes: [] };
    const base = {
      id: sessionIdRef.current,
      createdAt: Date.now(),
      scenario,
      turns: history,
      clientState: state,
      report: null,
      generatedBy: generatedBy?.label ?? "",
      isDemo: generatedBy?.isDemo ?? false,
    };
    saveSession(base);
    try {
      const report = await requestReport({ sessionId: sessionIdRef.current, scenario, turns: history, clientState: state });
      saveSession({ ...base, report });
      router.push(`/report/${sessionIdRef.current}`);
    } catch (e) {
      inFlight.current = false;
      setError({
        message: `${e instanceof ApiError ? e.message : "Couldn't generate the report."} Your transcript is saved in History.`,
        retry: () => void endSession(),
        retryLabel: "Try again",
      });
      setPhase("ended");
    }
  }, [generatedBy, recorder, router, scenario]);

  const busy = phase === "client-thinking" || phase === "transcribing" || phase === "reporting";

  return (
    <div className="flex h-dvh flex-col bg-bg">
      <audio ref={audioRef} className="hidden" preload="auto" />

      {/* Top bar */}
      <header className="flex h-14 shrink-0 items-center justify-between gap-3 border-b border-border px-3 sm:px-5">
        <Link href="/practice/briefing" className="inline-flex items-center gap-1.5 text-sm text-fg-muted hover:text-fg">
          <ArrowLeft className="h-4 w-4" /> <span className="hidden sm:inline">Briefing</span>
        </Link>
        <div className="flex min-w-0 items-center gap-2">
          <span className="truncate text-sm font-medium">{scenario.title}</span>
          {generatedBy?.isDemo && <Badge tone="mid">Demo engine</Badge>}
        </div>
        <Button variant="danger" size="sm" onClick={() => void endSession()} disabled={phase === "pre" || phase === "reporting"}>
          <PhoneOff className="h-3.5 w-3.5" /> <span className="hidden sm:inline">End &amp; get coaching</span><span className="sm:hidden">End</span>
        </Button>
      </header>

      <div className="flex min-h-0 flex-1">
        {/* Side panel */}
        <aside className="hidden w-80 shrink-0 flex-col gap-5 overflow-y-auto border-r border-border p-5 lg:flex">
          <ClientCard scenario={scenario} speaking={phase === "client-speaking"} thinking={phase === "client-thinking"} />
          <div>
            <p className="text-[11px] uppercase tracking-wider text-fg-subtle">Objective</p>
            <p className="mt-1.5 text-sm leading-relaxed">{OBJECTIVES[scenario.settings.focus]}</p>
          </div>
          <div>
            <p className="text-[11px] uppercase tracking-wider text-fg-subtle">Progress</p>
            <div className="mt-2 flex items-center gap-2">
              <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-surface-2">
                <div className="h-full rounded-full bg-signal transition-all" style={{ width: `${Math.min(100, (learnerCount / scenario.settings.maxTurns) * 100)}%` }} />
              </div>
              <span className="font-mono text-xs text-fg-muted">{learnerCount}/{scenario.settings.maxTurns}</span>
            </div>
          </div>
          <div className="mt-auto space-y-1.5 text-xs text-fg-subtle">
            <p>You speak: <span className="text-fg-muted">{lang.label}</span> → {sttOff ? "typing (Prisma not configured)" : "Gnani Prisma v2.5"}</p>
            <p>Client voice: <span className="text-fg-muted">{ttsOff ? "text only" : status?.tts.provider ?? "Gnani Timbre"}</span></p>
            <p>Client &amp; coach: <span className="text-fg-muted">{generatedBy?.label ?? status?.reasoning.label ?? "…"}</span></p>
          </div>
        </aside>

        {/* Transcript */}
        <section className="flex min-w-0 flex-1 flex-col">
          <div className="flex-1 overflow-y-auto px-3 py-6 sm:px-8" aria-live="polite">
            <div className="mx-auto flex max-w-2xl flex-col gap-4">
              <div className="lg:hidden">
                <ClientCard scenario={scenario} speaking={phase === "client-speaking"} thinking={phase === "client-thinking"} compact />
              </div>

              {phase === "pre" && (
                <div className="rise mx-auto mt-10 max-w-md text-center">
                  <p className="font-display text-3xl">Ready when you are.</p>
                  <p className="mt-3 text-sm leading-relaxed text-fg-muted">
                    {sttOff
                      ? `${scenario.client.name} will open the call. Speech input isn't configured on this deployment, so type your answers; they'll be marked as typed.`
                      : `${scenario.client.name} will open the call. When it's your turn, click the mic (or press Space), speak, then click again to send. Recordings are capped at 30 seconds.`}
                  </p>
                  <Button size="lg" className="mt-6" onClick={startCall}>
                    <Play className="h-4 w-4" /> Start the call
                  </Button>
                </div>
              )}

              {turns.map((t) =>
                t.role === "client" ? (
                  <div key={t.index} className="rise flex gap-3">
                    <div className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-client/15 text-xs font-semibold text-client">{initials(scenario.client.name)}</div>
                    <div className="min-w-0 max-w-[85%]">
                      <p className="rounded-2xl rounded-tl-sm bg-surface-2 px-4 py-2.5 leading-relaxed">{t.text}</p>
                      <div className="mt-1 flex items-center gap-2 pl-1 text-xs text-fg-subtle">
                        {audioUrls[t.index] && (
                          <button
                            className="inline-flex items-center gap-1 rounded px-1 hover:text-fg"
                            onClick={() => play(t.index, audioUrls[t.index])}
                            disabled={phase === "recording"}
                            aria-label="Replay client's message"
                          >
                            <Volume2 className={cn("h-3.5 w-3.5", playingIdx === t.index && "text-client")} /> {playingIdx === t.index ? "Playing" : "Replay"}
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                ) : (
                  <div key={t.index} className="rise flex flex-col items-end">
                    <p className="max-w-[85%] rounded-2xl rounded-tr-sm bg-signal/12 px-4 py-2.5 leading-relaxed ring-1 ring-signal/25">{t.text}</p>
                    {t.englishText && (
                      <p className="mt-1.5 max-w-[85%] rounded-xl border border-border px-3 py-2 text-sm text-fg-muted">
                        <span className="text-[11px] uppercase tracking-wider text-fg-subtle">Client heard (English rendering)</span>
                        <br />
                        {t.englishText}
                      </p>
                    )}
                    <span className="mt-1 pr-1 text-xs text-fg-subtle">
                      {t.source === "prisma" ? `Gnani Prisma · ${t.audioSeconds?.toFixed(1)}s` : "Typed"}
                    </span>
                  </div>
                ),
              )}

              {phase === "client-thinking" && (
                <div className="flex gap-3 pl-11"><Thinking label={`${scenario.client.name.split(" ")[0] === "Dr." ? scenario.client.name : scenario.client.name.split(" ")[0]} is thinking…`} /></div>
              )}

              {phase === "ended" && clientState?.ended && (
                <div className="rise mt-4 rounded-2xl border border-border bg-surface p-5 text-center">
                  <p className="text-[11px] uppercase tracking-wider text-fg-subtle">Call ended</p>
                  <p className="mt-1 font-display text-2xl">{OUTCOME_LABEL[clientState.outcome ?? "follow-up-later"]}</p>
                  <Button className="mt-4" size="lg" onClick={() => void endSession()}>Get my coaching report</Button>
                </div>
              )}
              {phase === "reporting" && (
                <div className="mt-4 flex justify-center"><Thinking label="Your coach is reviewing the call. This can take up to a minute…" /></div>
              )}
              <div ref={transcriptEnd} />
            </div>
          </div>

          {/* Dock */}
          <div className="shrink-0 border-t border-border bg-bg-raised/80 px-3 pb-[max(env(safe-area-inset-bottom),12px)] pt-3 backdrop-blur sm:px-8">
            <div className="mx-auto max-w-2xl space-y-3">
              {error && (
                <Notice
                  tone="error"
                  action={
                    <div className="flex shrink-0 gap-2">
                      {error.undo && <Button size="sm" variant="ghost" onClick={error.undo}>Edit my answer</Button>}
                      {error.retry && <Button size="sm" variant="secondary" onClick={error.retry}><RotateCcw className="h-3.5 w-3.5" /> {error.retryLabel ?? "Retry"}</Button>}
                      <button aria-label="Dismiss" className="p-1 text-fg-subtle hover:text-fg" onClick={() => setError(null)}><X className="h-4 w-4" /></button>
                    </div>
                  }
                >
                  {error.message}
                </Notice>
              )}
              {notice && !error && (
                <Notice tone="warn" action={<button aria-label="Dismiss" className="p-1 text-fg-subtle hover:text-fg" onClick={() => setNotice(null)}><X className="h-4 w-4" /></button>}>
                  {notice}
                </Notice>
              )}

              {phase === "review" && pending && (
                <div className="rise rounded-xl border border-border-strong bg-surface p-3">
                  <p className="text-[11px] uppercase tracking-wider text-fg-subtle">
                    {pending.source === "prisma" ? `Gnani Prisma heard (${lang.label})` : "Your answer"}
                  </p>
                  <p className="mt-1 leading-relaxed">{pending.text}</p>
                  <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
                    <label className="flex items-center gap-2 text-xs text-fg-muted">
                      <input
                        type="checkbox"
                        checked={autoSend}
                        onChange={(e) => {
                          setAutoSend(e.target.checked);
                          try { localStorage.setItem("clientready.autosend", e.target.checked ? "1" : "0"); } catch { /* ignore */ }
                        }}
                      />
                      Send automatically next time
                    </label>
                    <div className="flex gap-2">
                      <Button size="sm" variant="ghost" onClick={startRecording}><RotateCcw className="h-3.5 w-3.5" /> Re-record</Button>
                      <Button size="sm" onClick={() => submitLearner(pending)}><Send className="h-3.5 w-3.5" /> Send</Button>
                    </div>
                  </div>
                </div>
              )}

              {typing && (phase === "your-turn" || phase === "review") ? (
                <form
                  className="flex items-end gap-2"
                  onSubmit={(e) => {
                    e.preventDefault();
                    submitLearner({ text: typed, source: "typed" });
                  }}
                >
                  <Textarea
                    aria-label="Type your answer"
                    value={typed}
                    maxLength={MAX_UTTERANCE_CHARS}
                    onChange={(e) => setTyped(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && !e.shiftKey) {
                        e.preventDefault();
                        submitLearner({ text: typed, source: "typed" });
                      }
                    }}
                    placeholder="Type what you'd say to the client… (typed answers are marked as typed, not Prisma)"
                    className="min-h-12 flex-1"
                    autoFocus
                  />
                  <Button type="submit" disabled={!typed.trim()} aria-label="Send typed answer"><Send className="h-4 w-4" /></Button>
                </form>
              ) : null}

              <div className="flex items-center justify-between gap-3">
                <StatusLine phase={phase} elapsed={recorder.elapsed} max={recorder.maxSeconds} />
                <div className="flex items-center gap-3">
                  {phase === "recording" && <LevelMeter level={recorder.level} active />}
                  {phase === "client-speaking" && (
                    <Button size="sm" variant="ghost" onClick={skipAudio}>Skip</Button>
                  )}
                  {!sttOff && phase !== "pre" && phase !== "ended" && phase !== "reporting" && (
                    <button
                      type="button"
                      onClick={phase === "recording" ? stopRecording : startRecording}
                      disabled={!(phase === "your-turn" || phase === "recording" || phase === "review")}
                      aria-label={phase === "recording" ? "Stop and send recording" : "Start recording"}
                      aria-pressed={phase === "recording"}
                      className={cn(
                        "relative grid h-14 w-14 place-items-center rounded-full transition-all disabled:opacity-40",
                        phase === "recording" ? "pulse-ring bg-low text-white" : "bg-signal text-signal-ink hover:scale-105",
                      )}
                    >
                      {phase === "recording" ? <Square className="h-5 w-5 fill-current" /> : <Mic className="h-6 w-6" />}
                    </button>
                  )}
                  {phase !== "pre" && phase !== "ended" && phase !== "reporting" && (
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => setTyping((x) => !x)}
                      disabled={sttOff || busy}
                      aria-label={typing ? "Switch to voice" : "Type instead"}
                      title={sttOff ? "Speech input needs GNANI_API_KEY" : undefined}
                    >
                      <Keyboard className="h-4 w-4" /> <span className="hidden sm:inline">{typing ? "Voice" : "Type"}</span>
                    </Button>
                  )}
                </div>
              </div>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}

function StatusLine({ phase, elapsed, max }: { phase: Phase; elapsed: number; max: number }) {
  const map: Partial<Record<Phase, React.ReactNode>> = {
    pre: <span className="text-fg-subtle">Not started</span>,
    "client-thinking": <Thinking label="Client is thinking" />,
    "client-speaking": <span className="flex items-center gap-2 text-client"><Volume2 className="h-4 w-4" /> Client is speaking</span>,
    "your-turn": <span className="text-signal">Your turn</span>,
    recording: (
      <span className="flex items-center gap-2 text-low">
        <span className="h-2 w-2 animate-pulse rounded-full bg-low" /> Listening · <span className="font-mono">{Math.floor(elapsed)}s / {max}s</span>
      </span>
    ),
    transcribing: <Thinking label="Transcribing with Gnani Prisma" />,
    review: <span className="text-fg-muted">Check the transcript, then send</span>,
    ended: <span className="text-fg-muted">Call ended</span>,
    reporting: <Thinking label="Generating report" />,
  };
  return <div className="min-w-0 text-sm" role="status">{map[phase]}</div>;
}

function ClientCard({ scenario, speaking, thinking, compact }: { scenario: Scenario; speaking: boolean; thinking: boolean; compact?: boolean }) {
  const c = scenario.client;
  return (
    <div className={cn("flex items-center gap-3", compact ? "rounded-xl border border-border bg-surface px-3 py-2.5" : "flex-col items-start")}>
      <div className={cn("relative grid shrink-0 place-items-center rounded-full bg-client/15 font-semibold text-client", compact ? "h-10 w-10 text-sm" : "h-16 w-16 text-lg", speaking && "pulse-ring")}>
        {initials(c.name)}
      </div>
      <div className="min-w-0">
        <p className="font-medium">{c.name}</p>
        <p className="truncate text-sm text-fg-muted">{c.role} · {c.businessType.replace(/\s*\(fictional\)/i, "")}</p>
        {!compact && (
          <div className="mt-2 flex flex-wrap gap-1.5">
            <Badge tone="client">{c.country}</Badge>
            <Badge>{LABELS.friendliness[scenario.settings.friendliness]}</Badge>
            <Badge>{LABELS.difficulty[scenario.settings.difficulty]}</Badge>
          </div>
        )}
        {compact && (speaking || thinking) && <p className="text-xs text-client">{speaking ? "Speaking…" : "Thinking…"}</p>}
      </div>
    </div>
  );
}
