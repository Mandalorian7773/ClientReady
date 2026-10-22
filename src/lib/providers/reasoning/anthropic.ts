import Anthropic from "@anthropic-ai/sdk";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import type { z } from "zod";
import type { ChatMessage, ReasoningProvider } from "../types";
import { AppError } from "@/lib/server/errors";

/** Models that accept the server-side refusal fallback (`fallbacks: "default"`). */
const FALLBACK_MODELS = ["claude-opus-5-5", "claude-opus-5", "claude-fable-5-1", "claude-sonnet-5-5"];

/**
 * Claude via the official Anthropic SDK, using structured outputs
 * (output_config.format) so every response is schema-validated JSON.
 */
export class AnthropicReasoning implements ReasoningProvider {
  readonly id = "anthropic";
  readonly isDemo = false;
  readonly label: string;
  private client: Anthropic;

  constructor(private opts: { apiKey: string; clientModel: string; coachModel: string; client?: Anthropic }) {
    // SDK retries 408/409/429/5xx twice by default; keep that but cap time per call.
    this.client = opts.client ?? new Anthropic({ apiKey: opts.apiKey, maxRetries: 2, timeout: 60_000 });
    this.label = `Anthropic Claude (${opts.clientModel})`;
  }

  async generateJSON<T>({
    purpose,
    system,
    messages,
    schema,
    maxTokens,
  }: {
    purpose: "client-turn" | "coach-report";
    system: string;
    messages: ChatMessage[];
    schema: z.ZodType<T>;
    schemaName: string;
    maxTokens: number;
  }): Promise<T> {
    const model = purpose === "client-turn" ? this.opts.clientModel : this.opts.coachModel;
    const useFallback = FALLBACK_MODELS.includes(model);
    try {
      const response = await this.client.beta.messages.parse(
        {
          model,
          max_tokens: maxTokens,
          system,
          messages,
          // Client turns are latency-sensitive chat; the coaching report benefits from more reasoning.
          output_config: { effort: purpose === "client-turn" ? "low" : "medium", format: betaZodOutputFormat(schema) },
          ...(useFallback ? { betas: ["server-side-fallback-2026-07-01"], fallbacks: "default" as const } : {}),
        },
        { timeout: purpose === "client-turn" ? 45_000 : 120_000 },
      );
      if (response.stop_reason === "refusal") {
        throw new AppError("model_output_invalid", "The reasoning model declined this request. Try rephrasing your last turn.", 502);
      }
      if (response.stop_reason === "max_tokens") {
        throw new AppError("model_output_invalid", "The reasoning model ran out of space. Please retry.", 502, true);
      }
      if (!response.parsed_output) {
        throw new AppError("model_output_invalid", "The reasoning model returned an unreadable response. Please retry.", 502, true);
      }
      return response.parsed_output as T;
    } catch (err) {
      if (err instanceof AppError) throw err;
      if (err instanceof Anthropic.AuthenticationError) {
        throw new AppError("auth_failed", "The Anthropic API key was rejected. Check ANTHROPIC_API_KEY.", 502);
      }
      if (err instanceof Anthropic.RateLimitError) {
        throw new AppError("rate_limited", "The reasoning model is rate-limited. Wait a moment and retry.", 429, true);
      }
      if (err instanceof Anthropic.APIConnectionTimeoutError) {
        throw new AppError("timeout", "The reasoning model timed out. Please retry.", 504, true);
      }
      if (err instanceof Anthropic.BadRequestError) {
        throw new AppError("upstream_error", `The reasoning model rejected the request: ${err.message.slice(0, 200)}`, 502);
      }
      if (err instanceof Anthropic.APIError) {
        throw new AppError("upstream_error", `Reasoning model error (${err.status ?? "network"}). Please retry.`, 502, true);
      }
      throw new AppError("model_output_invalid", "The reasoning model returned an invalid response. Please retry.", 502, true);
    }
  }
}
