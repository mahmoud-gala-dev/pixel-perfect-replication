// =====================================================================
// KNOWLEDGE BRAIN — PHASE 8: CONFLICT ENGINE
// Automated conflict detection, temporal context awareness & resolution workflows
// =====================================================================

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import type {
  KnowledgeConflict,
  ConflictType,
  ConflictStatus,
  ConflictResolutionType,
  ConflictSeverity,
} from "./types";

export interface CandidateClaimInput {
  id?: string;
  node_id?: string | null;
  statement: string;
  claim_type?: string;
  valid_from?: string | null;
  valid_until?: string | null;
  temporal_context?: Record<string, unknown> | null;
  source_id?: string | null;
  confidence?: number | null;
}

export interface ExistingClaimItem {
  id: string;
  node_id?: string | null;
  claim_text?: string;
  statement?: string;
  claim_type?: string;
  status?: string;
  knowledge_state?: string;
  verification?: string;
  valid_from?: string | null;
  valid_until?: string | null;
  temporal_context?: Record<string, unknown> | null;
  source_id?: string | null;
  confidence?: number | null;
}

export class ConflictEngine {
  private inMemoryConflicts: KnowledgeConflict[] = [];

  constructor(private supabase: SupabaseClient<Database> | null = null) {}

  /**
   * Detects whether a proposed claim conflicts with any existing claims.
   * Considers temporal validity, software version context, and scope before declaring a contradiction.
   */
  public detectConflicts(
    newClaim: CandidateClaimInput,
    existingClaims: ExistingClaimItem[],
  ): KnowledgeConflict[] {
    const detected: KnowledgeConflict[] = [];
    const newStmt = newClaim.statement.trim().toLowerCase();
    const newWords = new Set(newStmt.split(/\W+/).filter((w) => w.length > 2));
    const newClaimId = newClaim.id || `claim-temp-${Date.now().toString(36)}`;

    // Filter to claims sharing the same canonical entity/node or matching key terms
    const relatedClaims = existingClaims.filter((c) => {
      if (c.status === "archived") return false;
      if (newClaim.node_id && c.node_id && newClaim.node_id === c.node_id) return true;
      const cStmt = (c.claim_text || c.statement || "").trim().toLowerCase();
      const cWords = cStmt.split(/\W+/).filter((w) => w.length > 2);
      const overlap = cWords.filter((w) => newWords.has(w)).length;
      return overlap >= 3;
    });

    for (const existing of relatedClaims) {
      if (existing.id === newClaim.id) continue;
      const existStmt = (existing.claim_text || existing.statement || "").trim().toLowerCase();

      // Check temporal differences (Section 23: Not every difference is a conflict)
      const hasTemporalDifferentiation = this.checkTemporalDifferentiation(newClaim, existing);
      if (hasTemporalDifferentiation) {
        // Different time periods or software versions -> NOT a direct contradiction
        continue;
      }

      // Check contradiction patterns (e.g. opposing numbers/versions, opposing polarity)
      const contradictionAnalysis = this.analyzeContradiction(newStmt, existStmt);
      if (contradictionAnalysis.isContradiction) {
        const conflictId = `conf-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
        const conflict: KnowledgeConflict = {
          id: conflictId,
          claim_a_id: existing.id,
          claim_b_id: newClaimId,
          conflict_type: contradictionAnalysis.conflictType,
          status: "OPEN",
          severity: contradictionAnalysis.severity,
          reason_summary: contradictionAnalysis.reason,
          detected_by: "ConflictEngine",
          created_by: "system",
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        };

        detected.push(conflict);
        this.inMemoryConflicts.push(conflict);
      }
    }

    return detected;
  }

  /**
   * Evaluates if two statements have distinct temporal validity intervals or version contexts.
   */
  private checkTemporalDifferentiation(
    claimA: CandidateClaimInput,
    claimB: ExistingClaimItem,
  ): boolean {
    // 1. Explicit calendar date windows
    if (claimA.valid_until && claimB.valid_from) {
      if (new Date(claimA.valid_until).getTime() <= new Date(claimB.valid_from).getTime()) {
        return true;
      }
    }
    if (claimB.valid_until && claimA.valid_from) {
      if (new Date(claimB.valid_until).getTime() <= new Date(claimA.valid_from).getTime()) {
        return true;
      }
    }

    // 2. Version context metadata (e.g. { version: "5" } vs { version: "6" })
    const ctxA = claimA.temporal_context || {};
    const ctxB = claimB.temporal_context || {};
    if (ctxA["version"] && ctxB["version"] && ctxA["version"] !== ctxB["version"]) {
      return true;
    }

    // 3. In-text version phrasing (e.g. "version 5" vs "version 6" or "v5" vs "v6")
    const stmtA = claimA.statement.toLowerCase();
    const stmtB = (claimB.claim_text || claimB.statement || "").toLowerCase();

    const verPattern = /\b(?:version|v)\s*(\d+(?:\.\d+)?)\b/g;
    const matchesA = Array.from(stmtA.matchAll(verPattern)).map((m) => m[1]);
    const matchesB = Array.from(stmtB.matchAll(verPattern)).map((m) => m[1]);

    // If both specify different explicit version scopes in text, treat as temporal differentiation
    if (matchesA.length > 0 && matchesB.length > 0) {
      const isDifferentVersionScope = matchesA.some((va) => !matchesB.includes(va));
      if (isDifferentVersionScope) {
        // Check if one says "introduced in v5" vs "introduced in v6" (which is a true conflict of introduction)
        const isIntroA = stmtA.includes("introduced") || stmtA.includes("added in") || stmtA.includes("created in");
        const isIntroB = stmtB.includes("introduced") || stmtB.includes("added in") || stmtB.includes("created in");
        if (isIntroA && isIntroB) {
          return false; // Conflicting introduction claim!
        }
        return true;
      }
    }

    return false;
  }

  /**
   * Analyzes if two statements directly contradict each other.
   */
  private analyzeContradiction(
    stmtA: string,
    stmtB: string,
  ): { isContradiction: boolean; conflictType: ConflictType; severity: ConflictSeverity; reason: string } {
    // 1. Direct opposing introduction claim (e.g. "introduced in version 5" vs "introduced in version 6")
    const isIntroA = stmtA.includes("introduced") || stmtA.includes("released in") || stmtA.includes("added in");
    const isIntroB = stmtB.includes("introduced") || stmtB.includes("released in") || stmtB.includes("added in");
    if (isIntroA && isIntroB) {
      const verA = stmtA.match(/\b(?:version|v)\s*(\d+)/)?.[1];
      const verB = stmtB.match(/\b(?:version|v)\s*(\d+)/)?.[1];
      if (verA && verB && verA !== verB) {
        return {
          isContradiction: true,
          conflictType: "DIRECT_CONTRADICTION",
          severity: "HIGH",
          reason: `Contradicting release version claims: "${stmtA}" vs "${stmtB}".`,
        };
      }
    }

    // 2. Opposing polarities (supports vs does not support, uses vs does not use, requires vs optional)
    const hasNegationA = /\b(?:not|never|cannot|deprecated|discontinued|unsupported)\b/.test(stmtA);
    const hasNegationB = /\b(?:not|never|cannot|deprecated|discontinued|unsupported)\b/.test(stmtB);
    if (hasNegationA !== hasNegationB) {
      // Check word overlap excluding negation
      const wordsA = stmtA.replace(/\b(?:not|never|cannot|deprecated|discontinued|unsupported)\b/g, "").split(/\W+/).filter((w) => w.length > 2);
      const wordsB = new Set(stmtB.replace(/\b(?:not|never|cannot|deprecated|discontinued|unsupported)\b/g, "").split(/\W+/).filter((w) => w.length > 2));
      const shared = wordsA.filter((w) => wordsB.has(w)).length;
      if (shared >= 3) {
        return {
          isContradiction: true,
          conflictType: "DIRECT_CONTRADICTION",
          severity: "HIGH",
          reason: `Opposing assertion polarities between related claims: "${stmtA}" vs "${stmtB}".`,
        };
      }
    }

    // 3. Opposing property assignment (e.g. "is sync" vs "is redis")
    const wordsA = stmtA.split(/\W+/).filter((w) => w.length > 2);
    const wordsB = stmtB.split(/\W+/).filter((w) => w.length > 2);
    const setB = new Set(wordsB);
    const sharedWords = wordsA.filter((w) => setB.has(w));
    if (sharedWords.length >= 3) {
      const isPropA = /\bis\s+([a-z0-9_-]+)/.exec(stmtA)?.[1];
      const isPropB = /\bis\s+([a-z0-9_-]+)/.exec(stmtB)?.[1];
      if (isPropA && isPropB && isPropA !== isPropB) {
        return {
          isContradiction: true,
          conflictType: "DIRECT_CONTRADICTION",
          severity: "MEDIUM",
          reason: `Differing assertions for same property: "${stmtA}" vs "${stmtB}".`,
        };
      }
    }

    return {
      isContradiction: false,
      conflictType: "POSSIBLE_CONFLICT",
      severity: "LOW",
      reason: "",
    };
  }

  /**
   * Helper / alias for single-claim detection used by automated pipelines & tests.
   */
  public async detectConflict(
    newClaim: CandidateClaimInput,
    optionsOrClaims: ExistingClaimItem[] | { claims?: ExistingClaimItem[]; detectedBy?: string } = [],
  ): Promise<KnowledgeConflict | null> {
    const claims = Array.isArray(optionsOrClaims)
      ? optionsOrClaims
      : optionsOrClaims.claims || [];

    const candidate: CandidateClaimInput = {
      ...newClaim,
      node_id: newClaim.node_id || (newClaim as any).subject_node_id,
    };

    const detected = this.detectConflicts(candidate, claims);
    if (detected.length > 0) {
      const first = detected[0]!;
      if (!Array.isArray(optionsOrClaims) && optionsOrClaims.detectedBy) {
        first.detected_by = optionsOrClaims.detectedBy;
      }
      return first;
    }
    return null;
  }

  /**
   * Resolves an open knowledge conflict without erasing historical claims.
   */
  public async resolveConflict(
    conflictId: string,
    resolutionType: ConflictResolutionType,
    options: {
      notes?: string;
      resolved_by?: string;
      contextClaims?: ExistingClaimItem[];
    } = {},
  ): Promise<{ success: boolean; conflict?: KnowledgeConflict | undefined; updatedClaims?: ExistingClaimItem[] | undefined }> {
    const resolvedBy = options.resolved_by || "reviewer";
    const now = new Date().toISOString();

    const conflict = this.inMemoryConflicts.find((c) => c.id === conflictId);
    if (conflict) {
      conflict.status = "RESOLVED";
      conflict.resolution_type = resolutionType;
      conflict.resolution_notes = options.notes || `Resolved as ${resolutionType}`;
      conflict.resolved_by = resolvedBy;
      conflict.resolved_at = now;
      conflict.updated_at = now;
    }

    // Apply resolution side-effects to claims in context
    const updatedClaims: ExistingClaimItem[] = [];
    if (options.contextClaims && conflict) {
      const claimA = options.contextClaims.find((c) => c.id === conflict.claim_a_id);
      const claimB = options.contextClaims.find((c) => c.id === conflict.claim_b_id);

      if (claimA && claimB) {
        if (resolutionType === "A_SUPPORTED") {
          claimA.verification = "verified";
          claimA.knowledge_state = "known";
          claimB.verification = "disputed";
          claimB.knowledge_state = "uncertain";
          updatedClaims.push(claimA, claimB);
        } else if (resolutionType === "B_SUPPORTED") {
          claimB.verification = "verified";
          claimB.knowledge_state = "known";
          claimA.verification = "disputed";
          claimA.knowledge_state = "superseded";
          updatedClaims.push(claimA, claimB);
        } else if (resolutionType === "BOTH_VALID_DIFFERENT_CONTEXT") {
          claimA.verification = "verified";
          claimA.knowledge_state = "known";
          claimB.verification = "verified";
          claimB.knowledge_state = "known";
          updatedClaims.push(claimA, claimB);
        } else if (resolutionType === "BOTH_VALID_DIFFERENT_TIME") {
          claimA.verification = "verified";
          claimA.knowledge_state = "outdated";
          claimB.verification = "verified";
          claimB.knowledge_state = "known";
          updatedClaims.push(claimA, claimB);
        } else if (resolutionType === "ONE_SUPERSEDES_ANOTHER") {
          claimA.knowledge_state = "superseded";
          claimB.knowledge_state = "known";
          updatedClaims.push(claimA, claimB);
        }
      }
    }

    // Update database if connected
    if (this.supabase) {
      try {
        await this.supabase
          .from("knowledge_conflicts" as any)
          .update({
            status: "RESOLVED",
            resolution_type: resolutionType,
            resolution_notes: options.notes || `Resolved as ${resolutionType}`,
            resolved_by: resolvedBy,
            resolved_at: now,
            updated_at: now,
          })
          .eq("id", conflictId);
      } catch (err) {
        console.warn("Failed to persist conflict resolution to database", err);
      }
    }

    return { success: true, conflict, updatedClaims };
  }

  public getConflicts(): KnowledgeConflict[] {
    return this.inMemoryConflicts;
  }
}
