// =====================================================================
// KNOWLEDGE BRAIN — PHASE 4: OPENAI-COMPATIBLE AI PROVIDER
// =====================================================================

import { BaseAIProvider } from "./base";
import type { AIChatParams, AIChatResponse } from "../types";

export interface OpenAICompatibleConfig {
  apiKey?: string;
  baseUrl?: string;
  defaultModel?: string;
  providerName?: string;
}

export class OpenAICompatibleProvider extends BaseAIProvider {
  readonly name: string;
  private readonly apiKey: string;
  private readonly baseUrl: string;
  private readonly defaultModel: string;

  constructor(config: OpenAICompatibleConfig = {}) {
    super();
    this.name = config.providerName ?? "OpenAI-Compatible";
    this.apiKey = config.apiKey ?? (typeof process !== "undefined" ? process.env?.["OPENAI_API_KEY"] ?? "" : "");
    this.baseUrl = config.baseUrl ?? (typeof process !== "undefined" ? process.env?.["OPENAI_BASE_URL"] ?? "https://api.openai.com/v1" : "https://api.openai.com/v1");
    this.defaultModel = config.defaultModel ?? "gpt-4o-mini";
  }

  isConfigured(): boolean {
    return Boolean(this.apiKey && this.apiKey.trim().length > 0);
  }

  async chat(params: AIChatParams): Promise<AIChatResponse> {
    if (!this.isConfigured()) {
      throw new Error(`[${this.name}] API key is not configured.`);
    }

    const messages = [];
    if (params.systemPrompt) {
      messages.push({ role: "system", content: params.systemPrompt });
    }
    for (const msg of params.messages) {
      messages.push({ role: msg.role, content: msg.content });
    }

    const model = params.model ?? this.defaultModel;

    const response = await fetch(`${this.baseUrl.replace(/\/+$/, "")}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify({
        model,
        messages,
        temperature: params.temperature ?? 0.3,
        max_tokens: params.maxTokens ?? 2000,
        stream: false,
      }),
    });

    if (!response.ok) {
      const errText = await response.text();
      throw new Error(`[${this.name}] Request failed (${response.status}): ${errText}`);
    }

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content ?? "";

    return {
      content,
      model,
      provider: this.name,
      finishReason: data.choices?.[0]?.finish_reason ?? "stop",
      usage: {
        promptTokens: data.usage?.prompt_tokens,
        completionTokens: data.usage?.completion_tokens,
        totalTokens: data.usage?.total_tokens,
      },
    };
  }

  override async *streamChat(params: AIChatParams): AsyncIterable<string> {
    if (!this.isConfigured()) {
      throw new Error(`[${this.name}] API key is not configured.`);
    }

    const messages = [];
    if (params.systemPrompt) {
      messages.push({ role: "system", content: params.systemPrompt });
    }
    for (const msg of params.messages) {
      messages.push({ role: msg.role, content: msg.content });
    }

    const model = params.model ?? this.defaultModel;

    const response = await fetch(`${this.baseUrl.replace(/\/+$/, "")}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify({
        model,
        messages,
        temperature: params.temperature ?? 0.3,
        max_tokens: params.maxTokens ?? 2000,
        stream: true,
      }),
    });

    if (!response.ok) {
      const errText = await response.text();
      throw new Error(`[${this.name}] Stream failed (${response.status}): ${errText}`);
    }

    const reader = response.body?.getReader();
    if (!reader) {
      throw new Error("Failed to open response stream.");
    }

    const decoder = new TextDecoder();
    let buffer = "";

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";

        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed.startsWith("data: ")) continue;
          const payload = trimmed.slice(6);
          if (payload === "[DONE]") return;

          try {
            const parsed = JSON.parse(payload);
            const delta = parsed.choices?.[0]?.delta?.content;
            if (delta) {
              yield delta;
            }
          } catch {
            // Ignore parse errors on partial chunks
          }
        }
      }
    } finally {
      reader.releaseLock();
    }
  }
}
