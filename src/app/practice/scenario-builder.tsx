"use client";

import { ArrowLeft, ArrowRight, Check, RotateCcw } from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { Badge, Button, Card, cn, Eyebrow, Field, Input, Segmented, Select, Textarea } from "@/components/ui";
import { loadDraft, saveDraft } from "@/lib/client/storage";
import { LANGUAGES, getLanguage } from "@/lib/languages";
import { DEFAULT_SCENARIO, getPreset, PRESETS } from "@/lib/scenario/presets";
import {
  COMPANY_SIZES,
  COUNTRIES,
  CURRENCIES,
  DIFFICULTY,
  EXPERIENCE,
  FOCUS,
  FRIENDLINESS,
  LABELS,
  NEGOTIATION_STYLE,
  OPENING,
  TECH_FAMILIARITY,
  URGENCY,
  parseScenario,
  safeParseScenario,
  type Scenario,
} from "@/lib/scenario/schema";

const STEPS = ["Template", "You", "Your offer", "The client", "Simulation"] as const;
const opts = <T extends string>(values: readonly T[], labels?: Record<T, string>) => values.map((v) => ({ value: v, label: labels?.[v] ?? v }));
const langOpts = LANGUAGES.map((l) => ({ value: l.id, label: l.id === "en" || l.id === "hinglish" ? l.label : `${l.label} · ${l.nativeLabel}` }));

export function ScenarioBuilder() {
  const router = useRouter();
  const params = useSearchParams();
  const [step, setStep] = useState(0);
  const [s, setS] = useState<Scenario>(DEFAULT_SCENARIO);
  const [errors, setErrors] = useState<string | null>(null);

  useEffect(() => {
    const presetId = params.get("preset");
    const preset = presetId ? getPreset(presetId) : undefined;
    if (preset) {
      setS(preset.scenario);
      setStep(1);
      return;
    }
    const draft = loadDraft();
    if (draft) setS(draft);
  }, [params]);

  function patch<K extends keyof Scenario>(section: K, values: Partial<Scenario[K]>) {
    setS((prev) => ({ ...prev, [section]: { ...(prev[section] as object), ...values } }) as Scenario);
  }

  function choosePreset(id: string) {
    const p = getPreset(id);
    if (p) {
      setS(p.scenario);
      setStep(1);
    }
  }

  function start() {
    const parsed = safeParseScenario({ ...s, id: s.id || "custom" });
    if (!parsed.success) {
      const issue = parsed.error.issues[0];
      setErrors(`Please check "${issue.path.join(" → ")}": ${issue.message}`);
      return;
    }
    saveDraft(parsed.data);
    router.push("/practice/briefing");
  }

  const isLast = step === STEPS.length - 1;

  return (
    <div className="mx-auto max-w-6xl px-4 py-10 sm:px-6 lg:py-14">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <Eyebrow>Scenario builder</Eyebrow>
          <h1 className="mt-2 font-display text-4xl leading-tight sm:text-5xl">Who are you pitching today?</h1>
          <p className="mt-2 max-w-xl text-fg-muted">Start from a template and change anything. Every field has a sensible default, so skip what you don&apos;t need.</p>
        </div>
        <Button variant="ghost" size="sm" onClick={() => { setS(parseScenario({})); setStep(1); }}>
          <RotateCcw className="h-3.5 w-3.5" /> Start blank
        </Button>
      </div>

      {/* Stepper */}
      <nav aria-label="Steps" className="mt-8 overflow-x-auto">
        <ol className="flex min-w-max gap-2">
          {STEPS.map((label, i) => (
            <li key={label}>
              <button
                onClick={() => setStep(i)}
                aria-current={step === i ? "step" : undefined}
                className={cn(
                  "flex items-center gap-2 rounded-full border px-3 py-1.5 text-sm transition-colors",
                  step === i ? "border-signal bg-signal/10 text-fg" : i < step ? "border-border-strong text-fg-muted" : "border-border text-fg-subtle hover:text-fg-muted",
                )}
              >
                <span className={cn("grid h-5 w-5 place-items-center rounded-full text-[11px] font-semibold", step === i ? "bg-signal text-signal-ink" : "bg-surface-2")}>
                  {i < step ? <Check className="h-3 w-3" /> : i + 1}
                </span>
                {label}
              </button>
            </li>
          ))}
        </ol>
      </nav>

      <div className="mt-6 grid gap-6 lg:grid-cols-[1fr_340px]">
        <Card className="p-5 sm:p-7">
          {step === 0 && (
            <div>
              <h2 className="text-lg font-medium">Pick a starting point</h2>
              <p className="mt-1 text-sm text-fg-muted">Each template has a realistic fictional client and a sample offer you can edit.</p>
              <div className="mt-5 grid gap-3 sm:grid-cols-2">
                {PRESETS.map((p) => (
                  <button
                    key={p.id}
                    onClick={() => choosePreset(p.id)}
                    className={cn(
                      "rounded-xl border p-4 text-left transition-colors hover:border-signal/60",
                      s.id === p.id ? "border-signal bg-signal/5" : "border-border bg-bg-raised",
                    )}
                  >
                    <span className="text-xl" aria-hidden>{p.emoji}</span>
                    <span className="mt-2 block font-medium">{p.title}</span>
                    <span className="mt-1 block text-sm text-fg-muted">{p.tagline}</span>
                    <span className="mt-3 flex flex-wrap gap-1.5">
                      <Badge>{p.scenario.client.country}</Badge>
                      <Badge>{LABELS.difficulty[p.scenario.settings.difficulty]}</Badge>
                      <Badge>{LABELS.focus[p.scenario.settings.focus]}</Badge>
                    </span>
                  </button>
                ))}
              </div>
            </div>
          )}

          {step === 1 && (
            <div className="grid gap-5 sm:grid-cols-2">
              <h2 className="text-lg font-medium sm:col-span-2">About you</h2>
              <Field label="What do you do?" htmlFor="profession" hint="e.g. AI automation freelancer, web designer">
                <Input id="profession" value={s.learner.profession} maxLength={120} onChange={(e) => patch("learner", { profession: e.target.value })} />
              </Field>
              <Field label="Freelancing experience" htmlFor="experience">
                <Select id="experience" value={s.learner.experience} options={opts(EXPERIENCE, LABELS.experience)} onChange={(e) => patch("learner", { experience: e.target.value as Scenario["learner"]["experience"] })} />
              </Field>
              <Field label="I'll speak in" htmlFor="speechLanguage" hint="Transcribed by Gnani Prisma. Non-English speech gets a faithful English rendering for the client.">
                <Select id="speechLanguage" value={s.learner.speechLanguage} options={langOpts} onChange={(e) => patch("learner", { speechLanguage: e.target.value })} />
              </Field>
              <Field label="Explain my coaching in" htmlFor="coachingLanguage" hint="Better example answers stay in English, since that's what you'll say to the client.">
                <Select id="coachingLanguage" value={s.learner.coachingLanguage} options={langOpts} onChange={(e) => patch("learner", { coachingLanguage: e.target.value })} />
              </Field>
              <div className="rounded-lg border border-border bg-bg-raised px-3 py-2 text-xs text-fg-muted sm:col-span-2">
                The client always speaks English, using a Gnani Timbre English (India) voice. {getLanguage(s.learner.speechLanguage).note ?? ""}
              </div>
              <Field label="What you're good at (optional)" htmlFor="strengths">
                <Textarea id="strengths" value={s.learner.strengths} maxLength={300} placeholder="e.g. strong technical knowledge, fast delivery" onChange={(e) => patch("learner", { strengths: e.target.value })} />
              </Field>
              <Field label="What you find hard (optional)" htmlFor="difficulties">
                <Textarea id="difficulties" value={s.learner.difficulties} maxLength={300} placeholder="e.g. justifying my price, nervous on calls" onChange={(e) => patch("learner", { difficulties: e.target.value })} />
              </Field>
              <Field label="Goal for this session (optional)" htmlFor="goals" className="sm:col-span-2">
                <Input id="goals" value={s.learner.goals} maxLength={300} placeholder="e.g. hold my price without sounding defensive" onChange={(e) => patch("learner", { goals: e.target.value })} />
              </Field>
            </div>
          )}

          {step === 2 && (
            <div className="grid gap-5 sm:grid-cols-2">
              <h2 className="text-lg font-medium sm:col-span-2">What you&apos;re selling</h2>
              <Field label="Service or product name" htmlFor="offerName">
                <Input id="offerName" value={s.offer.name} maxLength={120} onChange={(e) => patch("offer", { name: e.target.value })} />
              </Field>
              <Field label="Ideal customer" htmlFor="idealCustomer">
                <Input id="idealCustomer" value={s.offer.idealCustomer} maxLength={200} onChange={(e) => patch("offer", { idealCustomer: e.target.value })} />
              </Field>
              <Field label="What it is and how it works" htmlFor="description" className="sm:col-span-2">
                <Textarea id="description" value={s.offer.description} maxLength={600} onChange={(e) => patch("offer", { description: e.target.value })} />
              </Field>
              <Field label="Business outcome for the client" htmlFor="outcome" className="sm:col-span-2" hint="The result they pay for, not the features.">
                <Input id="outcome" value={s.offer.outcome} maxLength={300} onChange={(e) => patch("offer", { outcome: e.target.value })} />
              </Field>
              <Field label="Scope and deliverables" htmlFor="deliverables" className="sm:col-span-2">
                <Textarea id="deliverables" value={s.offer.deliverables} maxLength={600} onChange={(e) => patch("offer", { deliverables: e.target.value })} />
              </Field>
              <div className="grid grid-cols-[1fr_110px] gap-3">
                <Field label="Price" htmlFor="price">
                  <Input id="price" type="number" min={0} inputMode="decimal" value={s.offer.price} onChange={(e) => patch("offer", { price: Number(e.target.value) || 0 })} />
                </Field>
                <Field label="Currency" htmlFor="currency">
                  <Select id="currency" value={s.offer.currency} options={opts(CURRENCIES)} onChange={(e) => patch("offer", { currency: e.target.value as Scenario["offer"]["currency"] })} />
                </Field>
              </div>
              <Field label="Pricing model" htmlFor="pricingModel">
                <Input id="pricingModel" value={s.offer.pricingModel} maxLength={80} placeholder="fixed fee, monthly retainer…" onChange={(e) => patch("offer", { pricingModel: e.target.value })} />
              </Field>
              <Field label="Duration" htmlFor="duration">
                <Input id="duration" value={s.offer.duration} maxLength={80} onChange={(e) => patch("offer", { duration: e.target.value })} />
              </Field>
              <Field label="Assumptions or limitations" htmlFor="assumptions">
                <Input id="assumptions" value={s.offer.assumptions} maxLength={400} onChange={(e) => patch("offer", { assumptions: e.target.value })} />
              </Field>
              <Field label="Your current pitch (optional)" htmlFor="existingPitch" className="sm:col-span-2" hint="Paste what you usually say. The coach can compare it to how the call went.">
                <Textarea id="existingPitch" value={s.offer.existingPitch} maxLength={800} onChange={(e) => patch("offer", { existingPitch: e.target.value })} />
              </Field>
            </div>
          )}

          {step === 3 && (
            <div className="grid gap-5 sm:grid-cols-2">
              <h2 className="text-lg font-medium sm:col-span-2">Your client (fictional)</h2>
              <Field label="Client name" htmlFor="clientName">
                <Input id="clientName" value={s.client.name} maxLength={60} onChange={(e) => patch("client", { name: e.target.value })} />
              </Field>
              <Field label="Role" htmlFor="role">
                <Input id="role" value={s.client.role} maxLength={120} placeholder="Founder, clinic owner, ops manager…" onChange={(e) => patch("client", { role: e.target.value })} />
              </Field>
              <Field label="Country" htmlFor="country">
                <Select id="country" value={s.client.country} options={opts(COUNTRIES)} onChange={(e) => patch("client", { country: e.target.value as Scenario["client"]["country"] })} />
              </Field>
              <Field label="Industry" htmlFor="industry">
                <Input id="industry" value={s.client.industry} maxLength={120} onChange={(e) => patch("client", { industry: e.target.value })} />
              </Field>
              <Field label="Business" htmlFor="businessType" className="sm:col-span-2">
                <Input id="businessType" value={s.client.businessType} maxLength={120} onChange={(e) => patch("client", { businessType: e.target.value })} />
              </Field>
              <Field label="Their problem, in their words" htmlFor="problem" className="sm:col-span-2" hint="The client reveals this gradually. Leave blank to let them be vague.">
                <Textarea id="problem" value={s.client.problem} maxLength={500} onChange={(e) => patch("client", { problem: e.target.value })} />
              </Field>
              <Field label="Company size" htmlFor="companySize">
                <Select id="companySize" value={s.client.companySize} options={opts(COMPANY_SIZES, LABELS.companySize)} onChange={(e) => patch("client", { companySize: e.target.value as Scenario["client"]["companySize"] })} />
              </Field>
              <Field label="Budget situation" htmlFor="budget">
                <Input id="budget" value={s.client.budget} maxLength={200} onChange={(e) => patch("client", { budget: e.target.value })} />
              </Field>
              <Field label="Urgency" htmlFor="urgency">
                <Segmented name="Urgency" value={s.client.urgency} options={opts(URGENCY, LABELS.urgency)} onChange={(v) => patch("client", { urgency: v })} />
              </Field>
              <Field label="Tech familiarity" htmlFor="techFamiliarity">
                <Segmented name="Tech familiarity" value={s.client.techFamiliarity} options={opts(TECH_FAMILIARITY, LABELS.techFamiliarity)} onChange={(v) => patch("client", { techFamiliarity: v })} />
              </Field>
              <Field label="Personality" htmlFor="personality">
                <Input id="personality" value={s.client.personality} maxLength={200} onChange={(e) => patch("client", { personality: e.target.value })} />
              </Field>
              <Field label="Negotiation style" htmlFor="negotiationStyle">
                <Select id="negotiationStyle" value={s.client.negotiationStyle} options={opts(NEGOTIATION_STYLE, LABELS.negotiationStyle)} onChange={(e) => patch("client", { negotiationStyle: e.target.value as Scenario["client"]["negotiationStyle"] })} />
              </Field>
              <Field label="Communication preference" htmlFor="communication">
                <Input id="communication" value={s.client.communication} maxLength={200} onChange={(e) => patch("client", { communication: e.target.value })} />
              </Field>
              <Field label="Client voice" htmlFor="voiceGender" hint="Gnani Timbre English (India) voice.">
                <Segmented name="Client voice" value={s.client.voiceGender} options={[{ value: "female", label: "Female" }, { value: "male", label: "Male" }]} onChange={(v) => patch("client", { voiceGender: v })} />
              </Field>
            </div>
          )}

          {step === 4 && (
            <div className="grid gap-6">
              <h2 className="text-lg font-medium">How hard should it be?</h2>
              <Field label="Difficulty" htmlFor="difficulty">
                <Segmented name="Difficulty" value={s.settings.difficulty} options={opts(DIFFICULTY, LABELS.difficulty)} onChange={(v) => patch("settings", { difficulty: v })} />
              </Field>
              <Field label="Client attitude" htmlFor="friendliness">
                <Segmented name="Client attitude" value={s.settings.friendliness} options={opts(FRIENDLINESS, LABELS.friendliness)} onChange={(v) => patch("settings", { friendliness: v })} />
              </Field>
              <Field label="What do you want to practise most?" htmlFor="focus">
                <Segmented name="Focus" value={s.settings.focus} options={opts(FOCUS, LABELS.focus)} onChange={(v) => patch("settings", { focus: v })} />
              </Field>
              <Field label="How the call opens" htmlFor="opening">
                <Segmented name="Opening" value={s.settings.opening} options={opts(OPENING, LABELS.opening)} onChange={(v) => patch("settings", { opening: v })} />
              </Field>
              <Field label={`Session length: about ${s.settings.maxTurns} of your answers`} htmlFor="maxTurns" hint="Shorter sessions cost fewer credits. 8–12 is a good range.">
                <input id="maxTurns" type="range" min={4} max={20} value={s.settings.maxTurns} onChange={(e) => patch("settings", { maxTurns: Number(e.target.value) })} className="accent-[var(--signal)]" />
              </Field>
            </div>
          )}

          {errors && <p role="alert" className="mt-5 text-sm text-low">{errors}</p>}

          <div className="mt-8 flex items-center justify-between border-t border-border pt-5">
            <Button variant="ghost" onClick={() => setStep((x) => Math.max(0, x - 1))} disabled={step === 0}>
              <ArrowLeft className="h-4 w-4" /> Back
            </Button>
            {isLast ? (
              <Button onClick={start} size="lg">
                Review briefing <ArrowRight className="h-4 w-4" />
              </Button>
            ) : (
              <Button onClick={() => setStep((x) => x + 1)}>
                Next <ArrowRight className="h-4 w-4" />
              </Button>
            )}
          </div>
        </Card>

        <ScenarioSummary s={s} onStart={start} />
      </div>
    </div>
  );
}

function ScenarioSummary({ s, onStart }: { s: Scenario; onStart: () => void }) {
  const price = useMemo(() => `${s.offer.currency} ${s.offer.price.toLocaleString("en-US")}`, [s.offer.currency, s.offer.price]);
  return (
    <aside className="lg:sticky lg:top-20 lg:self-start">
      <Card className="p-5">
        <Eyebrow>Summary</Eyebrow>
        <dl className="mt-4 space-y-3 text-sm">
          <div>
            <dt className="text-fg-subtle">You</dt>
            <dd>{s.learner.profession || "Freelancer"}</dd>
          </div>
          <div>
            <dt className="text-fg-subtle">Selling</dt>
            <dd>
              {s.offer.name} · <span className="font-mono">{price}</span>
            </dd>
          </div>
          <div>
            <dt className="text-fg-subtle">To</dt>
            <dd>
              {s.client.name}, {s.client.role}
              <span className="block text-fg-muted">{s.client.businessType} · {s.client.country}</span>
            </dd>
          </div>
          <div className="flex flex-wrap gap-1.5 pt-1">
            <Badge tone="signal">{LABELS.difficulty[s.settings.difficulty]}</Badge>
            <Badge>{LABELS.friendliness[s.settings.friendliness]}</Badge>
            <Badge>{LABELS.focus[s.settings.focus]}</Badge>
            <Badge>~{s.settings.maxTurns} turns</Badge>
          </div>
          <div className="pt-1 text-fg-muted">
            Speak: {getLanguage(s.learner.speechLanguage).label} · Coaching: {getLanguage(s.learner.coachingLanguage).label}
          </div>
        </dl>
        <Button onClick={onStart} className="mt-5 w-full" size="lg">
          Continue to briefing <ArrowRight className="h-4 w-4" />
        </Button>
      </Card>
    </aside>
  );
}
