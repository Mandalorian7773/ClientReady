"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { encodeWavPcm16, MAX_UTTERANCE_SECONDS, MIN_UTTERANCE_SECONDS, resampleMono, TARGET_SAMPLE_RATE } from "@/lib/audio/wav";

export type RecorderState = "idle" | "requesting" | "recording" | "processing" | "denied" | "unsupported" | "error";

export interface Recording {
  wav: Blob;
  durationSec: number;
  peak: number;
}

function pickMimeType(): string | undefined {
  if (typeof MediaRecorder === "undefined") return undefined;
  for (const t of ["audio/webm;codecs=opus", "audio/webm", "audio/mp4", "audio/ogg;codecs=opus"]) {
    if (MediaRecorder.isTypeSupported(t)) return t;
  }
  return undefined;
}

/**
 * Converts whatever the browser recorded (WebM/Opus, MP4/AAC, Ogg) into
 * 16 kHz mono 16-bit PCM WAV, a format Gnani Prisma accepts directly.
 */
export async function toWav16k(blob: Blob): Promise<Recording> {
  const ctx = new AudioContext();
  try {
    const decoded = await ctx.decodeAudioData(await blob.arrayBuffer());
    const channels = Array.from({ length: decoded.numberOfChannels }, (_, i) => decoded.getChannelData(i));
    const mono = resampleMono(channels, decoded.sampleRate, TARGET_SAMPLE_RATE);
    let peak = 0;
    for (let i = 0; i < mono.length; i++) peak = Math.max(peak, Math.abs(mono[i]));
    const wav = encodeWavPcm16(mono, TARGET_SAMPLE_RATE);
    return { wav: new Blob([wav as BlobPart], { type: "audio/wav" }), durationSec: mono.length / TARGET_SAMPLE_RATE, peak };
  } finally {
    void ctx.close();
  }
}

/**
 * Microphone recorder with level metering and a hard duration cap.
 * One recording at a time; start() while recording is ignored.
 */
export function useRecorder(opts: { maxSeconds?: number; onComplete: (r: Recording) => void; onError: (msg: string) => void }) {
  const maxSeconds = opts.maxSeconds ?? MAX_UTTERANCE_SECONDS;
  const [state, setState] = useState<RecorderState>("idle");
  const [level, setLevel] = useState(0);
  const [elapsed, setElapsed] = useState(0);
  const streamRef = useRef<MediaStream | null>(null);
  const recRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const rafRef = useRef<number>(0);
  const ctxRef = useRef<AudioContext | null>(null);
  const startedAtRef = useRef(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const cbRef = useRef(opts);
  cbRef.current = opts;

  const cleanupStream = useCallback(() => {
    cancelAnimationFrame(rafRef.current);
    if (timerRef.current) clearInterval(timerRef.current);
    timerRef.current = null;
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    void ctxRef.current?.close();
    ctxRef.current = null;
    setLevel(0);
  }, []);

  useEffect(() => cleanupStream, [cleanupStream]);

  const stop = useCallback(() => {
    const rec = recRef.current;
    if (rec && rec.state === "recording") rec.stop();
  }, []);

  const start = useCallback(async () => {
    if (recRef.current?.state === "recording" || state === "requesting" || state === "processing") return;
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === "undefined") {
      setState("unsupported");
      cbRef.current.onError("This browser can't record audio. Try Chrome, Edge, Firefox or Safari, or type your answer.");
      return;
    }
    setState("requesting");
    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, channelCount: 1 } });
    } catch (e) {
      const denied = (e as DOMException).name === "NotAllowedError" || (e as DOMException).name === "SecurityError";
      setState(denied ? "denied" : "error");
      cbRef.current.onError(
        denied
          ? "Microphone access was blocked. Allow it in your browser's site settings, or type your answer instead."
          : "No microphone was found. Connect one, or type your answer instead.",
      );
      return;
    }
    streamRef.current = stream;

    // Level meter
    const ctx = new AudioContext();
    ctxRef.current = ctx;
    const analyser = ctx.createAnalyser();
    analyser.fftSize = 512;
    ctx.createMediaStreamSource(stream).connect(analyser);
    const data = new Uint8Array(analyser.fftSize);
    const tick = () => {
      analyser.getByteTimeDomainData(data);
      let sum = 0;
      for (const v of data) sum += ((v - 128) / 128) ** 2;
      setLevel(Math.min(1, Math.sqrt(sum / data.length) * 4));
      rafRef.current = requestAnimationFrame(tick);
    };
    tick();

    const mimeType = pickMimeType();
    const rec = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
    recRef.current = rec;
    chunksRef.current = [];
    rec.ondataavailable = (e) => e.data.size > 0 && chunksRef.current.push(e.data);
    rec.onstop = async () => {
      const secs = (performance.now() - startedAtRef.current) / 1000;
      cleanupStream();
      setState("processing");
      try {
        if (secs < MIN_UTTERANCE_SECONDS) throw new Error("short");
        const blob = new Blob(chunksRef.current, { type: rec.mimeType || mimeType || "audio/webm" });
        const out = await toWav16k(blob);
        if (out.peak < 0.01) {
          cbRef.current.onError("We couldn't hear anything. Check your microphone isn't muted and try again.");
        } else {
          cbRef.current.onComplete(out);
        }
      } catch (e) {
        cbRef.current.onError(
          (e as Error).message === "short"
            ? "That was too short. Click the mic, speak, then click again to send."
            : "Couldn't process that recording. Please try again.",
        );
      } finally {
        setState("idle");
        setElapsed(0);
      }
    };

    startedAtRef.current = performance.now();
    setElapsed(0);
    timerRef.current = setInterval(() => {
      const s = (performance.now() - startedAtRef.current) / 1000;
      setElapsed(s);
      if (s >= maxSeconds) stop();
    }, 200);
    rec.start(250);
    setState("recording");
  }, [cleanupStream, maxSeconds, state, stop]);

  /** Discard the current recording without sending it. */
  const cancel = useCallback(() => {
    const rec = recRef.current;
    if (rec && rec.state === "recording") {
      rec.onstop = null;
      rec.stop();
    }
    cleanupStream();
    setState("idle");
    setElapsed(0);
  }, [cleanupStream]);

  return { state, level, elapsed, maxSeconds, start, stop, cancel };
}
