import { describe, expect, it } from "vitest";
import {
  applyResult,
  currentLevel,
  EMPTY_PROGRESS,
  isUnlocked,
  levelIdOf,
  LEVELS,
  levelScenario,
  localDay,
  starsFor,
  streak,
  totalStars,
  type Progress,
} from "@/lib/levels/path";
import { getPreset } from "@/lib/scenario/presets";

const DAY = 86_400_000;
const NOON = new Date(2026, 9, 29, 12).getTime();

function play(p: Progress, levelId: string, score: number, sessionId = `s_${levelId}_${score}`, at = NOON) {
  return applyResult(p, { sessionId, scenarioId: `level:${levelId}`, score, at });
}

describe("level path", () => {
  it("every level points at a real preset and builds a valid scenario", () => {
    expect(new Set(LEVELS.map((l) => l.id)).size).toBe(LEVELS.length);
    for (const l of LEVELS) {
      expect(getPreset(l.presetId)).toBeDefined();
      const s = levelScenario(l);
      expect(levelIdOf(s)).toBe(l.id);
      expect(s.learner.speechLanguage).toBe("en");
      if (l.settings.difficulty) expect(s.settings.difficulty).toBe(l.settings.difficulty);
    }
  });

  it("uses the learner's languages, not the preset's", () => {
    const hinglish = LEVELS.find((l) => l.presetId === "discovery-hinglish")!;
    expect(levelScenario(hinglish).learner.coachingLanguage).toBe("en");
    expect(levelScenario(hinglish, { speechLanguage: "ta", coachingLanguage: "ta" }).learner.speechLanguage).toBe("ta");
  });

  it("maps scores to stars", () => {
    expect([null, 0, 49, 50, 69, 70, 84, 85, 100].map(starsFor)).toEqual([0, 0, 0, 1, 1, 2, 2, 3, 3]);
  });

  it("only unlocks the first level at the start", () => {
    expect(isUnlocked(EMPTY_PROGRESS, LEVELS[0].id)).toBe(true);
    expect(isUnlocked(EMPTY_PROGRESS, LEVELS[1].id)).toBe(false);
    expect(currentLevel(EMPTY_PROGRESS)?.id).toBe(LEVELS[0].id);
  });

  it("unlocks the next level on a pass, not on a fail", () => {
    const failed = play(EMPTY_PROGRESS, LEVELS[0].id, 40);
    expect(failed.result).toMatchObject({ stars: 0, unlocked: null, xp: 10 });
    expect(isUnlocked(failed.progress, LEVELS[1].id)).toBe(false);

    const passed = play(failed.progress, LEVELS[0].id, 72);
    expect(passed.result).toMatchObject({ stars: 2, prevStars: 0, unlocked: LEVELS[1].id, xp: 20 });
    expect(isUnlocked(passed.progress, LEVELS[1].id)).toBe(true);
    expect(currentLevel(passed.progress)?.id).toBe(LEVELS[1].id);
    expect(passed.progress.levels[LEVELS[0].id]).toEqual({ best: 72, stars: 2, attempts: 2 });
  });

  it("keeps the best score and never re-announces an unlock", () => {
    let p = play(EMPTY_PROGRESS, LEVELS[0].id, 90).progress;
    const again = play(p, LEVELS[0].id, 55);
    p = again.progress;
    expect(again.result.unlocked).toBeNull();
    expect(p.levels[LEVELS[0].id]).toMatchObject({ best: 90, stars: 3 });
    expect(totalStars(p)).toBe(3);
  });

  it("is idempotent per session", () => {
    const first = play(EMPTY_PROGRESS, LEVELS[0].id, 80, "same");
    const second = play(first.progress, LEVELS[0].id, 80, "same");
    expect(second.progress).toBe(first.progress);
    expect(second.progress.xp).toBe(first.progress.xp);
  });

  it("gives XP but no stars for custom scenarios", () => {
    const { progress, result } = applyResult(EMPTY_PROGRESS, { sessionId: "c", scenarioId: "custom", score: 90, at: NOON });
    expect(result.levelId).toBeNull();
    expect(progress.xp).toBe(25);
    expect(totalStars(progress)).toBe(0);
  });

  it("counts a streak of consecutive days", () => {
    let p = EMPTY_PROGRESS;
    for (const [i, d] of [3, 2, 1, 0].entries()) p = play(p, LEVELS[0].id, 60, `d${i}`, NOON - d * DAY).progress;
    expect(streak(p, NOON)).toEqual({ days: 4, today: true });
    // Tomorrow, before practising, the streak is still alive.
    expect(streak(p, NOON + DAY)).toEqual({ days: 4, today: false });
    // Missing a whole day breaks it.
    expect(streak(p, NOON + 2 * DAY).days).toBe(0);
    expect(p.days.at(-1)).toBe(localDay(NOON));
  });
});
