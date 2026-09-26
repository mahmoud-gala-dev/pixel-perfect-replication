// =====================================================================
// KNOWLEDGE BRAIN — PHASE 11: MISSIONS & SELF-IMPROVEMENT TYPES
// =====================================================================

export type ObservationType =
  | "KNOWLEDGE_GAP"
  | "MISSING_EVIDENCE"
  | "OUTDATED_KNOWLEDGE"
  | "NEEDS_REVALIDATION"
  | "BROKEN_SOURCE"
  | "SOURCE_STALE"
  | "POSSIBLE_DUPLICATE"
  | "ALIAS_CONFLICT"
  | "OPEN_CONFLICT"
  | "ORPHAN_NODE"
  | "WEAK_CONNECTIVITY"
  | "RETRIEVAL_FAILURE"
  | "ANSWER_FEEDBACK"
  | "STALE_EMBEDDING"
  | "UNRESOLVED_PROPOSAL"
  | "QUARANTINED_KNOWLEDGE"
  | "HIGH_IMPACT_UNCERTAINTY"
  | "COMPRESSION_CANDIDATE"
  | "TAXONOMY_REVIEW_CANDIDATE";

export type ObservationSeverity = "low" | "medium" | "high" | "critical";
export type ObservationStatus = "open" | "in_progress" | "resolved" | "dismissed";

export interface BrainObservation {
  id: string;
  user_id: string;
  observation_type: ObservationType;
  target_type: "node" | "claim" | "source" | "relation" | "proposal" | "gap" | "cluster" | "retrieval";
  target_id: string;
  severity: ObservationSeverity;
  confidence: number;
  status: ObservationStatus;
  summary: string;
  signals: Record<string, unknown>;
  detected_by: string;
  first_detected_at: string;
  last_detected_at: string;
  occurrence_count: number;
  resolved_at?: string | null;
  metadata?: Record<string, unknown>;
}

export type MissionType =
  | "RESEARCH_GAP"
  | "FIND_EVIDENCE"
  | "REVALIDATE_CLAIM"
  | "RESOLVE_CONFLICT"
  | "CHECK_SOURCE"
  | "REPAIR_SOURCE"
  | "INVESTIGATE_DUPLICATE"
  | "IMPROVE_CONNECTIVITY"
  | "REVIEW_QUARANTINE"
  | "COMPRESS_KNOWLEDGE"
  | "REVIEW_TAXONOMY"
  | "REINDEX_KNOWLEDGE"
  | "ANSWER_QUALITY_INVESTIGATION";

export type MissionStatus =
  | "PROPOSED"
  | "QUEUED"
  | "RUNNING"
  | "WAITING_FOR_REVIEW"
  | "BLOCKED"
  | "COMPLETED"
  | "FAILED"
  | "CANCELLED"
  | "PAUSED";

export type MissionPriority = "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
export type MissionRiskLevel = "LOW" | "MEDIUM" | "HIGH";

export type MissionOutcome =
  | "IMPROVED"
  | "NO_CHANGE_NEEDED"
  | "PARTIALLY_IMPROVED"
  | "NEEDS_HUMAN_REVIEW"
  | "INSUFFICIENT_EVIDENCE"
  | "FAILED"
  | "BLOCKED";

export interface MissionBudget {
  max_steps: number;
  max_ai_calls: number;
  max_research_queries: number;
  max_sources: number;
}

export interface MissionBudgetUsed {
  steps: number;
  ai_calls: number;
  research_queries: number;
  sources: number;
}

export interface BrainMission {
  id: string;
  user_id: string;
  mission_type: MissionType;
  title: string;
  description?: string | null;
  status: MissionStatus;
  priority: MissionPriority;
  risk_level: MissionRiskLevel;
  target_type?: string | null;
  target_id?: string | null;
  trigger_observation_id?: string | null;
  goal: string;
  constraints?: Record<string, unknown>;
  budget: MissionBudget;
  budget_used: MissionBudgetUsed;
  assigned_agent: string;
  outcome?: MissionOutcome | null;
  outcome_summary?: string | null;
  started_at?: string | null;
  completed_at?: string | null;
  reviewed_at?: string | null;
  created_at: string;
  metadata?: Record<string, unknown>;
}

export interface AgentRun {
  id: string;
  user_id: string;
  mission_id: string;
  agent_type: string;
  status: "running" | "completed" | "failed" | "blocked" | "cancelled";
  input: Record<string, unknown>;
  structured_output: Record<string, unknown>;
  reason_summary?: string | null;
  model?: string | null;
  provider?: string | null;
  usage_metadata?: Record<string, unknown>;
  error?: string | null;
  started_at: string;
  completed_at?: string | null;
  created_at: string;
}

export interface ResearchRun {
  id: string;
  user_id: string;
  mission_id: string;
  status: "running" | "completed" | "failed" | "insufficient_evidence";
  research_question: string;
  search_plan: {
    questions: string[];
    preferred_source_types: string[];
    time_or_version_context?: string;
    max_sources?: number;
    stop_conditions?: string[];
  };
  sources_checked: Array<{
    url: string;
    title: string;
    source_kind: string;
    status: string;
    quality?: string;
  }>;
  findings_summary?: string | null;
  budget_used?: Record<string, unknown>;
  error?: string | null;
  started_at: string;
  completed_at?: string | null;
  metadata?: Record<string, unknown>;
}

export type FindingType =
  | "SUPPORTING_EVIDENCE"
  | "CONTRADICTING_EVIDENCE"
  | "NEW_CLAIM"
  | "UPDATED_CLAIM"
  | "SUPERSEDED_CLAIM"
  | "BROKEN_SOURCE_REPAIR"
  | "DUPLICATE_CANDIDATE"
  | "TAXONOMY_CANDIDATE";

export interface ResearchFinding {
  id: string;
  user_id: string;
  research_run_id: string;
  finding_type: FindingType;
  statement: string;
  related_entity_refs: string[];
  source_id?: string | null;
  source_url?: string | null;
  source_title?: string | null;
  evidence_excerpt?: string | null;
  confidence: number;
  status: "proposed" | "converted_to_proposal" | "dismissed";
  metadata?: Record<string, unknown>;
  created_at: string;
}

export type AutonomyMode = "OFF" | "OBSERVE_ONLY" | "SUGGEST" | "RESEARCH" | "SAFE_AUTO";

export interface AutonomySettings {
  autonomy_mode: AutonomyMode;
  daily_mission_budget: number;
  max_concurrent_missions: number;
  max_research_calls_per_mission: number;
  max_ai_calls_per_mission: number;
  max_sources_per_mission: number;
  allowed_domains: string[];
  blocked_domains: string[];
}

export interface BrainGoal {
  id: string;
  user_id: string;
  title: string;
  description?: string | null;
  status: "ACTIVE" | "COMPLETED" | "PAUSED" | "ARCHIVED";
  priority: "LOW" | "MEDIUM" | "HIGH";
  scope: Record<string, unknown>;
  success_criteria: string[];
  target_date?: string | null;
  created_at: string;
  metadata?: Record<string, unknown>;
}

export interface BrainAlert {
  id: string;
  user_id: string;
  alert_type: string;
  severity: "low" | "medium" | "high" | "critical";
  target_type?: string | null;
  target_id?: string | null;
  summary: string;
  status: "unread" | "acknowledged" | "dismissed";
  created_at: string;
  acknowledged_at?: string | null;
  metadata?: Record<string, unknown>;
}
