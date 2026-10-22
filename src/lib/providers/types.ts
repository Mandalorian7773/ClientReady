import type { z } from "zod";

/** Speech-to-text. Implemented by Gnani Prisma. */
export interface TranscriptionProvider {
  readonly id: string;
  readonly label: string;
  transcribe(input: { audio: Uint8Array; mimeType: string; languageCode: string; biasWords?: string[] }): Promise<{
    transcript: string;
    requestId?: string;
  }>;
}

/** Text-to-speech. Implemented by Gnani Timbre. */
export interface SynthesisProvider {
  readonly id: string;
  readonly label: string;
  synthesize(input: { text: string; voice: string; language: string; speed?: number }): Promise<{
    audio: Uint8Array;
    contentType: string;
  }>;
}

export interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

/** Reasoning (LLM). Implemented by Anthropic, an OpenAI-compatible server (e.g. self-hosted Evon), or the demo engine. */
export interface ReasoningProvider {
  readonly id: string;
  readonly label: string;
  readonly isDemo: boolean;
  generateJSON<T>(input: {
    purpose: "client-turn" | "coach-report";
    system: string;
    messages: ChatMessage[];
    schema: z.ZodType<T>;
    schemaName: string;
    maxTokens: number;
  }): Promise<T>;
}
