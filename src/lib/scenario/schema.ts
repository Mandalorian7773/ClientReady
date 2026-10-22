import { z } from "zod";
import { LANGUAGE_IDS } from "@/lib/languages";

/**
 * Scenario configuration. Every field is bounded so a scenario can never blow
 * up prompt size, and every field has a default so learners never have to fill
 * the whole form.
 */

const short = (max = 120) => z.string().trim().max(max);
const long = (max = 600) => z.string().trim().max(max);

export const COUNTRIES = ["US", "UK", "Canada", "Australia", "UAE", "Germany", "Singapore", "Other"] as const;
export const EXPERIENCE = ["new", "some", "experienced"] as const;
export const COMPANY_SIZES = ["solo", "small", "mid", "large"] as const;
export const URGENCY = ["low", "medium", "high"] as const;
export const TECH_FAMILIARITY = ["none", "basic", "expert"] as const;
export const DIFFICULTY = ["beginner", "intermediate", "advanced", "expert"] as const;
export const FRIENDLINESS = ["friendly", "neutral", "sceptical", "demanding"] as const;
export const FOCUS = ["discovery", "pitch", "technical", "pricing", "negotiation", "closing"] as const;
export const OPENING = ["client-explains", "pitch-now"] as const;
export const NEGOTIATION_STYLE = ["collaborative", "analytical", "bargain-hunter", "risk-averse", "decisive"] as const;
export const CURRENCIES = ["USD", "GBP", "EUR", "CAD", "AUD", "AED", "SGD", "INR"] as const;
export const VOICE_GENDER = ["female", "male"] as const;

export const LearnerSchema = z.object({
  profession: short().default("Freelance developer"),
  experience: z.enum(EXPERIENCE).default("some"),
  speechLanguage: z.enum(LANGUAGE_IDS).default("en"),
  coachingLanguage: z.enum(LANGUAGE_IDS).default("en"),
  strengths: long(300).default(""),
  difficulties: long(300).default(""),
  goals: long(300).default(""),
});

export const OfferSchema = z.object({
  name: short().default("AI Receptionist"),
  description: long().default(""),
  outcome: long(300).default(""),
  idealCustomer: short(200).default(""),
  deliverables: long().default(""),
  price: z.coerce.number().min(0).max(10_000_000).default(2000),
  currency: z.enum(CURRENCIES).default("USD"),
  pricingModel: short(80).default("fixed project fee"),
  duration: short(80).default("4 weeks"),
  assumptions: long(400).default(""),
  existingPitch: long(800).default(""),
});

export const ClientSchema = z.object({
  name: short(60).default("Dr. Sarah Mitchell"),
  country: z.enum(COUNTRIES).default("US"),
  industry: short().default("Healthcare"),
  businessType: short().default("Family dental clinic"),
  role: short().default("Clinic owner"),
  companySize: z.enum(COMPANY_SIZES).default("small"),
  budget: short(200).default("Has not decided; price-sensitive"),
  urgency: z.enum(URGENCY).default("medium"),
  techFamiliarity: z.enum(TECH_FAMILIARITY).default("basic"),
  personality: short(200).default("Busy, practical, polite but direct"),
  negotiationStyle: z.enum(NEGOTIATION_STYLE).default("analytical"),
  communication: short(200).default("Prefers short, concrete answers"),
  voiceGender: z.enum(VOICE_GENDER).default("female"),
  problem: long(500).default(""),
});

export const SettingsSchema = z.object({
  difficulty: z.enum(DIFFICULTY).default("intermediate"),
  friendliness: z.enum(FRIENDLINESS).default("neutral"),
  focus: z.enum(FOCUS).default("pitch"),
  maxTurns: z.coerce.number().int().min(4).max(20).default(10),
  opening: z.enum(OPENING).default("client-explains"),
});

export const ScenarioSchema = z.object({
  id: short(64).default("custom"),
  title: short(120).default("Custom scenario"),
  learner: LearnerSchema.default(() => LearnerSchema.parse({})),
  offer: OfferSchema.default(() => OfferSchema.parse({})),
  client: ClientSchema.default(() => ClientSchema.parse({})),
  settings: SettingsSchema.default(() => SettingsSchema.parse({})),
});

export type Scenario = z.infer<typeof ScenarioSchema>;
export type ScenarioInput = z.input<typeof ScenarioSchema>;
export type Learner = Scenario["learner"];
export type Offer = Scenario["offer"];
export type ClientProfile = Scenario["client"];
export type SimSettings = Scenario["settings"];

/** Parse untrusted input into a complete, bounded scenario. */
export function parseScenario(input: unknown): Scenario {
  return ScenarioSchema.parse(input ?? {});
}

export function safeParseScenario(input: unknown) {
  return ScenarioSchema.safeParse(input ?? {});
}

export const LABELS = {
  experience: { new: "New to freelancing", some: "1–3 years", experienced: "3+ years" },
  companySize: { solo: "Solo / 1–5", small: "Small (5–50)", mid: "Mid-size (50–500)", large: "Large (500+)" },
  urgency: { low: "Nice to have", medium: "Wants it this quarter", high: "Urgent pain" },
  techFamiliarity: { none: "Non-technical", basic: "Some familiarity", expert: "Technical expert" },
  difficulty: { beginner: "Beginner", intermediate: "Intermediate", advanced: "Advanced", expert: "Expert" },
  friendliness: { friendly: "Friendly", neutral: "Neutral", sceptical: "Sceptical", demanding: "Demanding" },
  focus: {
    discovery: "Discovery",
    pitch: "Pitch",
    technical: "Technical questioning",
    pricing: "Pricing",
    negotiation: "Negotiation",
    closing: "Closing",
  },
  opening: { "client-explains": "Client explains their problem first", "pitch-now": "Client asks you to pitch immediately" },
  negotiationStyle: {
    collaborative: "Collaborative",
    analytical: "Analytical (wants numbers)",
    "bargain-hunter": "Bargain hunter",
    "risk-averse": "Risk-averse",
    decisive: "Decisive",
  },
} as const;
