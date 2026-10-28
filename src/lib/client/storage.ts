"use client";

import { parseScenario, safeParseScenario, type Scenario } from "@/lib/scenario/schema";
import type { ClientState, Turn } from "@/lib/sim/types";
import type { CoachReport } from "@/lib/coach/report";

/**
 * Local-first persistence. Session history lives only in this browser's
 * localStorage: no account, no server database, and no audio is ever stored.
 */

const DRAFT_KEY = "clientready.draft.v1";
const SESSIONS_KEY = "clientready.sessions.v1";
const MAX_SESSIONS = 50;

export interface SavedSession {
  id: string;
  createdAt: number;
  scenario: Scenario;
  turns: Turn[];
  clientState: ClientState;
  report: CoachReport | null;
  generatedBy: string;
  isDemo: boolean;
  /** The scripted sample call (not a real practice session). */
  sample?: boolean;
}

function safeGet(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function safeSet(key: string, value: string): boolean {
  try {
    localStorage.setItem(key, value);
    return true;
  } catch {
    return false;
  }
}

export function loadDraft(): Scenario | null {
  const raw = safeGet(DRAFT_KEY);
  if (!raw) return null;
  try {
    const parsed = safeParseScenario(JSON.parse(raw));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

export function saveDraft(s: Scenario) {
  safeSet(DRAFT_KEY, JSON.stringify(parseScenario(s)));
}

export function listSessions(): SavedSession[] {
  const raw = safeGet(SESSIONS_KEY);
  if (!raw) return [];
  try {
    const arr = JSON.parse(raw);
    return Array.isArray(arr) ? (arr as SavedSession[]).filter((s) => s && typeof s.id === "string") : [];
  } catch {
    return [];
  }
}

export function getSession(id: string): SavedSession | undefined {
  return listSessions().find((s) => s.id === id);
}

export function saveSession(session: SavedSession): boolean {
  const others = listSessions().filter((s) => s.id !== session.id);
  const next = [session, ...others].sort((a, b) => b.createdAt - a.createdAt).slice(0, MAX_SESSIONS);
  return safeSet(SESSIONS_KEY, JSON.stringify(next));
}

export function deleteSession(id: string) {
  safeSet(SESSIONS_KEY, JSON.stringify(listSessions().filter((s) => s.id !== id)));
}

export function deleteAllSessions() {
  try {
    localStorage.removeItem(SESSIONS_KEY);
  } catch {
    /* ignore */
  }
}

export function newSessionId(): string {
  const rnd = typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID().replace(/-/g, "") : Math.random().toString(36).slice(2) + Date.now().toString(36);
  return `s_${rnd.slice(0, 20)}`;
}
