"use client";

import { SAMPLE_SCRIPT, SAMPLE_STATE, SAMPLE_TURNS, SAMPLE_VOICE, SAMPLE_LABEL } from "@/lib/sample/sample-call";
import type { ClientState, Turn } from "@/lib/sim/types";
import { Emitter, type CallEngine, type CallMode } from "./engine";

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

function pickVoice(role: "client" | "learner" | "coach"): SpeechSynthesisVoice | null {
  const synth = typeof window !== "undefined" ? window.speechSynthesis : undefined;
  if (!synth) return null;
  const voices = synth.getVoices().filter((v) => /^en/i.test(v.lang));
  if (!voices.length) return null;
  const by = (re: RegExp) => voices.find((v) => re.test(v.lang) || re.test(v.name));
  if (role === "learner") return by(/en-IN|India/i) ?? voices[1] ?? voices[0];
  if (role === "coach") return by(/en-GB|UK/i) ?? voices[2] ?? voices[0];
  return by(/en-US/i) ?? voices[0];
}

/** Plays the scripted sample call with the browser's own speech synthesis. No mic, no keys. */
export class SampleCall extends Emitter implements CallEngine {
  readonly sample = true;
  mode: CallMode = "idle";
  turns: Turn[] = [];
  clientState: ClientState | null = null;
  generatedBy = { label: SAMPLE_LABEL, isDemo: true };
  private alive = false;
  private talking = false;
  private t = 0;
  private last = 0;
  private cancel: (() => void) | null = null;

  private setMode(m: CallMode) {
    this.mode = m;
    this.emit("mode", m);
  }

  async start() {
    this.alive = true;
    this.setMode("thinking");
    await wait(900);
    for (let i = 0; i < SAMPLE_SCRIPT.length; i++) {
      if (!this.alive) return;
      const line = SAMPLE_SCRIPT[i];
      if (line.role === "learner") {
        this.setMode("user");
        await wait(650);
      } else this.setMode("client");
      await this.say(line.text, line.role);
      if (!this.alive) return;
      this.turns = SAMPLE_TURNS.slice(0, i + 1);
      if (line.role === "learner") {
        this.setMode("thinking");
        await wait(1100);
      }
    }
    if (this.alive) await this.finish("client");
  }

  async end() {
    await this.finish("user");
  }

  private async finish(reason: "user" | "client") {
    if (!this.alive) return;
    this.alive = false;
    this.stopSpeaking();
    // The sample report covers the whole script, so its transcript does too.
    this.turns = SAMPLE_TURNS;
    this.clientState = { ...SAMPLE_STATE };
    this.setMode("ended");
    this.emit("end", { reason });
  }

  /** A synthetic speech envelope: syllable pulses with slower phrase swells. */
  level(): number {
    const now = performance.now();
    this.t += this.last ? (now - this.last) / 1000 : 0;
    this.last = now;
    if (!this.talking) return this.mode === "thinking" ? 0.04 : 0.02;
    const syl = 0.5 + 0.5 * Math.sin(this.t * 27);
    const phrase = 0.55 + 0.45 * Math.sin(this.t * 2.3) * Math.sin(this.t * 5.1 + 1);
    return Math.max(0, Math.min(1, 0.22 + 0.62 * syl * phrase));
  }

  setMuted() {}
  submitTyped() {}

  voiceMetrics() {
    return SAMPLE_VOICE;
  }

  private say(text: string, role: "client" | "learner" | "coach"): Promise<void> {
    this.emit("speaking", role === "learner" ? null : { who: role, text });
    return new Promise((resolve) => {
      const est = (text.split(/\s+/).length / 2.6) * 1000 + 400;
      let timer: ReturnType<typeof setTimeout> | undefined;
      let done = false;
      const finish = () => {
        if (done) return;
        done = true;
        this.talking = false;
        if (timer) clearTimeout(timer);
        this.emit("speaking", null);
        resolve();
      };
      this.cancel = finish;
      this.talking = true;
      const synth = window.speechSynthesis;
      if (!synth) {
        timer = setTimeout(finish, est);
        return;
      }
      try {
        synth.cancel();
        const u = new SpeechSynthesisUtterance(text);
        const v = pickVoice(role);
        if (v) u.voice = v;
        u.rate = role === "coach" ? 1.02 : 1;
        u.pitch = role === "learner" ? 0.9 : 1;
        u.onend = finish;
        u.onerror = () => {
          timer = setTimeout(finish, est);
        };
        synth.speak(u);
        timer = setTimeout(finish, est * 2 + 3000);
      } catch {
        timer = setTimeout(finish, est);
      }
    });
  }

  async speakCoach(text: string): Promise<boolean> {
    this.setMode("coach");
    await this.say(text, "coach");
    return true;
  }

  stopSpeaking() {
    try {
      window.speechSynthesis?.cancel();
    } catch {
      /* ignore */
    }
    this.cancel?.();
  }

  destroy() {
    this.alive = false;
    this.stopSpeaking();
  }
}
