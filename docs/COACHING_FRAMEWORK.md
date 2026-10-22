# ClientReady coaching framework

The coach turns established sales and communication research into a fixed rubric. Nothing is retrieved from the web at runtime. The source of truth is [`src/lib/coach/rubric.ts`](../src/lib/coach/rubric.ts).

## Evidence-based principles vs our design choices

| Principle | Basis | Source |
|---|---|---|
| SPIN discovery (Situation, Problem, Implication, Need-payoff questions) | Evidence | Rackham, N. (1988). *SPIN Selling*. McGraw-Hill. Based on Huthwaite research covering 35,000+ sales calls. |
| Benefits over features (link capabilities to needs the client stated) | Evidence | Rackham (1988), chapter on demonstrating capability |
| Agree an Advance; avoid pressure closes in larger sales | Evidence | Rackham (1988), chapter on obtaining commitment |
| Resonating-focus value proposition | Evidence | Anderson, Narus & van Rossum (2006). Customer value propositions in business markets. *HBR* 84(3) |
| Jobs, pains, gains | Evidence | Osterwalder et al. (2014). *Value Proposition Design*. Wiley |
| Answer first (pyramid structure) | Evidence | Minto, B. *The Pyramid Principle* |
| Concrete over abstract; the curse of knowledge | Evidence | Heath & Heath (2007). *Made to Stick* |
| Negotiate on interests, options for mutual gain, objective criteria | Evidence | Fisher, Ury & Patton (2011). *Getting to Yes* (3rd ed.) |
| First offers act as anchors | Evidence | Galinsky & Mussweiler (2001). *JPSP* 81(4), 657–669 |
| Value-based pricing | Evidence | Nagle & Müller (2018). *The Strategy and Tactics of Pricing* (6th ed.) |
| Explicit, low-context communication with US/UK/AU clients | Evidence (a generalisation) | Meyer, E. (2014). *The Culture Map* |
| Intelligibility is not the same as accent | Evidence | Munro & Derwing (1995). *Language Learning* 45(1), 73–97 |
| Trade, don't cave (never discount without changing scope or terms) | **Design** | ClientReady recommendation, consistent with Fisher & Ury |
| Acknowledge, clarify, respond, confirm (objection handling) | **Design** | ClientReady recommendation |
| Explicit scope: deliverables, exclusions, assumptions, after-launch support | **Design** | ClientReady recommendation for freelance offers |
| Pace guide of 110–170 wpm, fewer than 3 fillers per 100 words, 15–110 words per answer | **Design heuristic** | Not research-derived thresholds; shown to learners as guidelines |

Citations were checked against publisher and catalogue records (October 2026). The summaries of Rackham's findings come from the book's documented claims and secondary references, not from the original Huthwaite dataset.

## Scorecard

| Category | Weight |
|---|---|
| Discovery and understanding the problem | 14 |
| Value proposition and outcomes | 14 |
| Clarity and structure | 12 |
| Objection handling | 12 |
| Offer, scope and pricing explanation | 10 |
| Technical explanation and credibility | 10 |
| Negotiation and commercial judgement | 10 |
| Closing and next steps | 10 |
| Delivery: intelligibility and pacing | 8 |

Each category has written anchors at 20, 50, 80 and 100.

**Overall** = Σ(weight × score) ÷ Σ(weight), taken over the categories that were **observed** in the session. Unobserved categories (for example, no price discussion) are excluded and the remaining weights are renormalised. The overall score is computed in code ([`score.ts`](../src/lib/coach/score.ts)), never by the model.

**Delivery** is computed from measured data only: recording duration, Prisma transcript word counts, and filler counts. It is not scored when every answer was typed. Accent is never assessed.

## Guardrails against hallucinated feedback

- Every quote the model cites is checked against the learner's turns. Matching is case- and punctuation-insensitive, and the English rendering also counts. Quotes that can't be found are removed, and the report shows how many were removed.
- The language-bridge "original" text is always taken from the transcript, never from the model's copy of it.
- Better example answers must not invent case studies or guarantees. The prompt tells the model to use placeholders such as "[a similar clinic I worked with]".
- Scores are clamped. Missing categories are filled as "not observed".
