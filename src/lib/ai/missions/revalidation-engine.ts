// =====================================================================
// KNOWLEDGE BRAIN — PHASE 11: REVALIDATION ENGINE
// Time-aware knowledge revalidation, version supersession,
// broken source revalidation & temporal truth preservation
// =====================================================================

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import { type ResearchProvider, MockResearchProvider } from "./research-provider";

export interface RevalidationTarget {
  claim_id: string;
  claim_text: string;
  node_id?: string | null;
  node_name?: string;
  temporal_context?: Record<string, unknown> | null;
  is_outdated?: boolean;
  status?: string;
  source_id?: string | null;
  source_url?: string | null;
  last_verified_at?: string | null;
}

export type RevalidationOutcomeType =
  | "STILL_SUPPORTED"
  | "UPDATED_EVIDENCE"
  | "POTENTIALLY_OUTDATED"
  | "SUPERSEDED_CANDIDATE"
  | "CONFLICT_DETECTED"
  | "SOURCE_UNAVAILABLE"
  | "INSUFFICIENT_EVIDENCE"
  | "NO_CHANGE";

export interface RevalidationResult {
  claim_id: string;
  outcome: RevalidationOutcomeType;
  current_version_context?: string;
  findings: string[];
  proposals: Array<{
    proposal_type: string;
    payload: Record<string, unknown>;
    reason: string;
  }>;
}

export class KnowledgeRevalidationEngine {
  private provider: ResearchProvider;

  constructor(
    private supabase: SupabaseClient<Database> | null = null,
    provider?: ResearchProvider,
  ) {
    this.provider = provider || new MockResearchProvider();
  }

  /**
   * Evaluates if a claim requires revalidation based on policy.
   * Timeless knowledge (e.g. definitions) does not need constant checking.
   */
  public shouldRevalidate(claim: RevalidationTarget): boolean {
    if (claim.is_outdated || claim.status === "outdated") return true;
    if (claim.temporal_context && Object.keys(claim.temporal_context).length > 0) return true;
    // Check text for time or version indicators
    const text = claim.claim_text.toLowerCase();
    const isVersioned = /\b(v\d+|\d+\.x|release|current|deprecated|deprecated_in)\b/.test(text);
    return isVersioned;
  }

  /**
   * Executes revalidation against current sources and context.
   */
  public async revalidateClaim(
    target: RevalidationTarget,
    currentVersionHint?: string,
  ): Promise<RevalidationResult> {
    const findings: string[] = [];
    const proposals: Array<{
      proposal_type: string;
      payload: Record<string, unknown>;
      reason: string;
    }> = [];

    // Search for current documentation regarding the concept
    const query = `${target.node_name || "Framework"} ${target.claim_text.slice(0, 50)} current version`;
    const searchResults = await this.provider.search(query, {
      maxResults: 2,
      timeOrVersionContext: currentVersionHint,
    });

    if (searchResults.length === 0) {
      return {
        claim_id: target.claim_id,
        outcome: "INSUFFICIENT_EVIDENCE",
        findings: ["No current documentation found to confirm or dispute claim."],
        proposals: [],
      };
    }

    const latest = searchResults[0];
    const fetched = await this.provider.fetch(latest.url);

    // Detect version discrepancy
    const oldVersion = (target.temporal_context as any)?.version || "earlier version";
    const textLower = fetched.sanitizedText.toLowerCase();

    // Check if new version differs from historical statement
    const hasDifferentVersion = currentVersionHint && !textLower.includes(oldVersion.toLowerCase());

    if (hasDifferentVersion || target.is_outdated) {
      findings.push(
        `New documentation from ${latest.title} discusses updated specification (${currentVersionHint || "current"}).`,
      );

      // Proposal 1: Create new current claim
      proposals.push({
        proposal_type: "ADD_CLAIM",
        payload: {
          node_id: target.node_id,
          claim_text: `In ${currentVersionHint || "current release"}, ${fetched.sanitizedText.slice(0, 100).trim()}`,
          temporal_context: { version: currentVersionHint || "latest" },
          status: "active",
        },
        reason: `Revalidation discovered current guidance in ${latest.title}`,
      });

      // Proposal 2: Mark old claim as superseded / outdated (PRESERVING HISTORY, NOT DELETING)
      proposals.push({
        proposal_type: "UPDATE_CLAIM",
        payload: {
          id: target.claim_id,
          status: "outdated",
          is_outdated: true,
          temporal_context: { ...((target.temporal_context as any) || {}), superseded_by_new_version: true },
        },
        reason: `Superseded by updated guidance in ${currentVersionHint || "latest"}. Historical record preserved.`,
      });

      return {
        claim_id: target.claim_id,
        outcome: "SUPERSEDED_CANDIDATE",
        current_version_context: currentVersionHint,
        findings,
        proposals,
      };
    }

    // Still supported
    findings.push(`Claim remains consistent with documentation from ${latest.title}.`);
    proposals.push({
      proposal_type: "ADD_EVIDENCE",
      payload: {
        claim_id: target.claim_id,
        source_url: latest.url,
        excerpt: fetched.sanitizedText.slice(0, 200),
        stance: "supported",
      },
      reason: `Revalidation confirmed claim is still supported by current source.`,
    });

    return {
      claim_id: target.claim_id,
      outcome: "STILL_SUPPORTED",
      current_version_context: currentVersionHint,
      findings,
      proposals,
    };
  }
}
