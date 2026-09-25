// =====================================================================
// KNOWLEDGE BRAIN — PHASE 6: ENTITY RESOLUTION & SMART SEARCH TYPES
// =====================================================================

import type { Database } from "@/integrations/supabase/types";

export type NodeType = Database["public"]["Enums"]["node_type"];

export type ResolutionStatus =
  | "EXISTING"
  | "NEW"
  | "POSSIBLE_DUPLICATE"
  | "AMBIGUOUS"
  | "UNRESOLVED";

export type MatchType =
  | "EXACT_NAME"
  | "NORMALIZED_NAME"
  | "SLUG"
  | "ALIAS"
  | "FULL_TEXT"
  | "SEMANTIC"
  | "HIERARCHY_CONTEXT"
  | "GRAPH_CONTEXT"
  | "MULTI_SIGNAL";

export type ClaimResolutionStatus =
  | "EXISTING_CLAIM"
  | "NEW_CLAIM"
  | "POSSIBLE_DUPLICATE_CLAIM"
  | "POTENTIAL_CONFLICT";

export type RelationResolutionStatus =
  | "EXISTING_RELATION"
  | "NEW_RELATION"
  | "POSSIBLE_DUPLICATE_RELATION"
  | "CONFLICTING_RELATION";

export type AliasResolutionStatus =
  | "EXISTING_ALIAS_SAME_NODE"
  | "NEW_ALIAS"
  | "ALIAS_CONFLICT";

export interface CandidateScores {
  exact_score: number;
  alias_score: number;
  text_score: number;
  semantic_score: number;
  type_score: number;
  hierarchy_score: number;
  graph_score: number;
  combined_score: number;
}

export interface CandidateSignals {
  exact_name_match?: boolean;
  normalized_name_match?: boolean;
  slug_match?: boolean;
  alias_matched?: string | null;
  text_similarity?: number;
  semantic_similarity?: number;
  type_compatible?: boolean;
  hierarchy_match?: boolean;
  graph_neighbors_matched?: string[];
  notes?: string[];
}

export interface ResolutionCandidateItem {
  id?: string;
  candidate_node_id: string;
  candidate_name: string;
  candidate_slug: string;
  candidate_type: NodeType;
  rank: number;
  scores: CandidateScores;
  signals: CandidateSignals;
}

export interface EntityResolutionResult {
  status: ResolutionStatus;
  canonical_node_id: string | null;
  resolution_confidence: number;
  extraction_confidence: number;
  match_type: MatchType;
  reason_summary: string;
  selected_candidate_id: string | null;
  candidates: ResolutionCandidateItem[];
  resolver_version: string;
}

export interface ResolveEntityCandidateInput {
  name: string;
  normalized_name?: string;
  type?: string;
  aliases?: string[];
  language?: string;
  context?: string[];
  hierarchy_suggestion?: string[];
  related_entities?: string[];
  claims?: string[];
  conversation_context?: string;
  extraction_confidence?: number;
}

export interface ClaimResolutionResult {
  status: ClaimResolutionStatus;
  canonical_claim_id: string | null;
  confidence: number;
  match_type: "EXACT" | "NORMALIZED" | "SEMANTIC" | "NONE";
  reason_summary: string;
  matched_statement?: string;
}

export interface RelationResolutionResult {
  status: RelationResolutionStatus;
  canonical_edge_id: string | null;
  confidence: number;
  source_canonical_id: string | null;
  target_canonical_id: string | null;
  match_type: "EXACT_EDGE" | "INVERSE_EDGE" | "SEMANTIC" | "NONE";
  reason_summary: string;
  is_noop_candidate: boolean;
}

export interface HierarchySegmentResolution {
  segment: string;
  status: "EXISTING" | "NEW" | "AMBIGUOUS";
  canonical_node_id: string | null;
  matched_name?: string;
}

export interface HierarchyResolutionResult {
  resolved_path: HierarchySegmentResolution[];
  reused_prefix_count: number;
  new_segments_count: number;
  summary: string;
}

export interface AliasResolutionResult {
  status: AliasResolutionStatus;
  canonical_node_id: string | null;
  conflicting_node_id?: string | null;
  alias_normalized: string;
  reason_summary: string;
}

export interface ScoringWeights {
  exact_name: number;
  alias: number;
  normalized_name: number;
  slug: number;
  full_text: number;
  semantic: number;
  type_compat: number;
  hierarchy_context: number;
  graph_context: number;
}

export const DEFAULT_SCORING_WEIGHTS: ScoringWeights = {
  exact_name: 1.0,
  alias: 0.95,
  normalized_name: 0.92,
  slug: 0.90,
  full_text: 0.70,
  semantic: 0.65,
  type_compat: 0.10,
  hierarchy_context: 0.10,
  graph_context: 0.10,
};

export const RESOLUTION_THRESHOLDS = {
  EXISTING_MIN: 0.92,
  POSSIBLE_DUPLICATE_MIN: 0.72,
  AMBIGUOUS_DELTA: 0.05,
  NEW_MAX: 0.58,
} as const;

export const RESOLVER_VERSION = "1.0.0";
