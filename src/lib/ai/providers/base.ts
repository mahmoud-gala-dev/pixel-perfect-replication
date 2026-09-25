// =====================================================================
// KNOWLEDGE BRAIN — PHASE 4: AI PROVIDER BASE ABSTRACTION
// =====================================================================

import type { AIProvider, AIChatParams, AIChatResponse } from "../types";

export abstract class BaseAIProvider implements AIProvider {
  abstract readonly name: string;

  abstract chat(params: AIChatParams): Promise<AIChatResponse>;

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
