// =====================================================================
// KNOWLEDGE BRAIN — AI PROVIDER VALIDATOR ENGINE
// Live test connection & balance/quota validation for Gemini & OpenRouter
// =====================================================================

export interface ProviderValidationResult {
  success: boolean;
  latencyMs: number;
  error?: string;
  details?: Record<string, unknown>;
}

/**
 * Tests an API key against the provider's live endpoint.
 * Returns success status, measured roundtrip latency, and formatted error if rejected.
 */
export async function testProviderKey(
  provider: "openrouter" | "gemini",
  apiKey: string,
): Promise<ProviderValidationResult> {
  const trimmedKey = apiKey.trim();
  if (!trimmedKey) {
    return {
      success: false,
      latencyMs: 0,
      error: "API key cannot be empty",
    };
  }

  const startTime = Date.now();

  if (provider === "gemini") {
    try {
      const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${encodeURIComponent(trimmedKey)}`;
      const response = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          contents: [{ role: "user", parts: [{ text: "ping" }] }],
          generationConfig: { maxOutputTokens: 2 },
        }),
      });

      const latencyMs = Date.now() - startTime;

      if (response.ok) {
        return {
          success: true,
          latencyMs,
        };
      }

      const errText = await response.text();
      let errorMsg = `HTTP ${response.status}`;
      try {
        const errJson = JSON.parse(errText);
        errorMsg = errJson.error?.message || errorMsg;
      } catch {
        errorMsg = errText.slice(0, 200) || errorMsg;
      }

      return {
        success: false,
        latencyMs,
        error: errorMsg,
      };
    } catch (err: unknown) {
      return {
        success: false,
        latencyMs: Date.now() - startTime,
        error: err instanceof Error ? err.message : "Network error connecting to Google Gemini",
      };
    }
  }

  if (provider === "openrouter") {
    try {
      // 1. Try OpenRouter official auth verification endpoint
      const authKeyUrl = "https://openrouter.ai/api/v1/auth/key";
      const keyResponse = await fetch(authKeyUrl, {
        method: "GET",
        headers: {
          Authorization: `Bearer ${trimmedKey}`,
        },
      });

      const latencyMs = Date.now() - startTime;

      if (keyResponse.ok) {
        let details: Record<string, unknown> | undefined;
        try {
          const keyData = await keyResponse.json();
          details = keyData?.data;
        } catch {
          // ignore json parse error
        }
        return {
          success: true,
          latencyMs,
          ...(details ? { details } : {}),
        };
      }

      // If unauthorized, return specific error
      if (keyResponse.status === 401 || keyResponse.status === 403) {
        const errText = await keyResponse.text();
        let errorMsg = "Invalid API key or unauthorized";
        try {
          const errJson = JSON.parse(errText);
          errorMsg = errJson.error?.message || errorMsg;
        } catch {
          // fallback
        }
        return {
          success: false,
          latencyMs,
          error: errorMsg,
        };
      }

      // 2. Fallback to minimal chat completion probe if auth endpoint failed for another reason
      const chatResponse = await fetch("https://openrouter.ai/api/v1/chat/completions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${trimmedKey}`,
          "HTTP-Referer": typeof window !== "undefined" ? window.location.origin : "https://knowledgebrain.lovable.app",
          "X-Title": "Knowledge Brain",
        },
        body: JSON.stringify({
          model: "openai/gpt-4o-mini",
          messages: [{ role: "user", content: "hi" }],
          max_tokens: 1,
        }),
      });

      const fallbackLatency = Date.now() - startTime;

      if (chatResponse.ok) {
        return {
          success: true,
          latencyMs: fallbackLatency,
        };
      }

      const errText = await chatResponse.text();
      let errorMsg = `HTTP ${chatResponse.status}`;
      try {
        const errJson = JSON.parse(errText);
        errorMsg = errJson.error?.message || errorMsg;
      } catch {
        // fallback
      }

      return {
        success: false,
        latencyMs: fallbackLatency,
        error: errorMsg,
      };
    } catch (err: unknown) {
      return {
        success: false,
        latencyMs: Date.now() - startTime,
        error: err instanceof Error ? err.message : "Network error connecting to OpenRouter",
      };
    }
  }

  return {
    success: false,
    latencyMs: 0,
    error: `Unsupported provider: ${provider}`,
  };
}
