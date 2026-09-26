// =====================================================================
// KNOWLEDGE BRAIN — REACT HOOK FOR AI PROVIDER MANAGEMENT
// Reactive binding to AIProviderManager state across components
// =====================================================================

import { useState, useEffect, useCallback } from "react";
import {
  AIProviderManager,
  type AIProviderId,
  type AIProviderSettings,
} from "@/lib/ai/provider-manager";
import { testProviderKey, type ProviderValidationResult } from "@/lib/ai/providers/provider-validator";
import { AIGateway } from "@/lib/ai/gateway";

export function useAIProvider() {
  const [settings, setSettings] = useState<AIProviderSettings>(() => AIProviderManager.getSettings());
  const [isValidating, setIsValidating] = useState(false);

  useEffect(() => {
    // Initial sync
    setSettings(AIProviderManager.getSettings());

    // Subscribe to changes
    const unsubscribe = AIProviderManager.subscribe((newSettings) => {
      setSettings(newSettings);
      // Synchronize with AIGateway
      AIGateway.setProvider(AIProviderManager.getActiveProviderInstance());
    });

    return unsubscribe;
  }, []);

  const switchProvider = useCallback((providerId: AIProviderId) => {
    AIProviderManager.setActiveProvider(providerId);
    AIGateway.setProvider(AIProviderManager.getActiveProviderInstance());
  }, []);

  const updateSettings = useCallback((updates: Partial<AIProviderSettings>) => {
    AIProviderManager.saveSettings(updates);
    AIGateway.setProvider(AIProviderManager.getActiveProviderInstance());
  }, []);

  const testKey = useCallback(
    async (provider: "gemini" | "openrouter", apiKey: string): Promise<ProviderValidationResult> => {
      setIsValidating(true);
      try {
        const result = await testProviderKey(provider, apiKey);
        // Save test status in settings
        const currentTestStatus = { ...settings.testStatus };
        currentTestStatus[provider] = result;
        const currentTestedAt = { ...settings.lastTestedAt };
        currentTestedAt[provider] = new Date().toISOString();

        updateSettings({
          testStatus: currentTestStatus,
          lastTestedAt: currentTestedAt,
        });

        return result;
      } finally {
        setIsValidating(false);
      }
    },
    [settings, updateSettings],
  );

  return {
    settings,
    activeProvider: settings.activeProvider,
    activeInstance: AIProviderManager.getActiveProviderInstance(),
    isValidating,
    switchProvider,
    updateSettings,
    testKey,
  };
}
