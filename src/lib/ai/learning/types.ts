// =====================================================================
// KNOWLEDGE BRAIN — PHASE 7: AUTOMATIC BRAIN LEARNING ENGINE TYPES
// =====================================================================

import type { Database, Json } from "@/integrations/supabase/types";
import type { NodeType } from "../resolution/types";

export type LearningMode = "review" | "auto";
export type TrustTier = "tier_a" | "tier_b" | "tier_c";
export type RiskLevel = "low" | "medium" | "high";

export type PlanStatus =
  | "draft"
  | "validating"
  | "ready"
  | "needs_review"
  | "approved"
  | "committing"
  | "committed"
  | "partially_committed"
  | "rejected"
  | "failed"
  | "quarantined";

export type OperationType =
  | "CREATE_NODE"
  | "UPDATE_NODE"
  | "MOVE_NODE"
  | "MERGE_NODE"
  | "ARCHIVE_NODE"
  | "CREATE_RELATION"
  | "UPDATE_RELATION"
  | "DEPRECATE_RELATION"
  | "ADD_ALIAS"
  | "REMOVE_ALIAS"
  | "ADD_CLAIM"
  | "UPDATE_CLAIM"
  | "DEPRECATE_CLAIM"
  | "NO_OP"
  | "QUARANTINE_CLAIM"
  | "QUARANTINE_NODE"
  | "ROLLBACK"
  | "RESTORE"
  | "SUPERSEDE_CLAIM"
  | "MARK_OUTDATED"
  | "RESOLVE_CONFLICT"
  | "VERIFY_CLAIM"
  | "DISPUTE_CLAIM";

export type OperationStatus = Database["public"]["Enums"]["operation_status"];

export interface FieldDiff {
  field: string;
  previous_value: unknown;
  proposed_value: unknown;
  action: "ADDED" | "MODIFIED" | "UNCHANGED";
}

export interface KnowledgeDiff {
  target_type: "node" | "relation" | "claim" | "alias";
  target_identifier: string; // name or UUID
  field_diffs: FieldDiff[];
  summary: string;
  is_noop: boolean;
}

export interface PlannedOperationPayload {
  // Common
  temp_id?: string | undefined;
  description?: string | null | undefined;
  confidence?: number | undefined;
  reason?: string | undefined;

  // Node operations
  name?: string | undefined;
  canonical_name?: string | undefined;
  node_type?: NodeType | undefined;
  parent_id?: string | null | undefined;
  summary?: string | null | undefined;
  slug?: string | undefined;
  node_id?: string | undefined;

  // Alias operations
  alias?: string | undefined;
  language?: string | undefined;
  is_primary?: boolean | undefined;
  conflicting_node_id?: string | undefined;

  // Relation operations
  source_id?: string | undefined;
  target_id?: string | undefined;
  relation_type?: string | undefined;

  // Claim operations
  statement?: string | undefined;
  claim_type?: string | undefined;
  subject_node_id?: string | undefined;
  is_conflicting?: boolean | undefined;
  conflicting_with_claim_id?: string | undefined;
  verification?: string | undefined;
  knowledge_state?: string | undefined;
  valid_from?: string | null | undefined;
  valid_until?: string | null | undefined;
  observed_at?: string | null | undefined;
  metadata?: Record<string, unknown> | undefined;

  // Rollback & Integrity operations
  subject_table?: string | undefined;
  subject_id?: string | undefined;
  target_version?: number | undefined;
  claim_id?: string | undefined;
  superseded_by?: string | null | undefined;
  resolution_type?: string | undefined;
  resolution_notes?: string | undefined;
  conflict_id?: string | undefined;

  [key: string]: unknown;
}

export interface KnowledgeOperationItem {
  id?: string | undefined;
  plan_id?: string | undefined;
  proposal_id?: string | null | undefined;
  message_id?: string | null | undefined;
  operation_type: OperationType;
  target_type: "node" | "relation" | "claim" | "alias";
  target_id?: string | null | undefined;
  status: OperationStatus;
  payload: PlannedOperationPayload;
  previous_state?: Record<string, unknown> | null | undefined;
  proposed_state?: Record<string, unknown> | null | undefined;
  diff?: KnowledgeDiff | null | undefined;
  confidence: number;
  risk_level: RiskLevel;
  trust_tier: TrustTier;
  reason_summary: string;
  execution_order: number;
  dependencies?: string[] | undefined; // IDs or temp_ids that must execute before this
}

export interface KnowledgePlanSummary {
  reused_nodes: number;
  created_nodes: number;
  updated_nodes: number;
  created_relations: number;
  added_claims: number;
  no_ops: number;
  review_required: number;
  quarantined: number;
}

export interface KnowledgePlan {
  id: string;
  extraction_run_id?: string | null;
  conversation_id?: string | null;
  status: PlanStatus;
  learning_mode: LearningMode;
  risk_level: RiskLevel;
  overall_confidence: number;
  plan_version: number;
  diff_summary: Record<string, unknown>;
  summary: KnowledgePlanSummary;
  metadata: Record<string, unknown>;
  created_by: string;
  approved_by?: string | null;
  approved_at?: string | null;
  committed_at?: string | null;
  created_at: string;
  updated_at: string;
  operations: KnowledgeOperationItem[];
}

export interface KnowledgeTransaction {
  id: string;
  plan_id: string;
  conversation_id?: string | null;
  status: "started" | "committed" | "partially_committed" | "failed" | "rolled_back";
  operation_count: number;
  summary: KnowledgePlanSummary;
  initiated_by: string;
  approved_by?: string | null;
  started_at: string;
  completed_at?: string | null;
  metadata: Record<string, unknown>;
}

export interface BrainLearningSettings {
  learning_mode: LearningMode;
  auto_create_nodes: boolean;
  auto_add_aliases: boolean;
  auto_add_relations: boolean;
  auto_add_claims: boolean;
  require_evidence_for_claims: boolean;
  min_node_confidence: number;
  min_relation_confidence: number;
  min_claim_confidence: number;
  solo_direct_commit?: boolean;
}

export const DEFAULT_BRAIN_SETTINGS: BrainLearningSettings = {
  learning_mode: "review",
  auto_create_nodes: false,
  auto_add_aliases: true,
  auto_add_relations: true,
  auto_add_claims: false,
  require_evidence_for_claims: true,
  min_node_confidence: 0.9,
  min_relation_confidence: 0.85,
  min_claim_confidence: 0.9,
  solo_direct_commit: false,
};

export interface ValidationIssue {
  severity: "error" | "warning";
  code: string;
  message: string;
  target?: string | undefined;
}

export interface OperationValidationResult {
  valid: boolean;
  issues: ValidationIssue[];
}

export interface PlanCommitResult {
  success: boolean;
  plan_id: string;
  transaction_id?: string;
  summary: KnowledgePlanSummary;
  warnings?: string[];
  error?: string;
}
