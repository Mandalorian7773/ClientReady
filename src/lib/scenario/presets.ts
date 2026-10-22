import { parseScenario, type Scenario, type ScenarioInput } from "./schema";

/**
 * Ready-to-run practice scenarios. All businesses and people are fictional.
 */
export interface Preset {
  id: string;
  title: string;
  tagline: string;
  emoji: string;
  scenario: Scenario;
}

const raw: Array<Omit<Preset, "scenario"> & { scenario: ScenarioInput }> = [
  {
    id: "ai-receptionist-clinic",
    title: "AI receptionist for a US dental clinic",
    tagline: "Sell a voice AI that answers after-hours calls and books appointments.",
    emoji: "🦷",
    scenario: {
      learner: { profession: "AI automation freelancer", experience: "some" },
      offer: {
        name: "AI Receptionist",
        description:
          "A voice AI agent that answers the clinic's phone 24/7, books and reschedules appointments in their practice management system, answers FAQs (hours, insurance, location) and hands off emergencies to on-call staff.",
        outcome: "Stop losing new-patient calls after hours and reduce front-desk phone load.",
        idealCustomer: "Independent dental and medical clinics in the US with 1–5 locations",
        deliverables:
          "Call flow design, voice agent setup, calendar integration, FAQ knowledge base, 2 weeks of tuning, staff handover session",
        price: 2000,
        currency: "USD",
        pricingModel: "one-time setup + $300/month support",
        duration: "3 weeks",
        assumptions: "Clinic uses a calendar/PMS with an API. Does not give medical advice. Usage costs billed at cost.",
      },
      client: {
        name: "Dr. Sarah Mitchell",
        country: "US",
        industry: "Healthcare",
        businessType: "Family dental clinic in Austin, Texas (fictional)",
        role: "Clinic owner",
        companySize: "small",
        budget: "No fixed budget; compares against hiring a part-time receptionist (~$1,800/month)",
        urgency: "medium",
        techFamiliarity: "basic",
        personality: "Busy, practical, polite but direct; worried about patient experience",
        negotiationStyle: "risk-averse",
        communication: "Short, plain-English answers; dislikes jargon",
        voiceGender: "female",
        problem: "We miss around 20 to 30 calls a week after 5pm and over lunch, and my front desk is overloaded.",
      },
      settings: { difficulty: "intermediate", friendliness: "neutral", focus: "pitch", maxTurns: 10, opening: "client-explains" },
    },
  },
  {
    id: "website-redesign-uk",
    title: "Website redesign for a UK business owner",
    tagline: "Pitch a conversion-focused redesign to a sceptical bakery chain owner.",
    emoji: "🎨",
    scenario: {
      learner: { profession: "Web designer and developer", experience: "some" },
      offer: {
        name: "Conversion-focused website redesign",
        description:
          "Redesign of the existing WordPress site with faster pages, clear online ordering for cakes, mobile-first layout, local SEO basics and analytics.",
        outcome: "More online cake pre-orders and fewer phone enquiries.",
        idealCustomer: "Local UK food and retail businesses with an outdated site",
        deliverables: "UX audit, new design (6 pages), build on WordPress, order form integration, speed optimisation, 30 days support",
        price: 2500,
        currency: "GBP",
        pricingModel: "fixed project fee, 50% upfront",
        duration: "5 weeks",
        assumptions: "Client supplies photos and copy. Hosting not included.",
      },
      client: {
        name: "James Whitfield",
        country: "UK",
        industry: "Food & retail",
        businessType: "Three-shop artisan bakery in Leeds (fictional)",
        role: "Owner",
        companySize: "small",
        budget: "Was quoted £900 by a local freelancer last year",
        urgency: "low",
        techFamiliarity: "none",
        personality: "Dry humour, sceptical of agencies after a bad experience",
        negotiationStyle: "bargain-hunter",
        communication: "Wants to know what he actually gets; hates waffle",
        voiceGender: "male",
        problem: "Our website looks dated and I suspect people aren't ordering online, but I'm not sure it really matters.",
      },
      settings: { difficulty: "intermediate", friendliness: "sceptical", focus: "pricing", maxTurns: 10, opening: "pitch-now" },
    },
  },
  {
    id: "ai-automation-startup",
    title: "Complex AI automation for a startup founder",
    tagline: "Explain an LLM-powered support automation to a technical founder.",
    emoji: "🤖",
    scenario: {
      learner: { profession: "AI engineer", experience: "experienced" },
      offer: {
        name: "Support triage & auto-reply automation",
        description:
          "An LLM pipeline that classifies inbound support tickets, drafts replies grounded in the help-centre, routes complex cases to humans, and logs everything for review.",
        outcome: "Cut first-response time from hours to minutes and reduce support headcount growth.",
        idealCustomer: "Seed to Series A SaaS startups with 500+ tickets/month",
        deliverables:
          "Discovery workshop, data audit, retrieval pipeline, Zendesk integration, evaluation harness, human-in-the-loop dashboard, 4 weeks of iteration",
        price: 12000,
        currency: "USD",
        pricingModel: "fixed fee in 3 milestones",
        duration: "8 weeks",
        assumptions: "Client provides API access to Zendesk and help-centre content. LLM usage billed to client account.",
      },
      client: {
        name: "Priya Raman",
        country: "US",
        industry: "B2B SaaS",
        businessType: "Seed-stage HR software startup in San Francisco (fictional)",
        role: "Co-founder & CTO",
        companySize: "small",
        budget: "Around $10k, needs to justify to co-founder",
        urgency: "high",
        techFamiliarity: "expert",
        personality: "Sharp, fast-talking, tests whether you really understand the tech",
        negotiationStyle: "analytical",
        communication: "Wants specifics: architecture, evaluation, failure modes",
        voiceGender: "female",
        problem: "We get about 1,200 support tickets a month, my two support people are burning out, and our response time is 9 hours.",
      },
      settings: { difficulty: "advanced", friendliness: "neutral", focus: "technical", maxTurns: 12, opening: "client-explains" },
    },
  },
  {
    id: "consulting-negotiation",
    title: "Negotiate consulting scope & fees",
    tagline: "Hold your rate while an ops director pushes to expand scope.",
    emoji: "🤝",
    scenario: {
      learner: { profession: "Data & automation consultant", experience: "experienced" },
      offer: {
        name: "Operations automation consulting",
        description:
          "A 6-week engagement to map the order-to-invoice process, identify automation opportunities and deliver two working automations.",
        outcome: "Remove ~40 hours/week of manual data entry in finance ops.",
        idealCustomer: "Mid-size distributors with manual back-office processes",
        deliverables: "Process map, opportunity report with ROI estimates, 2 production automations, documentation, handover",
        price: 9000,
        currency: "USD",
        pricingModel: "fixed fee; extra automations at $2,500 each",
        duration: "6 weeks",
        assumptions: "Access to ERP sandbox. Client assigns a process owner for 3 hrs/week.",
      },
      client: {
        name: "Michael Chen",
        country: "Canada",
        industry: "Wholesale distribution",
        businessType: "Industrial parts distributor in Toronto (fictional)",
        role: "Director of Operations",
        companySize: "mid",
        budget: "$6,000 approved; would need CFO sign-off for more",
        urgency: "medium",
        techFamiliarity: "basic",
        personality: "Friendly but a tough negotiator; always asks for more",
        negotiationStyle: "bargain-hunter",
        communication: "Likes options and trade-offs",
        voiceGender: "male",
        problem: "My finance team re-keys every order into the ERP by hand, and the errors cause invoice disputes.",
      },
      settings: { difficulty: "advanced", friendliness: "demanding", focus: "negotiation", maxTurns: 12, opening: "pitch-now" },
    },
  },
  {
    id: "discovery-hinglish",
    title: "Discovery call practice (Hinglish friendly)",
    tagline: "Speak in Hinglish, get coached in Hindi, and learn to ask better questions.",
    emoji: "🗣️",
    scenario: {
      learner: { profession: "Shopify developer", experience: "new", speechLanguage: "hinglish", coachingLanguage: "hi" },
      offer: {
        name: "Shopify store speed & checkout optimisation",
        description: "Audit and fix slow theme code, compress assets, simplify checkout and set up conversion tracking.",
        outcome: "Faster store and a higher checkout conversion rate.",
        idealCustomer: "Small DTC brands on Shopify",
        deliverables: "Performance audit, theme fixes, checkout tweaks, analytics dashboard",
        price: 1200,
        currency: "USD",
        pricingModel: "fixed fee",
        duration: "2 weeks",
      },
      client: {
        name: "Emma Collins",
        country: "Australia",
        industry: "E-commerce",
        businessType: "Small skincare brand selling online (fictional)",
        role: "Founder",
        companySize: "solo",
        budget: "Tight; around AUD 1,500",
        urgency: "high",
        techFamiliarity: "basic",
        personality: "Warm, chatty, a bit overwhelmed",
        negotiationStyle: "collaborative",
        communication: "Appreciates patience and simple explanations",
        voiceGender: "female",
        problem: "My sales dropped after a theme update and I'm not sure why.",
      },
      settings: { difficulty: "beginner", friendliness: "friendly", focus: "discovery", maxTurns: 8, opening: "client-explains" },
    },
  },
];

export const PRESETS: Preset[] = raw.map((p) => ({
  ...p,
  scenario: parseScenario({ ...p.scenario, id: p.id, title: p.title }),
}));

export function getPreset(id: string): Preset | undefined {
  return PRESETS.find((p) => p.id === id);
}

export const DEFAULT_SCENARIO: Scenario = PRESETS[0].scenario;
