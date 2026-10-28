"use client";

/**
 * Browser audio for the live call:
 *  - mic capture through an AudioWorklet, resampled to 16 kHz and cut into
 *    512-sample Int16 frames (32 ms) for the segmenter;
 *  - a level meter (AnalyserNode) that drives the ring;
 *  - a streaming player for Timbre's raw 16-bit PCM chunks.
 */

export interface Meter {
  node: AnalyserNode;
  /** level: 0..1 for the ring; rms: raw RMS. */
  read(): { level: number; rms: number };
}

export function makeMeter(ctx: AudioContext): Meter {
  const analyser = ctx.createAnalyser();
  analyser.fftSize = 1024;
  analyser.smoothingTimeConstant = 0.2;
  const buf = new Float32Array(analyser.fftSize);
  return {
    node: analyser,
    read() {
      analyser.getFloatTimeDomainData(buf);
      let sum = 0;
      for (let i = 0; i < buf.length; i++) sum += buf[i] * buf[i];
      const rms = Math.sqrt(sum / buf.length);
      const db = 20 * Math.log10(rms + 1e-8);
      return { level: Math.min(1, Math.max(0, (db + 58) / 40)), rms };
    },
  };
}

// Linear-interpolation resampler to 16 kHz; posts 512-sample Int16 frames.
const WORKLET_SRC = `
class Pcm16Frames extends AudioWorkletProcessor {
  constructor() {
    super();
    this.ratio = sampleRate / 16000;
    this.pos = 0;
    this.frame = new Int16Array(512);
    this.n = 0;
  }
  process(inputs) {
    const ch = inputs[0] && inputs[0][0];
    if (!ch) return true;
    while (this.pos < ch.length - 1) {
      const i = Math.floor(this.pos);
      const f = this.pos - i;
      const v = Math.max(-1, Math.min(1, ch[i] * (1 - f) + ch[i + 1] * f));
      this.frame[this.n++] = v < 0 ? v * 0x8000 : v * 0x7fff;
      if (this.n === 512) {
        this.port.postMessage(this.frame.buffer, [this.frame.buffer]);
        this.frame = new Int16Array(512);
        this.n = 0;
      }
      this.pos += this.ratio;
    }
    this.pos -= ch.length;
    return true;
  }
}
registerProcessor("pcm16-frames", Pcm16Frames);`;

export interface MicCapture {
  meter: Meter;
  stop(): void;
}

export async function startMic(ctx: AudioContext, onFrame: (frame: Int16Array) => void): Promise<MicCapture> {
  const stream = await navigator.mediaDevices.getUserMedia({
    audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true, channelCount: 1 },
  });
  const src = ctx.createMediaStreamSource(stream);
  const meter = makeMeter(ctx);
  src.connect(meter.node);

  const url = URL.createObjectURL(new Blob([WORKLET_SRC], { type: "application/javascript" }));
  try {
    await ctx.audioWorklet.addModule(url);
  } finally {
    URL.revokeObjectURL(url);
  }
  const node = new AudioWorkletNode(ctx, "pcm16-frames");
  node.port.onmessage = (e: MessageEvent<ArrayBuffer>) => onFrame(new Int16Array(e.data));
  src.connect(node);
  // Keep the worklet running without sending the mic to the speakers.
  const mute = ctx.createGain();
  mute.gain.value = 0;
  node.connect(mute).connect(ctx.destination);

  return {
    meter,
    stop() {
      stream.getTracks().forEach((t) => t.stop());
      try {
        src.disconnect();
        node.disconnect();
        node.port.onmessage = null;
      } catch {
        /* already disconnected */
      }
    },
  };
}

/** Plays raw little-endian 16-bit mono PCM chunks back to back, through a meter. */
export class PcmPlayer {
  readonly meter: Meter;
  onIdle: (() => void) | null = null;
  private out: GainNode;
  private next = 0;
  private sources = new Set<AudioBufferSourceNode>();
  private carry: Uint8Array | null = null;

  constructor(private ctx: AudioContext) {
    this.out = ctx.createGain();
    this.meter = makeMeter(ctx);
    this.out.connect(this.meter.node);
    this.meter.node.connect(ctx.destination);
  }

  get playing(): boolean {
    return this.sources.size > 0;
  }

  enqueue(chunk: Uint8Array, sampleRate: number) {
    let bytes = chunk;
    if (this.carry) {
      const merged = new Uint8Array(this.carry.length + bytes.length);
      merged.set(this.carry);
      merged.set(bytes, this.carry.length);
      bytes = merged;
      this.carry = null;
    }
    if (bytes.length % 2) {
      this.carry = bytes.slice(-1);
      bytes = bytes.slice(0, -1);
    }
    if (!bytes.length) return;
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    const n = bytes.length / 2;
    const audio = this.ctx.createBuffer(1, n, sampleRate);
    const data = audio.getChannelData(0);
    for (let i = 0; i < n; i++) data[i] = view.getInt16(i * 2, true) / 32768;
    const src = this.ctx.createBufferSource();
    src.buffer = audio;
    src.connect(this.out);
    const start = Math.max(this.ctx.currentTime + 0.03, this.next);
    src.start(start);
    this.next = start + audio.duration;
    this.sources.add(src);
    src.onended = () => {
      this.sources.delete(src);
      if (!this.sources.size) this.onIdle?.();
    };
  }

  stop() {
    for (const s of this.sources) {
      try {
        s.onended = null;
        s.stop();
      } catch {
        /* already stopped */
      }
    }
    this.sources.clear();
    this.next = 0;
    this.carry = null;
  }
}
