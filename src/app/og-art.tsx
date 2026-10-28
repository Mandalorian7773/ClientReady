import { ringMarkLines } from "@/lib/brand/ring-mark";

/**
 * Shared artwork for the Open Graph and Twitter preview images (1200x630),
 * in the Optikka style: paper, ink, one orange word, a hatched ring.
 */
export const OG_SIZE = { width: 1200, height: 630 };
export const OG_ALT = "ClientReady: practise the client call before the real one. Voice role-play on Gnani Prisma and Timbre.";

const PAPER = "#e8e1d6";
const INK = "#3a3026";
const INK_SOFT = "#655a4e";
const ACCENT = "#e5623a";
const MIST = "#b9b1a7";
const HEADLINE = "Practise the client call before the real one.";

/**
 * Loads Inter Tight (the site's typeface) from Google Fonts, subset to the
 * text used. Falls back to the renderer's default font if the fetch fails.
 */
async function interTight(weight: number, text: string): Promise<ArrayBuffer | null> {
  try {
    const css = await (await fetch(`https://fonts.googleapis.com/css2?family=Inter+Tight:wght@${weight}&text=${encodeURIComponent(text)}`)).text();
    const url = css.match(/src: url\((.+?)\) format\('(opentype|truetype)'\)/)?.[1];
    if (!url) return null;
    const res = await fetch(url);
    return res.ok ? await res.arrayBuffer() : null;
  } catch {
    return null;
  }
}

export async function ogFonts() {
  const text = `CLIENTREADY${HEADLINE}Voice role-play on Gnani Prisma + Timbre`;
  const [regular, medium] = await Promise.all([interTight(400, text), interTight(500, text)]);
  return [
    ...(regular ? [{ name: "Inter Tight", data: regular, weight: 400 as const, style: "normal" as const }] : []),
    ...(medium ? [{ name: "Inter Tight", data: medium, weight: 500 as const, style: "normal" as const }] : []),
  ];
}

/** The brand mark (src/lib/brand/ring-mark.ts) for the wordmark row. */
function OgMark() {
  return (
    <svg width="34" height="34" viewBox="0 0 64 64">
      {ringMarkLines(64).map((l, i) => (
        <line key={i} x1={l.x1} y1={l.y1} x2={l.x2} y2={l.y2} stroke={l.color} strokeOpacity={l.opacity} strokeWidth={2.6} strokeLinecap="round" />
      ))}
      <circle cx="32" cy="32" r="6" fill={ACCENT} />
    </svg>
  );
}

/** A hatched ribbon ring, echoing the voice ring on the call screen. */
function RingMotif() {
  const lines = 120;
  const cx = 190;
  const cy = 190;
  const parts = [];
  for (let i = 0; i < lines; i++) {
    const th = (i / lines) * Math.PI * 2;
    const r = 120 * (1 + 0.07 * Math.cos(3 * th));
    const half = 42 * Math.cos(th * 2);
    const sinP = Math.sin(th * 2);
    const x1 = cx + (r - half) * Math.cos(th);
    const y1 = cy + (r - half) * Math.sin(th) * 0.94 + 42 * sinP * 0.38;
    const x2 = cx + (r + half) * Math.cos(th);
    const y2 = cy + (r + half) * Math.sin(th) * 0.94 - 42 * sinP * 0.38;
    const warm = 0.5 + 0.5 * Math.cos(th - 0.8) > 0.45;
    parts.push(<line key={i} x1={x1} y1={y1} x2={x2} y2={y2} stroke={warm ? ACCENT : MIST} strokeWidth={1.3} strokeOpacity={0.45 + 0.45 * (0.5 + 0.5 * sinP)} />);
  }
  return (
    <svg width="380" height="380" viewBox="0 0 380 380">
      {parts}
    </svg>
  );
}

// The image renderer has no dotted borders, so rules are 1px strips with a repeating dot gradient.
const DOTS = "rgba(58, 48, 38, 0.35)";
const HRule = () => <div style={{ display: "flex", height: 1, width: "100%", backgroundImage: `linear-gradient(to right, ${DOTS} 50%, transparent 50%)`, backgroundSize: "3px 1px" }} />;
const VRule = () => <div style={{ display: "flex", width: 1, height: "100%", backgroundImage: `linear-gradient(to bottom, ${DOTS} 50%, transparent 50%)`, backgroundSize: "1px 3px" }} />;

export function OgArt() {
  return (
    <div style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column", background: PAPER, color: INK, fontFamily: "Inter Tight" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 14, padding: "36px 56px" }}>
        <OgMark />
        <div style={{ fontSize: 22, fontWeight: 500, letterSpacing: "0.22em" }}>CLIENTREADY</div>
      </div>
      <HRule />
      <div style={{ display: "flex", flex: 1 }}>
        <div style={{ display: "flex", flexDirection: "column", justifyContent: "space-between", width: 760, padding: "40px 56px 40px" }}>
          {/* One span per word, so the renderer wraps between words like a browser would. */}
          <div style={{ display: "flex", flexWrap: "wrap", columnGap: 22, fontSize: 84, fontWeight: 500, letterSpacing: "-0.045em", lineHeight: 0.98 }}>
            {HEADLINE.split(" ").map((w, i) => (
              <span key={i} style={w === "before" ? { color: ACCENT } : undefined}>
                {w}
              </span>
            ))}
          </div>
          <div style={{ fontSize: 22, fontWeight: 500, letterSpacing: "0.04em", textTransform: "uppercase", color: INK_SOFT }}>Voice role-play on Gnani Prisma + Timbre</div>
        </div>
        <VRule />
        <div style={{ display: "flex", flex: 1, alignItems: "center", justifyContent: "center" }}>
          <RingMotif />
        </div>
      </div>
    </div>
  );
}
