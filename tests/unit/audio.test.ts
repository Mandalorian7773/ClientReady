import { describe, expect, it } from "vitest";
import { encodeWavPcm16, parseWav, pcm16Rms, resampleMono } from "@/lib/audio/wav";
import { validateUtteranceAudio } from "@/lib/audio/validate";
import { AppError } from "@/lib/server/errors";
import { toneWav } from "../helpers/fixtures";

function code(fn: () => unknown): string | undefined {
  try {
    fn();
  } catch (e) {
    return (e as AppError).code;
  }
  return undefined;
}

describe("WAV encode/parse", () => {
  it("round-trips 16 kHz mono PCM16", () => {
    const bytes = toneWav(2);
    const info = parseWav(bytes)!;
    expect(info.sampleRate).toBe(16000);
    expect(info.channels).toBe(1);
    expect(info.bitsPerSample).toBe(16);
    expect(info.durationSec).toBeCloseTo(2, 2);
    expect(pcm16Rms(bytes, info)).toBeGreaterThan(0.1);
  });

  it("rejects non-WAV and truncated input", () => {
    expect(parseWav(new TextEncoder().encode("this is not audio at all, definitely not a RIFF file"))).toBeNull();
    expect(parseWav(new Uint8Array(10))).toBeNull();
  });

  it("resamples 48 kHz stereo to 16 kHz mono", () => {
    const l = new Float32Array(48000).fill(0.5);
    const r = new Float32Array(48000).fill(-0.5);
    const out = resampleMono([l, r], 48000, 16000);
    expect(out.length).toBe(16000);
    expect(Math.abs(out[100])).toBeLessThan(1e-6);
  });

  it("clips samples outside [-1, 1]", () => {
    const bytes = encodeWavPcm16(new Float32Array([2, -2]), 16000);
    const v = new DataView(bytes.buffer);
    expect(v.getInt16(44, true)).toBe(32767);
    expect(v.getInt16(46, true)).toBe(-32768);
  });
});

describe("utterance validation (before spending STT credits)", () => {
  it("accepts a normal utterance", () => {
    expect(validateUtteranceAudio(toneWav(3), "audio/wav").durationSec).toBeCloseTo(3, 1);
  });

  it("rejects empty, silent, too-short and too-long audio", () => {
    expect(code(() => validateUtteranceAudio(new Uint8Array(), "audio/wav"))).toBe("bad_audio");
    expect(code(() => validateUtteranceAudio(toneWav(2, 0), "audio/wav"))).toBe("empty_transcript");
    expect(code(() => validateUtteranceAudio(toneWav(0.2), "audio/wav"))).toBe("bad_audio");
    expect(code(() => validateUtteranceAudio(toneWav(31.5), "audio/wav"))).toBe("audio_too_long");
  });

  it("rejects non-WAV content types and non-WAV bytes", () => {
    expect(code(() => validateUtteranceAudio(toneWav(2), "audio/webm"))).toBe("bad_audio");
    expect(code(() => validateUtteranceAudio(new Uint8Array(2000).fill(7), "audio/wav"))).toBe("bad_audio");
  });

  it("rejects stereo uploads", () => {
    const mono = toneWav(1);
    const stereo = mono.slice();
    new DataView(stereo.buffer).setUint16(22, 2, true);
    expect(code(() => validateUtteranceAudio(stereo, "audio/wav"))).toBe("bad_audio");
  });
});
