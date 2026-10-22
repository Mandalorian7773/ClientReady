import type { Scenario } from "@/lib/scenario/schema";
import { LABELS } from "@/lib/scenario/schema";
import type { Concern, PersonaDossier } from "./types";

/**
 * Builds the client's hidden dossier deterministically from the scenario.
 * The same scenario always yields the same concerns in the same order, which
 * keeps the persona consistent across turns and makes it testable.
 */

const CONCERN_BANK: Record<string, Concern> = {
  roi: { id: "roi", label: "Return on investment", sample: "How will I know this actually pays for itself?" },
  price: { id: "price", label: "Price feels high", sample: "Why should I pay that much for this?" },
  scope: { id: "scope", label: "What exactly is included", sample: "What is actually included in that price?" },
  delivery: { id: "delivery", label: "Delivery risk", sample: "What happens if the project misses its deadline?" },
  maintenance: { id: "maintenance", label: "Maintenance and support", sample: "Who looks after this once it is live?" },
  trust: { id: "trust", label: "Trust in a remote freelancer", sample: "Why should I choose you over a local agency?" },
  integration: { id: "integration", label: "Integration with existing systems", sample: "How does this work with what we already use?" },
  accuracy: { id: "accuracy", label: "AI mistakes", sample: "What happens if the AI tells a customer something wrong?" },
  privacy: { id: "privacy", label: "Data privacy and compliance", sample: "Where does our customer data go?" },
  adoption: { id: "adoption", label: "Team adoption", sample: "My staff are busy; will they actually use this?" },
  alternatives: { id: "alternatives", label: "Cheaper alternatives", sample: "Couldn't I just buy an off-the-shelf tool?" },
  proof: { id: "proof", label: "Proof of results", sample: "Have you done this before? Can I see an example?" },
  scopeCreep: { id: "scopeCreep", label: "Wants more for the same price", sample: "Can you include a couple more things at that price?" },
  timeline: { id: "timeline", label: "Timeline", sample: "Can this be done faster?" },
};

function hasAny(text: string, words: string[]) {
  const t = text.toLowerCase();
  return words.some((w) => t.includes(w));
}

export function selectConcerns(s: Scenario): Concern[] {
  const offerText = `${s.offer.name} ${s.offer.description} ${s.offer.deliverables}`;
  const ids: string[] = [];
  const add = (...c: string[]) => c.forEach((id) => !ids.includes(id) && ids.push(id));

  switch (s.settings.focus) {
    case "discovery":
      add("roi", "adoption", "price");
      break;
    case "pitch":
      add("roi", "proof", "price");
      break;
    case "technical":
      add("integration", "accuracy", "maintenance");
      break;
    case "pricing":
      add("price", "scope", "alternatives");
      break;
    case "negotiation":
      add("price", "scopeCreep", "scope");
      break;
    case "closing":
      add("trust", "delivery", "price");
      break;
  }
  if (hasAny(offerText, ["ai", "llm", "voice agent", "chatbot", "automation"])) add("accuracy");
  if (s.client.industry.toLowerCase().includes("health") || hasAny(offerText, ["patient", "customer data", "tickets"])) add("privacy");
  if (hasAny(offerText, ["integrat", "erp", "zendesk", "calendar", "crm", "pms", "shopify", "wordpress"])) add("integration");
  if (s.client.negotiationStyle === "risk-averse") add("delivery", "trust");
  if (s.client.negotiationStyle === "bargain-hunter") add("price", "alternatives");
  if (s.client.negotiationStyle === "analytical") add("roi", "proof");
  if (s.client.country !== "Other") add("trust");
  add("maintenance", "delivery");

  const count = { beginner: 3, intermediate: 4, advanced: 5, expert: 6 }[s.settings.difficulty];
  return ids.slice(0, count).map((id) => CONCERN_BANK[id]);
}

export function buildDossier(s: Scenario): PersonaDossier {
  const c = s.client;
  const sizeLabel = LABELS.companySize[c.companySize];
  const problem = c.problem || `Has a business problem that ${s.offer.name} might address, but has not articulated it clearly.`;
  return {
    summary: `${c.name}, ${c.role} at a ${sizeLabel.toLowerCase()} ${c.businessType} (${c.industry}, ${c.country}). ${c.personality}.`,
    goals: [
      problem,
      `Wants to avoid wasting money or time on something that does not work.`,
      c.urgency === "high" ? "Needs a fix soon; the problem is actively costing them." : c.urgency === "low" ? "Not in a hurry; needs to be convinced this matters now." : "Would like to solve this within the quarter.",
    ],
    concerns: selectConcerns(s),
    decisionProcess:
      c.companySize === "solo" || c.companySize === "small"
        ? `Decides alone, but will not commit on this call unless the freelancer proposes a concrete, low-risk next step. Budget context: ${c.budget}.`
        : `Needs sign-off from a manager or finance for anything above the approved amount. Budget context: ${c.budget}.`,
    walkAway:
      "Ends politely without a next step if the freelancer stays vague after being challenged twice, cannot explain what is included, or will not discuss risk.",
    winsTrust: [
      "Good questions about the client's business before pitching",
      "Specific outcomes tied to the client's own numbers",
      "Clear scope, deliverables and what is NOT included",
      "Honest answers about risks and how they are handled",
      "A concrete, low-risk next step (pilot, demo, phased start)",
    ],
  };
}
