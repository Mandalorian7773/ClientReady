import "server-only";
import { NextResponse } from "next/server";
import { ZodError } from "zod";
import { AppError, isAppError } from "./errors";
import { checkRateLimit, clientKey } from "./rate-limit";
import { getEnv } from "./env";

export interface ApiErrorBody {
  error: { code: string; message: string; retryable: boolean };
}

export function errorResponse(err: unknown): NextResponse<ApiErrorBody> {
  if (isAppError(err)) {
    return NextResponse.json({ error: { code: err.code, message: err.message, retryable: err.retryable } }, { status: err.status });
  }
  if (err instanceof ZodError) {
    const first = err.issues[0];
    return NextResponse.json(
      { error: { code: "bad_request", message: `Invalid input${first ? ` at ${first.path.join(".") || "root"}: ${first.message}` : ""}.`, retryable: false } },
      { status: 400 },
    );
  }
  // Log the class/name only; never the full error which may embed request data.
  console.error("[api] unexpected error:", err instanceof Error ? `${err.name}: ${err.message.slice(0, 200)}` : typeof err);
  return NextResponse.json({ error: { code: "upstream_error", message: "Something went wrong. Please try again.", retryable: true } }, { status: 500 });
}

/** Wrap a route handler with rate limiting and uniform error responses. */
export function handler(name: string, fn: (req: Request) => Promise<Response>, opts: { weight?: number } = {}) {
  return async (req: Request): Promise<Response> => {
    try {
      const limit = getEnv().rateLimitPerMinute;
      const key = `${name}:${clientKey(req)}`;
      for (let i = 0; i < (opts.weight ?? 1); i++) {
        if (!checkRateLimit(key, limit)) {
          throw new AppError("rate_limited", "You're going a little fast. Please wait a few seconds and try again.", 429, true);
        }
      }
      return await fn(req);
    } catch (err) {
      return errorResponse(err);
    }
  };
}

export async function readJson(req: Request, maxBytes = 200_000): Promise<unknown> {
  const len = Number(req.headers.get("content-length") ?? 0);
  if (len > maxBytes) throw new AppError("bad_request", "Request is too large.", 413);
  const text = await req.text();
  if (text.length > maxBytes) throw new AppError("bad_request", "Request is too large.", 413);
  try {
    return JSON.parse(text);
  } catch {
    throw new AppError("bad_request", "Request body must be JSON.");
  }
}
