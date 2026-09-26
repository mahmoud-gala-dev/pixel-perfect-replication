// =====================================================================
// KNOWLEDGE BRAIN — PHASE 4: SECURE AI GATEWAY & CONVERSATION ENGINE
// =====================================================================

import { supabase } from "@/integrations/supabase/client";
import type { Json } from "@/integrations/supabase/types";
import { BrainContextBuilder, type BuildContextOptions } from "./brain-context-builder";
import { buildSystemPromptWithContext } from "./system-prompt";
import { OpenAICompatibleProvider } from "./providers/openai-compatible";
import { MockBrainProvider } from "./providers/mock-brain-provider";
import { BrainRetrievalEngine } from "./rag/brain-retrieval-engine";
import { ClaimLedgerEngine } from "./rag/claim-ledger-engine";
import type { AnswerMode, GroundingState, RetrievalResultPackage } from "./rag/types";
import type {
  AIProvider,
  ChatMessage,
  ChatRequestContract,
  ChatResponseContract,
} from "./types";

import { AIProviderManager } from "./provider-manager";

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
      return this.defaultProvider;
    }

    // In client browser environment, consult AIProviderManager
    if (typeof window !== "undefined") {
      return AIProviderManager.getActiveProviderInstance();
    }

    this.defaultProvider = new MockBrainProvider();
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

    // 3. Persist User Message (skip if retrying a failed assistant response)
    const isRetry = Boolean(options?.is_retry);
    let userMessageId = options?.retry_user_message_id ?? `msg-${Date.now()}-u`;
    if (!execOptions.skipDbPersistence && !isRetry) {
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

    // 4. Retrieve Brain Context (READ ONLY via BrainRetrievalEngine)
    const answerMode: AnswerMode = options?.answer_mode ?? "BRAIN_PREFERRED";
    let brainContextText = "";
    let hasBrainContext = false;
    let references: ChatResponseContract["references"] = {
      nodes: [],
      claims: [],
      relations: [],
    };
    let retrievalPackage: RetrievalResultPackage | null = null;

    if (useBrainContext) {
      const retrievalEngine = new BrainRetrievalEngine(execOptions.skipDbPersistence ? null : supabase);
      retrievalPackage = await retrievalEngine.retrieve(
        trimmedMessage,
        execOptions.mockContextData
          ? {
              searchDataset: { nodes: (execOptions.mockContextData.nodes || []) as any },
              graphDataset: {
                nodes: (execOptions.mockContextData.nodes || []) as any,
                edges: (execOptions.mockContextData.edges || []) as any,
              },
              claimDataset: {
                claims: (execOptions.mockContextData.claims || []) as any,
              },
            }
          : undefined,
        {
          answerMode,
          conversationId: conversation_id,
          userMessageId,
        },
      );

      const builtContext = BrainContextBuilder.buildContextFromPackage(retrievalPackage);
      brainContextText = builtContext.formattedText;
      hasBrainContext = builtContext.hasContext;
      references = builtContext.references;
    }

    // 5. Build Grounded System Prompt with Context
    const systemPrompt = buildSystemPromptWithContext(
      hasBrainContext ? brainContextText : null,
      {
        answerMode,
        hasSufficientKnowledge: retrievalPackage?.hasSufficientKnowledge,
      },
    );

    // 6. Assemble context messages (history + new user message)
    const contextMessages: ChatMessage[] = [
      ...historyMessages,
      { role: "user", content: trimmedMessage, id: userMessageId },
    ];

    // 7. Invoke LLM Provider (or state insufficient knowledge in BRAIN_ONLY mode)
    let assistantContent = "";
    let responseModel = options?.model ?? "brain-assistant";
    let tokenUsage: { promptTokens?: number | undefined; completionTokens?: number | undefined; totalTokens?: number | undefined } | undefined;

    if (answerMode === "BRAIN_ONLY" && retrievalPackage && !retrievalPackage.hasSufficientKnowledge) {
      assistantContent = "I don't have enough grounded knowledge in the Brain to answer this reliably.";
    } else {
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
    }

    const latencyMs = Date.now() - startTime;
    let assistantMessageId = `msg-${Date.now()}-a`;

    // 8. Claim Ledger & Attribution
    let claimLedgerResult: any = null;
    if (retrievalPackage) {
      const ledgerEngine = new ClaimLedgerEngine(execOptions.skipDbPersistence ? null : supabase);
      claimLedgerResult = await ledgerEngine.buildClaimLedger(
        assistantContent,
        retrievalPackage,
        assistantMessageId,
      );
    }

    // 9. Persist Assistant Message
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
            metadata: ({
              status: "completed",
              provider: provider.name,
              latency_ms: latencyMs,
              brain_context_used: hasBrainContext,
              grounding_state: claimLedgerResult?.groundingState ?? "UNKNOWN",
              answer_mode: answerMode,
              retrieval_run_id: retrievalPackage?.retrievalRunId || null,
              retrieved_node_ids: references.nodes.map((n) => n.id),
              retrieved_claim_ids: references.claims.map((c) => c.id),
              retrieved_relation_ids: references.relations.map((r) => r.id),
              claim_ledger: claimLedgerResult?.answerClaims ?? [],
              graph_paths: retrievalPackage?.graphPaths ?? [],
              sources: retrievalPackage?.sources ?? [],
              conflicts: retrievalPackage?.conflicts ?? [],
              retrieval_summary: retrievalPackage
                ? {
                    duration_ms: retrievalPackage.retrievalMetadata.durationMs,
                    methods_used: retrievalPackage.retrievalMetadata.methodsUsed,
                    candidate_count: retrievalPackage.retrievalMetadata.totalCandidatesFound,
                    query_type: retrievalPackage.queryAnalysis.queryType,
                    has_sufficient_knowledge: retrievalPackage.hasSufficientKnowledge,
                  }
                : null,
              references,
              usage: tokenUsage,
            } as unknown as Json),
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
      grounding_state:
        claimLedgerResult?.groundingState ??
        (hasBrainContext ? "STRONGLY_GROUNDED" : "GENERAL_KNOWLEDGE_USED"),
      answer_mode: answerMode,
      retrieval_run_id: retrievalPackage?.retrievalRunId,
      claim_ledger: claimLedgerResult?.answerClaims,
      graph_paths: retrievalPackage?.graphPaths,
      sources: retrievalPackage?.sources,
      conflicts_detected: retrievalPackage?.conflicts,
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
