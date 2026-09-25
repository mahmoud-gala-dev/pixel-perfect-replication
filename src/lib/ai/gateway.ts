// =====================================================================
// KNOWLEDGE BRAIN — PHASE 4: SECURE AI GATEWAY & CONVERSATION ENGINE
// =====================================================================

import { supabase } from "@/integrations/supabase/client";
import { BrainContextBuilder, type BuildContextOptions } from "./brain-context-builder";
import { buildSystemPromptWithContext } from "./system-prompt";
import { OpenAICompatibleProvider } from "./providers/openai-compatible";
import { MockBrainProvider } from "./providers/mock-brain-provider";
import type {
  AIProvider,
  ChatMessage,
  ChatRequestContract,
  ChatResponseContract,
} from "./types";

// In-memory idempotency cache to protect against rapid duplicate requests
const idempotencyCache = new Map<string, { timestamp: number; response: ChatResponseContract }>();

export interface GatewayExecutionOptions {
  provider?: AIProvider;
  mockContextData?: BuildContextOptions["mockData"];
  skipDbPersistence?: boolean;
}

export class AIGateway {
  private static defaultProvider: AIProvider | null = null;

  static getProvider(): AIProvider {
    if (this.defaultProvider) return this.defaultProvider;

    // Check if an OpenAI-compatible API key is available in environment
    const apiKey = typeof process !== "undefined" ? process.env?.["OPENAI_API_KEY"] : undefined;
    if (apiKey && apiKey.trim().length > 0) {
      this.defaultProvider = new OpenAICompatibleProvider({ apiKey });
    } else {
      this.defaultProvider = new MockBrainProvider();
    }
    return this.defaultProvider;
  }

  static setProvider(provider: AIProvider): void {
    this.defaultProvider = provider;
  }

  /**
   * Executes a complete chat exchange:
   * 1. Validates input & idempotency
   * 2. Persists User Message
   * 3. Selects recent conversation context window (bounded context)
   * 4. Retrieves Brain Context (READ ONLY)
   * 5. Calls configured AI Provider
   * 6. Persists Assistant Message with provenance metadata
   * 7. Returns structured response contract
   *
   * CRITICAL: Strictly read-only on knowledge entities. Never creates knowledge nodes, claims, or edges.
   */
  static async executeChat(
    request: ChatRequestContract,
    execOptions: GatewayExecutionOptions = {},
  ): Promise<ChatResponseContract> {
    const startTime = Date.now();
    const { conversation_id, message, options } = request;
    const trimmedMessage = message.trim();

    if (!trimmedMessage) {
      throw new Error("Message cannot be empty.");
    }
    if (trimmedMessage.length > 8000) {
      throw new Error("Message exceeds the maximum length of 8000 characters.");
    }

    // 1. Idempotency Check
    const idempotencyKey = options?.idempotency_key;
    if (idempotencyKey) {
      const cached = idempotencyCache.get(idempotencyKey);
      if (cached && Date.now() - cached.timestamp < 60000) {
        return cached.response;
      }
    }

    const provider = execOptions.provider ?? this.getProvider();
    const useBrainContext = options?.use_brain_context !== false;

    // 2. Load recent conversation history (Bounded Context: last 10 messages)
    const historyMessages: ChatMessage[] = [];
    if (!execOptions.skipDbPersistence) {
      try {
        const { data: dbMessages } = await supabase
          .from("messages")
          .select("id, role, content, created_at, metadata")
          .eq("conversation_id", conversation_id)
          .order("created_at", { ascending: false })
          .limit(10);

        if (dbMessages && dbMessages.length > 0) {
          // Reverse back to chronological order
          for (const m of [...dbMessages].reverse()) {
            historyMessages.push({
              id: m.id,
              role: m.role,
              content: m.content,
              created_at: m.created_at,
              metadata: (m.metadata ?? {}) as Record<string, unknown>,
            });
          }
        }
      } catch {
        // Continue if offline or during testing
      }
    }

    // 3. Persist User Message
    let userMessageId = `msg-${Date.now()}-u`;
    if (!execOptions.skipDbPersistence) {
      try {
        const { data: insertedUserMsg } = await supabase
          .from("messages")
          .insert({
            conversation_id,
            role: "user",
            content: trimmedMessage,
            metadata: {
              idempotency_key: idempotencyKey,
            },
          })
          .select("id")
          .single();

        if (insertedUserMsg) {
          userMessageId = insertedUserMsg.id;
        }

        // Update conversation timestamp
        await supabase
          .from("conversations")
          .update({ updated_at: new Date().toISOString() })
          .eq("id", conversation_id);
      } catch {
        // Proceed gracefully if DB mock is active
      }
    }

    // 4. Retrieve Brain Context (READ ONLY)
    let brainContextText = "";
    let hasBrainContext = false;
    let references: ChatResponseContract["references"] = {
      nodes: [],
      claims: [],
      relations: [],
    };

    if (useBrainContext) {
      const retrieved = await BrainContextBuilder.retrieveContext(
        trimmedMessage,
        execOptions.mockContextData ? { mockData: execOptions.mockContextData } : {},
      );

      if (retrieved.hasContext) {
        brainContextText = retrieved.formattedText;
        hasBrainContext = true;
        references = retrieved.references;
      }
    }

    // 5. Build System Prompt with Context
    const systemPrompt = buildSystemPromptWithContext(hasBrainContext ? brainContextText : null);

    // 6. Assemble context messages (history + new user message)
    const contextMessages: ChatMessage[] = [
      ...historyMessages,
      { role: "user", content: trimmedMessage, id: userMessageId },
    ];

    // 7. Invoke LLM Provider
    let assistantContent = "";
    let responseModel = options?.model ?? "brain-assistant";
    let tokenUsage: { promptTokens?: number | undefined; completionTokens?: number | undefined; totalTokens?: number | undefined } | undefined;

    try {
      const aiResponse = await provider.chat({
        messages: contextMessages,
        systemPrompt,
        temperature: options?.temperature ?? 0.3,
        ...(options?.model ? { model: options.model } : {}),
      });

      assistantContent = aiResponse.content;
      responseModel = aiResponse.model;
      tokenUsage = aiResponse.usage;
    } catch (err: unknown) {
      const errorMsg = err instanceof Error ? err.message : "AI Provider generation error";
      
      // Persist failed message state if applicable
      const failedResponse: ChatResponseContract = {
        message_id: `msg-${Date.now()}-err`,
        conversation_id,
        content: `Error: ${errorMsg}. Please verify your connection or try again.`,
        status: "failed",
        brain_context_used: false,
        error: errorMsg,
      };

      if (!execOptions.skipDbPersistence) {
        try {
          await supabase.from("messages").insert({
            conversation_id,
            role: "assistant",
            content: failedResponse.content,
            model: responseModel,
            metadata: {
              status: "failed",
              error: errorMsg,
              latency_ms: Date.now() - startTime,
            },
          });
        } catch {
          // Ignore secondary logging error
        }
      }

      return failedResponse;
    }

    const latencyMs = Date.now() - startTime;
    let assistantMessageId = `msg-${Date.now()}-a`;

    // 8. Persist Assistant Message
    if (!execOptions.skipDbPersistence) {
      try {
        const { data: insertedAssistantMsg } = await supabase
          .from("messages")
          .insert({
            conversation_id,
            role: "assistant",
            content: assistantContent,
            model: responseModel,
            token_count: tokenUsage?.totalTokens ?? null,
            metadata: {
              status: "completed",
              provider: provider.name,
              latency_ms: latencyMs,
              brain_context_used: hasBrainContext,
              retrieved_node_ids: references.nodes.map((n) => n.id),
              retrieved_claim_ids: references.claims.map((c) => c.id),
              retrieved_relation_ids: references.relations.map((r) => r.id),
              usage: tokenUsage,
            },
          })
          .select("id")
          .single();

        if (insertedAssistantMsg) {
          assistantMessageId = insertedAssistantMsg.id;
        }

        // Auto-generate title if conversation is still untitled or empty
        const { data: conv } = await supabase
          .from("conversations")
          .select("title")
          .eq("id", conversation_id)
          .single();

        if (!conv?.title || conv.title === "New conversation" || conv.title === "Untitled") {
          const autoTitle = trimmedMessage.slice(0, 36).trim() + (trimmedMessage.length > 36 ? "…" : "");
          await supabase
            .from("conversations")
            .update({ title: autoTitle })
            .eq("id", conversation_id);
        }
      } catch {
        // Proceed gracefully
      }
    }

    const finalResponse: ChatResponseContract = {
      message_id: assistantMessageId,
      conversation_id,
      content: assistantContent,
      status: "completed",
      brain_context_used: hasBrainContext,
      references,
      metadata: {
        model: responseModel,
        provider: provider.name,
        latency_ms: latencyMs,
        ...(tokenUsage ? { usage: tokenUsage } : {}),
      },
    };

    // Cache response if idempotency key was supplied
    if (idempotencyKey) {
      idempotencyCache.set(idempotencyKey, {
        timestamp: Date.now(),
        response: finalResponse,
      });
    }

    return finalResponse;
  }
}
