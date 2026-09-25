// =====================================================================
// KNOWLEDGE BRAIN — PHASE 5: EXTRACTION ENGINE & PROPOSAL TYPES
// =====================================================================

export type KnowledgeRelevance =
  | "KNOWLEDGE_RICH"
  | "PARTIALLY_RELEVANT"
  | "CONVERSATIONAL_ONLY"
  | "USER_PREFERENCE"
  | "INSTRUCTION"
  | "QUESTION_ONLY"
  | "UNCERTAIN";

export type ProposalType =
  | "ENTITY"
  | "TOPIC"
  | "CONCEPT"
  | "CLAIM"
  | "RELATION"
  | "HIERARCHY"
  | "ALIAS"
  | "SOURCE"
  | "EVIDENCE"
  | "OPEN_QUESTION"
  | "CONFLICT";

export type ProposalStatus =
  | "pending"
  | "analyzed"
  | "needs_resolution"
  | "needs_review"
  | "approved"
  | "rejected"
  | "committed"
  | "quarantined"
  | "failed";

export type ValidationStatus = "unvalidated" | "valid" | "invalid" | "warning";

export type ExtractionRunStatus = "queued" | "processing" | "completed" | "partial" | "failed";

export type ClaimType =
  | "fact"
  | "definition"
  | "procedural"
  | "opinion"
  | "interpretation"
  | "preference"
  | "example"
  | "hypothesis"
  | "unknown";

export type KnowledgeState = "CERTAIN" | "PROBABLE" | "UNCERTAIN" | "DISPUTED";

// ---------------------------------------------------------------------
// EXTRACTED CANDIDATE MODELS (Local temporary references; NOT canonical IDs)
// ---------------------------------------------------------------------

export interface ExtractedEntityCandidate {
  temporary_id: string; // e.g. "entity_1"
  name: string;
  entity_type: string; // e.g. "framework", "concept", "technology", "tool", "person"
  description: string;
  aliases: string[];
  language?: string | undefined; // "en", "ar", etc.
  context: string[]; // e.g. ["Laravel", "Software Architecture"]
  confidence: number;
}

export interface ExtractedClaimCandidate {
  temporary_id: string; // e.g. "claim_1"
  statement: string; // atomic statement
  subject_entity_ref: string; // references temporary_id of entity
  claim_type: ClaimType;
  knowledge_state: KnowledgeState;
  confidence: number;
  source_message_ids: string[];
  requires_verification: boolean;
}

export interface ExtractedRelationCandidate {
  temporary_id: string; // e.g. "relation_1"
  source_entity_ref: string; // references temporary_id of entity
  relation_type: string; // e.g. "uses", "related_to", "can_use", "implements", "part_of"
  target_entity_ref: string; // references temporary_id of entity
  description?: string | undefined;
  confidence: number;
  source_message_ids: string[];
}

export interface ExtractedHierarchySuggestion {
  category: string;
  subcategory?: string | undefined;
  topic?: string | undefined;
  concept?: string | undefined;
  path: string[];
  confidence: number;
}

export interface ExtractedAliasCandidate {
  entity_ref: string; // references temporary_id of entity
  alias: string;
  language?: string | undefined;
  confidence: number;
}

export interface ExtractedSourceCandidate {
  temporary_id: string; // e.g. "source_1"
  title: string;
  url?: string | undefined;
  description?: string | undefined;
  confidence: number;
}

export interface ExtractedOpenQuestion {
  temporary_id: string;
  question: string;
  context?: string | undefined;
  confidence: number;
}

export interface ExtractedContradiction {
  temporary_id: string;
  statement_a: string;
  statement_b: string;
  explanation: string;
  source_message_ids: string[];
}

// ---------------------------------------------------------------------
// COMPLETE EXTRACTION PAYLOAD
// ---------------------------------------------------------------------

export interface ExtractionPayload {
  relevance: KnowledgeRelevance;
  relevance_reason?: string | undefined;
  entities: ExtractedEntityCandidate[];
  claims: ExtractedClaimCandidate[];
  relations: ExtractedRelationCandidate[];
  hierarchy_suggestions: ExtractedHierarchySuggestion[];
  aliases?: ExtractedAliasCandidate[] | undefined;
  sources: ExtractedSourceCandidate[];
  open_questions: ExtractedOpenQuestion[];
  conflicts: ExtractedContradiction[];
  user_preferences?: string[] | undefined;
}

// ---------------------------------------------------------------------
// DATABASE RECORD REPRESENTATIONS
// ---------------------------------------------------------------------

export interface KnowledgeExtractionRun {
  id: string;
  user_id: string;
  conversation_id: string;
  trigger_message_id?: string | null | undefined;
  status: ExtractionRunStatus;
  relevance: KnowledgeRelevance;
  model?: string | null | undefined;
  provider?: string | null | undefined;
  metrics: {
    message_count?: number | undefined;
    duration_ms?: number | undefined;
    entity_count?: number | undefined;
    claim_count?: number | undefined;
    relation_count?: number | undefined;
    proposal_count?: number | undefined;
    token_usage?: {
      prompt_tokens?: number | undefined;
      completion_tokens?: number | undefined;
      total_tokens?: number | undefined;
    } | undefined;
  };
  error?: string | null | undefined;
  started_at: string;
  completed_at?: string | null | undefined;
  created_at: string;
  updated_at: string;
}

export interface KnowledgeProposalItem {
  id: string;
  extraction_run_id?: string | null | undefined;
  user_id: string;
  conversation_id: string;
  source_message_id?: string | null | undefined;
  proposal_type: ProposalType;
  status: ProposalStatus;
  payload: Record<string, unknown>;
  original_payload?: Record<string, unknown> | null | undefined;
  rejection_reason?: string | null | undefined;
  extraction_confidence?: number | null | undefined;
  validation_status: ValidationStatus;
  model?: string | null | undefined;
  provider?: string | null | undefined;
  created_at: string;
  updated_at: string;
}

export interface ConversationExtractionSummary {
  total_proposals: number;
  entities: number;
  claims: number;
  relations: number;
  hierarchy: number;
  sources: number;
  open_questions: number;
  conflicts: number;
  pending: number;
  approved: number;
  rejected: number;
}
