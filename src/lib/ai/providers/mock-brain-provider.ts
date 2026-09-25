// =====================================================================
// KNOWLEDGE BRAIN — PHASE 4: DETERMINISTIC / LOCAL BRAIN PROVIDER
// =====================================================================

import { BaseAIProvider } from "./base";
import type { AIChatParams, AIChatResponse } from "../types";

export class MockBrainProvider extends BaseAIProvider {
  readonly name = "KnowledgeBrain-Local";

  async chat(params: AIChatParams): Promise<AIChatResponse> {
    const lastUserMessage = [...params.messages].reverse().find((m) => m.role === "user")?.content ?? "";
    const systemPrompt = params.systemPrompt ?? "";
    const hasBrainContext = systemPrompt.includes("STRUCTURED BRAIN CONTEXT (READ-ONLY)");

    let responseText = "";

    if (lastUserMessage.toLowerCase().includes("hello") || lastUserMessage.toLowerCase().includes("hi")) {
      responseText = "Hello! I am the conversational interface for your Knowledge Brain. You can ask me questions about your stored concepts, relationships, and claims, or explore new topics.";
    } else if (hasBrainContext) {
      // Grounded response using retrieved Brain context
      const match = systemPrompt.match(/STRUCTURED BRAIN CONTEXT \(READ-ONLY\)[^:]*:\s*([\s\S]*?)={20,}/i);
      const contextSnippet = match ? match[1]?.trim() ?? "" : "";
      
      responseText = `Based on the verified knowledge currently recorded in your Knowledge Brain:\n\n${contextSnippet}\n\nThis information represents the active canonical record in your knowledge graph.`;
    } else {
      // No Brain context found
      responseText = `Regarding **${lastUserMessage}**:\n\nThis topic is not currently indexed in your Knowledge Brain. While I can discuss it based on general knowledge, no verified canonical concepts, atomic claims, or graph relations exist for it in your database yet.\n\n*(In Phase 5, you will be able to review and extract structured claims from our conversations directly into the Brain).*`;
    }

    return {
      content: responseText,
      model: params.model ?? "brain-local-1.0",
      provider: this.name,
      finishReason: "stop",
      usage: {
        promptTokens: Math.ceil(lastUserMessage.length / 4) + 50,
        completionTokens: Math.ceil(responseText.length / 4),
        totalTokens: Math.ceil((lastUserMessage.length + responseText.length) / 4) + 50,
      },
    };
  }

  override async *streamChat(params: AIChatParams): AsyncIterable<string> {
    const res = await this.chat(params);
    const chunks = res.content.split(/(\s+)/);
    for (const chunk of chunks) {
      yield chunk;
      await new Promise((resolve) => setTimeout(resolve, 15));
    }
  }
}
