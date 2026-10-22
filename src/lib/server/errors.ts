/**
 * Typed application errors. `code` is stable and safe to show the browser;
 * `message` is user-facing and must never contain secrets or raw upstream bodies.
 */
export type AppErrorCode =
  | "not_configured"
  | "auth_failed"
  | "credits_exhausted"
  | "rate_limited"
  | "bad_audio"
  | "audio_too_long"
  | "empty_transcript"
  | "bad_request"
  | "upstream_error"
  | "timeout"
  | "model_output_invalid"
  | "duplicate_turn"
  | "session_limit";

export class AppError extends Error {
  constructor(
    public code: AppErrorCode,
    message: string,
    public status = 400,
    public retryable = false,
  ) {
    super(message);
    this.name = "AppError";
  }
}

export function isAppError(e: unknown): e is AppError {
  return e instanceof AppError;
}

/**
 * Map a Gnani HTTP status to an AppError. Per docs: 400 bad params/audio,
 * 401 bad key, 403 key/org/credits, 429 rate limit, 500/503 transient.
 */
export function gnaniStatusToError(service: "Prisma" | "Timbre", status: number, upstreamMessage?: string): AppError {
  const detail = upstreamMessage ? ` (${upstreamMessage.slice(0, 160)})` : "";
  switch (status) {
    case 400:
      return new AppError("bad_request", `Gnani ${service} rejected the request${detail}.`, 400);
    case 401:
      return new AppError("auth_failed", `Gnani ${service}: the API key was rejected. Check GNANI_API_KEY.`, 502);
    case 403:
      return new AppError(
        "credits_exhausted",
        `Gnani ${service} refused access. Your key, organisation status or credits may need attention in app.gnani.ai/voice.`,
        402,
      );
    case 429:
      return new AppError("rate_limited", `Gnani ${service} is rate-limiting requests. Wait a moment and try again.`, 429, true);
    case 500:
    case 502:
    case 503:
    case 504:
      return new AppError("upstream_error", `Gnani ${service} is temporarily unavailable. Please retry.`, 503, true);
    default:
      return new AppError("upstream_error", `Gnani ${service} returned HTTP ${status}${detail}.`, 502, status >= 500);
  }
}
