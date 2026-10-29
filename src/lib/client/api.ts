"use client";

import type { Scenario } from "@/lib/scenario/schema";
import type { ClientState, Turn } from "@/lib/sim/types";
import type { CoachReport } from "@/lib/coach/report";
import type { ExplainInput, Explanation } from "@/lib/coach/explain";
import type { PublicStatus } from "@/lib/server/env";
import type { VoiceMetrics } from "@/lib/voice/delivery";

export class ApiError extends Error {
  constructor(
    public code: string,
    message: string,
    public retryable: boolean,
    public status: number,
  ) {
    super(message);
  }
}

async function asError(res: Response): Promise<ApiError> {
  try {
    const body = (await res.json()) as { error?: { code: string; message: string; retryable: boolean } };
    if (body.error) return new ApiError(body.error.code, body.error.message, body.error.retryable, res.status);
  } catch {
    /* fall through */
  }
  return new ApiError("upstream_error", `Request failed (HTTP ${res.status}).`, res.status >= 500, res.status);
}

async function post<T>(url: string, body: unknown, signal?: AbortSignal): Promise<T> {
  let res: Response;
  try {
    res = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body), signal });
  } catch (e) {
    if ((e as Error).name === "AbortError") throw e;
    throw new ApiError("network", "You appear to be offline. Check your connection and retry.", true, 0);
  }
  if (!res.ok) throw await asError(res);
  return (await res.json()) as T;
}

/** Provider status plus whether a live call can start right now. */
export type AppStatus = PublicStatus & {
  live_available: boolean;
  live_reason: "paused" | "daily_limit" | "visitor_limit" | null;
  per_visitor_limit: number;
};

export async function getStatus(): Promise<AppStatus> {
  const res = await fetch("/api/status", { cache: "no-store" });
  if (!res.ok) throw await asError(res);
  return res.json();
}

export interface TurnResponse {
  reply: string;
  state: ClientState;
  learnerEnglish?: string;
  generatedBy: string;
  isDemo: boolean;
  replayed: boolean;
}

export function requestClientTurn(
  payload: { sessionId: string; scenario: Scenario; turns: Turn[]; clientState: ClientState | null },
  signal?: AbortSignal,
) {
  return post<TurnResponse>("/api/turn", payload, signal);
}

export function requestReport(payload: { sessionId: string; scenario: Scenario; turns: Turn[]; clientState: ClientState; voice?: VoiceMetrics | null }) {
  return post<CoachReport>("/api/report", payload);
}

export function requestExplanation(payload: ExplainInput & { sessionId: string }) {
  return post<Explanation>("/api/explain", payload);
}

export interface SttResponse {
  transcript: string;
  durationSec: number;
  provider: string;
  languageCode: string;
  requestId?: string;
}

/** Claims a live-call slot. Throws an ApiError (code live_*) when none is available. */
export function claimLiveSession(sessionId: string) {
  return post<{ ok: true }>("/api/session", { sessionId });
}

export async function transcribe(wav: Blob, language: string, bias: string[], sessionId: string): Promise<SttResponse> {
  const form = new FormData();
  form.append("sessionId", sessionId);
  form.append("audio", wav, "utterance.wav");
  form.append("language", language);
  form.append("bias", JSON.stringify(bias.slice(0, 100)));
  let res: Response;
  try {
    res = await fetch("/api/stt", { method: "POST", body: form });
  } catch {
    throw new ApiError("network", "You appear to be offline. Check your connection and retry.", true, 0);
  }
  if (!res.ok) throw await asError(res);
  return res.json();
}

export async function synthesize(input: {
  text: string;
  kind: "client" | "coach";
  gender?: "female" | "male";
  language?: string;
  seed?: number;
  sessionId: string;
}): Promise<{ url: string; voice: string | null }> {
  let res: Response;
  try {
    res = await fetch("/api/tts", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(input) });
  } catch {
    throw new ApiError("network", "Could not reach the voice service.", true, 0);
  }
  if (!res.ok) throw await asError(res);
  const blob = await res.blob();
  return { url: URL.createObjectURL(blob), voice: res.headers.get("X-TTS-Voice") };
}
