/**
 * The voice ring: a twisted ribbon drawn from fine hatch lines (Optikka style).
 * It reacts to a 0..1 audio level and to who is talking.
 *
 *   const ring = new Ring(canvas);
 *   ring.setMode("client");  // idle | user | client | thinking | coach
 *   ring.setLevel(0.6);      // every frame, with the live level
 */

export type RingMode = "idle" | "user" | "client" | "thinking" | "coach";

interface ModeParams {
  warm: number;
  spin: number;
  wobble: number;
  swell: number;
}

// How much of the ribbon is orange, how fast it turns, how it moves.
const MODES: Record<RingMode, ModeParams> = {
  idle: { warm: 0.5, spin: 0.1, wobble: 0.15, swell: 0 },
  user: { warm: 0.88, spin: 0.22, wobble: 1, swell: 1 },
  client: { warm: 0.22, spin: 0.16, wobble: 0.8, swell: 0.75 },
  thinking: { warm: 0.42, spin: 0.55, wobble: 0.1, swell: 0 },
  coach: { warm: 1, spin: 0.2, wobble: 0.7, swell: 0.65 },
};

const ORANGE = [234, 106, 59];
const MIST = [186, 178, 168];

const lerp = (a: number, b: number, k: number) => a + (b - a) * k;
const smooth = (e0: number, e1: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - e0) / (e1 - e0)));
  return t * t * (3 - 2 * t);
};

export class Ring {
  private ctx: CanvasRenderingContext2D;
  private lines: number;
  private level = 0;
  private input = 0;
  private mode: RingMode = "idle";
  private cur: ModeParams = { ...MODES.idle };
  private t = 0;
  private phase = 0;
  private colorAngle = 0;
  private reduced: boolean;
  private last = performance.now();
  private raf = 0;
  private ro: ResizeObserver | null = null;
  private w = 1;
  private h = 1;

  constructor(
    private canvas: HTMLCanvasElement,
    opts: { lines?: number } = {},
  ) {
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Canvas 2D is not available");
    this.ctx = ctx;
    this.lines = opts.lines ?? 640;
    this.reduced = typeof matchMedia !== "undefined" && matchMedia("(prefers-reduced-motion: reduce)").matches;
    this.resize = this.resize.bind(this);
    this.frame = this.frame.bind(this);
    if (typeof ResizeObserver !== "undefined") {
      this.ro = new ResizeObserver(this.resize);
      this.ro.observe(canvas);
    } else {
      window.addEventListener("resize", this.resize);
    }
    this.resize();
    this.raf = requestAnimationFrame(this.frame);
  }

  setLevel(v: number) {
    this.input = Math.max(0, Math.min(1, v || 0));
  }

  setMode(m: RingMode) {
    if (MODES[m]) this.mode = m;
  }

  destroy() {
    cancelAnimationFrame(this.raf);
    this.ro?.disconnect();
    window.removeEventListener("resize", this.resize);
  }

  private resize() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const r = this.canvas.getBoundingClientRect();
    this.w = Math.max(1, r.width);
    this.h = Math.max(1, r.height);
    this.canvas.width = Math.round(this.w * dpr);
    this.canvas.height = Math.round(this.h * dpr);
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  private frame(now: number) {
    const dt = Math.min(0.05, (now - this.last) / 1000);
    this.last = now;
    this.t += dt;

    // Fast attack, slow release: jumps with speech, settles calmly.
    const k = this.input > this.level ? 1 - Math.exp(-dt * 22) : 1 - Math.exp(-dt * 5);
    this.level += (this.input - this.level) * k;

    // Ease mode parameters so state changes feel continuous.
    const target = MODES[this.mode];
    const mk = 1 - Math.exp(-dt * 3);
    (Object.keys(target) as Array<keyof ModeParams>).forEach((key) => {
      this.cur[key] += (target[key] - this.cur[key]) * mk;
    });

    const motion = this.reduced ? 0.25 : 1;
    this.phase += dt * (this.cur.spin + this.level * 0.6) * motion;
    this.colorAngle += dt * 0.12 * motion;

    this.draw(motion);
    this.raf = requestAnimationFrame(this.frame);
  }

  private draw(motion: number) {
    const { ctx, w, h, lines } = this;
    ctx.clearRect(0, 0, w, h);

    const lv = this.level;
    const c = this.cur;
    const cx = w / 2;
    const cy = h / 2;
    const R = Math.min(w, h) * 0.29 * (1 + lv * 0.07 * c.swell);
    const half = R * 0.33 * (1 + lv * 0.28 * c.swell);
    const tilt = 0.94;
    const t = this.t * motion;
    const thinking = this.mode === "thinking";

    ctx.lineWidth = 0.75;
    ctx.lineCap = "round";

    for (let i = 0; i < lines; i++) {
      const th = (i / lines) * Math.PI * 2;

      // A soft three-lobed loop, with travelling ripples that follow the voice.
      let shape = 1 + 0.07 * Math.cos(3 * (th - this.phase * 0.35));
      const wob = lv * c.wobble;
      shape += wob * 0.055 * Math.sin(5 * th + t * 5.2);
      shape += wob * 0.026 * Math.sin(11 * th - t * 8.3);
      shape += wob * 0.01 * Math.sin(17 * th + t * 12.1);

      // Two full twists around the loop keep the seam invisible.
      const phi = th * 2 + this.phase * 2.2;
      const cosP = Math.cos(phi);
      const sinP = Math.sin(phi);
      const r = R * shape;
      const ct = Math.cos(th);
      const st = Math.sin(th);
      const ax = cx + (r - half * cosP) * ct;
      const ay = cy + (r - half * cosP) * st * tilt + half * sinP * 0.38;
      const bx = cx + (r + half * cosP) * ct;
      const by = cy + (r + half * cosP) * st * tilt - half * sinP * 0.38;

      // Colour sweeps from mist grey to orange; the mode sets the orange share.
      const sweep = 0.5 + 0.5 * Math.cos(th - this.colorAngle);
      const edge = 1 - c.warm;
      let o = smooth(edge - 0.28, edge + 0.28, sweep);
      if (c.warm > 0.97) o = Math.max(o, 0.92);
      const col = [0, 1, 2].map((j) => Math.round(lerp(MIST[j], ORANGE[j], o)));

      // The face turned toward us reads brighter.
      let a = 0.28 + 0.55 * (0.5 + 0.5 * sinP);
      if (thinking) a *= 0.55 + 0.45 * (0.5 + 0.5 * Math.sin(th * 3 - this.t * 4));
      a = Math.min(1, a * (0.85 + lv * 0.3));

      ctx.strokeStyle = `rgba(${col[0]},${col[1]},${col[2]},${a.toFixed(3)})`;
      ctx.beginPath();
      ctx.moveTo(ax, ay);
      ctx.lineTo(bx, by);
      ctx.stroke();
    }
  }
}
