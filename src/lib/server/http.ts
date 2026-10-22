import { AppError } from "./errors";

export interface RetryOptions {
  timeoutMs: number;
  /** Total attempts including the first. Kept small: these calls cost credits. */
  attempts?: number;
  /** Status codes considered retryable. */
  retryOn?: number[];
  baseDelayMs?: number;
  fetchImpl?: typeof fetch;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * fetch with a hard timeout and bounded exponential backoff, retrying only on
 * network errors and explicitly retryable statuses (never on 4xx other than 429).
 */
export async function fetchWithRetry(url: string, init: RequestInit, opts: RetryOptions): Promise<Response> {
  const attempts = Math.max(1, Math.min(opts.attempts ?? 2, 3));
  const retryOn = opts.retryOn ?? [429, 500, 502, 503, 504];
  const doFetch = opts.fetchImpl ?? fetch;
  let lastError: unknown;

  for (let i = 0; i < attempts; i++) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), opts.timeoutMs);
    try {
      const res = await doFetch(url, { ...init, signal: controller.signal });
      clearTimeout(timer);
      if (retryOn.includes(res.status) && i < attempts - 1) {
        lastError = res;
        await sleep((opts.baseDelayMs ?? 400) * 2 ** i);
        continue;
      }
      return res;
    } catch (err) {
      clearTimeout(timer);
      lastError = err;
      if (i < attempts - 1) {
        await sleep((opts.baseDelayMs ?? 400) * 2 ** i);
        continue;
      }
    }
  }

  if (lastError instanceof Response) return lastError;
  if (lastError instanceof Error && lastError.name === "AbortError") {
    throw new AppError("timeout", "The speech service took too long to respond. Please try again.", 504, true);
  }
  throw new AppError("upstream_error", "Could not reach the speech service. Check your connection and retry.", 502, true);
}

/** Extract a short, safe error message from a Gnani JSON error body. */
export async function readUpstreamMessage(res: Response): Promise<string | undefined> {
  try {
    const text = await res.text();
    try {
      const json = JSON.parse(text) as { error?: { message?: string } | string; message?: string; detail?: unknown };
      if (typeof json.error === "object" && json.error?.message) return json.error.message;
      if (typeof json.error === "string") return json.error;
      if (json.message) return json.message;
      if (typeof json.detail === "string") return json.detail;
    } catch {
      return text.slice(0, 160);
    }
  } catch {
    /* ignore */
  }
  return undefined;
}
