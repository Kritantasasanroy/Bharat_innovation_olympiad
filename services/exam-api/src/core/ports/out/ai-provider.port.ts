import type { ZodSchema } from "zod";

/**
 * Token usage from an AI provider call.
 */
export interface AiUsage {
	promptTokens: number;
	completionTokens: number;
}

/**
 * Parameters for text generation.
 */
export interface GenerateTextParams {
	prompt: string;
	systemPrompt?: string | undefined;
	maxTokens?: number | undefined;
	temperature?: number | undefined;
}

/**
 * Result of text generation.
 */
export interface GenerateTextResult {
	text: string;
	usage: AiUsage;
}

/**
 * Parameters for structured output generation.
 */
export interface GenerateStructuredOutputParams<T> {
	prompt: string;
	systemPrompt?: string | undefined;
	schema: ZodSchema<T>;
}

/**
 * Result of structured output generation.
 */
export interface GenerateStructuredOutputResult<T> {
	data: T;
	usage: AiUsage;
}

/**
 * Output port for AI/LLM provider calls.
 *
 * All LLM interactions go through this port. The concrete provider
 * (Google, OpenAI, Anthropic) is configured via environment variables
 * and swappable without touching core logic.
 */
export interface AiProviderPort {
	generateText(params: GenerateTextParams): Promise<GenerateTextResult>;

	generateStructuredOutput<T>(
		params: GenerateStructuredOutputParams<T>,
	): Promise<GenerateStructuredOutputResult<T>>;
}
