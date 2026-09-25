// =====================================================================
// KNOWLEDGE BRAIN — PHASE 5: CLIENT KNOWLEDGE EXTRACTION SERVICE
// Communicates with extract-knowledge Edge Function and manages proposals.
// =====================================================================

import { supabase } from "@/integrations/supabase/client";
import { MockExtractionEngine } from "./mock-extractor";
import { ExtractionSchemaValidator } from "./schema-validator";
import type {
  ExtractionPayload,
  KnowledgeProposalItem,
  KnowledgeExtractionRun,
  ProposalStatus,
  ProposalType,
  ConversationExtractionSummary,
} from "./types";

export interface ExtractOptions {
  messageIds?: string[];
  model?: string;
  forceMock?: boolean;
}

export interface ExtractResultSummary {
  success: boolean;
  extraction_run_id: string;
  relevance: string;
  counts: {
    entities: number;
    claims: number;
    relations: number;
    hierarchy: number;
    sources: number;
    conflicts: number;
    open_questions: number;
    total_proposals: number;
  };
  duration_ms: number;
}

export class KnowledgeExtractionService {
  /**
   * Triggers knowledge extraction on a conversation.
   * Attempts Supabase Edge Function first; falls back to deterministic engine in local/test modes.
   */
  static async extractFromConversation(
    conversationId: string,
    options: ExtractOptions = {},
  ): Promise<ExtractResultSummary> {
    if (!options.forceMock) {
      try {
        const { data, error } = await supabase.functions.invoke<ExtractResultSummary>(
          "extract-knowledge",
          {
            body: {
              conversation_id: conversationId,
              message_ids: options.messageIds,
              options: { model: options.model },
            },
          },
        );

        if (!error && data && data.success) {
          return data;
        }
      } catch {
        // Edge function unavailable; proceed to local fallback
      }
    }

    // Local / Offline fallback execution
    return await this.executeLocalExtraction(conversationId, options);
  }

  /**
   * Local execution using MockExtractionEngine and direct Supabase proposals insertion.
   */
  private static async executeLocalExtraction(
    conversationId: string,
    options: ExtractOptions = {},
  ): Promise<ExtractResultSummary> {
    const startTime = Date.now();

    // 1. Fetch conversation messages
    let query = supabase
      .from("messages")
      .select("id, role, content, created_at")
      .eq("conversation_id", conversationId)
      .order("created_at", { ascending: true });

    if (options.messageIds && options.messageIds.length > 0) {
      query = query.in("id", options.messageIds);
    } else {
      query = query.limit(20);
    }

    const { data: messages } = await query;
    const msgList = messages ?? [];
    const triggerMessageId = msgList[msgList.length - 1]?.id ?? null;

    // 2. Extract candidates
    const rawExtraction = MockExtractionEngine.extract(msgList);
    const { sanitizedPayload } = ExtractionSchemaValidator.validate(rawExtraction);

    // 3. Create Extraction Run
    let runId = `run-${Date.now()}`;
    try {
      const { data: run } = await supabase
        .from("knowledge_extraction_runs")
        .insert({
          conversation_id: conversationId,
          trigger_message_id: triggerMessageId,
          status: "processing",
          relevance: sanitizedPayload.relevance,
          model: options.model ?? "brain-local-extractor",
          provider: "mock-engine",
          started_at: new Date().toISOString(),
        })
        .select("id")
        .single();

      if (run) runId = run.id;
    } catch {
      // Mock run ID if offline/unmigrated DB
    }

    // 4. Transform candidates into proposals
    const proposalsToInsert: Array<{
      extraction_run_id: string;
      conversation_id: string;
      source_message_id: string | null;
      proposal_type: ProposalType;
      status: ProposalStatus;
      payload: Record<string, unknown>;
      extraction_confidence: number;
      validation_status: "valid" | "warning";
      model: string;
      provider: string;
    }> = [];

    // Entities
    for (const e of sanitizedPayload.entities) {
      proposalsToInsert.push({
        extraction_run_id: runId,
        conversation_id: conversationId,
        source_message_id: triggerMessageId,
        proposal_type: "ENTITY",
        status: "pending",
        payload: e as unknown as Record<string, unknown>,
        extraction_confidence: e.confidence,
        validation_status: "valid",
        model: "brain-local-extractor",
        provider: "mock-engine",
      });
    }

    // Claims
    for (const c of sanitizedPayload.claims) {
      proposalsToInsert.push({
        extraction_run_id: runId,
        conversation_id: conversationId,
        source_message_id: triggerMessageId,
        proposal_type: "CLAIM",
        status: "pending",
        payload: c as unknown as Record<string, unknown>,
        extraction_confidence: c.confidence,
        validation_status: "valid",
        model: "brain-local-extractor",
        provider: "mock-engine",
      });
    }

    // Relations
    for (const r of sanitizedPayload.relations) {
      proposalsToInsert.push({
        extraction_run_id: runId,
        conversation_id: conversationId,
        source_message_id: triggerMessageId,
        proposal_type: "RELATION",
        status: "pending",
        payload: r as unknown as Record<string, unknown>,
        extraction_confidence: r.confidence,
        validation_status: "valid",
        model: "brain-local-extractor",
        provider: "mock-engine",
      });
    }

    // Hierarchy
    for (const h of sanitizedPayload.hierarchy_suggestions) {
      proposalsToInsert.push({
        extraction_run_id: runId,
        conversation_id: conversationId,
        source_message_id: triggerMessageId,
        proposal_type: "HIERARCHY",
        status: "pending",
        payload: h as unknown as Record<string, unknown>,
        extraction_confidence: h.confidence,
        validation_status: "valid",
        model: "brain-local-extractor",
        provider: "mock-engine",
      });
    }

    // Sources
    for (const s of sanitizedPayload.sources) {
      proposalsToInsert.push({
        extraction_run_id: runId,
        conversation_id: conversationId,
        source_message_id: triggerMessageId,
        proposal_type: "SOURCE",
        status: "pending",
        payload: s as unknown as Record<string, unknown>,
        extraction_confidence: s.confidence,
        validation_status: "valid",
        model: "brain-local-extractor",
        provider: "mock-engine",
      });
    }

    // Conflicts
    for (const conf of sanitizedPayload.conflicts) {
      proposalsToInsert.push({
        extraction_run_id: runId,
        conversation_id: conversationId,
        source_message_id: triggerMessageId,
        proposal_type: "CONFLICT",
        status: "pending",
        payload: conf as unknown as Record<string, unknown>,
        extraction_confidence: 0.90,
        validation_status: "valid",
        model: "brain-local-extractor",
        provider: "mock-engine",
      });
    }

    // Open Questions
    for (const q of sanitizedPayload.open_questions) {
      proposalsToInsert.push({
        extraction_run_id: runId,
        conversation_id: conversationId,
        source_message_id: triggerMessageId,
        proposal_type: "OPEN_QUESTION",
        status: "pending",
        payload: q as unknown as Record<string, unknown>,
        extraction_confidence: q.confidence,
        validation_status: "valid",
        model: "brain-local-extractor",
        provider: "mock-engine",
      });
    }

    // Persist proposals
    if (proposalsToInsert.length > 0) {
      try {
        await supabase.from("knowledge_proposals").insert(proposalsToInsert as any);
      } catch {
        // Continue if offline
      }
    }

    const durationMs = Date.now() - startTime;

    // Complete run
    try {
      await supabase
        .from("knowledge_extraction_runs")
        .update({
          status: "completed",
          relevance: sanitizedPayload.relevance,
          completed_at: new Date().toISOString(),
          metrics: {
            duration_ms: durationMs,
            message_count: msgList.length,
            entity_count: sanitizedPayload.entities.length,
            claim_count: sanitizedPayload.claims.length,
            relation_count: sanitizedPayload.relations.length,
            proposal_count: proposalsToInsert.length,
          },
        } as any)
        .eq("id", runId);
    } catch {
      // Continue
    }

    return {
      success: true,
      extraction_run_id: runId,
      relevance: sanitizedPayload.relevance,
      counts: {
        entities: sanitizedPayload.entities.length,
        claims: sanitizedPayload.claims.length,
        relations: sanitizedPayload.relations.length,
        hierarchy: sanitizedPayload.hierarchy_suggestions.length,
        sources: sanitizedPayload.sources.length,
        conflicts: sanitizedPayload.conflicts.length,
        open_questions: sanitizedPayload.open_questions.length,
        total_proposals: proposalsToInsert.length,
      },
      duration_ms: durationMs,
    };
  }

  /**
   * Fetches proposals with optional status, type, and conversation filters.
   */
  static async getProposals(filters: {
    conversationId?: string;
    status?: ProposalStatus | "all";
    type?: ProposalType | "all";
    search?: string;
    limit?: number;
  } = {}): Promise<KnowledgeProposalItem[]> {
    let query = supabase
      .from("knowledge_proposals")
      .select("*")
      .order("created_at", { ascending: false });

    if (filters.conversationId) {
      query = query.eq("conversation_id", filters.conversationId);
    }

    if (filters.status && filters.status !== "all") {
      query = query.eq("status", filters.status);
    }

    if (filters.type && filters.type !== "all") {
      query = query.eq("proposal_type", filters.type);
    }

    if (filters.limit) {
      query = query.limit(filters.limit);
    }

    const { data, error } = await query;
    if (error) throw error;

    let items = (data ?? []) as unknown as KnowledgeProposalItem[];

    if (filters.search && filters.search.trim()) {
      const q = filters.search.toLowerCase().trim();
      items = items.filter((item) => {
        const payloadStr = JSON.stringify(item.payload).toLowerCase();
        return payloadStr.includes(q) || item.proposal_type.toLowerCase().includes(q);
      });
    }

    return items;
  }

  /**
   * Fetches extraction runs for auditing and activity tracking.
   */
  static async getExtractionRuns(conversationId?: string): Promise<KnowledgeExtractionRun[]> {
    let query = supabase
      .from("knowledge_extraction_runs")
      .select("*")
      .order("created_at", { ascending: false });

    if (conversationId) {
      query = query.eq("conversation_id", conversationId);
    }

    const { data, error } = await query;
    if (error) throw error;
    return (data ?? []) as unknown as KnowledgeExtractionRun[];
  }

  /**
   * Updates proposal status (e.g. approve for resolution, reject).
   * Preserves rejection reason for audit history.
   */
  static async updateProposalStatus(
    proposalId: string,
    status: ProposalStatus,
    rejectionReason?: string,
  ): Promise<void> {
    const updateObj: Record<string, unknown> = {
      status,
      updated_at: new Date().toISOString(),
    };

    if (rejectionReason) {
      updateObj["rejection_reason"] = rejectionReason;
    }

    const { error } = await supabase
      .from("knowledge_proposals")
      .update(updateObj as any)
      .eq("id", proposalId);

    if (error) throw error;
  }

  /**
   * Edits a proposal payload while preserving original AI extraction for audit history.
   */
  static async editProposalPayload(
    proposalId: string,
    updatedPayload: Record<string, unknown>,
  ): Promise<void> {
    // 1. Fetch current proposal to preserve original_payload if not yet set
    const { data: current } = await supabase
      .from("knowledge_proposals")
      .select("payload, original_payload")
      .eq("id", proposalId)
      .single();

    const originalPayload = current?.original_payload ?? current?.payload ?? null;

    const { error } = await supabase
      .from("knowledge_proposals")
      .update({
        payload: updatedPayload,
        original_payload: originalPayload,
        updated_at: new Date().toISOString(),
      } as any)
      .eq("id", proposalId);

    if (error) throw error;
  }

  /**
   * Gets extraction counts summary for a conversation.
   */
  static async getConversationSummary(
    conversationId: string,
  ): Promise<ConversationExtractionSummary> {
    try {
      const { data, error } = await supabase.rpc("get_conversation_extraction_summary", {
        p_conversation_id: conversationId,
      });

      if (!error && data && typeof data === "object") {
        return data as unknown as ConversationExtractionSummary;
      }
    } catch {
      // Fallback to client query
    }

    const proposals = await this.getProposals({ conversationId });
    return {
      total_proposals: proposals.length,
      entities: proposals.filter((p) => ["ENTITY", "TOPIC", "CONCEPT"].includes(p.proposal_type)).length,
      claims: proposals.filter((p) => p.proposal_type === "CLAIM").length,
      relations: proposals.filter((p) => p.proposal_type === "RELATION").length,
      hierarchy: proposals.filter((p) => p.proposal_type === "HIERARCHY").length,
      sources: proposals.filter((p) => ["SOURCE", "EVIDENCE"].includes(p.proposal_type)).length,
      open_questions: proposals.filter((p) => p.proposal_type === "OPEN_QUESTION").length,
      conflicts: proposals.filter((p) => p.proposal_type === "CONFLICT").length,
      pending: proposals.filter((p) => p.status === "pending").length,
      approved: proposals.filter((p) => p.status === "approved").length,
      rejected: proposals.filter((p) => p.status === "rejected").length,
    };
  }
}
