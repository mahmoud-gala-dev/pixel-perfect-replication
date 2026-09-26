// =====================================================================
// KNOWLEDGE BRAIN — OPENROUTER AI PROVIDER
// Multi-model gateway provider (Claude 3.5 Sonnet, GPT-4o, DeepSeek, Llama 3.3)
// =====================================================================

import { BaseAIProvider } from "./base";
import type { AIChatParams, AIChatResponse } from "../types";

export type OpenRouterModel =
  | "anthropic/claude-3.5-sonnet"
  | "openai/gpt-4o"
  | "deepseek/deepseek-chat"
  | "meta-llama/llama-3.3-70b-instruct";

export interface OpenRouterConfig {
  apiKey?: string;
  defaultModel?: OpenRouterModel | string;
  siteUrl?: string;
  siteName?: string;
}

export class OpenRouterProvider extends BaseAIProvider {
  readonly name = "OpenRouter";
  private readonly apiKey: string;
  private readonly defaultModel: string;
  private readonly siteUrl: string;
  private readonly siteName: string;

  constructor(config: OpenRouterConfig = {}) {
    super();
    this.apiKey =
      config.apiKey ??
      (typeof process !== "undefined" ? process.env?.["OPENROUTER_API_KEY"] ?? "" : "");
    this.defaultModel = config.defaultModel ?? "anthropic/claude-3.5-sonnet";
    this.siteUrl =
      config.siteUrl ??
      (typeof window !== "undefined"
        ? window.location.origin
        : "https://knowledgebrain.lovable.app");
    this.siteName = config.siteName ?? "Knowledge Brain";
  }

  isConfigured(): boolean {
    return Boolean(this.apiKey && this.apiKey.trim().length > 0);
  }

  private buildHeaders(): Record<string, string> {
    return {
      "Content-Type": "application/json",
      Authorization: `Bearer ${this.apiKey.trim()}`,
      "HTTP-Referer": this.siteUrl,
      "X-Title": this.siteName,
    };
  }

  async chat(params: AIChatParams): Promise<AIChatResponse> {
    if (!this.isConfigured()) {
      throw new Error(`[${this.name}] API key is not configured. Please add your OpenRouter API key in Settings.`);
    }

    const messages = [];
    if (params.systemPrompt) {
      messages.push({ role: "system", content: params.systemPrompt });
    }
    for (const msg of params.messages) {
      messages.push({ role: msg.role, content: msg.content });
    }

    const model = params.model ?? this.defaultModel;

    const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: this.buildHeaders(),
      body: JSON.stringify({
        model,
        messages,
        temperature: params.temperature ?? 0.3,
        max_tokens: params.maxTokens ?? 2048,
        stream: false,
      }),
    });

    if (!response.ok) {
      const errText = await response.text();
      let errorDetail = errText;
      try {
        const errJson = JSON.parse(errText);
        errorDetail = errJson.error?.message ?? errText;
      } catch {
        // use raw text
      }
      throw new Error(`[${this.name}] Request failed (${response.status}): ${errorDetail}`);
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

    const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: this.buildHeaders(),
      body: JSON.stringify({
        model,
        messages,
        temperature: params.temperature ?? 0.3,
        max_tokens: params.maxTokens ?? 2048,
        stream: true,
      }),
    });

    if (!response.ok) {
      const errText = await response.text();
      throw new Error(`[${this.name}] Stream failed (${response.status}): ${errText}`);
    }

    const reader = response.body?.getReader();
    if (!reader) {
      throw new Error(`[${this.name}] Failed to open response stream.`);
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
            // ignore partial chunk parse errors
          }
        }
      }
    } finally {
      reader.releaseLock();
    }
  }
}
