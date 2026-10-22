/**
 * ClientReady coaching framework.
 *
 * Principles are tagged `evidence` (from published research or established,
 * widely-cited practitioner frameworks) or `design` (our own recommendation,
 * informed by those sources but not directly proven by them).
 * See docs/COACHING_FRAMEWORK.md for the full write-up.
 */

export type PrincipleBasis = "evidence" | "design";

export interface Principle {
  id: string;
  name: string;
  idea: string;
  basis: PrincipleBasis;
  source: string;
}

export const PRINCIPLES: Principle[] = [
  {
    id: "spin",
    name: "SPIN discovery",
    idea: "Ask Situation, Problem, Implication and Need-payoff questions so the client states the cost of the problem and the value of solving it before you pitch.",
    basis: "evidence",
    source: "Rackham, N. (1988). SPIN Selling. McGraw-Hill. Huthwaite research on 35,000+ sales calls.",
  },
  {
    id: "benefits-not-features",
    name: "Benefits over features",
    idea: "Link each capability to a need the client has explicitly stated. Generic advantages tend to trigger objections; benefits tied to explicit needs reduce them.",
    basis: "evidence",
    source: "Rackham, N. (1988). SPIN Selling, chapter on demonstrating capability.",
  },
  {
    id: "advance",
    name: "Agree an Advance",
    idea: "In larger sales, pressure closes backfire. Success is an agreed, specific next action that moves the deal forward (a pilot, a scoped proposal by a date, a demo with the decision-maker).",
    basis: "evidence",
    source: "Rackham, N. (1988). SPIN Selling, chapter on obtaining commitment.",
  },
  {
    id: "resonating-focus",
    name: "Resonating-focus value proposition",
    idea: "Lead with the one or two differences that matter most to this client, quantified where possible, rather than listing every benefit.",
    basis: "evidence",
    source: "Anderson, J. C., Narus, J. A., & van Rossum, W. (2006). Customer value propositions in business markets. Harvard Business Review, 84(3).",
  },
  {
    id: "jobs-pains-gains",
    name: "Jobs, pains and gains",
    idea: "Describe the offer in terms of the client's job to be done, the pains it removes and the gains it creates.",
    basis: "evidence",
    source: "Osterwalder, A., Pigneur, Y., Bernarda, G., & Smith, A. (2014). Value Proposition Design. Wiley.",
  },
  {
    id: "pyramid",
    name: "Answer first",
    idea: "State the main point first, then two or three supporting reasons, then detail. Busy clients judge clarity in the first sentence.",
    basis: "evidence",
    source: "Minto, B. (1987/2009). The Pyramid Principle. Pearson.",
  },
  {
    id: "concrete",
    name: "Concrete over abstract",
    idea: "Experts suffer the curse of knowledge. Replace jargon with a concrete example, analogy or number the client already understands.",
    basis: "evidence",
    source: "Heath, C., & Heath, D. (2007). Made to Stick. Random House.",
  },
  {
    id: "interests",
    name: "Negotiate on interests",
    idea: "Explore the interest behind a position (e.g. budget approval risk), invent options for mutual gain, and use objective criteria.",
    basis: "evidence",
    source: "Fisher, R., Ury, W., & Patton, B. (2011). Getting to Yes (3rd ed.). Penguin.",
  },
  {
    id: "anchor",
    name: "Anchor with a well-justified first number",
    idea: "First offers strongly predict settlements. State your price confidently with its rationale; when the client anchors, refocus on value and alternatives.",
    basis: "evidence",
    source: "Galinsky, A. D., & Mussweiler, T. (2001). First offers as anchors. Journal of Personality and Social Psychology, 81(4), 657–669.",
  },
  {
    id: "value-pricing",
    name: "Price after value",
    idea: "Anchor price to the economic value delivered to this client, not to your hours. Present price after the value is clear.",
    basis: "evidence",
    source: "Nagle, T. T., & Müller, G. (2018). The Strategy and Tactics of Pricing (6th ed.). Routledge.",
  },
  {
    id: "trade-dont-cave",
    name: "Trade, don't cave",
    idea: "Never reduce price without changing scope, terms or timeline. Offer options (e.g. pilot vs full build) instead of a discount.",
    basis: "design",
    source: "ClientReady recommendation, consistent with Fisher & Ury's options for mutual gain and common negotiation practice.",
  },
  {
    id: "acrc",
    name: "Acknowledge, clarify, respond, confirm",
    idea: "Acknowledge the concern, ask what is behind it, answer the real concern with specifics or proof, then check it is resolved.",
    basis: "design",
    source: "ClientReady recommendation, drawing on Rackham (1988) and Fisher & Ury (2011).",
  },
  {
    id: "scope-clarity",
    name: "Explicit scope",
    idea: "State deliverables, what is not included, assumptions, timeline and what happens after launch. Ambiguous scope reads as risk to an international client.",
    basis: "design",
    source: "ClientReady recommendation for freelance offers.",
  },
  {
    id: "low-context",
    name: "Explicit, low-context communication",
    idea: "Clients in the US, UK, Canada and Australia generally expect explicit, direct statements. Say the point, the number and the next step plainly instead of implying them.",
    basis: "evidence",
    source: "Meyer, E. (2014). The Culture Map. PublicAffairs. (Communicating scale; generalisation, not a rule for every individual.)",
  },
  {
    id: "intelligibility",
    name: "Intelligibility, not accent",
    idea: "Being understood depends on clarity, pacing, structure and stress, not on sounding native. Strong accents can be fully intelligible.",
    basis: "evidence",
    source: "Munro, M. J., & Derwing, T. M. (1995). Foreign accent, comprehensibility, and intelligibility in the speech of second language learners. Language Learning, 45(1), 73–97.",
  },
];

export type CategoryId =
  | "discovery"
  | "value"
  | "clarity"
  | "offer"
  | "technical"
  | "objections"
  | "negotiation"
  | "closing"
  | "delivery";

export interface Category {
  id: CategoryId;
  name: string;
  weight: number;
  principleIds: string[];
  /** Anchors at 20 / 50 / 80 / 100 so scores are comparable across sessions. */
  anchors: { 20: string; 50: string; 80: string; 100: string };
}

export const CATEGORIES: Category[] = [
  {
    id: "discovery",
    name: "Discovery & understanding the problem",
    weight: 14,
    principleIds: ["spin"],
    anchors: {
      20: "Pitches immediately; no questions about the client's situation.",
      50: "Asks some situation questions but does not explore impact or cost.",
      80: "Uncovers the problem and its business impact with follow-ups before pitching.",
      100: "Client states the cost of the problem and the value of a fix in their own words.",
    },
  },
  {
    id: "value",
    name: "Value proposition & outcomes",
    weight: 14,
    principleIds: ["resonating-focus", "benefits-not-features", "jobs-pains-gains"],
    anchors: {
      20: "Lists features or technology with no outcome.",
      50: "Mentions generic benefits (save time, more sales) without tying to this client.",
      80: "Ties one or two outcomes to the client's stated problem.",
      100: "Quantified outcome using the client's own numbers, with a credible basis.",
    },
  },
  {
    id: "clarity",
    name: "Clarity & structure",
    weight: 12,
    principleIds: ["pyramid", "low-context"],
    anchors: {
      20: "Hard to follow; main point missing or buried.",
      50: "Main point present but surrounded by filler or tangents.",
      80: "Answer-first, logically ordered, appropriately concise.",
      100: "Consistently crisp: point, reasons, example, check-in.",
    },
  },
  {
    id: "offer",
    name: "Offer, scope & pricing explanation",
    weight: 10,
    principleIds: ["scope-clarity", "value-pricing"],
    anchors: {
      20: "Price or scope vague, or contradicts itself.",
      50: "States price and some deliverables; exclusions and assumptions unclear.",
      80: "Clear deliverables, timeline, price and what happens after delivery.",
      100: "Clear scope including exclusions, with price justified by value and options offered.",
    },
  },
  {
    id: "technical",
    name: "Technical explanation & credibility",
    weight: 10,
    principleIds: ["concrete"],
    anchors: {
      20: "Jargon-heavy or inaccurate; no evidence of competence.",
      50: "Technically correct but not adapted to the client's level.",
      80: "Explains how it works at the right level, with concrete examples.",
      100: "Addresses failure modes and safeguards honestly; builds credibility with proof.",
    },
  },
  {
    id: "objections",
    name: "Objection handling",
    weight: 12,
    principleIds: ["acrc", "benefits-not-features"],
    anchors: {
      20: "Defensive, dismissive or ignores the concern.",
      50: "Responds but generically, without exploring the concern.",
      80: "Acknowledges, clarifies and answers with specifics.",
      100: "Resolves the real concern with evidence and confirms the client is satisfied.",
    },
  },
  {
    id: "negotiation",
    name: "Negotiation & commercial judgement",
    weight: 10,
    principleIds: ["interests", "anchor", "trade-dont-cave"],
    anchors: {
      20: "Discounts immediately or agrees to unpaid extra scope.",
      50: "Holds price weakly or concedes without getting anything back.",
      80: "Explores interests and offers options; concessions are traded.",
      100: "Protects margin and the relationship; creates a win-win structure.",
    },
  },
  {
    id: "closing",
    name: "Closing & next steps",
    weight: 10,
    principleIds: ["advance"],
    anchors: {
      20: "Ends without proposing any next step.",
      50: "Vague next step (\"let me know\", \"I'll send details\").",
      80: "Proposes a specific next step with a date or owner.",
      100: "Client agrees to a specific Advance that moves the decision forward.",
    },
  },
  {
    id: "delivery",
    name: "Delivery: intelligibility & pacing",
    weight: 8,
    principleIds: ["intelligibility"],
    anchors: {
      20: "Very long or very short turns, frequent fillers, recognition often failed.",
      50: "Understandable but rushed, padded or uneven.",
      80: "Comfortable pace, few fillers, well-sized answers.",
      100: "Consistently clear, well-paced and easy to follow.",
    },
  },
];

export const CATEGORY_IDS = CATEGORIES.map((c) => c.id) as [CategoryId, ...CategoryId[]];
export const TOTAL_WEIGHT = CATEGORIES.reduce((s, c) => s + c.weight, 0);

export function getCategory(id: CategoryId): Category {
  return CATEGORIES.find((c) => c.id === id)!;
}

export function getPrinciple(id: string): Principle | undefined {
  return PRINCIPLES.find((p) => p.id === id);
}
