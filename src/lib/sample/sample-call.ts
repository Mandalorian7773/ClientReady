import { finalizeReport, type CoachReport, type CoachReportWire } from "@/lib/coach/report";
import { getPreset } from "@/lib/scenario/presets";
import type { Scenario } from "@/lib/scenario/schema";
import type { ClientState, Turn } from "@/lib/sim/types";
import type { VoiceMetrics } from "@/lib/voice/delivery";

/**
 * A scripted sample call: both sides are hand-written and voiced by the
 * browser's speech synthesis, and the report is a fixed example. Every screen
 * labels it as a sample. It is not output from Gnani or any model.
 */

export const SAMPLE_LABEL = "Scripted sample (browser voice, not Gnani)";

export const SAMPLE_SCENARIO: Scenario = getPreset("ai-receptionist-clinic")!.scenario;

export const SAMPLE_SCRIPT: Array<{ role: "client" | "learner"; text: string; seconds?: number }> = [
  { role: "client", text: "Hi, thanks for getting on the call. We miss a lot of calls after five, and honestly I'm not sure an AI receptionist is the answer. What would this actually do for us?" },
  { role: "learner", text: "So basically we build a voice agent with calendar integration and a dashboard. It uses a large language model and it is very advanced.", seconds: 9 },
  { role: "client", text: "Okay, but I asked what it does for my clinic. And what does it cost?" },
  { role: "learner", text: "Um, the total is around two thousand dollars. I think it's a good price, actually.", seconds: 6 },
  { role: "client", text: "That's a lot for a phone system. My cousin uses a ninety-nine dollar a month answering service. Why would I pay more?" },
  { role: "learner", text: "Accept my proposal at this price or leave it. This is already the lowest I can do.", seconds: 5 },
  { role: "client", text: "Then I think I'll leave it. Send me something in writing and I'll take a look. Thanks for your time." },
];

export const SAMPLE_TURNS: Turn[] = SAMPLE_SCRIPT.map((l, index) => ({
  index,
  role: l.role,
  text: l.text,
  source: l.role === "client" ? "model" : "prisma",
  audioSeconds: l.seconds,
}));

export const SAMPLE_STATE: ClientState = {
  interest: 22,
  phase: "ended",
  raisedConcernIds: ["roi", "price", "alternatives"],
  ended: true,
  outcome: "not-interested",
  notes: [],
};

/** Illustrative figures, labelled as such on the report. */
export const SAMPLE_VOICE: VoiceMetrics = {
  speakingSeconds: 20,
  clientSeconds: 34,
  talkTimeSharePct: 37,
  medianAnswerDelayMs: 1900,
  midAnswerPauses: 2,
  longestPauseMs: 2100,
  loudnessVariation: 0.62,
};

const WIRE: CoachReportWire = {
  summary: "You knew the product well but pitched features, named the price before any value, then closed with an ultimatum.",
  categories: [
    { id: "discovery", observed: true, score: 20, rationale: "You never asked about her missed calls before explaining the product.", evidence: [{ turn: 1, quote: "we build a voice agent with calendar integration and a dashboard" }] },
    { id: "value", observed: true, score: 30, rationale: "Features and technology, but no outcome for her clinic.", evidence: [{ turn: 1, quote: "It uses a large language model and it is very advanced" }] },
    { id: "clarity", observed: true, score: 60, rationale: "Short, understandable answers.", evidence: [] },
    { id: "offer", observed: true, score: 35, rationale: "A clear number, but no scope or what's included.", evidence: [{ turn: 3, quote: "the total is around two thousand dollars" }] },
    { id: "technical", observed: false, score: 0, rationale: "", evidence: [] },
    { id: "objections", observed: true, score: 15, rationale: "The answering-service comparison was met with an ultimatum.", evidence: [{ turn: 5, quote: "Accept my proposal at this price or leave it" }] },
    { id: "negotiation", observed: true, score: 15, rationale: "No options and no trade; the conversation became yes or no.", evidence: [{ turn: 5, quote: "This is already the lowest I can do" }] },
    { id: "closing", observed: true, score: 10, rationale: "The call ended with the client declining.", evidence: [] },
    { id: "delivery", observed: true, score: 0, rationale: "A comfortable pace and short answers, but three fillers and a hedge right around the price.", evidence: [] },
  ],
  strengths: [{ turn: 3, quote: "the total is around two thousand dollars", why: "You gave a real number when she asked instead of dodging. Keep that, just after the value." }],
  issues: [
    {
      title: "Ask before you explain",
      category: "discovery",
      turn: 1,
      quote: "So basically we build a voice agent with calendar integration and a dashboard.",
      whatWasMissing: "A question about her missed calls before describing the product.",
      whyItMattered: "A busy clinic owner buys fewer missed patients, not a dashboard. Without her numbers you had nothing to tie the price to later.",
      betterResponse: "Before I explain it, how many calls would you say you miss after five on a normal week? And roughly what is a new patient worth to you?",
      whyBetterWorks: "Her answer gives you the number that justifies your price.",
      principleId: "spin",
      exercise: "Open your next three practice calls with two questions before any description.",
    },
    {
      title: "Value before price, no hedge",
      category: "offer",
      turn: 3,
      quote: "I think it's a good price, actually.",
      whatWasMissing: "The outcome before the number, and a confident close on the number.",
      whyItMattered: "A hedge invites a discount. It tells her you are not sure the price is fair either.",
      betterResponse: "If it books even two of those missed patients a month, it pays for itself in the first quarter. The full setup is two thousand dollars.",
      whyBetterWorks: "Outcome first, number second, then silence.",
      principleId: "value-pricing",
      exercise: "Say your price line three times: outcome, number, stop.",
    },
    {
      title: "Options, not ultimatums",
      category: "negotiation",
      turn: 5,
      quote: "Accept my proposal at this price or leave it.",
      whatWasMissing: "An answer to her comparison and a smaller first step.",
      whyItMattered: "An ultimatum turns a negotiation into yes or no, and a sceptical buyer picks no.",
      betterResponse: "Fair question. An answering service takes messages; this books the appointment. Let's start smaller: a two-week pilot on after-hours calls, and you only move to the full setup if it books patients.",
      whyBetterWorks: "Acknowledges the comparison, shows the difference, and lowers the risk of saying yes.",
      principleId: "trade-dont-cave",
      exercise: "Prepare a pilot option for every offer you sell.",
    },
  ],
  plan: [
    { title: "Discovery first", why: "You pitched before you knew her numbers.", exercise: "Two questions before any description.", successMetric: "The client states a number before you name a price." },
    { title: "Price with value", why: "The price came with a hedge and no outcome.", exercise: "Outcome, number, silence.", successMetric: "No hedge within one sentence of your price." },
    { title: "Offer two options", why: "A single take-it-or-leave-it offer ended the call.", exercise: "Pilot vs full scope, price for each.", successMetric: "The call ends with an agreed next step." },
  ],
  languageBridge: [],
  deliveryNotes: [
    "Three fillers (\"so basically\", \"um\", \"actually\") in three answers.",
    "One hedge (\"I think\") right next to your price.",
    "About two seconds of silence before you named the price.",
  ],
  proposalSteps: [
    "Restate her problem in her words: missed after-hours calls and lost new patients.",
    "Offer two options, not one: a small pilot and the full setup.",
    "Give scope, timeline and price for each, in one breath each.",
    "Name the low-risk next step and ask which option fits better.",
    "Stop talking and let her answer.",
  ],
  nextDrill: "Practise the price question three times: outcome first, number second, then silence.",
  spoken: [
    { label: "Discovery", refType: "issue", refIndex: 0, text: "In this part you said, 'So basically we build a voice agent with calendar integration and a dashboard.' She asked what it would do for her clinic, and you answered with features. Here's how to open properly: ask one question first, like, how many calls do you miss after five on a normal week? Then tie everything to that number." },
    { label: "Price", refType: "issue", refIndex: 1, text: "In this part you said, 'I think it's a good price, actually.' You named the price before any value, then hedged it. Here's how to state a price: give the outcome first, then the number, then stop talking." },
    { label: "Proposal", refType: "issue", refIndex: 2, text: "In this part you said, 'Accept my proposal at this price or leave it.' An ultimatum ends the conversation, and here it did. Here's how to put up a proposal: restate her problem, offer two options, such as a two-week pilot or the full setup, give the price for each, and ask which one fits better." },
    { label: "Delivery", refType: "none", refIndex: -1, text: "Your tone could have sounded more confident. You used fillers like 'basically' and 'um', a hedge, 'I think', right next to your price, and you paused about two seconds before it. Next time, say the number in one breath and let the silence sit." },
    { label: "Report", refType: "none", refIndex: -1, text: "Your written report is on screen now. Practise the price question once more before your next real call." },
  ],
};

export function buildSampleReport(now = Date.now()): CoachReport {
  return finalizeReport(WIRE, SAMPLE_TURNS.slice(0, -1), SAMPLE_STATE, {
    generatedBy: SAMPLE_LABEL,
    isDemo: true,
    voice: SAMPLE_VOICE,
    now,
  });
}
