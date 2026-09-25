// =====================================================================
// KNOWLEDGE BRAIN — PHASE 9: KNOWLEDGE GAP DETECTOR
// Structured gap detection for insufficient, missing, or conflicted knowledge
// =====================================================================

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import type { GapType, KnowledgeGap, QueryAnalysis } from "./types";

export class GapDetector {
  private inMemoryGaps: KnowledgeGap[] = [];

  constructor(private supabase: SupabaseClient<Database> | null = null) {}

  /**
   * Analyzes retrieval results to identify if a knowledge gap exists.
   * Does NOT launch autonomous research; only records and surfaces the gap.
   */
  public async detectAndRecord(
    resultOrAnalysis: any,
    results?: any,
    options?: any,
  ): Promise<KnowledgeGap | null> {
    if (resultOrAnalysis && "queryAnalysis" in resultOrAnalysis) {
      return this.evaluateKnowledgeGap(resultOrAnalysis.queryAnalysis, resultOrAnalysis, options);
    }
    return this.evaluateKnowledgeGap(resultOrAnalysis, results || { nodes: [], claims: [] }, options);
  }

  public async evaluateKnowledgeGap(
    queryAnalysis: QueryAnalysis,
    retrievalResults: {
      nodes: any[];
      claims: any[];
      relations?: any[] | undefined;
      conflicts?: any[] | undefined;
    },
    contextOptions: {
      conversationId?: string | null | undefined;
      messageId?: string | null | undefined;
    } = {},
  ): Promise<KnowledgeGap | null> {
    const rawQuery = queryAnalysis.rawQuery;
    let gapType: GapType | null = null;
    let priority: KnowledgeGap["priority"] = "medium";
    let suggestedAction = "";
    const relatedNodeIds: string[] = retrievalResults.nodes.map((n) => n.id);

    // 1. Missing Entity
    if (queryAnalysis.resolvedEntities.length === 0 && retrievalResults.nodes.length === 0) {
      gapType = "MISSING_ENTITY";
      priority = "medium";
      suggestedAction = `Create canonical knowledge node for topic discussed in query: "${rawQuery}".`;
    }
    // 2. Missing Claims
    else if (retrievalResults.nodes.length > 0 && retrievalResults.claims.length === 0) {
      gapType = "MISSING_CLAIM";
      priority = "high";
      suggestedAction = `Add grounded claims for entity "${retrievalResults.nodes[0]?.name || "Unknown"}" to answer query: "${rawQuery}".`;
    }
    // 3. Outdated Knowledge for Current Query
    else if (
      queryAnalysis.temporalIntent.isCurrentOnly &&
      retrievalResults.claims.length > 0 &&
      retrievalResults.claims.every((c) => c.is_outdated || c.is_superseded)
    ) {
      gapType = "OUTDATED_KNOWLEDGE";
      priority = "high";
      suggestedAction = `Update claims with latest specifications for "${retrievalResults.nodes[0]?.name || "Unknown"}". Existing knowledge is outdated or superseded.`;
    }
    // 4. Conflicted Knowledge
    else if (
      retrievalResults.conflicts &&
      retrievalResults.conflicts.length > 0 &&
      queryAnalysis.queryType === "FACT"
    ) {
      gapType = "CONFLICTED_KNOWLEDGE";
      priority = "high";
      suggestedAction = `Resolve open knowledge conflict between claims regarding "${retrievalResults.nodes[0]?.name || "topic"}".`;
    }
    // 5. Insufficient Context
    else if (
      retrievalResults.nodes.length < 1 ||
      (queryAnalysis.queryType === "COMPARISON" && retrievalResults.nodes.length < 2)
    ) {
      gapType = "INSUFFICIENT_CONTEXT";
      priority = "low";
      suggestedAction = "Index additional related concepts in the Knowledge Brain to support comprehensive comparison.";
    }

    if (!gapType) {
      return null;
    }

    const gapId = `gap-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
    const gap: KnowledgeGap = {
      id: gapId,
      query: rawQuery,
      normalized_query: queryAnalysis.normalizedQuery,
      conversation_id: contextOptions.conversationId || null,
      message_id: contextOptions.messageId || null,
      gap_type: gapType,
      status: "open",
      priority,
      related_node_ids: relatedNodeIds,
      suggested_action: suggestedAction,
      created_at: new Date().toISOString(),
    };

    this.inMemoryGaps.push(gap);

    if (this.supabase) {
      try {
        await this.supabase.from("knowledge_gaps").insert({
          id: gap.id,
          query: gap.query,
          normalized_query: gap.normalized_query ?? null,
          conversation_id: gap.conversation_id ?? null,
          message_id: gap.message_id ?? null,
          gap_type: gap.gap_type,
          status: gap.status,
          priority: gap.priority,
          related_node_ids: gap.related_node_ids,
          suggested_action: gap.suggested_action ?? null,
        });
      } catch (err) {
        console.warn("Failed to persist knowledge gap to database", err);
      }
    }

    return gap;
  }

  public getRecordedGaps(): KnowledgeGap[] {
    return this.inMemoryGaps;
  }
}
