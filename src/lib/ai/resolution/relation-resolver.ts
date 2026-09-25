// =====================================================================
// KNOWLEDGE BRAIN — PHASE 6: RELATION RESOLUTION ENGINE
// =====================================================================

import type { KnowledgeEdge } from "@/lib/knowledge-engine/types";
import { normalizeKnowledgeName } from "@/lib/knowledge-engine/normalization";
import type { RelationResolutionResult } from "./types";

export interface ResolveRelationInput {
  source_canonical_id: string | null;
  target_canonical_id: string | null;
  relation_type: string;
  source_entity_name?: string;
  target_entity_name?: string;
}

export class RelationResolver {
  /**
   * Resolves a proposed relation between two resolved canonical nodes.
   * If an identical directed or symmetric edge already exists, marks it as
   * EXISTING_RELATION with is_noop_candidate = true (Section 73 & 74).
   */
  public resolveRelation(
    proposed: ResolveRelationInput,
    existingEdges: KnowledgeEdge[],
  ): RelationResolutionResult {
    const { source_canonical_id, target_canonical_id, relation_type } = proposed;

    if (!source_canonical_id || !target_canonical_id) {
      return {
        status: "NEW_RELATION",
        canonical_edge_id: null,
        confidence: 0,
        source_canonical_id,
        target_canonical_id,
        match_type: "NONE",
        reason_summary: "Endpoint entities are not yet fully resolved to canonical IDs.",
        is_noop_candidate: false,
      };
    }

    const normType = normalizeKnowledgeName(relation_type);

    // 1. Check for exact existing directed edge
    const exactEdge = existingEdges.find(
      (e) =>
        e.source_node_id === source_canonical_id &&
        e.target_node_id === target_canonical_id &&
        normalizeKnowledgeName(e.relation_type) === normType &&
        e.status !== "archived" &&
        e.status !== "deprecated",
    );

    if (exactEdge) {
      return {
        status: "EXISTING_RELATION",
        canonical_edge_id: exactEdge.id,
        confidence: 1.0,
        source_canonical_id,
        target_canonical_id,
        match_type: "EXACT_EDGE",
        reason_summary: `Identical relation (${relation_type}) already exists in canonical brain. Marked as NO-OP.`,
        is_noop_candidate: true,
      };
    }

    // 2. Check for inverse relation if relation type is symmetric (e.g. similar_to, related_to)
    const isSymmetric = normType.includes("similar") || normType.includes("related");
    if (isSymmetric) {
      const inverseEdge = existingEdges.find(
        (e) =>
          e.source_node_id === target_canonical_id &&
          e.target_node_id === source_canonical_id &&
          normalizeKnowledgeName(e.relation_type) === normType &&
          e.status !== "archived" &&
          e.status !== "deprecated",
      );

      if (inverseEdge) {
        return {
          status: "EXISTING_RELATION",
          canonical_edge_id: inverseEdge.id,
          confidence: 0.98,
          source_canonical_id,
          target_canonical_id,
          match_type: "INVERSE_EDGE",
          reason_summary: `Symmetric relation (${relation_type}) already exists in opposite direction. Marked as NO-OP.`,
          is_noop_candidate: true,
        };
      }
    }

    // 3. Check for similar/duplicate relation types between the same nodes
    // E.g. "uses" vs "can_use" vs "implements"
    const existingBetweenNodes = existingEdges.filter(
      (e) =>
        e.source_node_id === source_canonical_id &&
        e.target_node_id === target_canonical_id &&
        e.status !== "archived" &&
        e.status !== "deprecated",
    );

    if (existingBetweenNodes.length > 0 && existingBetweenNodes[0]) {
      const priorEdge = existingBetweenNodes[0];
      return {
        status: "POSSIBLE_DUPLICATE_RELATION",
        canonical_edge_id: priorEdge.id,
        confidence: 0.85,
        source_canonical_id,
        target_canonical_id,
        match_type: "SEMANTIC",
        reason_summary: `An existing relation of type "${priorEdge.relation_type}" connects these nodes. Proposed "${relation_type}" surfaced for review.`,
        is_noop_candidate: false,
      };
    }

    // 4. Otherwise, it is a clean NEW relation candidate
    return {
      status: "NEW_RELATION",
      canonical_edge_id: null,
      confidence: 0.95,
      source_canonical_id,
      target_canonical_id,
      match_type: "NONE",
      reason_summary: "No existing canonical edge connects these nodes with this relation.",
      is_noop_candidate: false,
    };
  }
}
