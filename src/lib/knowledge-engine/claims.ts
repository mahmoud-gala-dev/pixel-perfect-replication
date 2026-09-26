import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import type {
  EvidenceRow,
  KnowledgeClaimRow,
  SafeCreateClaimInput,
  SafeCreateClaimResult,
} from "./types";

/**
 * Validates atomic claim requirements:
 * 1. Non-empty
 * 2. Trimmed & whitespace collapsed
 * 3. Atomic checks (single atomic assertion)
 */
export function validateAtomicClaim(statement: string): {
  valid: boolean;
  normalized: string;
  isLikelyNonAtomic: boolean;
  error?: string | undefined;
} {
  const normalized = statement.trim().replace(/\s+/g, " ");
  if (!normalized) {
    return {
      valid: false,
      normalized: "",
      isLikelyNonAtomic: false,
      error: "Claim statement cannot be empty.",
    };
  }

  // Heuristic for complex run-on compound sentences (e.g. multiple " and ... and ... and ...")
  const andCount = (normalized.match(/\b(and|moreover|furthermore|additionally)\b/gi) ?? []).length;
  const sentenceCount = (normalized.match(/[.!?](\s|$)/g) ?? []).length;
  const isLikelyNonAtomic = andCount >= 3 || sentenceCount >= 2;

  return {
    valid: true,
    normalized,
    isLikelyNonAtomic,
  };
}

/**
 * Evaluates the aggregate verification status of a claim based on attached evidence stances.
 */
export function evaluateClaimVerification(evidences: EvidenceRow[]): Database["public"]["Enums"]["verification_status"] {
  let supportingCount = 0;
  let contradictingCount = 0;

  for (const ev of evidences) {
    if (ev.stance === "supported" || ev.stance === "verified") {
      supportingCount++;
    } else if (ev.stance === "contradicted" || ev.stance === "rejected") {
      contradictingCount++;
    }
  }

  if (supportingCount > 0 && contradictingCount > 0) {
    return "disputed";
  }
  if (supportingCount > 0) {
    return "verified";
  }
  if (contradictingCount > 0) {
    return "rejected";
  }
  return "unverified";
}

/**
 * Safe write path for creating atomic claims:
 * Validates, calls safe_create_claim RPC, or executes audited transaction fallback.
 */
export async function safeCreateClaim(
  supabase: SupabaseClient<Database>,
  input: SafeCreateClaimInput,
): Promise<SafeCreateClaimResult> {
  const val = validateAtomicClaim(input.statement);
  if (!val.valid) {
    return {
      created: false,
      message: val.error,
    };
  }

  // Try RPC safe_create_claim
  try {
    const { data: rpcData, error: rpcError } = await supabase.rpc("safe_create_claim", {
      p_node_id: (input.node_id ?? null) as string,
      p_statement: val.normalized,
      p_claim_type: input.claim_type ?? "fact",
      p_confidence: input.confidence ?? 1.0,
      p_status: input.status ?? "active",
      p_metadata: (input.metadata ?? {}) as any,
    });

    if (!rpcError && rpcData) {
      const parsed = typeof rpcData === "string" ? JSON.parse(rpcData) : rpcData;
      return {
        created: !!parsed.created,
        claim: parsed.claim ?? null,
        message: parsed.message,
      };
    }
  } catch {
    // Fall back to direct insert
  }

  // Fallback insert
  const { data: newClaim, error: insertError } = await supabase
    .from("knowledge_claims")
    .insert({
      node_id: input.node_id ?? null,
      claim_text: val.normalized,
      claim_type: input.claim_type ?? "fact",
      confidence: input.confidence ?? 1.0,
      status: input.status ?? "active",
      verification: "unverified",
      metadata: (input.metadata ?? {}) as any,
    })
    .select("*")
    .single();

  if (insertError) {
    return {
      created: false,
      message: insertError.message,
    };
  }

  // Record audit operation
  try {
    await supabase.from("knowledge_operations").insert({
      operation_type: "ADD_CLAIM",
      status: "executed",
      payload: {
        node_id: input.node_id,
        claim_type: input.claim_type ?? "fact",
        statement: val.normalized,
      },
      result: (newClaim ?? {}) as any,
      confidence: input.confidence ?? 1.0,
      reason: "Safe atomic claim creation",
    });
  } catch {
    // Non-blocking
  }

  return {
    created: true,
    claim: newClaim as KnowledgeClaimRow,
  };
}
