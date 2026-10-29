"use client";

import { Check, CircleDollarSign, Cpu, Crown, Flame, Handshake, Lock, Megaphone, MessageCircleQuestion, Play, Trophy, Zap, type LucideIcon } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Stars } from "@/components/stars";
import { Badge, Button, Card, cn, Eyebrow, Field, Select } from "@/components/ui";
import { loadProgress, saveLanguagePrefs } from "@/lib/client/progress";
import { saveDraft } from "@/lib/client/storage";
import { LANGUAGES } from "@/lib/languages";
import {
  currentLevel,
  isUnlocked,
  levelIndex,
  levelScenario,
  MAX_STARS,
  PASS_SCORE,
  streak,
  totalStars,
  UNITS,
  type LanguagePrefs,
  type Level,
  type Progress,
} from "@/lib/levels/path";
import { getPreset } from "@/lib/scenario/presets";
import { LABELS } from "@/lib/scenario/schema";

const FOCUS_ICON: Record<string, LucideIcon> = {
  discovery: MessageCircleQuestion,
  pitch: Megaphone,
  technical: Cpu,
  pricing: CircleDollarSign,
  negotiation: Handshake,
  closing: Trophy,
};

// Horizontal offsets (px) that make the nodes wind left and right down the page.
const WIND = [0, 56, 84, 56, 0, -56, -84, -56];

const langOpts = LANGUAGES.map((l) => ({ value: l.id, label: l.label }));

export default function LevelsPage() {
  const router = useRouter();
  const [progress, setProgress] = useState<Progress | null>(null);
  const [open, setOpen] = useState<string | null>(null);

  useEffect(() => {
    const p = loadProgress();
    setProgress(p);
    setOpen(currentLevel(p)?.id ?? null);
  }, []);

  if (!progress) return null;

  const current = currentLevel(progress);
  const st = streak(progress);
  const langs: LanguagePrefs = { speechLanguage: progress.langs?.speechLanguage ?? "en", coachingLanguage: progress.langs?.coachingLanguage ?? "en" };

  function setLangs(next: Partial<LanguagePrefs>) {
    const merged = { ...langs, ...next };
    saveLanguagePrefs(merged);
    setProgress(loadProgress());
  }

  function play(level: Level) {
    saveDraft(levelScenario(level, langs));
    router.push("/practice/briefing");
  }

  return (
    <div className="mx-auto max-w-3xl px-4 py-10 sm:px-6 lg:py-14">
      <Eyebrow>Levels</Eyebrow>
      <h1 className="mt-2 font-display text-4xl leading-tight sm:text-5xl">From first hello to the hardest close.</h1>
      <p className="mt-3 max-w-xl text-fg-muted">
        Each level is a short call that&apos;s a little harder than the last. Score {PASS_SCORE}+ to earn a star and unlock the next one; 70+ and 85+ earn
        more stars.
      </p>

      <div className="mt-8 grid grid-cols-3 gap-3">
        <Stat icon={<Flame className={cn("h-5 w-5", st.days > 0 ? "text-accent-bright" : "text-fg-subtle")} />} value={st.days} label="Day streak" hint={st.days > 0 && !st.today ? "Practise today to keep it" : undefined} />
        <Stat icon={<Zap className="h-5 w-5 text-mid" />} value={progress.xp} label="XP" />
        <Stat icon={<Crown className="h-5 w-5 text-signal-strong" />} value={`${totalStars(progress)}/${MAX_STARS}`} label="Stars" />
      </div>

      <details className="mt-4 text-sm">
        <summary className="label cursor-pointer text-fg-muted hover:text-fg">Languages for levels</summary>
        <div className="mt-3 grid gap-4 sm:grid-cols-2">
          <Field label="I'll speak in" htmlFor="lvSpeech">
            <Select id="lvSpeech" value={langs.speechLanguage} options={langOpts} onChange={(e) => setLangs({ speechLanguage: e.target.value as LanguagePrefs["speechLanguage"] })} />
          </Field>
          <Field label="Explain my coaching in" htmlFor="lvCoach">
            <Select id="lvCoach" value={langs.coachingLanguage} options={langOpts} onChange={(e) => setLangs({ coachingLanguage: e.target.value as LanguagePrefs["coachingLanguage"] })} />
          </Field>
        </div>
      </details>

      {!current && (
        <Card className="mt-8 p-5 text-center">
          <p className="font-display text-2xl">Every level passed.</p>
          <p className="mt-1 text-sm text-fg-muted">Go back for three stars on each, or build your own scenario.</p>
        </Card>
      )}

      <div className="mt-10 space-y-12">
        {UNITS.map((unit, u) => {
          const unitDone = unit.levels.every((l) => (progress.levels[l.id]?.stars ?? 0) > 0);
          const unitActive = unit.levels.some((l) => l.id === current?.id);
          const unitStars = unit.levels.reduce((s, l) => s + (progress.levels[l.id]?.stars ?? 0), 0);
          return (
            <section key={unit.id} aria-labelledby={`unit-${unit.id}`}>
              <div className={cn("flex items-center justify-between gap-4 rounded-2xl px-5 py-4", unitActive ? "bg-signal-strong text-signal-ink" : unitDone ? "bg-fg text-bg" : "bg-surface-2 text-fg")}>
                <div>
                  <p className="label opacity-80">Unit {u + 1}</p>
                  <h2 id={`unit-${unit.id}`} className="mt-1 text-xl font-medium tracking-[-0.02em]">{unit.title}</h2>
                  <p className="mt-0.5 text-sm opacity-85">{unit.description}</p>
                </div>
                <span className="label shrink-0 tabular opacity-90">★ {unitStars}/{unit.levels.length * 3}</span>
              </div>

              <ol className="mt-8 flex flex-col items-center gap-6">
                {unit.levels.map((level) => {
                  const n = levelIndex(level.id);
                  return (
                    <LevelNode
                      key={level.id}
                      level={level}
                      number={n + 1}
                      offset={WIND[n % WIND.length]}
                      stars={progress.levels[level.id]?.stars ?? 0}
                      best={progress.levels[level.id]?.best}
                      attempts={progress.levels[level.id]?.attempts ?? 0}
                      unlocked={isUnlocked(progress, level.id)}
                      isCurrent={level.id === current?.id}
                      open={open === level.id}
                      onToggle={() => setOpen((o) => (o === level.id ? null : level.id))}
                      onPlay={() => play(level)}
                    />
                  );
                })}
              </ol>
            </section>
          );
        })}
      </div>
    </div>
  );
}

function Stat({ icon, value, label, hint }: { icon: React.ReactNode; value: number | string; label: string; hint?: string }) {
  return (
    <Card className="flex flex-col items-center gap-1 px-2 py-4 text-center">
      {icon}
      <span className="font-display text-3xl tabular">{value}</span>
      <span className="label text-fg-muted">{label}</span>
      {hint && <span className="text-[11px] text-mid">{hint}</span>}
    </Card>
  );
}

function LevelNode({
  level,
  number,
  offset,
  stars,
  best,
  attempts,
  unlocked,
  isCurrent,
  open,
  onToggle,
  onPlay,
}: {
  level: Level;
  number: number;
  offset: number;
  stars: number;
  best?: number;
  attempts: number;
  unlocked: boolean;
  isCurrent: boolean;
  open: boolean;
  onToggle: () => void;
  onPlay: () => void;
}) {
  const preset = getPreset(level.presetId);
  const Icon = !unlocked ? Lock : level.boss ? Crown : stars > 0 ? Check : FOCUS_ICON[level.settings.focus ?? "pitch"] ?? Play;
  const passed = stars > 0;

  return (
    <li className="flex w-full flex-col items-center">
      <div className="flex flex-col items-center transition-transform" style={{ transform: `translateX(${offset}px)` }}>
        {isCurrent && !open && <span className="label mb-2 rounded-full border border-signal/60 bg-bg-raised px-3 py-1 text-signal">Start</span>}
        <div className="relative">
          {isCurrent && <span aria-hidden className="absolute -inset-2 animate-ping rounded-full bg-accent-bright/25 [animation-duration:2s]" />}
          <button
            type="button"
            onClick={onToggle}
            aria-expanded={open}
            aria-label={`Level ${number}: ${level.title}${unlocked ? (passed ? `, ${stars} of 3 stars` : "") : ", locked"}`}
            className={cn(
              "relative grid place-items-center rounded-full border-b-[6px] transition-transform active:translate-y-0.5 active:border-b-2",
              level.boss ? "h-24 w-24" : "h-20 w-20",
              !unlocked
                ? "border-[#bfb4a6] bg-surface-2 text-fg-subtle"
                : passed
                  ? "border-[#8a3518] bg-signal-strong text-signal-ink"
                  : "border-[#2a221b] bg-fg text-bg hover:bg-signal-strong hover:border-[#8a3518]",
              isCurrent && "bg-signal-strong border-[#8a3518] text-signal-ink",
            )}
          >
            <Icon className={level.boss ? "h-9 w-9" : "h-8 w-8"} strokeWidth={2.2} />
          </button>
        </div>
        <Stars value={stars} className="mt-2" />
        <span className={cn("mt-1 max-w-40 text-center text-sm", unlocked ? "text-fg" : "text-fg-subtle")}>{level.title}</span>
      </div>

      {open && (
        <Card className="mt-4 w-full max-w-md p-5" role="region" aria-label={`Level ${number} details`}>
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="label text-fg-subtle">Level {number}{level.boss ? " · Boss" : ""}</p>
              <p className="mt-1 text-lg font-medium">{level.title}</p>
            </div>
            <Stars value={stars} />
          </div>
          <p className="mt-2 text-sm leading-relaxed text-fg-muted">{level.goal}</p>
          {preset && (
            <p className="mt-3 text-sm">
              Client: <span className="text-fg">{preset.scenario.client.name}</span>
              <span className="text-fg-muted"> · {preset.scenario.client.role}, {preset.scenario.client.country}</span>
            </p>
          )}
          <div className="mt-3 flex flex-wrap gap-1.5">
            {level.settings.difficulty && <Badge tone="signal">{LABELS.difficulty[level.settings.difficulty]}</Badge>}
            {level.settings.friendliness && <Badge>{LABELS.friendliness[level.settings.friendliness]}</Badge>}
            {level.settings.focus && <Badge>{LABELS.focus[level.settings.focus]}</Badge>}
            {level.settings.maxTurns && <Badge>~{level.settings.maxTurns} answers</Badge>}
          </div>
          {attempts > 0 && (
            <p className="mt-3 text-xs text-fg-subtle">
              Best score {best} · {attempts} attempt{attempts === 1 ? "" : "s"}
            </p>
          )}
          {unlocked ? (
            <Button className="mt-4 w-full" size="lg" onClick={onPlay}>
              {passed ? (stars < 3 ? "Go for more stars" : "Practise again") : attempts > 0 ? "Try again" : "Start level"}
            </Button>
          ) : (
            <p className="mt-4 flex items-center gap-2 text-sm text-fg-muted">
              <Lock className="h-4 w-4" /> Score {PASS_SCORE}+ on level {number - 1} to unlock.
            </p>
          )}
        </Card>
      )}
    </li>
  );
}
