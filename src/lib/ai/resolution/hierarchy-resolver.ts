// =====================================================================
// KNOWLEDGE BRAIN — PHASE 6: HIERARCHY RESOLUTION ENGINE
// =====================================================================

import type { KnowledgeNode } from "@/lib/knowledge-engine/types";
import { normalizeKnowledgeName } from "@/lib/knowledge-engine/normalization";
import type { HierarchyResolutionResult, HierarchySegmentResolution } from "./types";

export class HierarchyResolver {
  /**
   * Resolves a proposed hierarchy path (e.g. Programming -> Backend -> PHP -> Laravel -> Architecture).
   * Reuses all existing canonical path segments from the root down to the last matching node,
   * leaving only genuinely missing segments as candidates for future creation (Section 39, 40, 71).
   */
  public resolveHierarchyPath(
    pathSegments: string[],
    existingNodes: KnowledgeNode[],
  ): HierarchyResolutionResult {
    const resolvedPath: HierarchySegmentResolution[] = [];
    let currentParentId: string | null = null;
    let reusedCount = 0;
    let newCount = 0;

    for (let i = 0; i < pathSegments.length; i++) {
      const rawSeg = pathSegments[i];
      if (!rawSeg) continue;
      const segment = rawSeg.trim();
      const normSegment = normalizeKnowledgeName(segment);

      if (!segment) continue;

      // Look for a node matching segment name under currentParentId (or root if currentParentId is null)
      let match: KnowledgeNode | undefined = existingNodes.find(
        (n) =>
          n.deleted_at === null &&
          (n.parent_id ?? null) === (currentParentId ?? null) &&
          (normalizeKnowledgeName(n.name) === normSegment ||
            (n.canonical_name && normalizeKnowledgeName(n.canonical_name) === normSegment)),
      );

      // If not found under currentParentId, check globally if this is the first segment (root)
      if (!match && i === 0) {
        match = existingNodes.find(
          (n) =>
            n.deleted_at === null &&
            (normalizeKnowledgeName(n.name) === normSegment ||
              (n.canonical_name && normalizeKnowledgeName(n.canonical_name) === normSegment)),
        );
      }

      if (match) {
        resolvedPath.push({
          segment,
          status: "EXISTING",
          canonical_node_id: match.id,
          matched_name: match.name,
        });
        currentParentId = match.id;
        reusedCount++;
      } else {
        // Once a segment is missing, all subsequent child segments are NEW relative to this branch
        resolvedPath.push({
          segment,
          status: "NEW",
          canonical_node_id: null,
        });
        currentParentId = null;
        newCount++;
      }
    }

    const summary = `Hierarchy resolution: ${reusedCount} existing segments reused, ${newCount} new segments identified.`;

    return {
      resolved_path: resolvedPath,
      reused_prefix_count: reusedCount,
      new_segments_count: newCount,
      summary,
    };
  }
}
