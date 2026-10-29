import { getPreset } from "@/lib/scenario/presets";
import { parseScenario, type Scenario, type SimSettings } from "@/lib/scenario/schema";

/**
 * The level path: a fixed sequence of calls that gets harder unit by unit,
 * Duolingo-style. Each level reuses a preset client and offer but changes the
 * difficulty, attitude and focus, so the learner climbs from a friendly
 * discovery chat to a demanding negotiation.
 *
 * Pure data and pure functions only; persistence lives in lib/client/progress.
 */

export interface Level {
  id: string;
  title: string;
  /** One line telling the learner what this level is about. */
  goal: string;
  presetId: string;
  settings: Partial<SimSettings>;
  boss?: boolean;
}

export interface Unit {
  id: string;
  title: string;
  description: string;
  levels: Level[];
}

export const UNITS: Unit[] = [
  {
    id: "u1",
    title: "First conversations",
    description: "Listen before you pitch. Friendly clients, short calls.",
    levels: [
      {
        id: "u1-hello",
        title: "Say hello",
        goal: "Open the call warmly and ask three good questions about the client's problem.",
        presetId: "discovery-hinglish",
        settings: { difficulty: "beginner", friendliness: "friendly", focus: "discovery", maxTurns: 6, opening: "client-explains" },
      },
      {
        id: "u1-ask",
        title: "Ask, don't tell",
        goal: "Find out what missed calls actually cost the clinic before you mention your offer.",
        presetId: "ai-receptionist-clinic",
        settings: { difficulty: "beginner", friendliness: "friendly", focus: "discovery", maxTurns: 6, opening: "client-explains" },
      },
      {
        id: "u1-pitch",
        title: "Your first pitch",
        goal: "Pitch your offer in plain English, tied to the problem the client just described.",
        presetId: "ai-receptionist-clinic",
        settings: { difficulty: "beginner", friendliness: "neutral", focus: "pitch", maxTurns: 8, opening: "client-explains" },
      },
    ],
  },
  {
    id: "u2",
    title: "Selling the outcome",
    description: "Talk about results, not features. The clients start asking why.",
    levels: [
      {
        id: "u2-outcomes",
        title: "Outcomes over features",
        goal: "Sell more cake orders, not a WordPress rebuild.",
        presetId: "website-redesign-uk",
        settings: { difficulty: "beginner", friendliness: "neutral", focus: "pitch", maxTurns: 8, opening: "client-explains" },
      },
      {
        id: "u2-simple",
        title: "Explain it simply",
        goal: "Explain how a voice AI works to someone who dislikes jargon.",
        presetId: "ai-receptionist-clinic",
        settings: { difficulty: "intermediate", friendliness: "neutral", focus: "technical", maxTurns: 8, opening: "client-explains" },
      },
      {
        id: "u2-onthespot",
        title: "Pitch on the spot",
        goal: "A sceptical owner asks you to pitch right away. Make it crisp.",
        presetId: "website-redesign-uk",
        settings: { difficulty: "intermediate", friendliness: "sceptical", focus: "pitch", maxTurns: 10, opening: "pitch-now" },
      },
    ],
  },
  {
    id: "u3",
    title: "Talking money",
    description: "State your price with confidence and handle the first push-back.",
    levels: [
      {
        id: "u3-price",
        title: "Say your price",
        goal: "Anchor on value, then state your fee clearly without apologising.",
        presetId: "discovery-hinglish",
        settings: { difficulty: "intermediate", friendliness: "neutral", focus: "pricing", maxTurns: 8, opening: "client-explains" },
      },
      {
        id: "u3-expensive",
        title: "“That's expensive”",
        goal: "The client was quoted far less last year. Defend the gap without discounting first.",
        presetId: "website-redesign-uk",
        settings: { difficulty: "intermediate", friendliness: "sceptical", focus: "pricing", maxTurns: 10, opening: "pitch-now" },
      },
      {
        id: "u3-hold",
        title: "Hold your rate",
        goal: "Trade scope for price instead of just dropping your fee.",
        presetId: "consulting-negotiation",
        settings: { difficulty: "intermediate", friendliness: "neutral", focus: "negotiation", maxTurns: 10, opening: "pitch-now" },
      },
    ],
  },
  {
    id: "u4",
    title: "Tough rooms",
    description: "Expert clients, hard questions and a real close.",
    levels: [
      {
        id: "u4-technical",
        title: "Technical grilling",
        goal: "A CTO tests your architecture, evaluation and failure modes.",
        presetId: "ai-automation-startup",
        settings: { difficulty: "advanced", friendliness: "neutral", focus: "technical", maxTurns: 10, opening: "client-explains" },
      },
      {
        id: "u4-scope",
        title: "Scope creep",
        goal: "A demanding director keeps adding work. Protect your scope and your fee.",
        presetId: "consulting-negotiation",
        settings: { difficulty: "advanced", friendliness: "demanding", focus: "negotiation", maxTurns: 12, opening: "pitch-now" },
      },
      {
        id: "u4-close",
        title: "Ask for the deal",
        goal: "Handle the last objections and agree a concrete next step.",
        presetId: "ai-automation-startup",
        settings: { difficulty: "advanced", friendliness: "sceptical", focus: "closing", maxTurns: 12, opening: "client-explains" },
      },
      {
        id: "u4-boss",
        title: "Boss level",
        goal: "Expert difficulty, demanding client, and you need a signed next step.",
        presetId: "consulting-negotiation",
        settings: { difficulty: "expert", friendliness: "demanding", focus: "closing", maxTurns: 12, opening: "pitch-now" },
        boss: true,
      },
    ],
  },
];

/** All levels in play order. */
export const LEVELS: Level[] = UNITS.flatMap((u) => u.levels);

const LEVEL_PREFIX = "level:";

/** Score needed to pass a level (1 star) and unlock the next one. */
export const PASS_SCORE = 50;
export const MAX_STARS = LEVELS.length * 3;

export function starsFor(score: number | null | undefined): number {
  if (score == null || !Number.isFinite(score)) return 0;
  if (score >= 85) return 3;
  if (score >= 70) return 2;
  if (score >= PASS_SCORE) return 1;
  return 0;
}

/** XP for one scored session: something for showing up, more for doing well. */
export function xpFor(score: number): number {
  return 10 + 5 * starsFor(score);
}

export function levelIndex(id: string): number {
  return LEVELS.findIndex((l) => l.id === id);
}

export function getLevel(id: string): Level | undefined {
  return LEVELS.find((l) => l.id === id);
}

export function unitOf(levelId: string): { unit: Unit; unitNumber: number } | undefined {
  const i = UNITS.findIndex((u) => u.levels.some((l) => l.id === levelId));
  return i < 0 ? undefined : { unit: UNITS[i], unitNumber: i + 1 };
}

/** The level a scenario was started from, if any. */
export function levelIdOf(scenario: Pick<Scenario, "id">): string | null {
  if (!scenario.id.startsWith(LEVEL_PREFIX)) return null;
  const id = scenario.id.slice(LEVEL_PREFIX.length);
  return getLevel(id) ? id : null;
}

export interface LanguagePrefs {
  speechLanguage: Scenario["learner"]["speechLanguage"];
  coachingLanguage: Scenario["learner"]["coachingLanguage"];
}

/** Build the playable scenario for a level, using the learner's own languages. */
export function levelScenario(level: Level, langs?: Partial<LanguagePrefs>): Scenario {
  const preset = getPreset(level.presetId);
  if (!preset) throw new Error(`Level ${level.id} uses unknown preset ${level.presetId}`);
  const n = levelIndex(level.id) + 1;
  return parseScenario({
    ...preset.scenario,
    id: `${LEVEL_PREFIX}${level.id}`,
    title: `Level ${n} · ${level.title}`,
    learner: {
      ...preset.scenario.learner,
      speechLanguage: langs?.speechLanguage ?? "en",
      coachingLanguage: langs?.coachingLanguage ?? "en",
      goals: level.goal,
    },
    settings: { ...preset.scenario.settings, ...level.settings },
  });
}

/* ------------------------------------------------------------------ */
/* Progress                                                            */
/* ------------------------------------------------------------------ */

export interface LevelRecord {
  best: number;
  stars: number;
  attempts: number;
}

/** What one scored session earned. Kept so the report can show it again later. */
export interface SessionResult {
  sessionId: string;
  levelId: string | null;
  score: number;
  xp: number;
  stars: number;
  /** Stars the level had before this session. */
  prevStars: number;
  /** The level this session unlocked, if it was the first pass. */
  unlocked: string | null;
}

export interface Progress {
  levels: Record<string, LevelRecord>;
  xp: number;
  /** Local calendar days (YYYY-MM-DD) with at least one scored session, newest last. */
  days: string[];
  results: SessionResult[];
  langs?: Partial<LanguagePrefs>;
}

export const EMPTY_PROGRESS: Progress = { levels: {}, xp: 0, days: [], results: [] };

const MAX_DAYS = 400;
const MAX_RESULTS = 200;

export function isUnlocked(progress: Progress, levelId: string): boolean {
  const i = levelIndex(levelId);
  if (i <= 0) return i === 0;
  return (progress.levels[LEVELS[i - 1].id]?.stars ?? 0) > 0;
}

/** The first unlocked level without a pass, or null when every level is passed. */
export function currentLevel(progress: Progress): Level | null {
  return LEVELS.find((l) => isUnlocked(progress, l.id) && !(progress.levels[l.id]?.stars > 0)) ?? null;
}

export function totalStars(progress: Progress): number {
  return LEVELS.reduce((sum, l) => sum + (progress.levels[l.id]?.stars ?? 0), 0);
}

/** Local calendar day, e.g. "2026-10-29". */
export function localDay(ts: number): string {
  const d = new Date(ts);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function prevDay(day: string): string {
  const [y, m, d] = day.split("-").map(Number);
  return localDay(new Date(y, m - 1, d - 1, 12).getTime());
}

/** Consecutive practice days ending today, or yesterday if today isn't done yet. */
export function streak(progress: Progress, now = Date.now()): { days: number; today: boolean } {
  const set = new Set(progress.days);
  const today = localDay(now);
  let day = set.has(today) ? today : prevDay(today);
  let n = 0;
  while (set.has(day)) {
    n++;
    day = prevDay(day);
  }
  return { days: n, today: set.has(today) };
}

/**
 * Apply one scored session. Idempotent per session id: re-saving a session
 * (or regenerating its report) never awards XP twice or lowers a best score.
 */
export function applyResult(
  progress: Progress,
  input: { sessionId: string; scenarioId: string; score: number; at: number },
): { progress: Progress; result: SessionResult } {
  const existing = progress.results.find((r) => r.sessionId === input.sessionId);
  if (existing) return { progress, result: existing };

  const score = Math.max(0, Math.min(100, Math.round(input.score)));
  const levelId = levelIdOf({ id: input.scenarioId });
  const stars = starsFor(score);
  const xp = xpFor(score);
  const levels = { ...progress.levels };
  let prevStars = 0;
  let unlocked: string | null = null;

  if (levelId) {
    const before = levels[levelId] ?? { best: 0, stars: 0, attempts: 0 };
    prevStars = before.stars;
    levels[levelId] = { best: Math.max(before.best, score), stars: Math.max(before.stars, stars), attempts: before.attempts + 1 };
    const next = LEVELS[levelIndex(levelId) + 1];
    if (prevStars === 0 && stars > 0 && next) unlocked = next.id;
  }

  const day = localDay(input.at);
  const days = progress.days.includes(day) ? progress.days : [...progress.days, day].sort().slice(-MAX_DAYS);
  const result: SessionResult = { sessionId: input.sessionId, levelId, score, xp, stars, prevStars, unlocked };

  return {
    progress: { ...progress, levels, xp: progress.xp + xp, days, results: [...progress.results, result].slice(-MAX_RESULTS) },
    result,
  };
}
