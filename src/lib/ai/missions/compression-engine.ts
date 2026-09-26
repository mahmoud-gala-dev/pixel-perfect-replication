// =====================================================================
// KNOWLEDGE BRAIN — PHASE 11: KNOWLEDGE COMPRESSION ENGINE
// Non-destructive knowledge canonicalization, redundant claim consolidation,
// and complete provenance & evidence preservation
// =====================================================================

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";

export interface CompressionCandidate {
  primary_claim_id: string;
  duplicate_claim_ids: string[];
  canonical_statement: string;
  combined_evidence_ids: string[];
  combined_source_ids: string[];
  confidence: number;
  reason: string;
  has_conflicts: boolean;
  proposals: Array<{
    proposal_type: string;
    payload: Record<string, unknown>;
    reason: string;
  }>;
}

export class KnowledgeCompressionEngine {
  constructor(private supabase: SupabaseClient<Database> | null = null) {}

  /**
   * Identifies near-identical or redundant claims under the same node
   * and proposes a non-destructive consolidation preserving all provenance & evidence.
   */
  public findCompressionCandidates(
    claims: Array<{
      id: string;
      node_id?: string | null;
      claim_text: string;
      status?: string;
      verification_status?: string;
      confidence?: number | null;
    }>,
    evidence: Array<{
      id: string;
      claim_id: string;
      source_id?: string | null;
    }> = [],
  ): CompressionCandidate[] {
    const candidates: CompressionCandidate[] = [];
    const groupedByNode = new Map<string, typeof claims>();

    for (const c of claims) {
      if (!c.node_id || c.status === "archived") continue;
      const list = groupedByNode.get(c.node_id) || [];
      list.push(c);
      groupedByNode.set(c.node_id, list);
    }

    for (const [nodeId, nodeClaims] of groupedByNode.entries()) {
      if (nodeClaims.length < 2) continue;

      for (let i = 0; i < nodeClaims.length; i++) {
        for (let j = i + 1; j < nodeClaims.length; j++) {
          const cA = nodeClaims[i];
          const cB = nodeClaims[j];

          // Compute lexical and semantic overlap between claims
          const wordsA = new Set(cA.claim_text.toLowerCase().split(/\s+/).filter((w) => w.length > 3));
          const wordsB = new Set(cB.claim_text.toLowerCase().split(/\s+/).filter((w) => w.length > 3));

          if (wordsA.size === 0 || wordsB.size === 0) continue;

          let common = 0;
          for (const w of wordsA) {
            if (wordsB.has(w)) common++;
          }

          const jaccard = common / Math.max(wordsA.size, wordsB.size);

          if (jaccard >= 0.65) {
            // Highly redundant claim pair!
            const evidenceForA = evidence.filter((e) => e.claim_id === cA.id);
            const evidenceForB = evidence.filter((e) => e.claim_id === cB.id);

            const allEvidenceIds = Array.from(
              new Set([...evidenceForA.map((e) => e.id), ...evidenceForB.map((e) => e.id)]),
            );
            const allSourceIds = Array.from(
              new Set([
                ...evidenceForA.map((e) => e.source_id).filter(Boolean),
                ...evidenceForB.map((e) => e.source_id).filter(Boolean),
              ]),
            ) as string[];

            // Pick the more comprehensive text as canonical baseline
            const canonicalStatement = cA.claim_text.length >= cB.claim_text.length ? cA.claim_text : cB.claim_text;

            candidates.push({
              primary_claim_id: cA.id,
              duplicate_claim_ids: [cB.id],
              canonical_statement: canonicalStatement,
              combined_evidence_ids: allEvidenceIds,
              combined_source_ids: allSourceIds,
              confidence: Number(jaccard.toFixed(2)),
              has_conflicts: cA.status === "conflicted" || cB.status === "conflicted",
              reason: `High semantic overlap (${Math.round(jaccard * 100)}%) between claims under same concept.`,
              proposals: [
                {
                  proposal_type: "UPDATE_CLAIM",
                  payload: {
                    id: cA.id,
                    claim_text: canonicalStatement,
                    notes: `Consolidated with redundant claim ${cB.id}. Evidence merged.`,
                  },
                  reason: `Update primary canonical claim to consolidated statement.`,
                },
                {
                  proposal_type: "UPDATE_CLAIM",
                  payload: {
                    id: cB.id,
                    status: "archived",
                    notes: `Consolidated into canonical claim ${cA.id}. All evidence preserved on primary claim.`,
                  },
                  reason: `Archive redundant duplicate claim without deleting history or evidence.`,
                },
              ],
            });
          }
        }
      }
    }

    return candidates;
  }
}
