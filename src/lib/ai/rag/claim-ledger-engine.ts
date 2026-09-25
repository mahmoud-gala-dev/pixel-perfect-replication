// =====================================================================
// KNOWLEDGE BRAIN — PHASE 9: CLAIM LEDGER ENGINE
// Structured attribution, citation token validation & support verification
// =====================================================================

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import type {
  AnswerClaim,
  ClaimLedgerResult,
  GroundingState,
  RetrievalResultPackage,
  SupportStatus,
} from "./types";

export class ClaimLedgerEngine {
  constructor(private supabase: SupabaseClient<Database> | null = null) {}

  /**
   * Processes the generated answer text against the actual retrieved context.
   * Resolves safe citation tokens (e.g. [C1], [C2], [1]) to canonical claims.
   * Strictly validates that cited claims/sources actually existed in the retrieved context.
   */
  public async buildClaimLedger(
    assistantContent: string,
    retrievalPackage: RetrievalResultPackage,
    assistantMessageId?: string | null | undefined,
  ): Promise<ClaimLedgerResult> {
    const claims = retrievalPackage.claims || [];
    const claimTokenMap = new Map<string, any>();
    const claimIdMap = new Map<string, any>();

    claims.forEach((c, idx) => {
      claimTokenMap.set(`[C${idx + 1}]`, c);
      claimTokenMap.set(`[c${idx + 1}]`, c);
      claimTokenMap.set(`[${idx + 1}]`, c);
      claimIdMap.set(c.id, c);
    });

    // Split answer into meaningful sentences or paragraphs
    const rawSentences = assistantContent
      .split(/(?<=[.!?؟\n])\s+/)
      .map((s) => s.trim())
      .filter((s) => s.length > 10);

    const answerClaims: AnswerClaim[] = [];
    let supportedCount = 0;
    let unsupportedCount = 0;
    let hasConflicts = false;

    rawSentences.forEach((sentence, idx) => {
      // Find citation tokens in this sentence (e.g. [C1], [C2], [1])
      const tokenMatches = sentence.match(/\[(?:C\d+|\d+)\]/gi) || [];
      const matchedClaims: any[] = [];

      for (const token of tokenMatches) {
        const canonicalClaim = claimTokenMap.get(token);
        if (canonicalClaim) {
          matchedClaims.push(canonicalClaim);
        }
      }

      // If no explicit token, also check high lexical match with retrieved claims
      if (matchedClaims.length === 0) {
        const sentLower = sentence.toLowerCase();
        for (const c of claims) {
          const stmtLower = (c.statement || "").toLowerCase();
          const words = stmtLower.split(/\W+/).filter((w: string) => w.length > 3);
          const matchedWords = words.filter((w: string) => sentLower.includes(w));
          if (words.length > 0 && matchedWords.length / words.length >= 0.6) {
            matchedClaims.push(c);
            break;
          }
        }
      }

      let supportStatus: SupportStatus = "UNSUPPORTED_BY_BRAIN";
      const supportingLinks: AnswerClaim["supporting_links"] = [];

      if (matchedClaims.length > 0) {
        const primaryClaim = matchedClaims[0]!;
        if (primaryClaim.is_conflicted) {
          supportStatus = "CONFLICTED";
          hasConflicts = true;
        } else if (primaryClaim.verification === "verified") {
          supportStatus = "SUPPORTED";
          supportedCount++;
        } else {
          supportStatus = "PARTIALLY_SUPPORTED";
          supportedCount++;
        }

        for (const mc of matchedClaims) {
          const topEvidence = mc.supporting_evidence?.[0];
          const topSource = mc.sources?.[0];

          supportingLinks.push({
            knowledge_claim_id: mc.id,
            evidence_id: topEvidence?.id || null,
            source_id: topSource?.id || mc.source_id || null,
            support_type: "SUPPORT",
          });
        }
      } else {
        // Sentence not grounded in Brain context
        if (tokenMatches.length > 0) {
          supportStatus = "UNSUPPORTED_BY_BRAIN";
        } else if (retrievalPackage.answerMode === "BRAIN_PREFERRED") {
          supportStatus = "GENERAL_MODEL_KNOWLEDGE";
        } else {
          supportStatus = "UNSUPPORTED_BY_BRAIN";
        }
        unsupportedCount++;
      }

      answerClaims.push({
        id: `ac-${Date.now().toString(36)}-${idx}`,
        statement: sentence,
        position: idx,
        support_status: supportStatus,
        confidence: matchedClaims.length > 0 ? 0.95 : 0.5,
        citation_token: tokenMatches[0] || null,
        supporting_links: supportingLinks,
      });
    });

    // Determine overall GroundingState
    let groundingState: GroundingState = "STRONGLY_GROUNDED";
    if (retrievalPackage.claims.length === 0 && retrievalPackage.nodes.length === 0) {
      groundingState = "INSUFFICIENT_BRAIN_KNOWLEDGE";
    } else if (hasConflicts) {
      groundingState = "CONFLICTED_KNOWLEDGE";
    } else if (supportedCount > 0 && unsupportedCount > 0) {
      groundingState = "PARTIALLY_GROUNDED";
    } else if (supportedCount === 0 && unsupportedCount > 0) {
      groundingState = "GENERAL_KNOWLEDGE_USED";
    }

    // Persist to database if connected and assistantMessageId is provided
    if (this.supabase && assistantMessageId) {
      try {
        for (const ac of answerClaims) {
          const { data: insertedClaim } = await this.supabase
            .from("answer_claims")
            .insert({
              assistant_message_id: assistantMessageId,
              statement: ac.statement,
              position: ac.position,
              support_status: ac.support_status,
              confidence: ac.confidence ?? null,
              citation_token: ac.citation_token ?? null,
            })
            .select("id")
            .single();

          if (insertedClaim && ac.supporting_links.length > 0) {
            for (const link of ac.supporting_links) {
              if (link.knowledge_claim_id) {
                await this.supabase.from("answer_claim_support").insert({
                  answer_claim_id: insertedClaim.id,
                  knowledge_claim_id: link.knowledge_claim_id,
                  evidence_id: link.evidence_id || null,
                  source_id: link.source_id || null,
                  support_type: link.support_type,
                });
              }
            }
          }
        }
      } catch (err) {
        console.warn("Failed to persist answer claim ledger to database", err);
      }
    }

    return {
      answerClaims,
      groundingState,
      supportedClaimCount: supportedCount,
      unsupportedClaimCount: unsupportedCount,
      hasConflicts,
    };
  }
}
