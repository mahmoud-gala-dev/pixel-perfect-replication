// =====================================================================
// KNOWLEDGE BRAIN — GOOGLE GEMINI AI PROVIDER
// Direct integration supporting Gemini 2.0 Flash, 1.5 Pro, and 1.5 Flash
// =====================================================================

import { BaseAIProvider } from "./base";
import type { AIChatParams, AIChatResponse, ChatMessage } from "../types";

export type GeminiModel = "gemini-2.0-flash" | "gemini-1.5-pro" | "gemini-1.5-flash";

export interface GeminiConfig {
  apiKey?: string;
  defaultModel?: GeminiModel | string;
}

export class GeminiProvider extends BaseAIProvider {
  readonly name = "Google Gemini";
  private readonly apiKey: string;
  private readonly defaultModel: string;

  constructor(config: GeminiConfig = {}) {
    super();
    this.apiKey =
      config.apiKey ??
      (typeof process !== "undefined"
        ? process.env?.["GEMINI_API_KEY"] ?? process.env?.["GOOGLE_API_KEY"] ?? ""
        : "");
    this.defaultModel = config.defaultModel ?? "gemini-2.0-flash";
  }

  isConfigured(): boolean {
    return Boolean(this.apiKey && this.apiKey.trim().length > 0);
  }

  /**
   * Formats chat messages into Gemini API content payload format.
   * Merges consecutive messages with the same role to conform to Gemini API requirements.
   */
  private formatContents(messages: ChatMessage[]) {
    const contents: Array<{ role: "user" | "model"; parts: Array<{ text: string }> }> = [];

    for (const msg of messages) {
      if (msg.role === "system") continue; // system handled separately via systemInstruction
      const role = msg.role === "assistant" ? "model" : "user";
      const text = msg.content || "";

      if (!text.trim()) continue;

      const last = contents[contents.length - 1];
      if (last && last.role === role) {
        last.parts.push({ text });
      } else {
        contents.push({
          role,
          parts: [{ text }],
        });
      }
    }

    // Ensure contents starts with a user message if non-empty
    if (contents.length > 0 && contents[0]?.role === "model") {
      contents.unshift({ role: "user", parts: [{ text: "Hello" }] });
    }

    return contents;
  }

  async chat(params: AIChatParams): Promise<AIChatResponse> {
    if (!this.isConfigured()) {
      throw new Error(`[${this.name}] API key is not configured. Please add your Gemini API key in Settings.`);
    }

    const model = params.model ?? this.defaultModel;
    const contents = this.formatContents(params.messages);

    const body: Record<string, unknown> = {
      contents,
      generationConfig: {
        temperature: params.temperature ?? 0.3,
        maxOutputTokens: params.maxTokens ?? 2048,
      },
    };

    if (params.systemPrompt?.trim()) {
      body["systemInstruction"] = {
        parts: [{ text: params.systemPrompt.trim() }],
      };
    }

    const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(this.apiKey)}`;

    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
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
    const candidate = data.candidates?.[0];
    const content =
      candidate?.content?.parts
        ?.map((p: { text?: string }) => p.text ?? "")
        .join("") ?? "";

    const usage = data.usageMetadata
      ? {
          promptTokens: data.usageMetadata.promptTokenCount,
          completionTokens: data.usageMetadata.candidatesTokenCount,
          totalTokens: data.usageMetadata.totalTokenCount,
        }
      : undefined;

    return {
      content,
      model,
      provider: this.name,
      finishReason: candidate?.finishReason ?? "STOP",
      usage,
    };
  }

  override async *streamChat(params: AIChatParams): AsyncIterable<string> {
    if (!this.isConfigured()) {
      throw new Error(`[${this.name}] API key is not configured.`);
    }

    const model = params.model ?? this.defaultModel;
    const contents = this.formatContents(params.messages);

    const body: Record<string, unknown> = {
      contents,
      generationConfig: {
        temperature: params.temperature ?? 0.3,
        maxOutputTokens: params.maxTokens ?? 2048,
      },
    };

    if (params.systemPrompt?.trim()) {
      body["systemInstruction"] = {
        parts: [{ text: params.systemPrompt.trim() }],
      };
    }

    const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:streamGenerateContent?alt=sse&key=${encodeURIComponent(this.apiKey)}`;

    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
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
            const candidate = parsed.candidates?.[0];
            const textParts = candidate?.content?.parts?.map((p: { text?: string }) => p.text ?? "").join("");
            if (textParts) {
              yield textParts;
            }
          } catch {
            // Partial chunk or empty payload
          }
        }
      }
    } finally {
      reader.releaseLock();
    }
  }
}
