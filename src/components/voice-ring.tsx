"use client";

import { forwardRef, useEffect, useImperativeHandle, useRef } from "react";
import { Ring, type RingMode } from "@/lib/client/voice/ring";

export interface VoiceRingHandle {
  setMode(m: RingMode): void;
  setLevel(v: number): void;
}

/** Canvas voice ring. Decorative: state is also announced in text elsewhere. */
export const VoiceRing = forwardRef<VoiceRingHandle, { className?: string }>(function VoiceRing({ className }, ref) {
  const canvas = useRef<HTMLCanvasElement | null>(null);
  const ring = useRef<Ring | null>(null);

  useEffect(() => {
    if (!canvas.current) return;
    try {
      ring.current = new Ring(canvas.current);
    } catch {
      ring.current = null; // no canvas support: the call still works without the ring
    }
    return () => ring.current?.destroy();
  }, []);

  useImperativeHandle(ref, () => ({
    setMode: (m) => ring.current?.setMode(m),
    setLevel: (v) => ring.current?.setLevel(v),
  }));

  return <canvas ref={canvas} aria-hidden className={className} />;
});
