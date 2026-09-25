import type { Database, Tables } from "@/integrations/supabase/types";

export type KnowledgeNode = Tables<"knowledge_nodes">;
export type KnowledgeAlias = Tables<"knowledge_aliases">;
export type KnowledgeEdge = Tables<"knowledge_edges">;
export type KnowledgeEntry = Tables<"knowledge_entries">;
export type KnowledgeEntryNode = Tables<"knowledge_entry_nodes">;

export type DbNodeType = Database["public"]["Enums"]["node_type"];
export type DbKnowledgeStatus = Database["public"]["Enums"]["knowledge_status"];

export const NODE_TYPES = [
  "category",
  "topic",
  "concept",
  "technology",
  "framework",
  "tool",
  "method",
  "theory",
  "person",
  "organization",
  "event",
  "resource",
] as const;

export type NodeType = (typeof NODE_TYPES)[number] | (string & {});

export const ALIAS_TYPES = [
  "abbreviation",
  "translation",
  "alternate_name",
  "common_name",
  "legacy_name",
] as const;

export type AliasType = (typeof ALIAS_TYPES)[number];

export const NODE_STATUSES = [
  "draft",
  "active",
  "proposed",
  "review",
  "archived",
  "deprecated",
] as const;

export type KnowledgeStatus = (typeof NODE_STATUSES)[number];

export const RELATION_TYPES = [
  "related_to",
  "uses",
  "requires",
  "prerequisite_of",
  "part_of",
  "alternative_to",
  "implements",
  "created_by",
] as const;

export type RelationType = (typeof RELATION_TYPES)[number] | (string & {});

export type ResolutionStatus = "existing" | "new" | "possible_duplicate" | "ambiguous";

export type MatchType =
  | "exact_parent"
  | "alias_parent"
  | "exact_canonical"
  | "alias"
  | "slug"
  | "normalized"
  | "fuzzy";

export interface NodeCandidate {
  id: string;
  name: string;
  canonical_name: string;
  slug: string;
  node_type: string;
  parent_id: string | null;
  parent_path?: string | undefined;
  match_type: MatchType;
  confidence: number;
  matched_alias?: string | null | undefined;
}

export interface NodeResolutionResult {
  status: ResolutionStatus;
  node_id: string | null;
  confidence: number;
  reason: string;
  candidates: NodeCandidate[];
}

export interface SafeCreateNodeInput {
  name: string;
  parent_id?: string | null | undefined;
  node_type?: NodeType | undefined;
  description?: string | null | undefined;
  summary?: string | null | undefined;
  status?: KnowledgeStatus | undefined;
  metadata?: Record<string, unknown> | undefined;
  force?: boolean | undefined;
}

export interface SafeCreateNodeResult {
  created: boolean;
  status: "created" | "existing" | "possible_duplicate" | "ambiguous";
  node?: KnowledgeNode | null | undefined;
  resolution?: NodeResolutionResult | undefined;
  reason?: string | undefined;
  candidates?: NodeCandidate[] | undefined;
}

export interface MoveValidationResult {
  valid: boolean;
  error?: string | undefined;
}

export interface HierarchyPathItem {
  id: string;
  name: string;
  canonical_name?: string | undefined;
  slug: string;
  node_type: NodeType;
  depth: number;
}

// ============================================================================
// PHASE 3 TYPES: Relations, Claims, Sources, Evidence & Graph
// ============================================================================

export type RelationTypeRow = Tables<"relation_types">;
export type SourceRow = Tables<"sources">;
export type EvidenceRow = Tables<"evidence">;
export type KnowledgeClaimRow = Tables<"knowledge_claims">;
export type KnowledgeClaim = KnowledgeClaimRow;

export const CLAIM_TYPES = [
  "fact",
  "definition",
  "rule",
  "observation",
  "opinion",
  "interpretation",
  "historical",
  "procedural",
  "technical",
] as const;

export type ClaimType = (typeof CLAIM_TYPES)[number] | (string & {});

export const EVIDENCE_STANCES = [
  "supported",
  "contradicted",
  "qualifies",
  "mentions",
] as const;

export type EvidenceStance = (typeof EVIDENCE_STANCES)[number];

export const EVIDENCE_TYPES = [
  "direct_quote",
  "data_point",
  "benchmark",
  "reference",
  "observation",
  "experiment",
] as const;

export type EvidenceType = (typeof EVIDENCE_TYPES)[number] | (string & {});

export const SOURCE_KINDS = [
  "documentation",
  "website",
  "book",
  "pdf",
  "api",
  "conversation",
  "user",
  "manual",
  "ai_research",
] as const;

export type SourceKind = Database["public"]["Enums"]["source_kind"];

export interface RelationTypeDef {
  key: string;
  name: string;
  description: string;
  inverse_key: string | null;
  is_symmetric: boolean;
  allows_self_relation: boolean;
}

export interface NodeRelationItem {
  id: string;
  direction: "outgoing" | "incoming";
  relation_type: string;
  relation_name: string;
  display_relation: string;
  inverse_key: string | null;
  is_symmetric: boolean;
  description: string | null;
  confidence: number | null;
  status: KnowledgeStatus;
  other_node: {
    id: string;
    name: string;
    node_type: string;
    slug: string;
  };
}

export interface NodeRelationsResult {
  node_id: string;
  outgoing: NodeRelationItem[];
  incoming: NodeRelationItem[];
  total: number;
}

export interface GraphNode {
  id: string;
  name: string;
  canonical_name: string | null;
  slug: string;
  node_type: string;
  status: KnowledgeStatus;
  parent_id: string | null;
  is_center?: boolean | undefined;
}

export interface GraphEdge {
  id: string;
  source: string;
  target: string;
  relation_type: string;
  description: string | null;
  confidence: number | null;
  status: KnowledgeStatus;
}

export interface GraphNeighborhood {
  center_node_id: string;
  depth: number;
  nodes: GraphNode[];
  edges: GraphEdge[];
}

export interface SafeCreateRelationInput {
  source_node_id: string;
  target_node_id: string;
  relation_type: string;
  description?: string | null | undefined;
  confidence?: number | undefined;
  status?: KnowledgeStatus | undefined;
  metadata?: Record<string, unknown> | undefined;
}

export interface SafeCreateRelationResult {
  created: boolean;
  status: "created" | "existing" | "rejected";
  edge?: KnowledgeEdge | null | undefined;
  message?: string | undefined;
}

export interface SafeCreateClaimInput {
  node_id?: string | null | undefined;
  statement: string;
  claim_type?: ClaimType | undefined;
  confidence?: number | undefined;
  status?: KnowledgeStatus | undefined;
  metadata?: Record<string, unknown> | undefined;
}

export interface SafeCreateClaimResult {
  created: boolean;
  claim?: KnowledgeClaimRow | null | undefined;
  message?: string | undefined;
}

export interface SafeAttachEvidenceInput {
  claim_id: string;
  source_id: string;
  stance: EvidenceStance;
  excerpt?: string | null | undefined;
  locator?: string | null | undefined;
  evidence_type?: EvidenceType | string | undefined;
  confidence?: number | undefined;
  metadata?: Record<string, unknown> | undefined;
}

export interface SafeAttachEvidenceResult {
  created: boolean;
  evidence?: EvidenceRow | null | undefined;
  claim_verification?: string | undefined;
  message?: string | undefined;
}

