// =====================================================================
// KNOWLEDGE BRAIN — PHASE 8: KNOWLEDGE INTEGRITY TYPES
// Versioning, Evidence, Conflict Detection, Temporal Knowledge & Rollback
// =====================================================================

export type ClaimKnowledgeState =
  | "known"
  | "probable"
  | "uncertain"
  | "conflicted"
  | "outdated"
  | "deprecated"
  | "superseded"
  | "unknown";

export type ClaimVerificationStatus =
  | "unverified"
  | "partially_verified"
  | "verified"
  | "disputed"
  | "needs_review";

export type ConflictType =
  | "DIRECT_CONTRADICTION"
  | "TEMPORAL_CONFLICT"
  | "SCOPE_CONFLICT"
  | "SOURCE_DISAGREEMENT"
  | "DEFINITION_CONFLICT"
  | "ENTITY_AMBIGUITY"
  | "VERSION_CONFLICT"
  | "POSSIBLE_CONFLICT";

export type ConflictStatus =
  | "OPEN"
  | "UNDER_REVIEW"
  | "RESOLVED"
  | "NOT_A_CONFLICT"
  | "SUPERSEDED";

export type ConflictSeverity = "LOW" | "MEDIUM" | "HIGH";

export type ConflictResolutionType =
  | "A_SUPPORTED"
  | "B_SUPPORTED"
  | "BOTH_VALID_DIFFERENT_CONTEXT"
  | "BOTH_VALID_DIFFERENT_TIME"
  | "ONE_SUPERSEDES_ANOTHER"
  | "INSUFFICIENT_EVIDENCE"
  | "NOT_A_CONFLICT";

export type SourceQuality =
  | "official"
  | "primary"
  | "secondary"
  | "community"
  | "user-provided"
  | "ai-generated"
  | "unknown";

export type SourceAvailability =
  | "active"
  | "unavailable"
  | "broken"
  | "archived"
  | "unknown";

export type EvidenceStance =
  | "supported"
  | "contradicted"
  | "qualifies"
  | "mentions"
  | "verified"
  | "rejected"
  | "disputed";

export interface KnowledgeVersion {
  id: string;
  subject_table: string;
  subject_id: string;
  version: number;
  snapshot: Record<string, unknown>;
  change_type?: string | null;
  previous_version_id?: string | null;
  knowledge_transaction_id?: string | null;
  knowledge_operation_id?: string | null;
  reason_summary?: string | null;
  metadata?: Record<string, unknown>;
  created_by: string;
  created_at: string;
}

export interface KnowledgeChange {
  id: string;
  subject_table: string;
  subject_id: string;
  change_type: string;
  previous_state?: Record<string, unknown> | null;
  new_state?: Record<string, unknown> | null;
  diff?: Record<string, unknown> | null;
  reason?: string | null;
  reason_summary?: string | null;
  confidence?: number | null;
  operation_id?: string | null;
  transaction_id?: string | null;
  conversation_id?: string | null;
  message_id?: string | null;
  source_id?: string | null;
  changed_by: string;
  created_at: string;
}

export interface KnowledgeConflict {
  id: string;
  claim_a_id: string;
  claim_b_id: string;
  conflict_type: ConflictType;
  status: ConflictStatus;
  severity: ConflictSeverity;
  reason_summary: string;
  detected_by: string;
  resolution_type?: ConflictResolutionType | null;
  resolution_notes?: string | null;
  resolved_by?: string | null;
  resolved_at?: string | null;
  metadata?: Record<string, unknown>;
  created_by: string;
  created_at: string;
  updated_at: string;
}

export interface EvidenceItem {
  id: string;
  source_id: string;
  claim_id?: string | null;
  node_id?: string | null;
  stance: EvidenceStance;
  excerpt?: string | null;
  locator?: string | null;
  source_location?: string | null;
  strength?: number | null;
  confidence?: number | null;
  content_hash?: string | null;
  source?: {
    id: string;
    title: string;
    url?: string | null;
    source_quality: SourceQuality;
    availability: SourceAvailability;
    reliability?: number | null;
  } | null;
  created_by: string;
  created_at: string;
}

export interface ExplainKnowledgeResult {
  found: boolean;
  claim?: {
    id: string;
    statement: string;
    claim_type: string;
    knowledge_state: ClaimKnowledgeState;
    verification: ClaimVerificationStatus;
    confidence?: number | null;
    valid_from?: string | null;
    valid_until?: string | null;
    superseded_by?: string | null;
    created_at: string;
    updated_at: string;
  };
  node?: {
    id: string;
    name: string;
    node_type: string;
  } | null;
  supporting_evidence: EvidenceItem[];
  counter_evidence: EvidenceItem[];
  sources: Array<{
    id: string;
    title: string;
    url?: string | null;
    source_quality: SourceQuality;
    availability: SourceAvailability;
  }>;
  conflicts: Array<{
    id: string;
    conflict_type: ConflictType;
    status: ConflictStatus;
    severity: ConflictSeverity;
    reason_summary: string;
    other_claim_id: string;
  }>;
  provenance?: {
    conversation_id?: string | null;
    message_id?: string | null;
    origin?: string;
  } | null;
  version_history: Array<{
    version: number;
    change_type?: string | null;
    reason_summary?: string | null;
    created_at: string;
  }>;
}

export interface ImpactAnalysisResult {
  subject_table: string;
  subject_id: string;
  impact_level: "LOW" | "MEDIUM" | "HIGH";
  affected_nodes: Array<{ id: string; name: string }>;
  affected_relations: Array<{ id: string; relation_type: string; source_id: string; target_id: string }>;
  affected_claims: Array<{ id: string; statement: string }>;
  affected_evidence: Array<{ id: string; stance: string }>;
  warnings: string[];
}

export interface RollbackPreview {
  subject_table: string;
  subject_id: string;
  current_version: number;
  target_version: number;
  current_state: Record<string, unknown>;
  target_state: Record<string, unknown>;
  reverse_diff: {
    added: Record<string, unknown>;
    modified: Record<string, { from: unknown; to: unknown }>;
    removed: Record<string, unknown>;
  };
  impact: ImpactAnalysisResult;
  is_stale: boolean;
  stale_reason?: string;
}

export interface RollbackResult {
  success: boolean;
  subject_table: string;
  subject_id: string;
  target_version: number;
  new_version?: number;
  transaction_id?: string;
  restored_snapshot?: Record<string, unknown>;
  error?: string;
}

export interface BrainHealthMetrics {
  total_claims: number;
  verified_claims: number;
  unverified_claims: number;
  conflicted_claims: number;
  outdated_claims: number;
  superseded_claims: number;
  open_conflicts: number;
  claims_without_evidence: number;
  broken_sources: number;
  recent_rollbacks: number;
}
