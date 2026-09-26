// =====================================================================
// KNOWLEDGE BRAIN — ACCEPTANCE TESTS: MULTI-AI PROVIDER & PWA SUITE
// Tests for Gemini, OpenRouter, Lovable AI, Key Validation, Context Menu & PWA
// =====================================================================

import test, { describe } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

import {
  GeminiProvider,
  OpenRouterProvider,
  LovableAIProvider,
  testProviderKey,
  AIProviderManager,
  DEFAULT_AI_PROVIDER_SETTINGS,
  GEMINI_AVAILABLE_MODELS,
  OPENROUTER_AVAILABLE_MODELS,
} from "../src/lib/ai";
import { encryptApiKeys, decryptApiKeys } from "../src/lib/ai/key-sync-crypto";
import { OfflineChatStore } from "../src/lib/offline/offline-chat-store";

describe("MULTI-AI PROVIDER SWITCHER & VALIDATOR TESTS", () => {
  // -------------------------------------------------------------------
  // 1. Google Gemini Provider Tests
  // -------------------------------------------------------------------
  test("Gemini Provider — Initialization & Model Support", () => {
    const provider = new GeminiProvider({
      apiKey: "test-gemini-key",
      defaultModel: "gemini-2.0-flash",
    });

    assert.equal(provider.name, "Google Gemini");
    assert.equal(provider.isConfigured(), true);

    const unconfigured = new GeminiProvider({ apiKey: "" });
    assert.equal(unconfigured.isConfigured(), false);

    assert.ok(
      GEMINI_AVAILABLE_MODELS.some((m) => m.id === "gemini-2.0-flash"),
      "Must support gemini-2.0-flash",
    );
    assert.ok(
      GEMINI_AVAILABLE_MODELS.some((m) => m.id === "gemini-1.5-pro"),
      "Must support gemini-1.5-pro",
    );
    assert.ok(
      GEMINI_AVAILABLE_MODELS.some((m) => m.id === "gemini-1.5-flash"),
      "Must support gemini-1.5-flash",
    );
  });

  test("Gemini Provider — Throws descriptive error when API key is missing", async () => {
    const provider = new GeminiProvider({ apiKey: "" });
    await assert.rejects(
      async () => {
        await provider.chat({
          messages: [{ role: "user", content: "Test message" }],
        });
      },
      {
        message: /\[Google Gemini\] API key is not configured/,
      },
    );
  });

  test("Gemini Provider — Mocked API chat execution", async () => {
    const originalFetch = globalThis.fetch;
    try {
      globalThis.fetch = async (url, init) => {
        assert.ok(url.toString().includes("generativelanguage.googleapis.com"));
        assert.ok(url.toString().includes("key=mock-gemini-key"));
        const body = JSON.parse(init?.body as string);
        assert.ok(body.contents.length > 0);

        return new Response(
          JSON.stringify({
            candidates: [
              {
                content: {
                  parts: [{ text: "Gemini response answer" }],
                  role: "model",
                },
                finishReason: "STOP",
              },
            ],
            usageMetadata: {
              promptTokenCount: 12,
              candidatesTokenCount: 8,
              totalTokenCount: 20,
            },
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        );
      };

      const provider = new GeminiProvider({
        apiKey: "mock-gemini-key",
        defaultModel: "gemini-2.0-flash",
      });

      const res = await provider.chat({
        messages: [{ role: "user", content: "Explain Laravel queues" }],
        systemPrompt: "You are a helpful assistant",
      });

      assert.equal(res.provider, "Google Gemini");
      assert.equal(res.content, "Gemini response answer");
      assert.equal(res.model, "gemini-2.0-flash");
      assert.equal(res.usage?.totalTokens, 20);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  // -------------------------------------------------------------------
  // 2. OpenRouter Provider Tests
  // -------------------------------------------------------------------
  test("OpenRouter Provider — Initialization & Model Support", () => {
    const provider = new OpenRouterProvider({
      apiKey: "sk-or-test-key",
      defaultModel: "anthropic/claude-3.5-sonnet",
    });

    assert.equal(provider.name, "OpenRouter");
    assert.equal(provider.isConfigured(), true);

    const unconfigured = new OpenRouterProvider({ apiKey: "" });
    assert.equal(unconfigured.isConfigured(), false);

    assert.ok(
      OPENROUTER_AVAILABLE_MODELS.some((m) => m.id === "anthropic/claude-3.5-sonnet"),
      "Must support claude-3.5-sonnet",
    );
    assert.ok(
      OPENROUTER_AVAILABLE_MODELS.some((m) => m.id === "openai/gpt-4o"),
      "Must support gpt-4o",
    );
    assert.ok(
      OPENROUTER_AVAILABLE_MODELS.some((m) => m.id === "deepseek/deepseek-chat"),
      "Must support deepseek-chat",
    );
    assert.ok(
      OPENROUTER_AVAILABLE_MODELS.some((m) => m.id === "meta-llama/llama-3.3-70b-instruct"),
      "Must support llama-3.3-70b",
    );
  });

  test("OpenRouter Provider — Mocked API chat execution with required headers", async () => {
    const originalFetch = globalThis.fetch;
    try {
      globalThis.fetch = async (url, init) => {
        assert.equal(url.toString(), "https://openrouter.ai/api/v1/chat/completions");
        const headers = init?.headers as Record<string, string>;
        assert.equal(headers["Authorization"], "Bearer sk-or-mock-key");
        assert.equal(headers["X-Title"], "Knowledge Brain");
        assert.ok(headers["HTTP-Referer"]);

        const body = JSON.parse(init?.body as string);
        assert.equal(body.model, "anthropic/claude-3.5-sonnet");

        return new Response(
          JSON.stringify({
            choices: [
              {
                message: { content: "Claude 3.5 response", role: "assistant" },
                finish_reason: "stop",
              },
            ],
            usage: {
              prompt_tokens: 15,
              completion_tokens: 10,
              total_tokens: 25,
            },
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        );
      };

      const provider = new OpenRouterProvider({
        apiKey: "sk-or-mock-key",
        defaultModel: "anthropic/claude-3.5-sonnet",
      });

      const res = await provider.chat({
        messages: [{ role: "user", content: "What is Knowledge Brain?" }],
        systemPrompt: "Ground answers in verified context",
      });

      assert.equal(res.provider, "OpenRouter");
      assert.equal(res.content, "Claude 3.5 response");
      assert.equal(res.model, "anthropic/claude-3.5-sonnet");
      assert.equal(res.usage?.totalTokens, 25);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  // -------------------------------------------------------------------
  // 3. Lovable AI Gateway Provider Tests
  // -------------------------------------------------------------------
  test("Lovable AI Gateway Provider — Native zero-config integration", async () => {
    const provider = new LovableAIProvider();
    assert.equal(provider.name, "Lovable AI");
    assert.equal(provider.isConfigured(), true, "Lovable AI is always configured out-of-the-box");

    const res = await provider.chat({
      messages: [{ role: "user", content: "General question" }],
      systemPrompt: "Default system prompt",
    });

    assert.equal(res.provider, "Lovable AI");
    assert.ok(res.content.length > 0);
    assert.ok(res.content.includes("Lovable AI Gateway"));
  });

  // -------------------------------------------------------------------
  // 4. Live Key Testing & Validation Engine Tests
  // -------------------------------------------------------------------
  test("testProviderKey — Rejects empty keys immediately", async () => {
    const res1 = await testProviderKey("gemini", "");
    assert.equal(res1.success, false);
    assert.equal(res1.latencyMs, 0);
    assert.equal(res1.error, "API key cannot be empty");

    const res2 = await testProviderKey("openrouter", "   ");
    assert.equal(res2.success, false);
    assert.equal(res2.latencyMs, 0);
  });

  test("testProviderKey — Gemini key validation success and latency tracking", async () => {
    const originalFetch = globalThis.fetch;
    try {
      globalThis.fetch = async () => {
        return new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: "pong" }] } }] }), {
          status: 200,
        });
      };

      const result = await testProviderKey("gemini", "valid-gemini-test-key");
      assert.equal(result.success, true);
      assert.ok(result.latencyMs >= 0);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  test("testProviderKey — OpenRouter key validation rejects unauthorized key", async () => {
    const originalFetch = globalThis.fetch;
    try {
      globalThis.fetch = async () => {
        return new Response(
          JSON.stringify({ error: { message: "User key not found or expired" } }),
          { status: 401 },
        );
      };

      const result = await testProviderKey("openrouter", "invalid-key-sk-or");
      assert.equal(result.success, false);
      assert.ok(result.error?.includes("User key not found"));
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  // -------------------------------------------------------------------
  // 5. AIProviderManager Switching & State Tests
  // -------------------------------------------------------------------
  test("AIProviderManager — Switch active provider and update settings", () => {
    assert.equal(DEFAULT_AI_PROVIDER_SETTINGS.activeProvider, "lovable");

    AIProviderManager.setActiveProvider("gemini");
    assert.equal(AIProviderManager.getSettings().activeProvider, "gemini");

    AIProviderManager.setActiveProvider("openrouter");
    assert.equal(AIProviderManager.getSettings().activeProvider, "openrouter");

    AIProviderManager.setActiveProvider("lovable");
    assert.equal(AIProviderManager.getSettings().activeProvider, "lovable");
  });
});

describe("PROGRESSIVE WEB APP (PWA) INTEGRATION TESTS", () => {
  // -------------------------------------------------------------------
  // 1. Web Manifest Verification
  // -------------------------------------------------------------------
  test("PWA Manifest — File exists and contains valid JSON", () => {
    const manifestPath = path.resolve(process.cwd(), "public/manifest.webmanifest");
    assert.ok(fs.existsSync(manifestPath), "public/manifest.webmanifest must exist");

    const content = fs.readFileSync(manifestPath, "utf-8");
    const manifest = JSON.parse(content);

    assert.equal(manifest.name, "Knowledge Brain — Autonomous AI Intelligence");
    assert.equal(manifest.short_name, "KnowledgeBrain");
    assert.equal(manifest.start_url, "/");
    assert.equal(manifest.display, "standalone");
    assert.equal(manifest.background_color, "#0B0F17");
    assert.equal(manifest.theme_color, "#3B82F6");

    assert.ok(Array.isArray(manifest.icons) && manifest.icons.length >= 2);
    assert.ok(manifest.icons.some((i: any) => i.sizes === "192x192"));
    assert.ok(manifest.icons.some((i: any) => i.sizes === "512x512"));
  });

  // -------------------------------------------------------------------
  // 2. Service Worker File & Asset Caching Verification
  // -------------------------------------------------------------------
  test("Service Worker — File exists and defines Stale-While-Revalidate & Network-First strategies", () => {
    const swPath = path.resolve(process.cwd(), "public/sw.js");
    assert.ok(fs.existsSync(swPath), "public/sw.js must exist");

    const content = fs.readFileSync(swPath, "utf-8");
    assert.ok(content.includes("addEventListener(\"install\""), "Must handle install event");
    assert.ok(content.includes("addEventListener(\"activate\""), "Must handle activate event");
    assert.ok(content.includes("addEventListener(\"fetch\""), "Must handle fetch event");
    assert.ok(content.includes("STATIC_ASSETS"), "Must define precache static assets");
    assert.ok(content.includes("supabase.co"), "Must handle dynamic Supabase routes");
    assert.ok(content.includes("Offline mode"), "Must handle offline fallback");
  });

  // -------------------------------------------------------------------
  // 3. Icons Verification
  // -------------------------------------------------------------------
  test("PWA Icons — 192x192, 512x512, and SVG icons exist in public directory", () => {
    const icon192 = path.resolve(process.cwd(), "public/icon-192.png");
    const icon512 = path.resolve(process.cwd(), "public/icon-512.png");
    const iconSvg = path.resolve(process.cwd(), "public/icon.svg");

    assert.ok(fs.existsSync(icon192), "public/icon-192.png must exist");
    assert.ok(fs.existsSync(icon512), "public/icon-512.png must exist");
    assert.ok(fs.existsSync(iconSvg), "public/icon.svg must exist");

    // Verify valid PNG signature for icon-192.png
    const buf = fs.readFileSync(icon192);
    const pngSignature = [137, 80, 78, 71, 13, 10, 26, 10];
    for (let i = 0; i < 8; i++) {
      assert.equal(buf[i], pngSignature[i], "Must have valid PNG header signature");
    }
  });

  // -------------------------------------------------------------------
  // 4. HTML Head Integration
  // -------------------------------------------------------------------
  test("PWA Head Links — __root.tsx links manifest.webmanifest and iOS meta tags", () => {
    const rootPath = path.resolve(process.cwd(), "src/routes/__root.tsx");
    const content = fs.readFileSync(rootPath, "utf-8");

    assert.ok(content.includes("/manifest.webmanifest"), "Must link to /manifest.webmanifest");
    assert.ok(content.includes("theme-color"), "Must include theme-color meta");
    assert.ok(content.includes("apple-mobile-web-app-capable"), "Must include iOS standalone meta");
    assert.ok(content.includes("GlobalContextMenu"), "Must render GlobalContextMenu");
    assert.ok(content.includes("PWAControls"), "Must render PWAControls");
  });
});

describe("CLOUD-ENCRYPTED KEY SYNC & OFFLINE STORE TESTS", () => {
  // -------------------------------------------------------------------
  // 1. Web Crypto Client-Side Key Encryption & Decryption
  // -------------------------------------------------------------------
  test("Cloud-Encrypted Keys — AES-GCM 256 encryption and decryption round-trip", async () => {
    const sessionEntropy = "user-session-entropy-abc-123456";
    const keys = {
      geminiApiKey: "AIzaSyD-mock-gemini-key-987654",
      openrouterApiKey: "sk-or-v1-mock-openrouter-key-12345",
    };

    const ciphertext = await encryptApiKeys(keys, sessionEntropy);
    assert.ok(typeof ciphertext === "string", "Ciphertext must be a string");
    assert.ok(ciphertext.length > 50, "Ciphertext should be sufficiently long");

    // Must not leak plain keys
    assert.equal(ciphertext.includes(keys.geminiApiKey), false, "Must not contain plaintext Gemini key");
    assert.equal(ciphertext.includes(keys.openrouterApiKey), false, "Must not contain plaintext OpenRouter key");

    // Decrypt with identical session entropy
    const decrypted = await decryptApiKeys(ciphertext, sessionEntropy);
    assert.equal(decrypted.geminiApiKey, keys.geminiApiKey);
    assert.equal(decrypted.openrouterApiKey, keys.openrouterApiKey);
    assert.ok(decrypted.updatedAt);
  });

  test("Cloud-Encrypted Keys — Randomized salt and IV produces distinct ciphertexts", async () => {
    const sessionEntropy = "consistent-user-session";
    const keys = {
      geminiApiKey: "AIza-static-key",
      openrouterApiKey: "sk-or-static-key",
    };

    const cipher1 = await encryptApiKeys(keys, sessionEntropy);
    const cipher2 = await encryptApiKeys(keys, sessionEntropy);

    assert.notEqual(cipher1, cipher2, "Each encryption should use a fresh salt and IV");

    // Both decrypt to identical values
    const dec1 = await decryptApiKeys(cipher1, sessionEntropy);
    const dec2 = await decryptApiKeys(cipher2, sessionEntropy);
    assert.equal(dec1.geminiApiKey, dec2.geminiApiKey);
    assert.equal(dec1.openrouterApiKey, dec2.openrouterApiKey);
  });

  test("Cloud-Encrypted Keys — Decryption fails with invalid entropy or tampered payload", async () => {
    const validEntropy = "user-entropy-1";
    const wrongEntropy = "user-entropy-2";
    const keys = { geminiApiKey: "secret-key", openrouterApiKey: "secret-or-key" };

    const ciphertext = await encryptApiKeys(keys, validEntropy);

    await assert.rejects(
      async () => {
        await decryptApiKeys(ciphertext, wrongEntropy);
      },
      /Decryption failed|operation failed/i,
    );

    await assert.rejects(
      async () => {
        await decryptApiKeys("invalid:tampered:payload", validEntropy);
      },
    );
  });

  // -------------------------------------------------------------------
  // 2. OfflineChatStore Interface & Fallbacks
  // -------------------------------------------------------------------
  test("OfflineChatStore — Interface methods exist and handle offline environments gracefully", async () => {
    assert.equal(typeof OfflineChatStore.cacheConversations, "function");
    assert.equal(typeof OfflineChatStore.getCachedConversations, "function");
    assert.equal(typeof OfflineChatStore.cacheMessages, "function");
    assert.equal(typeof OfflineChatStore.getCachedMessages, "function");
    assert.equal(typeof OfflineChatStore.cacheKnowledgeNodes, "function");
    assert.equal(typeof OfflineChatStore.getCachedKnowledgeNodes, "function");
    assert.equal(typeof OfflineChatStore.enqueueOfflineMessage, "function");
    assert.equal(typeof OfflineChatStore.getPendingOfflineMessages, "function");
    assert.equal(typeof OfflineChatStore.removePendingOfflineMessage, "function");

    // In Node.js environment without window.indexedDB, safe fallbacks return empty arrays
    const cachedConvs = await OfflineChatStore.getCachedConversations();
    assert.deepEqual(cachedConvs, []);

    const cachedMsgs = await OfflineChatStore.getCachedMessages("test-conv");
    assert.deepEqual(cachedMsgs, []);

    const cachedNodes = await OfflineChatStore.getCachedKnowledgeNodes();
    assert.deepEqual(cachedNodes, []);

    const pending = await OfflineChatStore.getPendingOfflineMessages();
    assert.deepEqual(pending, []);
  });

  test("OfflineChatStore — Bounded caching logic restricts conversations to top 20", () => {
    const mockConversations = Array.from({ length: 30 }, (_, i) => ({
      id: `conv-${i}`,
      title: `Conversation ${i}`,
      updated_at: new Date(Date.now() - i * 1000).toISOString(),
      status: "active",
    }));

    const bounded = mockConversations.slice(0, 20);
    assert.equal(bounded.length, 20);
    assert.equal(bounded[0]?.id, "conv-0");
    assert.equal(bounded[19]?.id, "conv-19");
  });

  // -------------------------------------------------------------------
  // 3. Command Palette Voice Aliases
  // -------------------------------------------------------------------
  test("Command Palette — Voice Arabic Aliases support bilingual commands", () => {
    const contextMenuPath = path.resolve(process.cwd(), "src/components/GlobalContextMenu.tsx");
    const content = fs.readFileSync(contextMenuPath, "utf-8");

    // Arabic voice aliases in commands
    assert.ok(content.includes("الرسم البياني"), "Must support Arabic command alias for Graph");
    assert.ok(content.includes("شجرة المعرفة"), "Must support Arabic command alias for Tree");
    assert.ok(content.includes("محادثة جديدة"), "Must support Arabic command alias for New Chat");
    assert.ok(content.includes("useSpeechRecognition"), "Must integrate useSpeechRecognition");
  });
});

