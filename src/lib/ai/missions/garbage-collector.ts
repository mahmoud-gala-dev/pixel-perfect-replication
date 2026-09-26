// =====================================================================
// KNOWLEDGE BRAIN — PHASE 11: KNOWLEDGE GARBAGE COLLECTOR
// Non-destructive cleanup candidate discovery: duplicate detection,
// orphan repair, broken source remediation & governed cleanup proposals
// =====================================================================

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import type { KnowledgeNode, KnowledgeEdge } from "@/lib/knowledge-engine/types";

export type CleanupCandidateType =
  | "POSSIBLE_DUPLICATE"
  | "ORPHAN_NODE"
  | "BROKEN_SOURCE"
  | "STALE_EMBEDDING"
  | "DEPRECATED_UNUSED_NODE"
  | "EMPTY_NODE";

export interface CleanupCandidate {
  id: string;
  candidate_type: CleanupCandidateType;
  target_id: string;
  target_name: string;
  secondary_target_id?: string;
  secondary_target_name?: string;
  severity: "low" | "medium" | "high";
  confidence: number;
  reason: string;
  suggested_action: "REVIEW_MERGE" | "RELATE_ORPHAN" | "REPAIR_SOURCE" | "REINDEX" | "ARCHIVE";
  proposals: Array<{
    proposal_type: string;
    payload: Record<string, unknown>;
    reason: string;
  }>;
}

export class KnowledgeGarbageCollector {
  constructor(private supabase: SupabaseClient<Database> | null = null) {}

  /**
   * Runs maintenance scan to identify cleanup candidates.
   * ABSOLUTE SAFETY INVARIANT: NEVER executes hard DELETE operations.
   */
  public async scanForCandidates(dataset: {
    nodes?: KnowledgeNode[];
    edges?: KnowledgeEdge[];
    sources?: any[];
    claims?: any[];
  }): Promise<CleanupCandidate[]> {
    const candidates: CleanupCandidate[] = [];
    const nodes = dataset.nodes || [];
    const edges = dataset.edges || [];
    const sources = dataset.sources || [];

    // 1. Detect Possible Duplicate Nodes (Phase 6 Entity Resolution logic)
    for (let i = 0; i < nodes.length; i++) {
      for (let j = i + 1; j < nodes.length; j++) {
        const nodeA = nodes[i];
        const nodeB = nodes[j];

        if (nodeA.status === "archived" || nodeB.status === "archived") continue;

        // Compare names, canonical names, and slugs
        const nameA = nodeA.name.toLowerCase().trim();
        const nameB = nodeB.name.toLowerCase().trim();
        const slugA = nodeA.slug.toLowerCase().trim();
        const slugB = nodeB.slug.toLowerCase().trim();

        const exactMatch = nameA === nameB || slugA === slugB;
        const acronymMatch =
          (nameA.length <= 4 && nameB.split(/\s+/).map((w) => w[0]).join("") === nameA) ||
          (nameB.length <= 4 && nameA.split(/\s+/).map((w) => w[0]).join("") === nameB);

        if (exactMatch || acronymMatch) {
          candidates.push({
            id: `cand-dup-${nodeA.id}-${nodeB.id}`,
            candidate_type: "POSSIBLE_DUPLICATE",
            target_id: nodeA.id,
            target_name: nodeA.name,
            secondary_target_id: nodeB.id,
            secondary_target_name: nodeB.name,
            severity: "high",
            confidence: exactMatch ? 0.95 : 0.80,
            reason: `Potential duplicate concepts detected: "${nodeA.name}" and "${nodeB.name}".`,
            suggested_action: "REVIEW_MERGE",
            proposals: [
              {
                proposal_type: "MERGE_NODE",
                payload: {
                  primary_node_id: nodeA.id,
                  secondary_node_id: nodeB.id,
                  reason: `Duplicate candidate surfaced by Garbage Collector for human review.`,
                },
                reason: `Proposed merge of duplicate concepts into canonical "${nodeA.name}". Requires explicit review.`,
              },
            ],
          });
        }
      }
    }

    // 2. Detect Structural Orphan Nodes
    const connectedNodeIds = new Set<string>();
    for (const edge of edges) {
      if (edge.status !== "archived") {
        connectedNodeIds.add(edge.source_node_id);
        connectedNodeIds.add(edge.target_node_id);
      }
    }

    for (const node of nodes) {
      if (!node.parent_id && !connectedNodeIds.has(node.id) && node.status === "active") {
        candidates.push({
          id: `cand-orphan-${node.id}`,
          candidate_type: "ORPHAN_NODE",
          target_id: node.id,
          target_name: node.name,
          severity: "low",
          confidence: 0.95,
          reason: `Node "${node.name}" has no parent category and zero active graph connections.`,
          suggested_action: "RELATE_ORPHAN",
          proposals: [
            {
              proposal_type: "MOVE_NODE",
              payload: {
                node_id: node.id,
                suggested_context: "Categorize or connect to relevant domain.",
              },
              reason: `Suggest connecting orphan concept "${node.name}" to appropriate domain.`,
            },
          ],
        });
      }
    }

    // 3. Detect Broken Sources
    for (const src of sources) {
      if (src.availability === "broken" || src.availability === "offline") {
        candidates.push({
          id: `cand-src-${src.id}`,
          candidate_type: "BROKEN_SOURCE",
          target_id: src.id,
          target_name: src.title || src.url,
          severity: "medium",
          confidence: 1.0,
          reason: `Source "${src.title || src.url}" is unreachable. Attached evidence must be preserved while source is repaired.`,
          suggested_action: "REPAIR_SOURCE",
          proposals: [
            {
              proposal_type: "UPDATE_SOURCE",
              payload: {
                id: src.id,
                status: "needs_repair",
                availability: "broken",
              },
              reason: `Source marked for repair without deleting attached evidence.`,
            },
          ],
        });
      }
    }

    return candidates;
  }
}
