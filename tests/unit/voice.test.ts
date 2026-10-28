import { describe, expect, it, vi } from "vitest";
import { BargeInDetector, FRAME_MS, FRAME_SAMPLES, frameRms, UtteranceSegmenter, type SegmenterEvent } from "@/lib/voice/segmenter";
import { VoiceMetricsSchema, VoiceTracker } from "@/lib/voice/delivery";
import { base64ToBytes, SseParser } from "@/lib/voice/sse";
import { encodeWavFromInt16, parseWav } from "@/lib/audio/wav";
import { GnaniTimbreTTS } from "@/lib/providers/gnani/timbre";
import { debriefVoice, isKnownVoice } from "@/lib/providers/gnani/voices";
import { buildSampleReport, SAMPLE_TURNS } from "@/lib/sample/sample-call";
import { DEBRIEF_OPENING } from "@/lib/coach/report";

const frame = (amp: number) => {
  const f = new Int16Array(FRAME_SAMPLES);
  for (let i = 0; i < f.length; i++) f[i] = Math.round(amp * 32767 * Math.sin((2 * Math.PI * 200 * i) / 16000));
  return f;
};
const ms = (n: number) => Math.round(n / FRAME_MS);

function feed(seg: UtteranceSegmenter, amp: number, durationMs: number): SegmenterEvent[] {
  const out: SegmenterEvent[] = [];
  for (let i = 0; i < ms(durationMs); i++) out.push(...seg.push(frame(amp)));
  return out;
}

describe("UtteranceSegmenter (hands-free turn ends)", () => {
  it("measures frame loudness", () => {
    expect(frameRms(frame(0))).toBe(0);
    expect(frameRms(frame(0.5))).toBeCloseTo(0.354, 2);
  });

  it("emits one segment after speech followed by 1.1 s of silence, with pre-roll", () => {
    const seg = new UtteranceSegmenter();
    feed(seg, 0.001, 500); // room tone, fills the pre-roll
    const start = feed(seg, 0.2, 2000);
    expect(start.filter((e) => e.type === "speech-start")).toHaveLength(1);
    expect(feed(seg, 0.001, 1000).some((e) => e.type === "segment")).toBe(false); // a thinking pause is not the end
    const ev = feed(seg, 0.001, 200).find((e) => e.type === "segment");
    expect(ev?.type).toBe("segment");
    if (ev?.type !== "segment") return;
    expect(ev.segment.speechMs).toBeGreaterThan(1900);
    expect(ev.segment.durationMs).toBeGreaterThan(2000 + 1100); // includes pre-roll and the closing pause
    expect(ev.segment.forced).toBe(false);
    expect(seg.inSegment).toBe(false);
  });

  it("keeps one segment across a pause shorter than the silence window", () => {
    const seg = new UtteranceSegmenter();
    const events = [...feed(seg, 0.2, 1000), ...feed(seg, 0.001, 700), ...feed(seg, 0.2, 1000), ...feed(seg, 0.001, 1200)];
    expect(events.filter((e) => e.type === "segment")).toHaveLength(1);
  });

  it("drops clicks and coughs shorter than the minimum", () => {
    const seg = new UtteranceSegmenter();
    const events = [...feed(seg, 0.3, 130), ...feed(seg, 0.001, 1300)];
    expect(events.some((e) => e.type === "segment")).toBe(false);
    expect(events.some((e) => e.type === "discarded")).toBe(true);
  });

  it("cuts very long answers into parts so each fits Prisma REST", () => {
    const seg = new UtteranceSegmenter({ maxSegmentMs: 3000 });
    const events = feed(seg, 0.2, 7000);
    const parts = events.filter((e) => e.type === "segment");
    expect(parts.length).toBe(2);
    expect(parts.every((e) => e.type === "segment" && e.segment.forced)).toBe(true);
  });

  it("adapts the noise floor so a noisy room isn't treated as speech", () => {
    const seg = new UtteranceSegmenter();
    for (let i = 0; i < 400; i++) seg.observe(frame(0.006));
    expect(seg.floor).toBeGreaterThan(0.004);
    expect(feed(seg, 0.008, 1000).some((e) => e.type === "speech-start")).toBe(false);
  });

  it("flushes an open segment when the call ends mid-sentence", () => {
    const seg = new UtteranceSegmenter();
    feed(seg, 0.2, 800);
    expect(seg.flush()?.type).toBe("segment");
    expect(seg.flush()).toBeNull();
  });

  it("encodes segments as 16 kHz WAV Prisma accepts", () => {
    const wav = encodeWavFromInt16(frame(0.2), 16000);
    expect(parseWav(wav)).toMatchObject({ sampleRate: 16000, channels: 1, bitsPerSample: 16 });
  });
});

describe("BargeInDetector", () => {
  it("fires after 350 ms clearly above the floor, not on a short blip", () => {
    const b = new BargeInDetector();
    const fired = (n: number, rms: number) => Array.from({ length: n }, () => b.push(rms, 0.01)).some(Boolean);
    expect(fired(ms(200), 0.2)).toBe(false);
    b.reset();
    expect(fired(ms(400), 0.2)).toBe(true);
    expect(fired(ms(1000), 0.03)).toBe(false); // the client's voice leaking at low level
  });
});

describe("VoiceTracker", () => {
  it("measures answer delay, mid-answer pauses and talk-time share", () => {
    const t = new VoiceTracker();
    t.client(4000);
    t.clientFinished(1000);
    let now = 1000;
    const step = (speaking: boolean, dur: number) => {
      for (let i = 0; i < ms(dur); i++) {
        now += FRAME_MS;
        t.user(now, speaking ? 0.1 : 0.001, speaking);
      }
    };
    step(false, 1500); // thinks for 1.5 s
    step(true, 2000);
    step(false, 900); // pause mid-answer
    step(true, 1000);
    const s = t.summary();
    expect(s.medianAnswerDelayMs).toBeGreaterThan(1400);
    expect(s.medianAnswerDelayMs).toBeLessThan(1700);
    expect(s.midAnswerPauses).toBe(1);
    expect(s.longestPauseMs).toBeGreaterThan(800);
    expect(s.talkTimeSharePct).toBeGreaterThan(35);
    expect(VoiceMetricsSchema.safeParse(s).success).toBe(true);
  });

  it("returns nulls rather than invented numbers when nothing was measured", () => {
    const s = new VoiceTracker().summary();
    expect(s.medianAnswerDelayMs).toBeNull();
    expect(s.loudnessVariation).toBeNull();
    expect(s.talkTimeSharePct).toBeNull();
  });
});

describe("SSE parsing (Timbre stream)", () => {
  it("parses events split across network chunks", () => {
    const p = new SseParser();
    const audio = btoa(String.fromCharCode(1, 2, 3, 4));
    const out = [
      ...p.push('event: start\ndata: {"status":"streaming_started"}\n\nevent: chu'),
      ...p.push(`nk\ndata: {"chunk_index":1,"audio":"${audio}","is_final":false}\r\n\r\n`),
      ...p.push('event: complete\ndata: {"audio":"","is_final":true}\n\nevent: chunk\ndata: {bad json}\n\n'),
    ];
    expect(out.map((e) => e.event)).toEqual(["start", "chunk", "complete"]);
    expect(Array.from(base64ToBytes((out[1].data as { audio: string }).audio))).toEqual([1, 2, 3, 4]);
  });
});

describe("Timbre streaming", () => {
  it("requests raw 16-bit PCM over SSE and passes the body through", async () => {
    const fetchImpl = vi.fn(async () => new Response('event: complete\ndata: {"audio":""}\n\n', { status: 200, headers: { "Content-Type": "text/event-stream" } }));
    const tts = new GnaniTimbreTTS({ apiKey: "k", baseUrl: "https://api.vachana.ai", model: "timbre-v2.5", timeoutMs: 1000, fetchImpl: fetchImpl as unknown as typeof fetch });
    const { body, sampleRate } = await tts.stream({ text: "Hello there", voice: "Kaveri", language: "en-IN" });
    expect(sampleRate).toBe(24000);
    expect(await new Response(body).text()).toContain("complete");
    const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://api.vachana.ai/api/v1/tts/sse");
    expect(JSON.parse(String(init.body)).audio_config).toEqual({ sample_rate: 24000, num_channels: 1, sample_width: 2, encoding: "linear_pcm", container: "raw" });
  });

  it("maps upstream errors before streaming starts", async () => {
    const tts = new GnaniTimbreTTS({ apiKey: "k", baseUrl: "https://x", model: "timbre-v2.5", timeoutMs: 1000, fetchImpl: (async () => new Response("{}", { status: 403 })) as unknown as typeof fetch });
    await expect(tts.stream({ text: "Hi", voice: "Kaveri", language: "en-IN" })).rejects.toMatchObject({ code: "credits_exhausted" });
  });

  it("picks catalog voices for the debrief coach in each language", () => {
    expect(debriefVoice("timbre-v2.5", "en-IN")).toBe("Trupti");
    expect(debriefVoice("timbre-v2.5", "en-IN", "Devika")).toBe("Devika");
    expect(debriefVoice("timbre-v2.5", "en-IN", "NotAVoice")).toBe("Trupti");
    expect(isKnownVoice("timbre-v2.5", debriefVoice("timbre-v2.5", "hi-IN"))).toBe(true);
    expect(isKnownVoice("timbre-v3.0", debriefVoice("timbre-v3.0", "en-IN"))).toBe(true);
  });
});

describe("sample call", () => {
  it("builds a report whose every quote and spoken segment verifies against the script", () => {
    const r = buildSampleReport(0);
    expect(r.droppedQuotes).toBe(0);
    expect(r.issues.every((i) => i.quote !== null)).toBe(true);
    expect(r.spoken[0].text).toBe(DEBRIEF_OPENING);
    expect(r.spoken.map((s) => s.label)).toEqual(["Call ended", "Discovery", "Price", "Proposal", "Delivery", "Report"]);
    expect(r.isDemo).toBe(true);
    expect(r.generatedBy).toMatch(/not Gnani/);
    expect(SAMPLE_TURNS.filter((t) => t.role === "client")).toHaveLength(4);
  });
});
