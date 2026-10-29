"use client";

import { applyResult, EMPTY_PROGRESS, type LanguagePrefs, type Progress, type SessionResult } from "@/lib/levels/path";
import type { SavedSession } from "./storage";

/**
 * Level-path progress (stars, XP, streak). Like session history it lives only
 * in this browser, but in its own key so deleting history keeps your levels.
 */

const PROGRESS_KEY = "clientready.progress.v1";

export function loadProgress(): Progress {
  try {
    const raw = localStorage.getItem(PROGRESS_KEY);
    if (!raw) return EMPTY_PROGRESS;
    const p = JSON.parse(raw) as Partial<Progress>;
    return {
      levels: p.levels && typeof p.levels === "object" ? p.levels : {},
      xp: typeof p.xp === "number" ? p.xp : 0,
      days: Array.isArray(p.days) ? p.days.filter((d) => typeof d === "string") : [],
      results: Array.isArray(p.results) ? p.results.filter((r) => r && typeof r.sessionId === "string") : [],
      langs: p.langs,
    };
  } catch {
    return EMPTY_PROGRESS;
  }
}

function saveProgress(p: Progress) {
  try {
    localStorage.setItem(PROGRESS_KEY, JSON.stringify(p));
  } catch {
    /* storage full or blocked: progress is a nicety, never break the call flow */
  }
}

/** Count a scored practice session towards XP, streak and level stars. The sample call never counts. */
export function recordSession(session: SavedSession): SessionResult | null {
  const score = session.report?.overall;
  if (session.sample || score == null) return null;
  const { progress, result } = applyResult(loadProgress(), {
    sessionId: session.id,
    scenarioId: session.scenario.id,
    score,
    at: session.report?.createdAt ?? session.createdAt,
  });
  saveProgress(progress);
  return result;
}

export function getSessionResult(sessionId: string): SessionResult | undefined {
  return loadProgress().results.find((r) => r.sessionId === sessionId);
}

export function saveLanguagePrefs(langs: LanguagePrefs) {
  saveProgress({ ...loadProgress(), langs });
}
