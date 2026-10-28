/**
 * Hands-free turn-taking without a streaming STT socket.
 *
 * The browser cuts the microphone into 512-sample (32 ms) 16 kHz frames. This
 * segmenter watches their loudness against an adaptive noise floor and emits
 * a speech segment once you have been quiet for `silenceMs`. Each segment is
 * then sent to Gnani Prisma REST (≈0.3 s), so the call feels continuous while
 * staying deployable on serverless hosts that cannot proxy WebSockets.
 *
 * Pure logic, no browser APIs, so it is unit-tested directly.
 */

export const FRAME_SAMPLES = 512;
export const FRAME_MS = (FRAME_SAMPLES / 16_000) * 1000; // 32 ms

export interface SegmenterOptions {
  /** Quiet time that ends a segment. 1.1 s tolerates thinking pauses mid-pitch. */
  silenceMs?: number;
  /** Speech shorter than this is treated as a cough or click and dropped. */
  minSpeechMs?: number;
  /** Long answers are cut here and transcribed in parts (Prisma REST ideal ≤ 30 s). */
  maxSegmentMs?: number;
  /** Audio kept from just before speech starts, so the first syllable isn't clipped. */
  preRollMs?: number;
  /** Consecutive loud frames needed to count as speech onset. */
  onsetFrames?: number;
}

export interface Segment {
  samples: Int16Array;
  /** Time actually spent speaking inside the segment (for words per minute). */
  speechMs: number;
  durationMs: number;
  /** True when the segment was cut at maxSegmentMs rather than by silence. */
  forced: boolean;
}

export type SegmenterEvent = { type: "speech-start" } | { type: "segment"; segment: Segment } | { type: "discarded" };

export function frameRms(frame: Int16Array): number {
  let sum = 0;
  for (let i = 0; i < frame.length; i++) {
    const s = frame[i] / 32768;
    sum += s * s;
  }
  return frame.length ? Math.sqrt(sum / frame.length) : 0;
}

export class UtteranceSegmenter {
  floor = 0.008;
  private o: Required<SegmenterOptions>;
  private preRoll: Int16Array[] = [];
  private frames: Int16Array[] = [];
  private active = false;
  private loudRun = 0;
  private silentMs = 0;
  private speechMs = 0;

  constructor(opts: SegmenterOptions = {}) {
    this.o = { silenceMs: 1100, minSpeechMs: 300, maxSegmentMs: 28_000, preRollMs: 320, onsetFrames: 2, ...opts };
  }

  get speaking(): boolean {
    return this.active && this.silentMs === 0;
  }

  get inSegment(): boolean {
    return this.active;
  }

  /** Loudness above which a frame counts as speech. */
  threshold(): number {
    return Math.max(this.floor * 3, 0.012);
  }

  /** Track the noise floor and pre-roll without capturing (e.g. while the client talks). */
  observe(frame: Int16Array, rms = frameRms(frame)): boolean {
    const loud = rms > this.threshold();
    if (!loud) this.floor = this.floor * 0.995 + rms * 0.005;
    this.preRoll.push(frame);
    const keep = Math.ceil(this.o.preRollMs / FRAME_MS);
    while (this.preRoll.length > keep) this.preRoll.shift();
    return loud;
  }

  /** Feed one frame while it is the learner's turn. */
  push(frame: Int16Array, rms = frameRms(frame)): SegmenterEvent[] {
    const events: SegmenterEvent[] = [];
    const preRollBefore = this.preRoll.slice();
    const loud = this.observe(frame, rms);

    if (!this.active) {
      this.loudRun = loud ? this.loudRun + 1 : 0;
      if (this.loudRun >= this.o.onsetFrames) {
        this.active = true;
        // Include the frames before onset (they are in the pre-roll) plus this one.
        this.frames = [...preRollBefore, frame];
        this.speechMs = this.loudRun * FRAME_MS;
        this.silentMs = 0;
        events.push({ type: "speech-start" });
      }
      return events;
    }

    this.frames.push(frame);
    if (loud) {
      this.speechMs += FRAME_MS;
      this.silentMs = 0;
    } else {
      this.silentMs += FRAME_MS;
    }

    const durationMs = this.frames.length * FRAME_MS;
    if (this.silentMs >= this.o.silenceMs) {
      events.push(this.close(false));
    } else if (durationMs >= this.o.maxSegmentMs) {
      events.push(this.close(true));
    }
    return events;
  }

  /** Close any open segment now (e.g. the call ended mid-sentence). */
  flush(): SegmenterEvent | null {
    return this.active ? this.close(false) : null;
  }

  reset() {
    this.active = false;
    this.frames = [];
    this.loudRun = 0;
    this.silentMs = 0;
    this.speechMs = 0;
  }

  private close(forced: boolean): SegmenterEvent {
    const speechMs = this.speechMs;
    const frames = this.frames;
    this.reset();
    if (speechMs < this.o.minSpeechMs) return { type: "discarded" };
    const samples = new Int16Array(frames.length * FRAME_SAMPLES);
    frames.forEach((f, i) => samples.set(f, i * FRAME_SAMPLES));
    return { type: "segment", segment: { samples, speechMs, durationMs: frames.length * FRAME_MS, forced } };
  }
}

/**
 * Detects the learner talking over the client: clearly louder than the room
 * for `holdMs`. Echo cancellation removes most of the client's own voice; the
 * high multiplier handles the rest.
 */
export class BargeInDetector {
  private run = 0;
  constructor(private opts: { holdMs?: number; multiplier?: number; minRms?: number } = {}) {}

  push(rms: number, floor: number): boolean {
    const hold = this.opts.holdMs ?? 350;
    const loud = rms > Math.max(floor * (this.opts.multiplier ?? 6), this.opts.minRms ?? 0.05);
    this.run = loud ? this.run + FRAME_MS : 0;
    if (this.run >= hold) {
      this.run = 0;
      return true;
    }
    return false;
  }

  reset() {
    this.run = 0;
  }
}
