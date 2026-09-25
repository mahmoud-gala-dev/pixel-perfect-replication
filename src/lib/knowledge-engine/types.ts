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
