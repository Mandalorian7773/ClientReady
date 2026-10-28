/**
 * The ClientReady mark: a still frame of the call screen's voice ring (a
 * twisted ribbon of hatch lines, mist grey sweeping into orange) around the
 * orange dot from the wordmark. One source for the favicon, the apple icon,
 * the wordmark and the link-preview image.
 *
 * Geometry follows src/lib/client/voice/ring.ts, simplified to a fixed pose
 * and fewer, thicker lines so it stays legible at 16px.
 */

const ORANGE = [229, 98, 58]; // --accent-bright #e5623a
const MIST = [185, 177, 167]; // --mist #b9b1a7
export const PAPER = "#e8e1d6";
export const ACCENT = "#e5623a";

export interface MarkLine {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  color: string;
  opacity: number;
}

const smooth = (e0: number, e1: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - e0) / (e1 - e0)));
  return t * t * (3 - 2 * t);
};

/** Hatch lines for a ring centred in a `size` x `size` box. */
export function ringMarkLines(size = 64, opts: { lines?: number; warm?: number; phase?: number } = {}): MarkLine[] {
  const lines = opts.lines ?? 72;
  const warm = opts.warm ?? 0.55;
  const phase = opts.phase ?? 0.35;
  const c = size / 2;
  const R = size * 0.3;
  const half = R * 0.36;
  const out: MarkLine[] = [];
  for (let i = 0; i < lines; i++) {
    const th = (i / lines) * Math.PI * 2;
    const r = R * (1 + 0.07 * Math.cos(3 * (th - phase * 0.35)));
    // Two full twists around the loop, as on the call screen.
    const phi = th * 2 + phase * 2.2;
    const cosP = Math.cos(phi);
    const sinP = Math.sin(phi);
    const x1 = c + (r - half * cosP) * Math.cos(th);
    const y1 = c + (r - half * cosP) * Math.sin(th) * 0.94 + half * sinP * 0.38;
    const x2 = c + (r + half * cosP) * Math.cos(th);
    const y2 = c + (r + half * cosP) * Math.sin(th) * 0.94 - half * sinP * 0.38;
    const sweep = 0.5 + 0.5 * Math.cos(th - 0.9);
    const edge = 1 - warm;
    const o = smooth(edge - 0.28, edge + 0.28, sweep);
    const col = [0, 1, 2].map((j) => Math.round(MIST[j] + (ORANGE[j] - MIST[j]) * o));
    out.push({
      x1: round(x1),
      y1: round(y1),
      x2: round(x2),
      y2: round(y2),
      color: `rgb(${col[0]},${col[1]},${col[2]})`,
      opacity: round(0.45 + 0.5 * (0.5 + 0.5 * sinP)),
    });
  }
  return out;
}

const round = (n: number) => Math.round(n * 100) / 100;

/** Standalone SVG markup (favicon, apple icon). */
export function ringMarkSvg(opts: { size?: number; background?: boolean; radius?: number } = {}): string {
  const size = opts.size ?? 64;
  const bg = opts.background ?? true;
  const stroke = round(size / 64 * 1.9);
  const lines = ringMarkLines(size)
    .map((l) => `<line x1="${l.x1}" y1="${l.y1}" x2="${l.x2}" y2="${l.y2}" stroke="${l.color}" stroke-opacity="${l.opacity}" stroke-width="${stroke}" stroke-linecap="round"/>`)
    .join("");
  const dot = `<circle cx="${size / 2}" cy="${size / 2}" r="${round(size * 0.085)}" fill="${ACCENT}"/>`;
  const rect = bg ? `<rect width="${size}" height="${size}" rx="${opts.radius ?? round(size * 0.22)}" fill="${PAPER}"/>` : "";
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${size} ${size}">${rect}${lines}${dot}</svg>`;
}
