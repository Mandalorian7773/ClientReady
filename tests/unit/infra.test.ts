import { describe, expect, it, vi } from "vitest";
import { once, clearIdempotency } from "@/lib/server/idempotency";
import { checkRateLimit, resetRateLimits } from "@/lib/server/rate-limit";
import { fetchWithRetry } from "@/lib/server/http";
import { gnaniStatusToError } from "@/lib/server/errors";
import { asData, escapeHtml } from "@/lib/sim/sanitize";

describe("idempotency", () => {
  it("runs a key once and replays the result", async () => {
    clearIdempotency();
    const fn = vi.fn(async () => 42);
    const a = once("k1", fn);
    const b = once("k1", fn);
    expect(await a.value).toBe(42);
    expect(await b.value).toBe(42);
    expect(b.replayed).toBe(true);
    expect(fn).toHaveBeenCalledOnce();
  });

  it("lets a failed attempt be retried", async () => {
    clearIdempotency();
    const first = once("k2", async () => {
      throw new Error("boom");
    });
    await expect(first.value).rejects.toThrow("boom");
    await Promise.resolve();
    const second = once("k2", async () => "ok");
    expect(second.replayed).toBe(false);
    expect(await second.value).toBe("ok");
  });
});

describe("rate limiter", () => {
  it("allows up to the limit within the window, then blocks, then recovers", () => {
    resetRateLimits();
    const t = 1_000_000;
    expect(checkRateLimit("ip", 2, 60_000, t)).toBe(true);
    expect(checkRateLimit("ip", 2, 60_000, t + 1)).toBe(true);
    expect(checkRateLimit("ip", 2, 60_000, t + 2)).toBe(false);
    expect(checkRateLimit("ip", 2, 60_000, t + 61_000)).toBe(true);
  });
});

describe("fetchWithRetry", () => {
  it("caps attempts at 3 even if asked for more", async () => {
    const f = vi.fn(async () => new Response("", { status: 503 }));
    const res = await fetchWithRetry("https://x", {}, { timeoutMs: 100, attempts: 10, baseDelayMs: 1, fetchImpl: f as unknown as typeof fetch });
    expect(res.status).toBe(503);
    expect(f).toHaveBeenCalledTimes(3);
  });

  it("never retries a 400", async () => {
    const f = vi.fn(async () => new Response("", { status: 400 }));
    await fetchWithRetry("https://x", {}, { timeoutMs: 100, attempts: 3, baseDelayMs: 1, fetchImpl: f as unknown as typeof fetch });
    expect(f).toHaveBeenCalledOnce();
  });

  it("retries network errors then reports a typed error", async () => {
    const f = vi.fn(async () => {
      throw new TypeError("fetch failed");
    });
    await expect(fetchWithRetry("https://x", {}, { timeoutMs: 100, attempts: 2, baseDelayMs: 1, fetchImpl: f as unknown as typeof fetch })).rejects.toMatchObject({ code: "upstream_error" });
    expect(f).toHaveBeenCalledTimes(2);
  });
});

describe("error mapping and sanitising", () => {
  it("never echoes long upstream bodies", () => {
    const e = gnaniStatusToError("Prisma", 400, "x".repeat(1000));
    expect(e.message.length).toBeLessThan(260);
  });

  it("strips control chars and delimiters, and truncates", () => {
    expect(asData("a\u0000b<tag>c")).toBe("ab‹tag›c");
    expect(asData("x".repeat(20), 5)).toBe("xxxxx…");
  });

  it("escapes HTML", () => {
    expect(escapeHtml(`<img src=x onerror="alert(1)">`)).toBe("&lt;img src=x onerror=&quot;alert(1)&quot;&gt;");
  });
});
