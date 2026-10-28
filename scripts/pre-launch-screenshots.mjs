// Pre-launch screenshots and layout checks. Needs two prod servers: 3100 (normal) and 3101 (LIVE_MODE=off). Run: node scripts/pre-launch-screenshots.mjs
import { chromium } from "playwright";
import { mkdirSync } from "node:fs";

const BASE = "http://localhost:3100";
const OFF = "http://localhost:3101";
const OUT = "tmp/screenshots";
mkdirSync(OUT, { recursive: true });
const results = [];
const check = (name, ok, detail = "") => results.push(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? `  (${detail})` : ""}`);

const browser = await chromium.launch();

async function page(viewport, opts = {}) {
  const ctx = await browser.newContext({ viewport, deviceScaleFactor: 1, ...opts });
  // A saved scenario, as if the user came through the builder.
  await ctx.addInitScript(() => {
    try {
      if (!localStorage.getItem("clientready.draft.v1")) localStorage.setItem("clientready.draft.v1", "__preset__");
    } catch {}
  });
  return ctx.newPage();
}

async function setDraft(p) {
  await p.goto(`${BASE}/practice?preset=ai-receptionist-clinic`);
  await p.getByRole("button", { name: "Continue to briefing" }).click();
  await p.waitForURL("**/practice/briefing");
}

// ---------- landing ----------
for (const [w, h, name] of [[1440, 900, "landing-1440x900"], [390, 844, "landing-390x844"]]) {
  const p = await page({ width: w, height: h }, w < 500 ? { isMobile: true, hasTouch: true } : {});
  await p.goto(BASE);
  await p.waitForTimeout(1500);
  await p.screenshot({ path: `${OUT}/${name}.png` });
  if (w < 500) {
    const m = await p.evaluate(() => {
      const h1 = document.querySelector("h1").getBoundingClientRect();
      const small = [...document.querySelectorAll("a, button")]
        .filter((el) => el.offsetParent && el.getBoundingClientRect().width > 1)
        .map((el) => ({ t: (el.textContent || el.getAttribute("aria-label") || "").trim().slice(0, 30), h: Math.round(el.getBoundingClientRect().height), y: Math.round(el.getBoundingClientRect().top + scrollY) }))
        .filter((b) => b.h < 44 && b.y < 1400);
      return { scrollW: document.documentElement.scrollWidth, h1Right: Math.round(h1.right), small };
    });
    check("390px: no horizontal scroll", m.scrollW <= 390, `scrollWidth ${m.scrollW}`);
    check("390px: hero headline fits", m.h1Right <= 390 - 16, `right edge ${m.h1Right}`);
    check("390px: buttons/links above the fold ≥ 44px", m.small.length === 0, m.small.map((s) => `${s.t}:${s.h}px`).join(", ") || "all ≥ 44px");
  }
  await p.context().close();
}

// ---------- session ready + call/debrief layout ----------
for (const [w, h] of [[1440, 800], [1280, 720]]) {
  const p = await page({ width: w, height: h });
  await setDraft(p);
  await p.goto(`${BASE}/practice/session`);
  const start = p.getByRole("button", { name: "Start the call" });
  await start.waitFor();
  await p.waitForTimeout(800);
  await p.screenshot({ path: `${OUT}/session-ready-${w}x${h}.png` });
  const m = await p.evaluate(() => {
    const btn = [...document.querySelectorAll("button")].find((b) => b.textContent.trim() === "Start the call").getBoundingClientRect();
    const top = [...document.querySelectorAll("main > div")].slice(0, 3);
    const firstLines = top.map((cell) => {
      const el = cell.querySelector("a span span:last-child, span.label");
      const r = el.getBoundingClientRect();
      return Math.round(r.bottom);
    });
    const labels = [...document.querySelectorAll("main .grid > span.label")].map((s) => ({ t: s.textContent, lines: Math.round(s.getBoundingClientRect().height / 14) }));
    const h1 = document.querySelector("h1");
    return { btnBottom: Math.round(btn.bottom), vh: innerHeight, firstLines, labels, h1: h1.innerText, h1Lines: Math.round(h1.getBoundingClientRect().height / parseFloat(getComputedStyle(h1).fontSize) / 0.95) };
  });
  check(`${w}x${h}: "Start the call" visible without scrolling`, m.btnBottom <= m.vh, `button bottom ${m.btnBottom}px of ${m.vh}px`);
  const spread = Math.max(...m.firstLines) - Math.min(...m.firstLines);
  check(`${w}x${h}: top-row labels share a baseline`, spread <= 1, `bottoms ${m.firstLines.join("/")}`);
  const wrapped = m.labels.filter((l) => l.lines > 1);
  check(`${w}x${h}: no label/value label wraps`, wrapped.length === 0, wrapped.map((l) => l.t).join(", ") || m.labels.map((l) => l.t).join(", "));
  check(`${w}x${h}: name keeps title with surname`, /Dr\. Mitchell/.test(m.h1), JSON.stringify(m.h1));
  await p.context().close();
}

// ---------- sample call: during call, debrief, report ----------
{
  const p = await page({ width: 1440, height: 900 });
  await p.goto(`${BASE}/practice/session?sample`);
  await p.getByRole("button", { name: "Play the sample call" }).click();
  await p.waitForTimeout(5000);
  await p.screenshot({ path: `${OUT}/sample-call-1440x900.png` });
  const callFits = await p.evaluate(() => {
    const b = [...document.querySelectorAll("button")].find((x) => x.textContent.trim() === "End call").getBoundingClientRect();
    return { bottom: Math.round(b.bottom), vh: innerHeight };
  });
  check("1440x900 call: End call visible", callFits.bottom <= callFits.vh, `${callFits.bottom}/${callFits.vh}`);
  await p.getByRole("button", { name: "End call" }).click();
  await p.getByRole("button", { name: "Skip to report" }).waitFor();
  await p.waitForTimeout(2500);
  await p.screenshot({ path: `${OUT}/sample-debrief-1440x900.png` });
  await p.getByRole("button", { name: "Skip to report" }).click();
  await p.waitForURL("**/report/**");
  await p.waitForTimeout(1200);
  await p.screenshot({ path: `${OUT}/sample-report-1440x900.png` });
  await p.screenshot({ path: `${OUT}/sample-report-full.png`, fullPage: true });
  check("report tab title", (await p.title()) === "Report · ClientReady", await p.title());
  for (const [w, h] of [[1440, 800], [1280, 720]]) {
    await p.setViewportSize({ width: w, height: h });
    await p.waitForTimeout(300);
    await p.screenshot({ path: `${OUT}/sample-report-${w}x${h}.png` });
  }
  await p.context().close();
}

// ---------- debrief/call at the smaller sizes ----------
for (const [w, h] of [[1440, 800], [1280, 720]]) {
  const p = await page({ width: w, height: h });
  await p.goto(`${BASE}/practice/session?sample`);
  await p.getByRole("button", { name: "Play the sample call" }).click();
  await p.waitForTimeout(3000);
  const m = await p.evaluate(() => {
    const b = [...document.querySelectorAll("button")].find((x) => x.textContent.trim() === "End call").getBoundingClientRect();
    return { bottom: Math.round(b.bottom), scrollH: document.documentElement.scrollHeight, vh: innerHeight };
  });
  check(`${w}x${h} call: End call visible`, m.bottom <= m.vh, `${m.bottom}/${m.vh}, page ${m.scrollH}px`);
  await p.screenshot({ path: `${OUT}/sample-call-${w}x${h}.png` });
  await p.getByRole("button", { name: "End call" }).click();
  await p.getByRole("button", { name: "Skip to report" }).waitFor();
  await p.waitForTimeout(2000);
  const d = await p.evaluate(() => {
    const b = [...document.querySelectorAll("button")].find((x) => x.textContent.trim() === "Skip to report").getBoundingClientRect();
    return { bottom: Math.round(b.bottom), vh: innerHeight };
  });
  check(`${w}x${h} debrief: Skip to report visible`, d.bottom <= d.vh, `${d.bottom}/${d.vh}`);
  await p.screenshot({ path: `${OUT}/sample-debrief-${w}x${h}.png` });
  await p.context().close();
}

// ---------- blocked (LIVE_MODE=off) ----------
{
  const p = await page({ width: 1440, height: 800 });
  await p.goto(`${OFF}/practice?preset=ai-receptionist-clinic`);
  await p.getByRole("button", { name: "Continue to briefing" }).click();
  await p.waitForURL("**/practice/briefing");
  await p.goto(`${OFF}/practice/session`);
  await p.getByText("Live calls are paused for today").waitFor();
  await p.waitForTimeout(600);
  await p.screenshot({ path: `${OUT}/session-blocked-1440x800.png` });
  const hasStart = await p.getByRole("button", { name: "Start the call" }).count();
  const sample = await p.getByRole("link", { name: "Hear the sample call" }).getAttribute("href");
  check("blocked: Start the call hidden", hasStart === 0);
  check("blocked: links to the sample call", sample === "/practice/session?sample", sample);
  await p.context().close();
}

// ---------- OG image + titles ----------
{
  const p = await page({ width: 1200, height: 630 });
  await p.goto(`${BASE}/opengraph-image`);
  await p.screenshot({ path: `${OUT}/opengraph-image.png` });
  const titles = {};
  for (const path of ["/", "/practice", "/practice/briefing", "/practice/session", "/history"]) {
    await p.goto(`${BASE}${path}`);
    titles[path] = await p.title();
  }
  const want = {
    "/": "ClientReady: practise client calls before the real one",
    "/practice": "Build your scenario · ClientReady",
    "/practice/briefing": "Briefing · ClientReady",
    "/practice/session": "Call · ClientReady",
    "/history": "History · ClientReady",
  };
  for (const [k, v] of Object.entries(want)) check(`title ${k}`, titles[k] === v, titles[k]);
  await p.context().close();
}

await browser.close();
console.log(results.join("\n"));
