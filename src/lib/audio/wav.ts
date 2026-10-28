/**
 * Minimal PCM WAV helpers shared by the browser (encode) and server (validate).
 *
 * Browsers' MediaRecorder emits WebM/Opus (Chrome, Firefox) or MP4 (Safari);
 * WebM is not in Prisma's accepted list (WAV, MP3, OGG, FLAC, AAC, M4A). We
 * therefore decode in the browser and upload 16 kHz mono 16-bit PCM WAV, which
 * is exactly what Prisma converts everything to internally.
 */

export const TARGET_SAMPLE_RATE = 16_000;
/** Prisma REST allows 60 s, its OpenAPI spec says 30 s is ideal; we cap at 30 s. */
export const MAX_UTTERANCE_SECONDS = 30;
export const MIN_UTTERANCE_SECONDS = 0.4;
export const MAX_UPLOAD_BYTES = 44 + TARGET_SAMPLE_RATE * 2 * (MAX_UTTERANCE_SECONDS + 1);

export function encodeWavPcm16(samples: Float32Array, sampleRate: number): Uint8Array {
  const dataLen = samples.length * 2;
  const buf = new ArrayBuffer(44 + dataLen);
  const v = new DataView(buf);
  const writeStr = (o: number, s: string) => {
    for (let i = 0; i < s.length; i++) v.setUint8(o + i, s.charCodeAt(i));
  };
  writeStr(0, "RIFF");
  v.setUint32(4, 36 + dataLen, true);
  writeStr(8, "WAVE");
  writeStr(12, "fmt ");
  v.setUint32(16, 16, true); // PCM chunk size
  v.setUint16(20, 1, true); // PCM
  v.setUint16(22, 1, true); // mono
  v.setUint32(24, sampleRate, true);
  v.setUint32(28, sampleRate * 2, true); // byte rate
  v.setUint16(32, 2, true); // block align
  v.setUint16(34, 16, true); // bits per sample
  writeStr(36, "data");
  v.setUint32(40, dataLen, true);
  let o = 44;
  for (let i = 0; i < samples.length; i++, o += 2) {
    const s = Math.max(-1, Math.min(1, samples[i]));
    v.setInt16(o, s < 0 ? s * 0x8000 : s * 0x7fff, true);
  }
  return new Uint8Array(buf);
}

/** Wrap already-quantised 16-bit mono samples in a WAV header. */
export function encodeWavFromInt16(samples: Int16Array, sampleRate: number): Uint8Array {
  const f = new Float32Array(samples.length);
  for (let i = 0; i < samples.length; i++) f[i] = samples[i] / 32768;
  return encodeWavPcm16(f, sampleRate);
}

export interface WavInfo {
  sampleRate: number;
  channels: number;
  bitsPerSample: number;
  durationSec: number;
  dataOffset: number;
  dataLength: number;
}

/** Parse and validate a PCM WAV header. Returns null if it is not a usable PCM WAV. */
export function parseWav(bytes: Uint8Array): WavInfo | null {
  if (bytes.length < 44) return null;
  const v = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const str = (o: number, n: number) => String.fromCharCode(...bytes.subarray(o, o + n));
  if (str(0, 4) !== "RIFF" || str(8, 4) !== "WAVE") return null;

  let offset = 12;
  let fmt: { format: number; channels: number; sampleRate: number; bits: number } | null = null;
  while (offset + 8 <= bytes.length) {
    const id = str(offset, 4);
    const size = v.getUint32(offset + 4, true);
    const body = offset + 8;
    if (id === "fmt ") {
      if (size < 16 || body + 16 > bytes.length) return null;
      fmt = {
        format: v.getUint16(body, true),
        channels: v.getUint16(body + 2, true),
        sampleRate: v.getUint32(body + 4, true),
        bits: v.getUint16(body + 14, true),
      };
    } else if (id === "data") {
      if (!fmt || fmt.format !== 1 || fmt.channels < 1 || fmt.sampleRate < 8000 || fmt.bits !== 16) return null;
      const dataLength = Math.min(size, bytes.length - body);
      const bytesPerSec = fmt.sampleRate * fmt.channels * (fmt.bits / 8);
      return {
        sampleRate: fmt.sampleRate,
        channels: fmt.channels,
        bitsPerSample: fmt.bits,
        durationSec: dataLength / bytesPerSec,
        dataOffset: body,
        dataLength,
      };
    }
    offset = body + size + (size % 2);
  }
  return null;
}

/** Root-mean-square level of 16-bit mono PCM, 0..1. Used to reject silent clips. */
export function pcm16Rms(bytes: Uint8Array, info: WavInfo): number {
  const v = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const n = Math.floor(info.dataLength / 2);
  if (n === 0) return 0;
  let sum = 0;
  const step = Math.max(1, Math.floor(n / 50_000));
  let count = 0;
  for (let i = 0; i < n; i += step) {
    const s = v.getInt16(info.dataOffset + i * 2, true) / 0x8000;
    sum += s * s;
    count++;
  }
  return Math.sqrt(sum / count);
}

/** Linear-interpolation resample + downmix. Adequate for speech at 16 kHz. */
export function resampleMono(channels: Float32Array[], fromRate: number, toRate: number): Float32Array {
  const len = channels[0]?.length ?? 0;
  const mono = new Float32Array(len);
  for (const ch of channels) for (let i = 0; i < len; i++) mono[i] += ch[i] / channels.length;
  if (fromRate === toRate) return mono;
  const ratio = fromRate / toRate;
  const outLen = Math.floor(len / ratio);
  const out = new Float32Array(outLen);
  for (let i = 0; i < outLen; i++) {
    const pos = i * ratio;
    const i0 = Math.floor(pos);
    const i1 = Math.min(i0 + 1, len - 1);
    const frac = pos - i0;
    out[i] = mono[i0] * (1 - frac) + mono[i1] * frac;
  }
  return out;
}
