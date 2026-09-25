// =====================================================================
// KNOWLEDGE BRAIN — PHASE 6: CLAIM RESOLUTION ENGINE
// =====================================================================

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import type { KnowledgeClaimRow } from "@/lib/knowledge-engine/types";
import { normalizeKnowledgeName, calculateNameSimilarity } from "@/lib/knowledge-engine/normalization";
import type { ClaimResolutionResult } from "./types";
import {
  type EmbeddingProvider,
  defaultEmbeddingProvider,
  cosineSimilarity,
} from "./embedding-provider";

export interface ResolveClaimInput {
  statement: string;
  subject_canonical_node_id?: string | null;
  claim_type?: string;
}

function getClaimText(c: KnowledgeClaimRow | { statement?: string; claim_text?: string }): string {
  if ("claim_text" in c && c.claim_text) return c.claim_text;
  if ("statement" in c && c.statement) return c.statement;
  return "";
}

export class ClaimResolver {
  private supabase: SupabaseClient<Database> | null = null;
  private embeddingProvider: EmbeddingProvider;

  constructor(
    supabase?: SupabaseClient<Database> | null,
    embeddingProvider: EmbeddingProvider = defaultEmbeddingProvider,
  ) {
    this.supabase = supabase ?? null;
    this.embeddingProvider = embeddingProvider;
  }

  /**
   * Resolves a proposed claim against existing canonical claims.
   * Classifies as:
   * - EXISTING_CLAIM (exact or normalized match)
   * - POSSIBLE_DUPLICATE_CLAIM (semantically similar without conflict)
   * - POTENTIAL_CONFLICT (opposite/conflicting statement on same subject)
   * - NEW_CLAIM (novel factual claim)
   */
  public async resolveClaim(
    proposed: ResolveClaimInput,
    existingClaims: KnowledgeClaimRow[],
  ): Promise<ClaimResolutionResult> {
    const rawStatement = proposed.statement.trim();
    const normStatement = normalizeKnowledgeName(rawStatement);

    if (!rawStatement) {
      return {
        status: "NEW_CLAIM",
        canonical_claim_id: null,
        confidence: 0,
        match_type: "NONE",
        reason_summary: "Empty statement provided.",
      };
    }

    const activeClaims = existingClaims.filter(
      (c) => c.status !== "archived" && c.status !== "deprecated",
    );

    // 1. Exact Match
    const exact = activeClaims.find(
      (c) => getClaimText(c).trim() === rawStatement,
    );
    if (exact) {
      return {
        status: "EXISTING_CLAIM",
        canonical_claim_id: exact.id,
        confidence: 1.0,
        match_type: "EXACT",
        reason_summary: `Identical claim already exists in canonical brain.`,
        matched_statement: getClaimText(exact),
      };
    }

    // 2. Normalized Match
    const normalized = activeClaims.find(
      (c) => normalizeKnowledgeName(getClaimText(c)) === normStatement,
    );
    if (normalized) {
      return {
        status: "EXISTING_CLAIM",
        canonical_claim_id: normalized.id,
        confidence: 0.98,
        match_type: "NORMALIZED",
        reason_summary: `Equivalent normalized claim exists in canonical brain.`,
        matched_statement: getClaimText(normalized),
      };
    }

    // 3. Subject-filtered and Semantic similarity check
    const candidatePool = proposed.subject_canonical_node_id
      ? activeClaims.filter((c) => c.node_id === proposed.subject_canonical_node_id)
      : activeClaims;

    let bestSimilarity = 0;
    let bestMatch: KnowledgeClaimRow | null = null;

    // Check lexical similarity first
    for (const claim of candidatePool) {
      const text = getClaimText(claim);
      const sim = calculateNameSimilarity(rawStatement, text);
      if (sim > bestSimilarity) {
        bestSimilarity = sim;
        bestMatch = claim;
      }
    }

    // If strong lexical overlap (>= 0.85) on same subject
    if (bestSimilarity >= 0.85 && bestMatch) {
      return {
        status: "POSSIBLE_DUPLICATE_CLAIM",
        canonical_claim_id: bestMatch.id,
        confidence: bestSimilarity,
        match_type: "SEMANTIC",
        reason_summary: `Strongly overlapping claim on same subject: "${getClaimText(bestMatch)}". Review required.`,
        matched_statement: getClaimText(bestMatch),
      };
    }

    // Embeddings comparison for semantic similarity
    try {
      const proposedVec = await this.embeddingProvider.generateEmbedding(rawStatement);

      for (const claim of candidatePool) {
        const text = getClaimText(claim);
        const claimVec = await this.embeddingProvider.generateEmbedding(text);
        const cosSim = cosineSimilarity(proposedVec, claimVec);

        if (cosSim > bestSimilarity) {
          bestSimilarity = cosSim;
          bestMatch = claim;
        }
      }
    } catch {
      // Graceful fallback to lexical similarity
    }

    // Check if statement contains negation/conflict indicators
    const isNegation =
      normStatement.includes(" not ") ||
      normStatement.includes(" never ") ||
      normStatement.includes(" cannot ") ||
      normStatement.includes("لا ");

    if (bestMatch && bestSimilarity >= 0.70) {
      const matchedText = getClaimText(bestMatch);
      if (isNegation) {
        return {
          status: "POTENTIAL_CONFLICT",
          canonical_claim_id: bestMatch.id,
          confidence: bestSimilarity,
          match_type: "SEMANTIC",
          reason_summary: `Proposed claim may contradict existing canonical claim: "${matchedText}". Marked for conflict review.`,
          matched_statement: matchedText,
        };
      }

      return {
        status: "POSSIBLE_DUPLICATE_CLAIM",
        canonical_claim_id: bestMatch.id,
        confidence: bestSimilarity,
        match_type: "SEMANTIC",
        reason_summary: `Semantically related existing claim found: "${matchedText}". Review required.`,
        matched_statement: matchedText,
      };
    }

    // If no match found => NEW_CLAIM
    return {
      status: "NEW_CLAIM",
      canonical_claim_id: null,
      confidence: 0.95,
      match_type: "NONE",
      reason_summary: "No overlapping canonical claim found. Classified as new claim candidate.",
    };
  }
}
