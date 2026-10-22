import { z } from "zod";
import type { ChatMessage, ReasoningProvider } from "../types";
import { AppError } from "@/lib/server/errors";
import { fetchWithRetry } from "@/lib/server/http";
import { parseModelJSON } from "./json";

/**
 * Any server exposing the OpenAI-style /chat/completions API, e.g. Gnani Evon
 * v3.3 open weights served with vLLM or SGLang. The UI label comes from
 * OPENAI_COMPAT_LABEL and is never assumed to be Evon.
 */
export class OpenAICompatibleReasoning implements ReasoningProvider {
  readonly id = "openai-compatible";
  readonly isDemo = false;

  constructor(
    private opts: { baseUrl: string; apiKey?: string; model: string; label: string; fetchImpl?: typeof fetch },
  ) {}

  get label() {
    return this.opts.label;
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
    const jsonSchema = z.toJSONSchema(schema);
    const sys = `${system}\n\nRespond with a single JSON object that matches this JSON Schema exactly. No prose, no code fences.\n${JSON.stringify(jsonSchema)}`;
    const res = await fetchWithRetry(
      `${this.opts.baseUrl.replace(/\/$/, "")}/chat/completions`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(this.opts.apiKey ? { Authorization: `Bearer ${this.opts.apiKey}` } : {}),
        },
        body: JSON.stringify({
          model: this.opts.model,
          max_tokens: maxTokens,
          temperature: purpose === "client-turn" ? 0.7 : 0.3,
          response_format: { type: "json_object" },
          messages: [{ role: "system", content: sys }, ...messages],
        }),
      },
      { timeoutMs: purpose === "client-turn" ? 45_000 : 120_000, attempts: 2, fetchImpl: this.opts.fetchImpl },
    );
    if (!res.ok) {
      if (res.status === 401 || res.status === 403) throw new AppError("auth_failed", "The reasoning server rejected the API key.", 502);
      if (res.status === 429) throw new AppError("rate_limited", "The reasoning server is rate-limited.", 429, true);
      throw new AppError("upstream_error", `Reasoning server error (HTTP ${res.status}).`, 502, res.status >= 500);
    }
    const body = (await res.json().catch(() => null)) as { choices?: Array<{ message?: { content?: string } }> } | null;
    const content = body?.choices?.[0]?.message?.content;
    if (!content) throw new AppError("model_output_invalid", "The reasoning server returned no content.", 502, true);
    return parseModelJSON(content, schema);
  }
}
