// =====================================================================
// KNOWLEDGE BRAIN — REAL-TIME TOKEN & PROVIDER COST TRACKER
// Extracts real usage metrics and calculates estimated USD costs
// Supports Session & Cumulative tracking across Gemini, OpenRouter & Lovable AI
// =====================================================================

export interface ModelPricing {
  promptCostPerMillion: number;
  completionCostPerMillion: number;
  displayName: string;
}

/**
 * Standard industry model pricing rates (USD per 1,000,000 tokens).
 */
export const MODEL_PRICING_TABLE: Record<string, ModelPricing> = {
  // Google Gemini
  "gemini-2.0-flash": {
    promptCostPerMillion: 0.10,
    completionCostPerMillion: 0.40,
    displayName: "Gemini 2.0 Flash",
  },
  "gemini-1.5-flash": {
    promptCostPerMillion: 0.075,
    completionCostPerMillion: 0.30,
    displayName: "Gemini 1.5 Flash",
  },
  "gemini-1.5-pro": {
    promptCostPerMillion: 1.25,
    completionCostPerMillion: 5.00,
    displayName: "Gemini 1.5 Pro",
  },

  // OpenRouter / Anthropic / OpenAI / DeepSeek / Meta
  "anthropic/claude-3.5-sonnet": {
    promptCostPerMillion: 3.00,
    completionCostPerMillion: 15.00,
    displayName: "Claude 3.5 Sonnet",
  },
  "openai/gpt-4o": {
    promptCostPerMillion: 2.50,
    completionCostPerMillion: 10.00,
    displayName: "GPT-4o",
  },
  "openai/gpt-4o-mini": {
    promptCostPerMillion: 0.15,
    completionCostPerMillion: 0.60,
    displayName: "GPT-4o Mini",
  },
  "gpt-4o-mini": {
    promptCostPerMillion: 0.15,
    completionCostPerMillion: 0.60,
    displayName: "GPT-4o Mini",
  },
  "claude-3-5-sonnet": {
    promptCostPerMillion: 3.00,
    completionCostPerMillion: 15.00,
    displayName: "Claude 3.5 Sonnet",
  },
  "deepseek/deepseek-chat": {
    promptCostPerMillion: 0.14,
    completionCostPerMillion: 0.28,
    displayName: "DeepSeek V3",
  },
  "meta-llama/llama-3.3-70b-instruct": {
    promptCostPerMillion: 0.40,
    completionCostPerMillion: 0.40,
    displayName: "Llama 3.3 70B",
  },

  // Lovable Native & Fallback Models
  "lovable-auto-v1": {
    promptCostPerMillion: 0.15,
    completionCostPerMillion: 0.60,
    displayName: "Lovable Gateway Auto",
  },
  "brain-assistant-fast": {
    promptCostPerMillion: 0.10,
    completionCostPerMillion: 0.40,
    displayName: "Brain Fast (2.0 Flash)",
  },
  default: {
    promptCostPerMillion: 0.20,
    completionCostPerMillion: 0.80,
    displayName: "Standard LLM",
  },
};

export interface TokenUsageRecordParams {
  provider: string;
  model: string;
  promptTokens: number;
  completionTokens: number;
  latencyMs?: number;
}

export interface ProviderUsageStats {
  totalTokens: number;
  promptTokens: number;
  completionTokens: number;
  estimatedCostUsd: number;
  requestCount: number;
}

export interface TokenUsageSummary {
  totalTokens: number;
  promptTokens: number;
  completionTokens: number;
  totalCostUsd: number;
  sessionTokens: number;
  sessionCostUsd: number;
  requestCount: number;
  byProvider: Record<string, ProviderUsageStats>;
  lastResetAt: string;
}

const STORAGE_KEY = "knowledge_brain_token_usage_v1";

// In-memory session tracking
let inMemorySessionTokens = 0;
let inMemorySessionCost = 0;

export class TokenCostTracker {
  /**
   * Resolves model pricing configuration by key or prefix.
   */
  static getModelPricing(modelName?: string): ModelPricing {
    if (!modelName) return MODEL_PRICING_TABLE["default"];

    const normalized = modelName.trim().toLowerCase();
    if (MODEL_PRICING_TABLE[normalized]) {
      return MODEL_PRICING_TABLE[normalized];
    }

    // Match partial names (e.g. "gemini-2.0-flash" in "models/gemini-2.0-flash")
    for (const [key, val] of Object.entries(MODEL_PRICING_TABLE)) {
      if (key !== "default" && normalized.includes(key.toLowerCase())) {
        return val;
      }
    }

    return MODEL_PRICING_TABLE["default"];
  }

  /**
   * Calculates USD cost for given prompt and completion tokens.
   */
  static calculateCost(model: string, promptTokens: number, completionTokens: number): number {
    const pricing = this.getModelPricing(model);
    const promptCost = (promptTokens / 1_000_000) * pricing.promptCostPerMillion;
    const completionCost = (completionTokens / 1_000_000) * pricing.completionCostPerMillion;
    return Number((promptCost + completionCost).toFixed(6));
  }

  /**
   * Formats a USD amount into human-friendly currency display.
   * e.g. "$0.0008", "<$0.0001", "$1.24"
   */
  static formatCost(usd: number): string {
    if (usd <= 0) return "$0.00";
    if (usd < 0.0001) return "<$0.0001";
    if (usd < 0.01) return `$${usd.toFixed(4)}`;
    return `$${usd.toFixed(3)}`;
  }

  /**
   * Formats token count (e.g. 420, 1.2k, 2.5M).
   */
  static formatTokens(tokens: number): string {
    if (tokens >= 1_000_000) return `${(tokens / 1_000_000).toFixed(1)}M`;
    if (tokens >= 1_000) return `${(tokens / 1_000).toFixed(1)}k`;
    return `${Math.round(tokens)}`;
  }

  /**
   * Estimates token count from raw text using the standard heuristic (words * 1.3).
   */
  static estimateTokensFromText(text: string): number {
    if (!text || !text.trim()) return 0;
    const words = text.trim().split(/\s+/).length;
    return Math.round(words * 1.3);
  }

  /**
   * Loads cumulative token usage summary from local storage.
   */
  static getUsageSummary(): TokenUsageSummary {
    const emptySummary: TokenUsageSummary = {
      totalTokens: 0,
      promptTokens: 0,
      completionTokens: 0,
      totalCostUsd: 0,
      sessionTokens: inMemorySessionTokens,
      sessionCostUsd: inMemorySessionCost,
      requestCount: 0,
      byProvider: {},
      lastResetAt: new Date().toISOString(),
    };

    if (typeof window === "undefined" || !window.localStorage) {
      return emptySummary;
    }

    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return emptySummary;
      const parsed = JSON.parse(raw);

      return {
        totalTokens: parsed.totalTokens || 0,
        promptTokens: parsed.promptTokens || 0,
        completionTokens: parsed.completionTokens || 0,
        totalCostUsd: parsed.totalCostUsd || 0,
        sessionTokens: inMemorySessionTokens,
        sessionCostUsd: inMemorySessionCost,
        requestCount: parsed.requestCount || 0,
        byProvider: parsed.byProvider || {},
        lastResetAt: parsed.lastResetAt || new Date().toISOString(),
      };
    } catch {
      return emptySummary;
    }
  }

  /**
   * Records a new AI interaction into persistent storage and updates session counters.
   */
  static recordUsage(params: TokenUsageRecordParams): void {
    const { provider, model, promptTokens, completionTokens } = params;
    const totalTokens = promptTokens + completionTokens;
    const cost = this.calculateCost(model, promptTokens, completionTokens);

    // Update in-memory session
    inMemorySessionTokens += totalTokens;
    inMemorySessionCost = Number((inMemorySessionCost + cost).toFixed(6));

    if (typeof window === "undefined" || !window.localStorage) return;

    try {
      const summary = this.getUsageSummary();
      summary.totalTokens += totalTokens;
      summary.promptTokens += promptTokens;
      summary.completionTokens += completionTokens;
      summary.totalCostUsd = Number((summary.totalCostUsd + cost).toFixed(6));
      summary.requestCount += 1;

      // Group by provider
      const provKey = provider || "Lovable AI";
      if (!summary.byProvider[provKey]) {
        summary.byProvider[provKey] = {
          totalTokens: 0,
          promptTokens: 0,
          completionTokens: 0,
          estimatedCostUsd: 0,
          requestCount: 0,
        };
      }

      summary.byProvider[provKey].totalTokens += totalTokens;
      summary.byProvider[provKey].promptTokens += promptTokens;
      summary.byProvider[provKey].completionTokens += completionTokens;
      summary.byProvider[provKey].estimatedCostUsd = Number(
        (summary.byProvider[provKey].estimatedCostUsd + cost).toFixed(6),
      );
      summary.byProvider[provKey].requestCount += 1;

      localStorage.setItem(STORAGE_KEY, JSON.stringify(summary));

      // Notify reactive listeners
      window.dispatchEvent(
        new CustomEvent("knowledge-brain:token-usage-updated", {
          detail: { summary, lastRecord: params },
        }),
      );
    } catch (e) {
      console.warn("[TokenCostTracker] Failed to record token usage:", e);
    }
  }

  /**
   * Resets all persistent usage counters and session stats.
   */
  static resetUsage(): void {
    inMemorySessionTokens = 0;
    inMemorySessionCost = 0;

    if (typeof window === "undefined" || !window.localStorage) return;

    const freshSummary: TokenUsageSummary = {
      totalTokens: 0,
      promptTokens: 0,
      completionTokens: 0,
      totalCostUsd: 0,
      sessionTokens: 0,
      sessionCostUsd: 0,
      requestCount: 0,
      byProvider: {},
      lastResetAt: new Date().toISOString(),
    };

    localStorage.setItem(STORAGE_KEY, JSON.stringify(freshSummary));

    window.dispatchEvent(
      new CustomEvent("knowledge-brain:token-usage-updated", {
        detail: { summary: freshSummary },
      }),
    );
  }
}
