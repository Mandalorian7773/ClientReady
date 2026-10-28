"use client";

import { ApiError, requestClientTurn, transcribe } from "@/lib/client/api";
import { encodeWavFromInt16 } from "@/lib/audio/wav";
import { MAX_UTTERANCE_CHARS, type ClientState, type Turn } from "@/lib/sim/types";
import { BargeInDetector, FRAME_MS, frameRms, UtteranceSegmenter, type Segment } from "@/lib/voice/segmenter";
import { VoiceTracker } from "@/lib/voice/delivery";
import { base64ToBytes, SseParser } from "@/lib/voice/sse";
import { PcmPlayer, startMic, type MicCapture } from "./audio";
import { Emitter, type CallEngine, type CallMode, type EngineOptions } from "./engine";

/** Prisma, Timbre and the reasoning model, hands-free. */
const MAX_CALL_MS = 10 * 60 * 1000;
const UNAVAILABLE = ["not_configured", "credits_exhausted", "auth_failed"];

export class LiveCall extends Emitter implements CallEngine {
  readonly sample = false;
  mode: CallMode = "idle";
  turns: Turn[] = [];
  clientState: ClientState | null = null;
  generatedBy: { label: string; isDemo: boolean } | null = null;

  private ctx: AudioContext | null = null;
  private mic: MicCapture | null = null;
  private player: PcmPlayer | null = null;
  private segmenter = new UtteranceSegmenter();
  private barge = new BargeInDetector();
  private tracker = new VoiceTracker();
  private alive = false;
  private muted = false;
  private startedAt = 0;
  private pendingStt = 0;
  private answer: string[] = [];
  private answerSpeechMs = 0;
  private abortSpeech: (() => void) | null = null;
  private sttAvailable: boolean;
  private ttsAvailable: boolean;
  private userSince = 0;
  private nudged = false;
  private timer: ReturnType<typeof setInterval> | null = null;
  private usedMic = false;

  constructor(private opts: EngineOptions) {
    super();
    this.sttAvailable = opts.sttAvailable;
    this.ttsAvailable = opts.ttsAvailable;
  }

  /** Must be called from a user gesture (it creates the AudioContext). */
  async start() {
    const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    this.ctx = new AC();
    await this.ctx.resume();
    this.player = new PcmPlayer(this.ctx);
    if (this.sttAvailable) {
      // Mic first, so a blocked permission fails before the client starts talking.
      this.mic = await startMic(this.ctx, (f) => this.onFrame(f));
      this.usedMic = true;
    } else {
      this.emit("needsTyping", this.opts.typingReason ?? "Speech input isn't configured, so type your answers. They are marked as typed.");
    }
    this.alive = true;
    this.startedAt = performance.now();
    this.timer = setInterval(() => {
      if (this.alive && performance.now() - this.startedAt > MAX_CALL_MS) void this.finish("time");
    }, 1000);
    void this.clientTurn();
  }

  level(): number {
    if (this.mode === "client" || this.mode === "coach") return this.player?.meter.read().level ?? 0;
    if (this.mode === "user" && this.mic && !this.muted) {
      const { level } = this.mic.meter.read();
      return this.segmenter.speaking ? level : level * 0.4;
    }
    return this.mode === "thinking" ? 0.05 : 0.03;
  }

  setMuted(muted: boolean) {
    this.muted = muted;
    if (muted) this.segmenter.reset();
  }

  voiceMetrics() {
    return this.usedMic ? this.tracker.summary() : null;
  }

  // ---------------- microphone ----------------

  private onFrame(frame: Int16Array) {
    if (!this.alive || this.muted) return;
    const rms = frameRms(frame);
    const now = performance.now();

    if (this.mode === "user") {
      const loud = rms > this.segmenter.threshold();
      for (const ev of this.segmenter.push(frame, rms)) {
        if (ev.type === "segment") this.transcribeSegment(ev.segment);
        if (ev.type === "discarded") this.maybeCommit();
      }
      this.tracker.user(now, rms, loud);
      if (!this.nudged && !this.answer.length && !this.segmenter.inSegment && now - this.userSince > 25_000) {
        this.nudged = true;
        this.emit("notice", "Take your time. The client is waiting for your answer.");
      }
      return;
    }

    this.segmenter.observe(frame, rms);
    if (this.mode === "client") {
      if (this.player?.playing) this.tracker.client(FRAME_MS);
      if (this.barge.push(rms, this.segmenter.floor)) this.abortSpeech?.();
    }
  }

  private transcribeSegment(seg: Segment) {
    this.pendingStt++;
    this.answerSpeechMs += seg.speechMs;
    const wav = new Blob([encodeWavFromInt16(seg.samples, 16_000) as BlobPart], { type: "audio/wav" });
    const s = this.opts.scenario;
    const bias = [s.offer.name, s.offer.description, s.client.name, s.client.industry].join(" ").split(/\s+/);
    transcribe(wav, s.learner.speechLanguage, bias, this.opts.sessionId)
      .then((r) => {
        if (r.transcript.trim()) this.answer.push(r.transcript.trim());
      })
      .catch((e) => {
        const err = e instanceof ApiError ? e : null;
        if (err?.code === "empty_transcript") {
          this.emit("notice", "That didn't come through. Try saying it again.");
        } else if (err && UNAVAILABLE.includes(err.code)) {
          this.sttAvailable = false;
          this.emit("needsTyping", `${err.message} Type your answers for the rest of this call.`);
        } else {
          this.emit("notice", `${err?.message ?? "Transcription failed."} Say that part again.`);
        }
      })
      .finally(() => {
        this.pendingStt--;
        this.maybeCommit();
      });
  }

  /** An answer is complete when you've paused and every segment is transcribed. */
  private maybeCommit() {
    if (this.mode !== "user" || this.segmenter.inSegment || this.pendingStt > 0 || !this.answer.length) return;
    const text = this.answer.join(" ");
    const secs = this.answerSpeechMs / 1000;
    this.answer = [];
    this.answerSpeechMs = 0;
    this.tracker.answerClosed();
    this.addLearnerTurn(text, "prisma", secs);
  }

  submitTyped(text: string) {
    const t = text.trim();
    if (!t || this.mode !== "user") return;
    this.addLearnerTurn(t, "typed");
  }

  /**
   * Keep the transcript strictly client/learner alternating: if the client
   * failed to reply to the previous answer, this answer is appended to it.
   */
  private addLearnerTurn(text: string, source: "prisma" | "typed", seconds?: number) {
    const last = this.turns[this.turns.length - 1];
    if (last?.role === "learner") {
      this.turns = [
        ...this.turns.slice(0, -1),
        {
          ...last,
          text: `${last.text} ${text}`.slice(0, MAX_UTTERANCE_CHARS),
          source: last.source === "typed" || source === "typed" ? "typed" : "prisma",
          audioSeconds: (last.audioSeconds ?? 0) + (seconds ?? 0) || undefined,
        },
      ];
    } else {
      this.turns = [
        ...this.turns,
        { index: this.turns.length, role: "learner", text: text.slice(0, MAX_UTTERANCE_CHARS), source, audioSeconds: seconds, at: Date.now() },
      ];
    }
    void this.clientTurn();
  }

  // ---------------- client ----------------

  private setMode(m: CallMode) {
    this.mode = m;
    if (m === "user") {
      this.userSince = performance.now();
      this.nudged = false;
      this.segmenter.reset();
      this.barge.reset();
    }
    this.emit("mode", m);
  }

  private async clientTurn(attempt = 0): Promise<void> {
    if (!this.alive) return;
    this.setMode("thinking");
    let res;
    try {
      res = await requestClientTurn({
        sessionId: this.opts.sessionId,
        scenario: this.opts.scenario,
        turns: this.turns,
        clientState: this.clientState,
      });
    } catch (e) {
      if (!this.alive) return;
      const err = e instanceof ApiError ? e : null;
      if (attempt === 0 && (err?.retryable ?? true)) {
        await new Promise((r) => setTimeout(r, 1200));
        return this.clientTurn(1);
      }
      this.emit("error", {
        message: `${err?.message ?? "The client couldn't reply."} Retry, or just say it again.`,
        retry: () => void this.clientTurn(),
      });
      if (this.turns.length) this.setMode("user");
      return;
    }
    if (!this.alive) return;

    let turns = this.turns;
    if (res.learnerEnglish && turns.at(-1)?.role === "learner") {
      turns = [...turns.slice(0, -1), { ...turns[turns.length - 1], englishText: res.learnerEnglish }];
    }
    const line: Turn = { index: turns.length, role: "client", text: res.reply, source: "model", at: Date.now() };
    this.turns = [...turns, line];
    this.clientState = res.state;
    this.generatedBy = { label: res.generatedBy, isDemo: res.isDemo };

    this.setMode("client");
    const finished = await this.speak(res.reply, "client");
    if (!this.alive) return;
    if (!finished) {
      // You talked over the client: keep listening, mark the line as interrupted.
      this.turns = this.turns.map((t) => (t.index === line.index ? { ...t, interrupted: true } : t));
      this.setMode("user");
      return;
    }
    this.tracker.clientFinished(performance.now());
    if (res.state.ended) {
      void this.finish("client");
      return;
    }
    this.setMode("user");
  }

  /** Streams Timbre audio; resolves true when it played to the end, false when interrupted. */
  private speak(text: string, who: "client" | "coach", language = "en-IN"): Promise<boolean> {
    this.emit("speaking", { who, text });
    const done = (v: boolean) => {
      this.emit("speaking", null);
      return v;
    };
    if (!this.ttsAvailable || !this.player) {
      // Without a voice the text stays on screen as a caption.
      this.emit("speaking", { who, text });
      return Promise.resolve(true);
    }
    const player = this.player;
    return new Promise<boolean>((resolve) => {
      const ac = new AbortController();
      let settled = false;
      const settle = (v: boolean) => {
        if (settled) return;
        settled = true;
        this.abortSpeech = null;
        player.onIdle = null;
        resolve(done(v));
      };
      this.abortSpeech = () => {
        ac.abort();
        player.stop();
        settle(false);
      };
      (async () => {
        try {
          const body = { text: text.slice(0, 900), kind: who, gender: this.opts.scenario.client.voiceGender, seed: this.opts.scenario.client.name.length, language, sessionId: this.opts.sessionId };
          const res = await fetch("/api/tts/stream", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body), signal: ac.signal });
          if (!res.ok || !res.body) {
            const j = (await res.json().catch(() => null)) as { error?: { code: string; message: string } } | null;
            throw new ApiError(j?.error?.code ?? "upstream_error", j?.error?.message ?? "Voice synthesis failed.", false, res.status);
          }
          const rate = Number(res.headers.get("X-Sample-Rate")) || 24_000;
          const reader = res.body.getReader();
          const dec = new TextDecoder();
          const parser = new SseParser();
          for (;;) {
            const { done: end, value } = await reader.read();
            if (end) break;
            for (const ev of parser.push(dec.decode(value, { stream: true }))) {
              const data = ev.data as { audio?: string; message?: string };
              if (ev.event === "chunk" && data.audio) player.enqueue(base64ToBytes(data.audio), rate);
              else if (ev.event === "error") this.emit("notice", `Voice error: ${data.message ?? "synthesis failed"}`);
            }
          }
          if (!player.playing) return settle(true);
          player.onIdle = () => settle(true);
        } catch (e) {
          if (ac.signal.aborted) return;
          const err = e instanceof ApiError ? e : null;
          if (err && UNAVAILABLE.includes(err.code)) this.ttsAvailable = false;
          this.emit("notice", `${err?.message ?? "Voice playback failed."} Showing the words instead.`);
          this.emit("speaking", { who, text });
          settled = true;
          this.abortSpeech = null;
          resolve(true);
        }
      })();
    });
  }

  speakCoach(text: string, ttsLanguage: string): Promise<boolean> {
    this.setMode("coach");
    return this.speak(text, "coach", ttsLanguage);
  }

  stopSpeaking() {
    this.abortSpeech?.();
  }

  // ---------------- ending ----------------

  async end() {
    await this.finish("user");
  }

  private async finish(reason: "user" | "client" | "time") {
    if (!this.alive) return;
    this.alive = false;
    this.abortSpeech?.();
    // Mode leaves "user" first, so maybeCommit can't start a client turn;
    // the answer that was still being spoken or transcribed is merged below.
    this.mode = "ended";
    const open = this.segmenter.flush();
    if (open?.type === "segment") this.transcribeSegment(open.segment);
    const deadline = performance.now() + 8000;
    while (this.pendingStt > 0 && performance.now() < deadline) await new Promise((r) => setTimeout(r, 100));
    if (this.answer.length) {
      const text = this.answer.join(" ");
      this.answer = [];
      const last = this.turns.at(-1);
      if (last?.role === "learner") {
        this.turns = [...this.turns.slice(0, -1), { ...last, text: `${last.text} ${text}`.slice(0, MAX_UTTERANCE_CHARS) }];
      } else if (last) {
        this.turns = [...this.turns, { index: this.turns.length, role: "learner", text, source: "prisma", audioSeconds: this.answerSpeechMs / 1000 }];
      }
    }
    this.mic?.stop();
    if (this.timer) clearInterval(this.timer);
    this.emit("mode", "ended");
    this.emit("end", { reason });
  }

  destroy() {
    this.alive = false;
    this.abortSpeech?.();
    this.mic?.stop();
    if (this.timer) clearInterval(this.timer);
    void this.ctx?.close();
  }
}
