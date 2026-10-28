"use client";

import type { Scenario } from "@/lib/scenario/schema";
import type { ClientState, Turn } from "@/lib/sim/types";
import type { VoiceMetrics } from "@/lib/voice/delivery";

/** Who is "on" right now; drives the ring and the copy on screen. */
export type CallMode = "idle" | "thinking" | "client" | "user" | "coach" | "ended";

export interface EngineEvents {
  mode: CallMode;
  /** Something failed; `retry` re-runs the failed step when that makes sense. */
  error: { message: string; retry?: () => void };
  notice: string;
  /** Text currently being spoken (for captions), or null when nobody is speaking. */
  speaking: { who: "client" | "coach"; text: string } | null;
  end: { reason: "user" | "client" | "time" };
  /** Speech input is unavailable (no key, mic blocked); the UI should offer typing. */
  needsTyping: string;
}

/** Common surface of the live call and the scripted sample call. */
export interface CallEngine {
  readonly sample: boolean;
  mode: CallMode;
  turns: Turn[];
  clientState: ClientState | null;
  generatedBy: { label: string; isDemo: boolean } | null;
  on<K extends keyof EngineEvents>(type: K, cb: (data: EngineEvents[K]) => void): void;
  start(): Promise<void>;
  /** Ends the call, finishing any answer that was mid-transcription. */
  end(): Promise<void>;
  /** 0..1 level for the ring, read every animation frame. */
  level(): number;
  setMuted(muted: boolean): void;
  submitTyped(text: string): void;
  speakCoach(text: string, ttsLanguage: string): Promise<boolean>;
  stopSpeaking(): void;
  voiceMetrics(): VoiceMetrics | null;
  destroy(): void;
}

export class Emitter {
  private handlers = new Map<keyof EngineEvents, Array<(d: never) => void>>();
  on<K extends keyof EngineEvents>(type: K, cb: (data: EngineEvents[K]) => void) {
    const list = this.handlers.get(type) ?? [];
    list.push(cb as (d: never) => void);
    this.handlers.set(type, list);
  }
  protected emit<K extends keyof EngineEvents>(type: K, data: EngineEvents[K]) {
    this.handlers.get(type)?.forEach((cb) => (cb as (d: EngineEvents[K]) => void)(data));
  }
}

export interface EngineOptions {
  sessionId: string;
  scenario: Scenario;
  sttAvailable: boolean;
  ttsAvailable: boolean;
  /** Why speech input is off, shown to the learner (e.g. mic blocked). */
  typingReason?: string;
}
