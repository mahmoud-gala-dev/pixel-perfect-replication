// =====================================================================
// KNOWLEDGE BRAIN — PHASE 4: AI PROVIDER BASE ABSTRACTION
// =====================================================================

import type { AIProvider, AIChatParams, AIChatResponse } from "../types";

export abstract class BaseAIProvider implements AIProvider {
  abstract readonly name: string;

  abstract chat(params: AIChatParams): Promise<AIChatResponse>;

  /**
   * Estimates token count using standard word-ratio heuristic (words * 1.3)
   */
  estimateTokensFromText(text: string): number {
    if (!text || !text.trim()) return 0;
    const words = text.trim().split(/\s+/).length;
    return Math.round(words * 1.3);
  }

  /**
   * Normalizes token usage extracting prompt and completion tokens.
   */
  normalizeTokenUsage(
    promptText: string,
    completionText: string,
    rawUsage?: { promptTokens?: number; completionTokens?: number; totalTokens?: number },
  ) {
    const promptTokens =
      rawUsage?.promptTokens ?? this.estimateTokensFromText(promptText);
    const completionTokens =
      rawUsage?.completionTokens ?? this.estimateTokensFromText(completionText);
    const totalTokens = rawUsage?.totalTokens ?? promptTokens + completionTokens;

    return { promptTokens, completionTokens, totalTokens };
  }

  async *streamChat(params: AIChatParams): AsyncIterable<string> {
    // Default fallback streaming: yield complete response in chunks
    const response = await this.chat({ ...params, stream: false });
    const words = response.content.split(" ");
    for (const word of words) {
      yield word + " ";
      await new Promise((resolve) => setTimeout(resolve, 20));
    }
  }
}

