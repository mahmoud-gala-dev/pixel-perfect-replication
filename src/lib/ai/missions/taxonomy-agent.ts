// =====================================================================
// KNOWLEDGE BRAIN — PHASE 11: TAXONOMY REVIEW AGENT
// Category explosion detection, taxonomy restructuring proposals & review governance
// =====================================================================

import type { KnowledgeNode } from "@/lib/knowledge-engine/types";

export interface TaxonomyReviewResult {
  category_explosion_nodes: Array<{
    node_id: string;
    name: string;
    child_count: number;
    recommendation: string;
  }>;
  duplicate_categories: Array<{
    primary_id: string;
    primary_name: string;
    duplicate_id: string;
    duplicate_name: string;
  }>;
  proposals: Array<{
    proposal_type: string;
    payload: Record<string, unknown>;
    risk_level: "high";
    reason: string;
  }>;
}

export class TaxonomyReviewAgent {
  /**
   * Evaluates the knowledge taxonomy for structural health.
   * STRICT SAFETY INVARIANT: Taxonomy mutations are HIGH-RISK and NEVER auto-commit.
   */
  public reviewTaxonomy(nodes: KnowledgeNode[]): TaxonomyReviewResult {
    const explosionCandidates: TaxonomyReviewResult["category_explosion_nodes"] = [];
    const duplicateCategories: TaxonomyReviewResult["duplicate_categories"] = [];
    const proposals: TaxonomyReviewResult["proposals"] = [];

    // 1. Child Count / Category Explosion (more than 15 direct children in a category)
    const childCounts = new Map<string, number>();
    for (const n of nodes) {
      if (n.parent_id && n.status === "active") {
        childCounts.set(n.parent_id, (childCounts.get(n.parent_id) || 0) + 1);
      }
    }

    for (const [parentId, count] of childCounts.entries()) {
      if (count > 15) {
        const parentNode = nodes.find((n) => n.id === parentId);
        if (parentNode) {
          explosionCandidates.push({
            node_id: parentId,
            name: parentNode.name,
            child_count: count,
            recommendation: `Split category "${parentNode.name}" into targeted sub-domains to prevent taxonomy explosion.`,
          });

          proposals.push({
            proposal_type: "RESTRUCTURE_TAXONOMY",
            payload: {
              node_id: parentId,
              current_children_count: count,
              action: "PROPOSE_SUB_TAXONOMY",
            },
            risk_level: "high",
            reason: `Category explosion detected: "${parentNode.name}" has ${count} direct children. Requires human review.`,
          });
        }
      }
    }

    // 2. Duplicate or Overlapping Categories
    const categories = nodes.filter((n) => n.node_type === "category" && n.status === "active");
    for (let i = 0; i < categories.length; i++) {
      for (let j = i + 1; j < categories.length; j++) {
        const catA = categories[i];
        const catB = categories[j];

        const nameA = catA.name.toLowerCase();
        const nameB = catB.name.toLowerCase();

        // Check substring or word permutation overlap
        const wordsA = new Set(nameA.split(/\s+/));
        const wordsB = new Set(nameB.split(/\s+/));
        const commonWords = Array.from(wordsA).filter((w) => wordsB.has(w) && w.length > 3);

        if (commonWords.length >= 2 || (nameA.includes(nameB) && nameA.length - nameB.length < 10)) {
          duplicateCategories.push({
            primary_id: catA.id,
            primary_name: catA.name,
            duplicate_id: catB.id,
            duplicate_name: catB.name,
          });

          proposals.push({
            proposal_type: "MERGE_CATEGORY",
            payload: {
              primary_category_id: catA.id,
              duplicate_category_id: catB.id,
            },
            risk_level: "high",
            reason: `Potential duplicate categories detected: "${catA.name}" and "${catB.name}". Reorganization proposal requires human review.`,
          });
        }
      }
    }

    return {
      category_explosion_nodes: explosionCandidates,
      duplicate_categories: duplicateCategories,
      proposals,
    };
  }
}
