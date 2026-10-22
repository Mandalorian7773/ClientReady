import type { Scenario } from "./schema";

/** One-line session objective shown in the briefing and studio. */
export const OBJECTIVES: Record<Scenario["settings"]["focus"], string> = {
  discovery: "Understand the client's real problem and its cost before you pitch anything.",
  pitch: "Explain your offer as a business outcome this client cares about, in under a minute.",
  technical: "Explain how it works and how you handle failure, at the client's level.",
  pricing: "State your price confidently and justify it with value, without discounting.",
  negotiation: "Protect your price and scope. Trade concessions instead of giving them away.",
  closing: "Leave the call with a specific, agreed next step.",
};

export const TIPS: Record<Scenario["settings"]["focus"], string[]> = {
  discovery: ["Ask how often the problem happens and what it costs.", "Let the client talk; summarise back what you heard."],
  pitch: ["Lead with the outcome, then how.", "Use the client's own numbers when you have them."],
  technical: ["Use a concrete example instead of jargon.", "Name a risk and your safeguard before they ask."],
  pricing: ["Say the number once, clearly, then stop talking.", "Tie price to the value of the outcome."],
  negotiation: ["Ask what's behind a price objection.", "Offer options (smaller scope, phased start) instead of a discount."],
  closing: ["Propose who does what by when.", "Ask for a small commitment: a pilot, a call, a scope review."],
};
