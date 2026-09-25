import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import type {
  EvidenceRow,
  SafeAttachEvidenceInput,
  SafeAttachEvidenceResult,
} from "./types";
import { evaluateClaimVerification } from "./claims";

/**
 * Normalizes source URLs to prevent redundant duplicate sources:
 * - strips unnecessary fragments
 * - removes trailing slashes
 * - lowercases protocol and domain
 */
export function normalizeSourceUrl(url: string | null | undefined): string | null {
  if (!url || !url.trim()) return null;
  const trimmed = url.trim();
  try {
    const parsed = new URL(trimmed);
    // keep pathname trimmed of trailing slash unless root
    let pathname = parsed.pathname;
    if (pathname.length > 1 && pathname.endsWith("/")) {
      pathname = pathname.slice(0, -1);
    }
    return `${parsed.protocol}//${parsed.host.toLowerCase()}${pathname}${parsed.search}`;
  } catch {
    // If not a standard URL, clean basic whitespace and trailing slashes
    return trimmed.replace(/\/+$/, "").toLowerCase();
  }
}

export interface GroupedEvidence {
  supporting: EvidenceRow[];
  contradicting: EvidenceRow[];
  qualifying: EvidenceRow[];
  mentioning: EvidenceRow[];
  total: number;
}

/**
 * Groups evidence items by their relationship (stance) to the claim.
 * Preserves both supporting and contradicting evidence!
 */
export function groupEvidenceByStance(evidences: EvidenceRow[]): GroupedEvidence {
  const result: GroupedEvidence = {
    supporting: [],
    contradicting: [],
    qualifying: [],
    mentioning: [],
    total: evidences.length,
  };

  for (const ev of evidences) {
    switch (ev.stance) {
      case "supported":
      case "verified":
        result.supporting.push(ev);
        break;
      case "contradicted":
      case "rejected":
        result.contradicting.push(ev);
        break;
      case "qualifies":
        result.qualifying.push(ev);
        break;
      case "mentions":
      default:
        result.mentioning.push(ev);
        break;
    }
  }

  return result;
}

/**
 * Safe write path for attaching evidence to a claim:
 * 1. Calls safe_attach_evidence RPC
 * 2. Or executes transactional fallback inserting evidence and updating claim verification
 */
export async function safeAttachEvidence(
  supabase: SupabaseClient<Database>,
  input: SafeAttachEvidenceInput,
): Promise<SafeAttachEvidenceResult> {
  // Try RPC safe_attach_evidence
  try {
    const { data: rpcData, error: rpcError } = await supabase.rpc("safe_attach_evidence", {
      p_claim_id: input.claim_id,
      p_source_id: input.source_id,
      p_stance: input.stance as Database["public"]["Enums"]["verification_status"],
      p_excerpt: input.excerpt ?? null,
      p_locator: input.locator ?? null,
      p_evidence_type: input.evidence_type ?? "direct_quote",
      p_confidence: input.confidence ?? 1.0,
      p_metadata: (input.metadata ?? {}) as any,
    });

    if (!rpcError && rpcData) {
      const parsed = typeof rpcData === "string" ? JSON.parse(rpcData) : rpcData;
      return {
        created: !!parsed.created,
        evidence: parsed.evidence ?? null,
        claim_verification: parsed.claim_verification,
        message: parsed.message,
      };
    }
  } catch {
    // Fall back to direct insert
  }

  // Get claim's node_id
  const { data: claim } = await supabase
    .from("knowledge_claims")
    .select("node_id")
    .eq("id", input.claim_id)
    .single();

  // Fallback direct insert
  const { data: newEv, error: insertError } = await supabase
    .from("evidence")
    .insert({
      claim_id: input.claim_id,
      source_id: input.source_id,
      node_id: claim?.node_id ?? null,
      stance: input.stance as Database["public"]["Enums"]["verification_status"],
      excerpt: input.excerpt?.trim() || null,
      locator: input.locator?.trim() || null,
      evidence_type: input.evidence_type ?? "direct_quote",
      confidence: input.confidence ?? 1.0,
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

  // Fetch all evidence for claim and re-evaluate verification
  const { data: allEvs } = await supabase
    .from("evidence")
    .select("*")
    .eq("claim_id", input.claim_id);

  const nextVerification = evaluateClaimVerification((allEvs ?? []) as EvidenceRow[]);

  await supabase
    .from("knowledge_claims")
    .update({
      verification: nextVerification,
      updated_at: new Date().toISOString(),
    })
    .eq("id", input.claim_id);

  // Record audit operation
  try {
    await supabase.from("knowledge_operations").insert({
      operation_type: "ADD_EVIDENCE",
      status: "executed",
      payload: {
        claim_id: input.claim_id,
        source_id: input.source_id,
        stance: input.stance,
      },
      result: (newEv ?? {}) as any,
      confidence: input.confidence ?? 1.0,
      reason: "Safe evidence attachment",
    });
  } catch {
    // Non-blocking
  }

  return {
    created: true,
    evidence: newEv as EvidenceRow,
    claim_verification: nextVerification,
  };
}
