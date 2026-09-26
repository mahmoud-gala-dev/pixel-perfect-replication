// =====================================================================
// KNOWLEDGE BRAIN — INTELLIGENT GRAPH DEDUPLICATION ASSISTANT
// Detects synonymous, duplicate and overlapping canonical nodes
// Executes Safe Merges preserving graph integrity, provenance and search resilience
// =====================================================================

import { normalizeKnowledgeName, calculateNameSimilarity } from "@/lib/knowledge-engine/normalization";
import type { SupabaseClient } from "@supabase/supabase-js";

export interface DuplicateNodeInfo {
  id: string;
  name: string;
  canonical_name?: string | null;
  node_type?: string;
  status?: string;
  created_at?: string;
  claims_count?: number;
  relations_count?: number;
}

export interface DuplicateCandidatePair {
  id: string; // unique pair id: `${minId}-${maxId}`
  primaryNode: DuplicateNodeInfo;
  absorbedNode: DuplicateNodeInfo;
  similarity: number;
  matchType: "trigram_similarity" | "alias_overlap" | "canonical_match";
  reason: string;
}

export interface SafeMergeResult {
  success: boolean;
  primaryNodeId: string;
  absorbedNodeId: string;
  absorbedNodeName: string;
  transferredClaimsCount: number;
  transferredEdgesCount: number;
  aliasCreated: string;
  error?: string;
}

export class DeduplicationService {
  /**
   * Calculates character trigram similarity using Sørensen–Dice coefficient.
   * If input strings are shorter than 3 characters, gracefully falls back to bigrams.
   */
  static calculateTrigramSimilarity(str1: string, str2: string): number {
    const s1 = normalizeKnowledgeName(str1);
    const s2 = normalizeKnowledgeName(str2);

    if (s1 === s2) return 1.0;
    if (!s1 || !s2) return 0.0;

    // For short strings, delegate to standard bigram dice similarity
    if (s1.length < 3 || s2.length < 3) {
      return calculateNameSimilarity(s1, s2);
    }

    // Substring inclusion booster
    if (s1.includes(s2) || s2.includes(s1)) {
      const minLen = Math.min(s1.length, s2.length);
      const maxLen = Math.max(s1.length, s2.length);
      if (minLen / maxLen >= 0.70) {
        return Number((0.85 + 0.15 * (minLen / maxLen)).toFixed(3));
      }
    }

    const getTrigrams = (text: string) => {
      const map = new Map<string, number>();
      for (let i = 0; i <= text.length - 3; i++) {
        const tri = text.slice(i, i + 3);
        map.set(tri, (map.get(tri) ?? 0) + 1);
      }
      return map;
    };

    const tri1 = getTrigrams(s1);
    const tri2 = getTrigrams(s2);

    let intersection = 0;
    for (const [tri, count1] of tri1.entries()) {
      const count2 = tri2.get(tri) ?? 0;
      intersection += Math.min(count1, count2);
    }

    const totalTrigrams = (s1.length - 2) + (s2.length - 2);
    if (totalTrigrams <= 0) return 0.0;

    return Number(((2.0 * intersection) / totalTrigrams).toFixed(3));
  }

  /**
   * Scans canonical nodes and aliases to discover duplicate candidate pairs exceeding threshold (default 0.82).
   */
  static findDuplicateCandidates(
    nodes: DuplicateNodeInfo[],
    aliases: Array<{ node_id: string; alias: string }> = [],
    threshold = 0.82,
  ): DuplicateCandidatePair[] {
    const candidates: DuplicateCandidatePair[] = [];
    const activeNodes = nodes.filter((n) => n.status !== "archived" && !n.name.startsWith("__"));

    // Build alias lookup map: node_id -> Set of normalized aliases
    const aliasMap = new Map<string, Set<string>>();
    for (const a of aliases) {
      if (!aliasMap.has(a.node_id)) aliasMap.set(a.node_id, new Set());
      const norm = normalizeKnowledgeName(a.alias);
      if (norm) aliasMap.get(a.node_id)!.add(norm);
    }

    for (let i = 0; i < activeNodes.length; i++) {
      for (let j = i + 1; j < activeNodes.length; j++) {
        const nodeA = activeNodes[i]!;
        const nodeB = activeNodes[j]!;

        // Trigram similarity on names
        const nameSim = this.calculateTrigramSimilarity(nodeA.name, nodeB.name);

        // Trigram similarity on canonical_name if present
        let canonSim = 0;
        if (nodeA.canonical_name && nodeB.canonical_name) {
          canonSim = this.calculateTrigramSimilarity(nodeA.canonical_name, nodeB.canonical_name);
        }

        // Alias Overlap Check
        const aliasesA = aliasMap.get(nodeA.id) || new Set<string>();
        const aliasesB = aliasMap.get(nodeB.id) || new Set<string>();
        let aliasOverlapSim = 0;

        const normNameA = normalizeKnowledgeName(nodeA.name);
        const normNameB = normalizeKnowledgeName(nodeB.name);

        if (aliasesA.has(normNameB) || aliasesB.has(normNameA)) {
          aliasOverlapSim = 0.96;
        } else {
          for (const a of aliasesA) {
            if (aliasesB.has(a)) {
              aliasOverlapSim = 0.92;
              break;
            }
          }
        }

        const maxScore = Math.max(nameSim, canonSim, aliasOverlapSim);

        if (maxScore >= threshold) {
          // Determine primary node: earlier creation date, or more claims/relations, or longer established
          let primary = nodeA;
          let absorbed = nodeB;

          if (nodeB.created_at && nodeA.created_at) {
            if (new Date(nodeB.created_at).getTime() < new Date(nodeA.created_at).getTime()) {
              primary = nodeB;
              absorbed = nodeA;
            }
          } else if ((nodeB.claims_count ?? 0) > (nodeA.claims_count ?? 0)) {
            primary = nodeB;
            absorbed = nodeA;
          }

          let matchType: DuplicateCandidatePair["matchType"] = "trigram_similarity";
          let reason = `Trigram similarity score is ${Math.round(nameSim * 100)}% between names.`;

          if (aliasOverlapSim >= maxScore) {
            matchType = "alias_overlap";
            reason = `Shared alias detected between "${nodeA.name}" and "${nodeB.name}".`;
          } else if (canonSim >= maxScore && canonSim > nameSim) {
            matchType = "canonical_match";
            reason = `Canonical concept names match with ${Math.round(canonSim * 100)}% similarity.`;
          }

          candidates.push({
            id: `${primary.id}_${absorbed.id}`,
            primaryNode: primary,
            absorbedNode: absorbed,
            similarity: maxScore,
            matchType,
            reason,
          });
        }
      }
    }

    return candidates.sort((a, b) => b.similarity - a.similarity);
  }

  /**
   * Executes a Safe Merge between primary node and absorbed node.
   * Transfers claims, relations, and aliases to primary node; adds absorbed node name as alias; archives absorbed node.
   */
  static async executeSafeMerge(
    supabase: SupabaseClient | any,
    primaryNodeId: string,
    absorbedNodeId: string,
    inMemoryContext?: {
      nodes: any[];
      claims: any[];
      edges: any[];
      aliases?: any[];
      auditLogs?: any[];
    },
  ): Promise<SafeMergeResult> {
    if (primaryNodeId === absorbedNodeId) {
      throw new Error("Cannot merge a node into itself.");
    }

    const now = new Date().toISOString();

    // 1. In-Memory Execution (for tests or local offline mode)
    if (inMemoryContext) {
      const absorbedNode = inMemoryContext.nodes.find((n) => n.id === absorbedNodeId);
      const primaryNode = inMemoryContext.nodes.find((n) => n.id === primaryNodeId);

      if (!absorbedNode || !primaryNode) {
        throw new Error("Nodes not found in memory context.");
      }

      // Transfer claims
      let transferredClaims = 0;
      for (const claim of inMemoryContext.claims) {
        if (claim.node_id === absorbedNodeId) {
          claim.node_id = primaryNodeId;
          claim.updated_at = now;
          transferredClaims++;
        }
      }

      // Transfer edges
      let transferredEdges = 0;
      for (const edge of inMemoryContext.edges) {
        if (edge.from_node_id === absorbedNodeId) {
          if (edge.to_node_id !== primaryNodeId) {
            edge.from_node_id = primaryNodeId;
            edge.updated_at = now;
            transferredEdges++;
          }
        }
        if (edge.to_node_id === absorbedNodeId) {
          if (edge.from_node_id !== primaryNodeId) {
            edge.to_node_id = primaryNodeId;
            edge.updated_at = now;
            transferredEdges++;
          }
        }
      }

      // Transfer existing aliases
      if (inMemoryContext.aliases) {
        for (const alias of inMemoryContext.aliases) {
          if (alias.node_id === absorbedNodeId) {
            alias.node_id = primaryNodeId;
          }
        }

        // Add absorbed node name as alternate_name alias
        inMemoryContext.aliases.push({
          id: `alias-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`,
          node_id: primaryNodeId,
          alias: absorbedNode.name,
          alias_type: "alternate_name",
          is_active: true,
          created_at: now,
        });
      }

      // Archive absorbed node
      absorbedNode.status = "archived";
      absorbedNode.updated_at = now;

      // Record in audit logs
      if (inMemoryContext.auditLogs) {
        inMemoryContext.auditLogs.push({
          action: "SAFE_MERGE_NODES",
          actor_role: "user",
          target_type: "node",
          target_id: primaryNodeId,
          result: "SUCCESS",
          metadata: {
            absorbed_node_id: absorbedNodeId,
            absorbed_name: absorbedNode.name,
            transferred_claims: transferredClaims,
            transferred_edges: transferredEdges,
          },
        });
      }

      return {
        success: true,
        primaryNodeId,
        absorbedNodeId,
        absorbedNodeName: absorbedNode.name,
        transferredClaimsCount: transferredClaims,
        transferredEdgesCount: transferredEdges,
        aliasCreated: absorbedNode.name,
      };
    }

    // 2. Supabase Database Execution
    try {
      // Fetch absorbed node details
      const { data: absorbedNode, error: fetchErr } = await (supabase.from("knowledge_nodes") as any)
        .select("id, name, canonical_name")
        .eq("id", absorbedNodeId)
        .single();

      if (fetchErr || !absorbedNode) {
        throw new Error(`Failed to find absorbed node: ${fetchErr?.message || "Not found"}`);
      }

      // Transfer claims
      const { data: claimsData } = await (supabase.from("knowledge_claims") as any)
        .update({ node_id: primaryNodeId, updated_at: now })
        .eq("node_id", absorbedNodeId)
        .select("id");

      const transferredClaimsCount = claimsData?.length ?? 0;

      // Transfer outgoing edges
      const { data: outEdges } = await (supabase.from("knowledge_edges") as any)
        .update({ from_node_id: primaryNodeId, updated_at: now })
        .eq("from_node_id", absorbedNodeId)
        .neq("to_node_id", primaryNodeId)
        .select("id");

      // Transfer incoming edges
      const { data: inEdges } = await (supabase.from("knowledge_edges") as any)
        .update({ to_node_id: primaryNodeId, updated_at: now })
        .eq("to_node_id", absorbedNodeId)
        .neq("from_node_id", primaryNodeId)
        .select("id");

      const transferredEdgesCount = (outEdges?.length ?? 0) + (inEdges?.length ?? 0);

      // Clean up self-referencing loops created between primary and absorbed
      await (supabase.from("knowledge_edges") as any)
        .delete()
        .eq("from_node_id", primaryNodeId)
        .eq("to_node_id", primaryNodeId);

      // Transfer existing aliases
      await (supabase.from("knowledge_aliases") as any)
        .update({ node_id: primaryNodeId })
        .eq("node_id", absorbedNodeId);

      // Add absorbed node's name as an alias to preserve search resilience
      await (supabase.from("knowledge_aliases") as any).insert({
        node_id: primaryNodeId,
        alias: absorbedNode.name,
        alias_type: "alternate_name",
        is_active: true,
        created_at: now,
      });

      // Archive absorbed node
      await (supabase.from("knowledge_nodes") as any)
        .update({
          status: "archived",
          updated_at: now,
        })
        .eq("id", absorbedNodeId);

      // Record Operation in knowledge_operations & brain_audit_logs
      await (supabase.from("knowledge_operations") as any).insert({
        operation_type: "MERGE_NODE",
        status: "executed",
        payload: {
          primary_node_id: primaryNodeId,
          absorbed_node_id: absorbedNodeId,
          absorbed_name: absorbedNode.name,
          transferred_claims: transferredClaimsCount,
          transferred_edges: transferredEdgesCount,
        },
        created_at: now,
      });

      await (supabase.from("brain_audit_logs") as any).insert({
        action: "SAFE_MERGE_NODES",
        actor_role: "user",
        target_type: "node",
        target_id: primaryNodeId,
        result: "SUCCESS",
        metadata: {
          absorbed_node_id: absorbedNodeId,
          absorbed_name: absorbedNode.name,
          transferred_claims: transferredClaimsCount,
          transferred_edges: transferredEdgesCount,
        },
      });

      return {
        success: true,
        primaryNodeId,
        absorbedNodeId,
        absorbedNodeName: absorbedNode.name,
        transferredClaimsCount,
        transferredEdgesCount,
        aliasCreated: absorbedNode.name,
      };
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Safe merge failed";
      return {
        success: false,
        primaryNodeId,
        absorbedNodeId,
        absorbedNodeName: "",
        transferredClaimsCount: 0,
        transferredEdgesCount: 0,
        aliasCreated: "",
        error: msg,
      };
    }
  }
}
