import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import type { KnowledgeEdge, KnowledgeNode } from "./types";

export interface PathStep {
  step_index: number;
  node_id: string;
  name: string;
  slug: string;
  node_type: string;
  summary: string | null;
  prerequisites: Array<{ id: string; name: string; relation_type: string }>;
  outgoing_dependents: Array<{ id: string; name: string; relation_type: string }>;
  step_kind: "prerequisite" | "core_concept" | "advanced" | "extension";
  claim_count: number;
  is_learned?: boolean;
}

export interface KnowledgePathResult {
  path_id: string;
  title: string;
  source_type: "canonical_prerequisite" | "ai_suggested_progression";
  target_node: { id: string; name: string };
  steps: PathStep[];
  total_steps: number;
  description: string;
}

export class KnowledgePathService {
  constructor(private supabase: SupabaseClient<Database> | null = null) {}

  /**
   * Generates an ordered Knowledge Path / Learning Sequence towards a target node.
   * Traverses canonical 'prerequisite_of', 'depends_on', and 'part_of' edges.
   * Explicitly flags whether the path is derived purely from canonical prerequisites or AI progression.
   */
  public buildPathToTarget(
    targetNodeId: string,
    allNodes: KnowledgeNode[],
    allEdges: KnowledgeEdge[],
    options: {
      isAiSuggested?: boolean;
      maxSteps?: number;
    } = {},
  ): KnowledgePathResult | null {
    const nodeMap = new Map<string, KnowledgeNode>();
    allNodes.forEach((n) => {
      if (!n.deleted_at) nodeMap.set(n.id, n);
    });

    const targetNode = nodeMap.get(targetNodeId);
    if (!targetNode) return null;

    const maxSteps = options.maxSteps ?? 10;
    const isAiSuggested = options.isAiSuggested ?? false;

    // Prerequisite relations:
    // If Edge: (A, prerequisite_of, B) => A is needed before B.
    // If Edge: (B, depends_on, A) => A is needed before B.
    // If Edge: (B, part_of, A) or (A, part_of, B) => contextual hierarchy.

    const directPrereqMap = new Map<string, Array<{ id: string; name: string; relation_type: string }>>();
    const dependentsMap = new Map<string, Array<{ id: string; name: string; relation_type: string }>>();

    allEdges.forEach((e) => {
      if (e.status === "archived" || e.status === "deprecated") return;

      const source = nodeMap.get(e.source_node_id);
      const target = nodeMap.get(e.target_node_id);
      if (!source || !target) return;

      if (e.relation_type === "prerequisite_of") {
        // source is prereq of target
        const list = directPrereqMap.get(e.target_node_id) || [];
        list.push({ id: source.id, name: source.name, relation_type: "prerequisite_of" });
        directPrereqMap.set(e.target_node_id, list);

        const depList = dependentsMap.get(e.source_node_id) || [];
        depList.push({ id: target.id, name: target.name, relation_type: "prerequisite_of" });
        dependentsMap.set(e.source_node_id, depList);
      } else if (e.relation_type === "depends_on") {
        // source depends on target => target is prereq of source
        const list = directPrereqMap.get(e.source_node_id) || [];
        list.push({ id: target.id, name: target.name, relation_type: "depends_on" });
        directPrereqMap.set(e.source_node_id, list);

        const depList = dependentsMap.get(e.target_node_id) || [];
        depList.push({ id: source.id, name: source.name, relation_type: "depends_on" });
        dependentsMap.set(e.target_node_id, depList);
      } else if (e.relation_type === "part_of" || e.relation_type === "uses") {
        // structural support
        const depList = dependentsMap.get(e.target_node_id) || [];
        depList.push({ id: source.id, name: source.name, relation_type: e.relation_type });
        dependentsMap.set(e.target_node_id, depList);
      }
    });

    // BFS backwards to collect all prerequisite ancestors
    const visitedPrereqs = new Set<string>();
    const queue: string[] = [targetNodeId];

    while (queue.length > 0 && visitedPrereqs.size < maxSteps) {
      const curr = queue.shift()!;
      const prereqs = directPrereqMap.get(curr) || [];
      for (const p of prereqs) {
        if (!visitedPrereqs.has(p.id) && p.id !== targetNodeId) {
          visitedPrereqs.add(p.id);
          queue.push(p.id);
        }
      }
    }

    // Topological sort (prerequisites first, target last)
    const sequenceIds: string[] = [];
    const remaining = new Set<string>(visitedPrereqs);

    while (remaining.size > 0) {
      // Find a node whose prerequisites in remaining are all resolved
      let candidate: string | null = null;
      for (const id of remaining) {
        const pList = directPrereqMap.get(id) || [];
        const hasUnresolvedPrereq = pList.some((p) => remaining.has(p.id));
        if (!hasUnresolvedPrereq) {
          candidate = id;
          break;
        }
      }

      if (candidate) {
        sequenceIds.push(candidate);
        remaining.delete(candidate);
      } else {
        // Cycle break fallback
        const next = remaining.values().next().value;
        if (next) {
          sequenceIds.push(next);
          remaining.delete(next);
        }
      }
    }

    // Add target node at the culmination of the path
    sequenceIds.push(targetNodeId);

    // If no prerequisites were found, add parent category or neighbor as introductory step
    if (sequenceIds.length === 1 && targetNode.parent_id && nodeMap.has(targetNode.parent_id)) {
      sequenceIds.unshift(targetNode.parent_id);
    }

    const steps: PathStep[] = sequenceIds.map((id, index) => {
      const node = nodeMap.get(id)!;
      const isTarget = id === targetNodeId;
      const stepKind: PathStep["step_kind"] = isTarget
        ? "core_concept"
        : index === 0
        ? "prerequisite"
        : "advanced";

      return {
        step_index: index + 1,
        node_id: node.id,
        name: node.name,
        slug: node.slug,
        node_type: node.node_type,
        summary: node.summary,
        prerequisites: directPrereqMap.get(node.id) || [],
        outgoing_dependents: dependentsMap.get(node.id) || [],
        step_kind: stepKind,
        claim_count: 0,
      };
    });

    return {
      path_id: `path-${targetNode.slug}`,
      title: `Learning Path: ${targetNode.name}`,
      source_type: isAiSuggested ? "ai_suggested_progression" : "canonical_prerequisite",
      target_node: { id: targetNode.id, name: targetNode.name },
      steps,
      total_steps: steps.length,
      description: isAiSuggested
        ? `AI-suggested concept progression towards ${targetNode.name} based on structural proximity.`
        : `Canonical prerequisite progression verified through typed graph relationships for ${targetNode.name}.`,
    };
  }
}
