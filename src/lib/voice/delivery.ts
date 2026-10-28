import { z } from "zod";
import { FRAME_MS } from "./segmenter";

/**
 * Timing-based delivery signals measured from the microphone during the call.
 * Prisma returns text only, so these are the only evidence the coach may use
 * for claims about how confident someone sounded.
 */
export const VoiceMetricsSchema = z.object({
  speakingSeconds: z.number().min(0).max(3600),
  clientSeconds: z.number().min(0).max(3600),
  talkTimeSharePct: z.number().min(0).max(100).nullable(),
  medianAnswerDelayMs: z.number().min(0).max(120_000).nullable(),
  midAnswerPauses: z.number().int().min(0).max(10_000),
  longestPauseMs: z.number().min(0).max(120_000),
  loudnessVariation: z.number().min(0).max(10).nullable(),
});
export type VoiceMetrics = z.infer<typeof VoiceMetricsSchema>;

/** Fed one frame at a time; `now` is a running clock in ms. */
export class VoiceTracker {
  private speakingMs = 0;
  private clientMs = 0;
  private loud: number[] = [];
  private delays: number[] = [];
  private pauses: number[] = [];
  private clientEndedAt: number | null = null;
  private awaitingAnswer = false;
  private silentSince: number | null = null;
  private inAnswer = false;

  /** A learner-turn frame. */
  user(now: number, rms: number, speaking: boolean) {
    if (speaking) {
      this.speakingMs += FRAME_MS;
      if (this.loud.length < 20_000) this.loud.push(rms);
      if (this.awaitingAnswer && this.clientEndedAt !== null) {
        this.delays.push(now - this.clientEndedAt);
        this.awaitingAnswer = false;
      }
      if (this.inAnswer && this.silentSince !== null && now - this.silentSince > 600) this.pauses.push(now - this.silentSince);
      this.silentSince = null;
      this.inAnswer = true;
    } else if (this.inAnswer && this.silentSince === null) {
      this.silentSince = now;
    }
  }

  /** Time the client spent talking. */
  client(ms: number) {
    this.clientMs += ms;
  }

  clientFinished(now: number) {
    this.clientEndedAt = now;
    this.awaitingAnswer = true;
    this.inAnswer = false;
    this.silentSince = null;
  }

  answerClosed() {
    this.inAnswer = false;
    this.silentSince = null;
  }

  summary(): VoiceMetrics {
    const mean = this.loud.reduce((a, b) => a + b, 0) / (this.loud.length || 1);
    const sd = Math.sqrt(this.loud.reduce((a, b) => a + (b - mean) ** 2, 0) / (this.loud.length || 1));
    const sorted = [...this.delays].sort((a, b) => a - b);
    const total = this.speakingMs + this.clientMs;
    return {
      speakingSeconds: Math.round(this.speakingMs / 100) / 10,
      clientSeconds: Math.round(this.clientMs / 100) / 10,
      talkTimeSharePct: total > 0 ? Math.round((100 * this.speakingMs) / total) : null,
      medianAnswerDelayMs: sorted.length ? Math.round(sorted[Math.floor(sorted.length / 2)]) : null,
      midAnswerPauses: this.pauses.length,
      longestPauseMs: this.pauses.length ? Math.round(Math.max(...this.pauses)) : 0,
      loudnessVariation: this.loud.length > 10 ? Math.round((sd / (mean || 1)) * 100) / 100 : null,
    };
  }
}
