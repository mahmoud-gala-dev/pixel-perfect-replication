// =====================================================================
// KNOWLEDGE BRAIN — AI PROVIDER CONFIGURATION MANAGER
// Central state, persistent caching, and active switcher for AI Providers
// =====================================================================

import type { AIProvider } from "./types";
import { GeminiProvider, type GeminiModel } from "./providers/gemini";
import { OpenRouterProvider, type OpenRouterModel } from "./providers/openrouter";
import { LovableAIProvider } from "./providers/lovable-ai";
import { MockBrainProvider } from "./providers/mock-brain-provider";

export type AIProviderId = "lovable" | "gemini" | "openrouter";

export interface AIProviderSettings {
  activeProvider: AIProviderId;
  geminiApiKey: string;
  openrouterApiKey: string;
  geminiModel: GeminiModel | string;
  openrouterModel: OpenRouterModel | string;
  lovableModel: string;
  lastTestedAt?: Record<string, string>;
  testStatus?: Record<string, { success: boolean; latencyMs: number; error?: string }>;
}

const STORAGE_KEY = "knowledge_brain_ai_settings_v1";

export const DEFAULT_AI_PROVIDER_SETTINGS: AIProviderSettings = {
  activeProvider: "lovable",
  geminiApiKey: "",
  openrouterApiKey: "",
  geminiModel: "gemini-2.0-flash",
  openrouterModel: "anthropic/claude-3.5-sonnet",
  lovableModel: "lovable-auto-v1",
  lastTestedAt: {},
  testStatus: {},
};

export const GEMINI_AVAILABLE_MODELS: Array<{ id: GeminiModel; label: string; desc: string }> = [
  { id: "gemini-2.0-flash", label: "Gemini 2.0 Flash", desc: "Next-gen ultra fast with state-of-the-art reasoning" },
  { id: "gemini-1.5-pro", label: "Gemini 1.5 Pro", desc: "Complex reasoning with 2M context window" },
  { id: "gemini-1.5-flash", label: "Gemini 1.5 Flash", desc: "High-frequency low-latency everyday tasks" },
];

export const OPENROUTER_AVAILABLE_MODELS: Array<{ id: OpenRouterModel; label: string; desc: string }> = [
  { id: "anthropic/claude-3.5-sonnet", label: "Claude 3.5 Sonnet", desc: "Industry benchmark for deep reasoning and code" },
  { id: "openai/gpt-4o", label: "GPT-4o (OpenAI)", desc: "Flagship multimodal intelligence" },
  { id: "deepseek/deepseek-chat", label: "DeepSeek V3", desc: "Strong reasoning at incredible cost-efficiency" },
  { id: "meta-llama/llama-3.3-70b-instruct", label: "Llama 3.3 70B", desc: "Top open-weights intelligence from Meta" },
];

class AIProviderManagerClass {
  private settings: AIProviderSettings = { ...DEFAULT_AI_PROVIDER_SETTINGS };
  private listeners: Set<(s: AIProviderSettings) => void> = new Set();
  private cachedInstances: Map<string, AIProvider> = new Map();

  constructor() {
    this.loadSettings();
  }

  loadSettings(): AIProviderSettings {
    if (typeof window === "undefined") {
      return this.settings;
    }

    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        this.settings = {
          ...DEFAULT_AI_PROVIDER_SETTINGS,
          ...parsed,
        };
      }
    } catch {
      // Ignore parse failure, keep defaults
    }
    return this.settings;
  }

  getSettings(): AIProviderSettings {
    return { ...this.settings };
  }

  saveSettings(updates: Partial<AIProviderSettings>): AIProviderSettings {
    this.settings = {
      ...this.settings,
      ...updates,
    };

    if (typeof window !== "undefined") {
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(this.settings));
      } catch (err) {
        console.error("Failed to persist AI provider settings to localStorage:", err);
      }
    }

    // Clear cached instances to recreate with updated keys
    this.cachedInstances.clear();

    // Notify listeners
    this.notify();

    return this.getSettings();
  }

  setActiveProvider(providerId: AIProviderId): void {
    this.saveSettings({ activeProvider: providerId });
  }

  getActiveProviderInstance(): AIProvider {
    const { activeProvider, geminiApiKey, openrouterApiKey, geminiModel, openrouterModel, lovableModel } =
      this.settings;

    const cacheKey = `${activeProvider}:${geminiApiKey}:${openrouterApiKey}:${geminiModel}:${openrouterModel}`;
    if (this.cachedInstances.has(cacheKey)) {
      return this.cachedInstances.get(cacheKey)!;
    }

    let instance: AIProvider;

    switch (activeProvider) {
      case "gemini": {
        if (geminiApiKey && geminiApiKey.trim()) {
          instance = new GeminiProvider({
            apiKey: geminiApiKey.trim(),
            defaultModel: geminiModel,
          });
        } else {
          // Fallback if key missing
          instance = new LovableAIProvider({ defaultModel: lovableModel });
        }
        break;
      }

      case "openrouter": {
        if (openrouterApiKey && openrouterApiKey.trim()) {
          instance = new OpenRouterProvider({
            apiKey: openrouterApiKey.trim(),
            defaultModel: openrouterModel,
          });
        } else {
          // Fallback if key missing
          instance = new LovableAIProvider({ defaultModel: lovableModel });
        }
        break;
      }

      case "lovable":
      default: {
        instance = new LovableAIProvider({ defaultModel: lovableModel });
        break;
      }
    }

    this.cachedInstances.set(cacheKey, instance);
    return instance;
  }

  subscribe(listener: (s: AIProviderSettings) => void): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  private notify(): void {
    for (const listener of this.listeners) {
      try {
        listener(this.getSettings());
      } catch (err) {
        console.error("Error in AIProviderManager listener:", err);
      }
    }
  }
}

export const AIProviderManager = new AIProviderManagerClass();
