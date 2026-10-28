import type { Scenario } from "@/lib/scenario/schema";
import type { ClientState, ClientTurnOutput, PersonaDossier, Turn } from "@/lib/sim/types";
import type { CoachReportWire } from "@/lib/coach/report";
import { CATEGORIES, type CategoryId } from "@/lib/coach/rubric";
import { computeDeliveryMetrics } from "@/lib/coach/metrics";
import { needsEnglishBridge } from "@/lib/languages";

/**
 * DEMO ENGINE — deterministic, keyword-based. It is NOT a language model and
 * the UI labels it as such everywhere. It exists so the full product flow
 * (and the real Gnani speech pipeline) can be demonstrated and tested without
 * an LLM key. Configure ANTHROPIC_API_KEY or an OpenAI-compatible server
 * for genuine adaptive conversations and coaching.
 */

export const DEMO_LABEL = "Demo engine (rule-based, not an LLM)";

const RX = {
  question: /\?|\b(how|what|why|when|which|who|could you|can you tell|do you)\b/i,
  discovery: /\b(how many|how much|how often|currently|right now|today|what happens|what does it cost|impact|tell me about|walk me through|biggest|challenge|problem)\b/i,
  numbers: /(\d[\d,.]*\s*(%|percent|hours?|calls?|patients?|orders?|tickets?|customers?|per|a week|a month|\/))|\b(roi|revenue|save|saves|saving|increase|reduce|cut|more bookings|conversion)\b/i,
  price: /(\$|£|€|₹|\b(usd|gbp|eur|aud|cad|inr|dollars?|pounds?|rupees?)\b|\bprice|cost|fee|budget|quote)/i,
  scope: /\b(include|includes|included|deliver|deliverables?|setup|set up|support|maintenance|weeks?|timeline|phase|milestone|handover|training)\b/i,
  nextStep: /\b(pilot|trial|demo|next step|schedule|book a|call on|meeting|proposal|send you|contract|start on|kick ?off|next week|tomorrow|monday|tuesday|wednesday|thursday|friday)\b/i,
  discount: /\b(discount|reduce the price|lower the price|cheaper|off the price|i can do it for|special price|best price)\b/i,
  risk: /\b(test|testing|fallback|human|hand ?off|escalat|monitor|review|guarantee|refund|sla|backup|accuracy|safeguard)\b/i,
  overclaim: /\b(100%|guarantee[sd]?|never fail|always works|no risk|zero errors)\b/i,
};

function learnerTurns(turns: Turn[]) {
  return turns.filter((t) => t.role === "learner");
}

function text(t: Turn) {
  return t.englishText || t.text;
}

function pick<T>(arr: T[], i: number): T {
  return arr[Math.abs(i) % arr.length];
}

function money(s: Scenario) {
  return `${s.offer.currency === "USD" ? "$" : s.offer.currency === "GBP" ? "£" : s.offer.currency === "EUR" ? "€" : `${s.offer.currency} `}${s.offer.price.toLocaleString("en-US")}`;
}

function business(c: Scenario["client"]): string {
  const b = c.businessType.replace(/\s*\(fictional\)/i, "").trim();
  const lower = b.charAt(0).toLowerCase() + b.slice(1);
  return /^(a|an|the)\s/i.test(lower) ? lower : `${/^[aeiou]/i.test(lower) ? "an" : "a"} ${lower}`;
}

export function demoOpening(s: Scenario): string {
  const c = s.client;
  const first = c.name.split(" ").slice(0, 2).join(" ");
  if (s.settings.opening === "pitch-now") {
    return `Hi, ${first} here. I'm the ${c.role.toLowerCase()} of ${business(c)}. I've only got about fifteen minutes, so tell me what you do and why I should care.`;
  }
  const problem = c.problem || "we have a problem that's costing us time and money";
  return `Hi, thanks for making the time. I'm ${first}, the ${c.role.toLowerCase()} of ${business(c)}. Honestly, ${problem.charAt(0).toLowerCase()}${problem.slice(1)} How do you think you could help?`;
}

export function demoClientTurn(s: Scenario, dossier: PersonaDossier, turns: Turn[], state: ClientState): ClientTurnOutput {
  const learners = learnerTurns(turns);
  const last = learners[learners.length - 1];
  const said = last ? text(last) : "";
  const n = learners.length;
  const nonLatin = /[^\u0000-ɏ\s\d.,!?'"₹$£€%()-]/.test(said);

  let interest = state.interest;
  const notes: string[] = [];
  const asked = RX.question.test(said);
  const discovery = asked && RX.discovery.test(said);
  const hasNumbers = RX.numbers.test(said);
  const nextStep = RX.nextStep.test(said);
  const discount = RX.discount.test(said);
  const overclaim = RX.overclaim.test(said);
  const words = said.split(/\s+/).filter(Boolean).length;

  if (discovery) {
    interest += 6;
    notes.push("Asked a discovery question about my situation.");
  }
  if (hasNumbers) {
    interest += 5;
    notes.push("Used concrete numbers or outcomes.");
  }
  if (RX.scope.test(said)) interest += 3;
  if (overclaim) {
    interest -= 6;
    notes.push("Made an absolute claim without support.");
  }
  if (words < 6) {
    interest -= 4;
    notes.push("Answer was too short to be useful.");
  }
  if (words > 160) {
    interest -= 4;
    notes.push("Answer was long; key point got lost.");
  }
  if (discount) {
    interest += 2;
    notes.push("Offered a discount without trading scope.");
  }

  const unraised = dossier.concerns.filter((c) => !state.raisedConcernIds.includes(c.id));
  const priceDiscussed = learners.some((t) => RX.price.test(text(t)));
  const remaining = s.settings.maxTurns - n;
  let reply: string;
  let newConcernIds: string[] = [];
  let phase: ClientTurnOutput["phase"] = state.phase === "opening" ? "discovery" : state.phase;
  let endConversation = false;
  let outcome: ClientTurnOutput["outcome"] = null;

  if (nonLatin && needsEnglishBridge(s.learner.speechLanguage)) {
    reply = "Sorry, I didn't quite catch that. Could you say it again in English?";
    notes.push("Demo engine cannot translate non-English speech; an LLM provider is needed for the language bridge.");
  } else if (nextStep && interest >= 52) {
    reply = pick(
      [
        `Okay, that sounds reasonable. Let's do that. Send me the details and we'll lock in a time.`,
        `Alright, you've answered my main questions. Put that in writing and we can get started.`,
      ],
      n,
    );
    endConversation = true;
    outcome = "next-step-agreed";
    phase = "ended";
  } else if (nextStep) {
    reply = `I'm not ready to commit yet. Send me something in writing and I'll think about it.`;
    endConversation = true;
    outcome = "follow-up-later";
    phase = "ended";
  } else if (remaining <= 0) {
    reply =
      interest >= 55
        ? `I need to jump to another call. I'm interested, so send me a short proposal and let's talk again next week.`
        : `I have to run. I'm not convinced yet, but feel free to email me something.`;
    endConversation = true;
    outcome = interest >= 55 ? "follow-up-later" : "not-interested";
    phase = "ended";
  } else if (discovery) {
    const details = [
      s.client.problem || "It's a recurring problem for us.",
      `Budget-wise, ${s.client.budget.charAt(0).toLowerCase()}${s.client.budget.slice(1).replace(/[.\s]+$/, "")}.`,
      `It matters because ${s.client.urgency === "high" ? "it's hurting us right now" : "it keeps coming up"}.`,
    ];
    reply = `${pick(details, n - 1)} ${unraised[0] && n >= 2 ? unraised[0].sample : "So what would you actually do about it?"}`;
    if (unraised[0] && n >= 2) newConcernIds = [unraised[0].id];
  } else if (discount) {
    reply = `So the price was flexible all along? What else is negotiable then, and what would I lose at the lower price?`;
    phase = "negotiation";
  } else if (overclaim) {
    reply = `You say that, but how can you be sure? What happens when it doesn't work as planned?`;
    phase = "objections";
  } else if (unraised.length > 0 && n >= 1) {
    const c = unraised[0];
    reply = `${pick(["Okay.", "Right.", "I see.", "Hmm."], n)} ${c.sample}`;
    newConcernIds = [c.id];
    phase = c.id === "price" || c.id === "scopeCreep" ? "negotiation" : "objections";
  } else if (!priceDiscussed) {
    reply = `So what would all of this cost me, and what exactly do I get for it?`;
    phase = "negotiation";
  } else {
    reply = `Okay. What would the next step look like if I wanted to move forward?`;
    phase = "closing";
  }

  return {
    learnerEnglish: "",
    reply,
    interest: Math.max(0, Math.min(100, interest)),
    phase,
    newConcernIds,
    endConversation,
    outcome,
    coachNote: notes.join(" ") || "Neutral answer; nothing specific moved me.",
  };
}

/** Quote at most the first ~20 words of a learner turn, verbatim. */
function quoteOf(t: Turn): string {
  return t.text.split(/\s+/).slice(0, 20).join(" ");
}

export function demoCoachReport(s: Scenario, dossier: PersonaDossier, turns: Turn[], state: ClientState): CoachReportWire {
  const learners = learnerTurns(turns);
  const m = computeDeliveryMetrics(turns);
  const find = (rx: RegExp) => learners.find((t) => rx.test(text(t)));
  const qTurns = learners.filter((t) => RX.discovery.test(text(t)) && RX.question.test(text(t)));
  const numTurn = find(RX.numbers);
  const priceTurn = find(RX.price);
  const scopeTurn = find(RX.scope);
  const riskTurn = find(RX.risk);
  const nextTurn = find(RX.nextStep);
  const discountTurn = find(RX.discount);
  const ev = (t?: Turn) => (t ? [{ turn: t.index, quote: quoteOf(t) }] : []);

  const scores: Record<CategoryId, { observed: boolean; score: number; rationale: string; evidence: { turn: number; quote: string }[] }> = {
    discovery: {
      observed: true,
      score: Math.min(90, 25 + qTurns.length * 20),
      rationale: qTurns.length ? `You asked ${qTurns.length} discovery question(s).` : "You did not ask about the client's situation before pitching.",
      evidence: ev(qTurns[0]),
    },
    value: {
      observed: learners.length > 0,
      score: numTurn ? 68 : 38,
      rationale: numTurn ? "You used at least one concrete number or outcome." : "Your answers described the service but not a measurable outcome for this client.",
      evidence: ev(numTurn),
    },
    clarity: {
      observed: learners.length > 0,
      score: m.avgWordsPerTurn >= 15 && m.avgWordsPerTurn <= 110 ? 66 : 45,
      rationale: `Average answer length was ${m.avgWordsPerTurn} words.`,
      evidence: [],
    },
    offer: {
      observed: !!(priceTurn || scopeTurn),
      score: priceTurn && scopeTurn ? 70 : 45,
      rationale: priceTurn && scopeTurn ? "You covered both price and scope." : "Price or scope was only partly explained.",
      evidence: ev(priceTurn ?? scopeTurn),
    },
    technical: {
      observed: state.raisedConcernIds.some((c) => ["integration", "accuracy", "maintenance"].includes(c)),
      score: riskTurn ? 65 : 40,
      rationale: riskTurn ? "You mentioned how risks are handled." : "Technical concerns were not answered with specifics.",
      evidence: ev(riskTurn),
    },
    objections: {
      observed: state.raisedConcernIds.length > 0,
      score: Math.max(30, Math.min(85, state.interest)),
      rationale: `The client raised ${state.raisedConcernIds.length} concern(s); final interest was ${state.interest}/100.`,
      evidence: [],
    },
    negotiation: {
      observed: !!(priceTurn || discountTurn),
      score: discountTurn ? 35 : 60,
      rationale: discountTurn ? "You offered a discount without asking for anything in return." : "You stated a price without immediately discounting.",
      evidence: ev(discountTurn ?? priceTurn),
    },
    closing: {
      observed: true,
      score: nextTurn ? (state.outcome === "next-step-agreed" ? 82 : 60) : 22,
      rationale: nextTurn ? "You proposed a next step." : "The call ended without you proposing a concrete next step.",
      evidence: ev(nextTurn),
    },
    delivery: { observed: true, score: 0, rationale: "Computed from measured pace, fillers and answer length.", evidence: [] },
  };

  const price = money(s);
  const issues: CoachReportWire["issues"] = [];
  if (qTurns.length < 2) {
    const firstIsQuestion = !!learners[0] && qTurns[0] === learners[0];
    issues.push({
      title: qTurns.length === 0 ? "Ask before you pitch" : "Go one level deeper in discovery",
      category: "discovery",
      turn: learners[0] && !firstIsQuestion ? learners[0].index : -1,
      quote: learners[0] && !firstIsQuestion ? quoteOf(learners[0]) : "",
      whatWasMissing:
        qTurns.length === 0
          ? "Questions that make the client describe the cost of the problem."
          : "A follow-up question about the impact or cost of the problem (an Implication question).",
      whyItMattered: `${s.client.name} needs to feel understood before hearing about ${s.offer.name}.`,
      betterResponse: `Before I suggest anything, can I ask a couple of quick questions? Roughly how often does this problem happen in a typical week, and what does it cost you when it does — in time, lost customers or revenue?`,
      whyBetterWorks: "It gets the client to state the impact in their own numbers, which you can use later to justify the price.",
      principleId: "spin",
      exercise: "Write three Problem and two Implication questions for this client and use them in your next session before mentioning your service.",
    });
  }
  if (!numTurn) {
    issues.push({
      title: "Turn features into a measurable outcome",
      category: "value",
      turn: -1,
      quote: "",
      whatWasMissing: "A specific result for this client, ideally in their own numbers.",
      whyItMattered: "Without an outcome, the client compares you on price alone.",
      betterResponse: `Based on what you said, the main result is this: ${(s.offer.outcome || "you solve the problem you described").replace(/[.\s]+$/, "")}. If that saves even a fraction of what it is costing you today, the ${price} pays for itself quickly, and I can show you how we'd measure that in the first month.`,
      whyBetterWorks: "Leads with the outcome, ties it to the client's situation and offers a way to verify it.",
      principleId: "resonating-focus",
      exercise: "Finish this sentence in under 30 words: 'For you, the main result is … which matters because …'.",
    });
  }
  if (!nextTurn) {
    issues.push({
      title: "Always propose a concrete next step",
      category: "closing",
      turn: -1,
      quote: "",
      whatWasMissing: "A specific, low-risk next action with a time.",
      whyItMattered: "Busy international clients rarely follow up on their own.",
      betterResponse: `Here's what I suggest: I'll send a one-page scope with the ${price} breakdown by Thursday, and we book 20 minutes on Friday to go through it. If it looks right, we can start with ${s.offer.duration ? `a ${s.offer.duration} plan` : "a small first phase"}. Does Friday work?`,
      whyBetterWorks: "It names who does what by when and asks for a small commitment (an Advance).",
      principleId: "advance",
      exercise: "Practise ending every answer in the last two minutes with a question that proposes a specific next step.",
    });
  }
  if (discountTurn) {
    issues.push({
      title: "Trade, don't discount",
      category: "negotiation",
      turn: discountTurn.index,
      quote: quoteOf(discountTurn),
      whatWasMissing: "Something in return for a lower price.",
      whyItMattered: "An early discount signals the original price was not real and invites more pressure.",
      betterResponse: `I'd rather keep the full scope at ${price}, because that's what gets you the result. If budget is the concern, we could start with a smaller first phase and add the rest once you see results. Would that work better?`,
      whyBetterWorks: "Protects the price by offering an option that changes scope instead of cutting margin.",
      principleId: "trade-dont-cave",
      exercise: "Prepare two scoped-down options for this offer so you never need to discount on the spot.",
    });
  }

  const ranked = (Object.entries(scores) as [CategoryId, (typeof scores)[CategoryId]][])
    .filter(([id, v]) => v.observed && id !== "delivery")
    .sort((a, b) => a[1].score - b[1].score)
    .slice(0, 3);

  return {
    summary: `Demo engine assessment (rule-based, not an LLM). You completed ${learners.length} turn(s) and the client ended at ${state.interest}/100 interest${state.outcome ? ` with outcome "${state.outcome}"` : ""}. ${qTurns.length ? "You asked some discovery questions." : "The biggest gap was discovery."} Connect an LLM provider for detailed, personalised coaching.`,
    categories: (Object.entries(scores) as [CategoryId, (typeof scores)[CategoryId]][]).map(([id, v]) => ({ id, ...v })),
    strengths: [qTurns[0], numTurn, nextTurn]
      .filter((t): t is Turn => !!t)
      .slice(0, 2)
      .map((t) => ({ turn: t.index, quote: quoteOf(t), why: "This moved the conversation forward with specifics." })),
    issues: issues.slice(0, 4),
    plan: ranked.map(([id]) => ({
      title: CATEGORIES.find((c) => c.id === id)?.name ?? id,
      why: scores[id].rationale,
      exercise: issues.find((i) => i.category === id)?.exercise ?? "Replay this scenario and focus on this skill.",
      successMetric: `Score 70+ in ${id} next session.`,
    })),
    languageBridge: [],
    deliveryNotes: [
      m.fillerCount ? `${m.fillerCount} filler word(s) across ${learners.length} answer(s).` : "No filler words detected in your answers.",
      ...(m.hedgeCount ? [`${m.hedgeCount} hedge(s) such as "I think" or "maybe", which soften your claims.`] : []),
    ],
    proposalSteps: [
      `Restate ${s.client.name.split(" ").slice(-1)[0]}'s problem in their own words.`,
      "Offer two options: a small, low-risk first step and the full scope.",
      `Give scope, timeline and price for each, in one breath each (the full scope is ${price}).`,
      "Name the next step and ask which option fits better, then stop talking.",
    ],
    nextDrill: issues[0]?.exercise ?? "Replay this scenario and end with a specific next step.",
    spoken: [
      ...issues.slice(0, 3).map((i, idx) => ({
        label: CATEGORIES.find((c) => c.id === i.category)?.name.split(" ")[0] ?? "Coach",
        text: i.quote
          ? `In this part you said, '${i.quote}'. ${i.whatWasMissing} Here's how to do it better: ${i.betterResponse}`
          : `${i.title}. ${i.whatWasMissing} Here's how to do it better: ${i.betterResponse}`,
        refType: "issue" as const,
        refIndex: idx,
      })),
    ],
  };
}
