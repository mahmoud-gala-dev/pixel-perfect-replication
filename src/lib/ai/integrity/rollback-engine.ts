// =====================================================================
// KNOWLEDGE BRAIN — PHASE 8: ROLLBACK ENGINE
// Controlled non-destructive rollback via reverse diff, impact analysis & Knowledge Engine
// =====================================================================

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import { ImpactAnalysisService } from "./impact-analysis";
import type { RollbackPreview, RollbackResult, KnowledgeVersion } from "./types";
import type { VersioningEngine } from "./versioning-engine";

export interface RollbackExecutionInput {
  subject_table: string;
  subject_id: string;
  target_version: number;
  expected_current_version?: number;
  reason?: string;
  user_id: string;
  user_role?: "admin" | "editor" | "reviewer" | "viewer";
}

export interface RollbackContext {
  nodes?: any[];
  claims?: any[];
  edges?: any[];
  evidence?: any[];
  versions?: KnowledgeVersion[];
}

export class RollbackEngine {
  constructor(
    private supabase: SupabaseClient<Database> | null = null,
    private versioningEngine?: VersioningEngine,
  ) {}

  /**
   * Generates a preview of rolling back an entity to a target historical version.
   * Compares current state with historical snapshot and performs impact analysis.
   */
  public async previewRollback(
    subjectTable: string,
    subjectId: string,
    targetVersion: number,
    context: RollbackContext = {},
  ): Promise<RollbackPreview> {
    const versions = context.versions || [];
    const entityVersions = versions
      .filter((v) => v.subject_table === subjectTable && v.subject_id === subjectId)
      .sort((a, b) => b.version - a.version);

    const currentVerRecord = entityVersions[0] || null;
    const currentVersionNum = currentVerRecord ? currentVerRecord.version : 1;

    // Fetch current state from context
    let currentState: Record<string, unknown> = {};
    if (subjectTable === "knowledge_nodes" && context.nodes) {
      const node = context.nodes.find((n) => n.id === subjectId);
      if (node) currentState = { ...node };
    } else if (subjectTable === "knowledge_claims" && context.claims) {
      const claim = context.claims.find((c) => c.id === subjectId);
      if (claim) currentState = { ...claim };
    } else if (currentVerRecord) {
      currentState = currentVerRecord.snapshot;
    }

    // Fetch target historical version
    const targetVerRecord = entityVersions.find((v) => v.version === targetVersion) || null;
    if (!targetVerRecord) {
      throw new Error(`Target historical version ${targetVersion} not found for ${subjectTable}:${subjectId}.`);
    }

    const targetState = targetVerRecord.snapshot;

    // Calculate reverse diff (current -> target)
    const added: Record<string, unknown> = {};
    const modified: Record<string, { from: unknown; to: unknown }> = {};
    const removed: Record<string, unknown> = {};

    const allKeys = new Set([...Object.keys(currentState), ...Object.keys(targetState)]);
    const ignoredKeys = new Set(["updated_at", "created_at"]);

    for (const key of allKeys) {
      if (ignoredKeys.has(key)) continue;
      const currentVal = currentState[key];
      const targetVal = targetState[key];

      if (currentVal === undefined && targetVal !== undefined) {
        added[key] = targetVal;
      } else if (currentVal !== undefined && targetVal === undefined) {
        removed[key] = currentVal;
      } else if (JSON.stringify(currentVal) !== JSON.stringify(targetVal)) {
        modified[key] = { from: currentVal, to: targetVal };
      }
    }

    // Run Impact Analysis
    const impact = ImpactAnalysisService.analyzeImpact(subjectTable, subjectId, "ROLLBACK", {
      nodes: context.nodes ?? [],
      edges: context.edges ?? [],
      claims: context.claims ?? [],
      evidence: context.evidence ?? [],
    });

    return {
      subject_table: subjectTable,
      subject_id: subjectId,
      current_version: currentVersionNum,
      target_version: targetVersion,
      current_state: currentState,
      target_state: targetState,
      reverse_diff: { added, modified, removed },
      impact,
      is_stale: false,
    };
  }

  /**
   * Executes a controlled rollback to a historical version.
   * Creates a NEW version v(N+1) without deleting any intermediate history.
   */
  public async executeRollback(
    input: RollbackExecutionInput,
    context: RollbackContext = {},
  ): Promise<RollbackResult> {
    // 1. Authorization check
    const role = input.user_role || "editor";
    if (role === "viewer") {
      return {
        success: false,
        subject_table: input.subject_table,
        subject_id: input.subject_id,
        target_version: input.target_version,
        error: "Permission denied: Viewers are not authorized to perform knowledge rollback.",
      };
    }

    // 2. Fetch versions to verify target and detect stale concurrency
    const versions = context.versions || [];
    const entityVersions = versions
      .filter((v) => v.subject_table === input.subject_table && v.subject_id === input.subject_id)
      .sort((a, b) => b.version - a.version);

    const latestVersion = entityVersions[0]?.version ?? 1;

    // Stale check (Section 79 Optimistic Concurrency)
    if (
      input.expected_current_version !== undefined &&
      input.expected_current_version !== latestVersion
    ) {
      return {
        success: false,
        subject_table: input.subject_table,
        subject_id: input.subject_id,
        target_version: input.target_version,
        error: `Stale rollback rejected: Current version is v${latestVersion}, but rollback was prepared against v${input.expected_current_version}. Please re-plan.`,
      };
    }

    // 3. Find target historical version
    const targetVer = entityVersions.find((v) => v.version === input.target_version);
    if (!targetVer) {
      return {
        success: false,
        subject_table: input.subject_table,
        subject_id: input.subject_id,
        target_version: input.target_version,
        error: `Target version v${input.target_version} does not exist.`,
      };
    }

    const restoredSnapshot = { ...targetVer.snapshot };
    const nextVersionNum = latestVersion + 1;
    const txId = `tx-rollback-${Date.now().toString(36)}`;
    const now = new Date().toISOString();

    // 4. Apply restoration to in-memory entity state
    if (input.subject_table === "knowledge_nodes" && context.nodes) {
      const node = context.nodes.find((n) => n.id === input.subject_id);
      if (node) {
        if (restoredSnapshot["name"] !== undefined) node.name = restoredSnapshot["name"] as string;
        if (restoredSnapshot["description"] !== undefined) node.description = restoredSnapshot["description"] as string;
        if (restoredSnapshot["summary"] !== undefined) node.summary = restoredSnapshot["summary"] as string;
        if (restoredSnapshot["parent_id"] !== undefined) node.parent_id = restoredSnapshot["parent_id"] as string | null;
        if (restoredSnapshot["node_type"] !== undefined) node.node_type = restoredSnapshot["node_type"] as any;
        node.updated_at = now;
      }
    } else if (input.subject_table === "knowledge_claims" && context.claims) {
      const claim = context.claims.find((c) => c.id === input.subject_id);
      if (claim) {
        if (restoredSnapshot["claim_text"] !== undefined) claim.claim_text = restoredSnapshot["claim_text"] as string;
        if (restoredSnapshot["statement"] !== undefined) claim.statement = restoredSnapshot["statement"] as string;
        if (restoredSnapshot["claim_type"] !== undefined) claim.claim_type = restoredSnapshot["claim_type"] as string;
        if (restoredSnapshot["knowledge_state"] !== undefined) claim.knowledge_state = restoredSnapshot["knowledge_state"] as string;
        if (restoredSnapshot["verification"] !== undefined) claim.verification = restoredSnapshot["verification"] as any;
        claim.updated_at = now;
      }
    }

    // 5. Create new Version v(N+1) with change_type = 'ROLLBACK'
    const newVersion: KnowledgeVersion = {
      id: `ver-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`,
      subject_table: input.subject_table,
      subject_id: input.subject_id,
      version: nextVersionNum,
      snapshot: restoredSnapshot,
      change_type: "ROLLBACK",
      previous_version_id: entityVersions[0]?.id || null,
      knowledge_transaction_id: txId,
      reason_summary: input.reason || `Rollback to version ${input.target_version}`,
      metadata: { target_version: input.target_version },
      created_by: input.user_id,
      created_at: now,
    };

    if (context.versions) {
      context.versions.push(newVersion);
    }

    // 6. If connected to Supabase RPC, call server-side function
    if (this.supabase) {
      try {
        const { data, error } = await this.supabase.rpc("rollback_entity_to_version" as any, {
          p_subject_table: input.subject_table,
          p_subject_id: input.subject_id,
          p_target_version: input.target_version,
        });

        if (!error && data && (data as any).success) {
          return {
            success: true,
            subject_table: input.subject_table,
            subject_id: input.subject_id,
            target_version: input.target_version,
            new_version: (data as any).new_version,
            transaction_id: (data as any).transaction_id,
            restored_snapshot: (data as any).restored_snapshot,
          };
        }
      } catch (err) {
        console.warn("Server-side rollback RPC failed, falling back to memory/plan", err);
      }
    }

    return {
      success: true,
      subject_table: input.subject_table,
      subject_id: input.subject_id,
      target_version: input.target_version,
      new_version: nextVersionNum,
      transaction_id: txId,
      restored_snapshot: restoredSnapshot,
    };
  }
}
