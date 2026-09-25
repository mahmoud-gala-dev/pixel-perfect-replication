// =====================================================================
// KNOWLEDGE BRAIN — PHASE 9: HYBRID RAG & RETRIEVAL ENGINE TYPES
// =====================================================================

export type QueryType =
  | "FACT"
  | "DEFINITION"
  | "EXPLANATION"
  | "COMPARISON"
  | "RELATIONSHIP"
  | "HOW_TO"
  | "WHY"
  | "HISTORY"
  | "TEMPORAL"
  | "ENTITY_LOOKUP"
  | "MULTI_HOP"
  | "OPEN_ENDED"
  | "UNKNOWN";

export type AnswerMode = "BRAIN_ONLY" | "BRAIN_PREFERRED" | "GENERAL_AI";

export type GroundingState =
  | "STRONGLY_GROUNDED"
  | "PARTIALLY_GROUNDED"
  | "INSUFFICIENT_BRAIN_KNOWLEDGE"
  | "CONFLICTED_KNOWLEDGE"
  | "GENERAL_KNOWLEDGE_USED";

export type SupportStatus =
  | "SUPPORTED"
  | "PARTIALLY_SUPPORTED"
  | "CONFLICTED"
  | "UNSUPPORTED_BY_BRAIN"
  | "GENERAL_MODEL_KNOWLEDGE"
  | "UNKNOWN";

export type RetrievalMethod =
  | "EXACT"
  | "ALIAS"
  | "LEXICAL"
  | "VECTOR"
  | "GRAPH"
  | "HIERARCHY"
  | "CLAIM"
  | "TEMPORAL"
  | "MULTI_SIGNAL";

export type GapType =
  | "MISSING_ENTITY"
  | "MISSING_CLAIM"
  | "MISSING_EVIDENCE"
  | "OUTDATED_KNOWLEDGE"
  | "CONFLICTED_KNOWLEDGE"
  | "INSUFFICIENT_CONTEXT"
  | "MISSING_RELATION"
  | "UNKNOWN";

export interface TemporalIntent {
  isHistorical: boolean;
  explicitVersion?: string | null | undefined;
  explicitYear?: number | null | undefined;
  isCurrentOnly: boolean;
}

export interface QueryAnalysis {
  rawQuery: string;
  normalizedQuery: string;
  queryType: QueryType;
  language: "en" | "ar" | "mixed";
  extractedKeywords: string[];
  resolvedEntities: Array<{
    name: string;
    nodeId: string;
    confidence: number;
    matchMethod?: string | undefined;
  }>;
  temporalIntent: TemporalIntent;
  comparisonEntities?: string[] | undefined;
  relationshipIntent?: {
    source?: string | undefined;
    target?: string | undefined;
    relationType?: string | undefined;
  } | undefined;
  depthPreference?: "shallow" | "deep" | "multi-hop" | undefined;
  detectedConcepts?: string[] | undefined;
}

export interface GraphPath {
  nodes: Array<{ id: string; name: string; node_type?: string | undefined }>;
  edges: Array<{ id: string; relation_type: string }>;
  relations: string[];
  length: number;
  depth?: number | undefined;
}

export interface RetrievedCandidate {
  id: string;
  type: "node" | "claim" | "edge" | "evidence" | "source" | "chunk";
  object: Record<string, unknown>;
  methods: RetrievalMethod[];
  score: number;
  scoreBreakdown: Record<string, number>;
  rank: number;
}

export interface RetrievalBudget {
  maxNodes?: number | undefined;
  maxClaims?: number | undefined;
  maxRelations?: number | undefined;
  maxEvidence?: number | undefined;
  maxSources?: number | undefined;
  maxGraphHops?: number | undefined;
  maxTokens?: number | undefined;
}

export interface RetrievalResultPackage {
  retrievalRunId: string;
  queryAnalysis: QueryAnalysis;
  answerMode: AnswerMode;
  groundingState: GroundingState;
  hasSufficientKnowledge: boolean;
  resolvedEntities: Array<{ name: string; nodeId: string }>;
  nodes: any[];
  claims: any[];
  relations: any[];
  graphPaths: GraphPath[];
  evidence: any[];
  sources: any[];
  conflicts: any[];
  chunks: any[];
  retrievalMetadata: {
    durationMs: number;
    methodsUsed: RetrievalMethod[];
    totalCandidatesFound: number;
    selectedCandidateCount: number;
    budgetApplied: RetrievalBudget;
  };
  methodsUsed?: RetrievalMethod[] | undefined;
}

export interface AnswerClaimSupportLink {
  knowledge_claim_id?: string | null | undefined;
  evidence_id?: string | null | undefined;
  source_id?: string | null | undefined;
  support_type: "SUPPORT" | "CONTRADICT" | "QUALIFY" | "MENTION";
  notes?: string | null | undefined;
}

export interface AnswerClaim {
  id: string;
  statement: string;
  position: number;
  support_status: SupportStatus;
  confidence?: number | null | undefined;
  citation_token?: string | null | undefined;
  supporting_links: AnswerClaimSupportLink[];
}

export interface ClaimLedgerResult {
  answerClaims: AnswerClaim[];
  groundingState: GroundingState;
  supportedClaimCount: number;
  unsupportedClaimCount: number;
  hasConflicts: boolean;
}

export interface KnowledgeGap {
  id: string;
  query: string;
  normalized_query?: string | null | undefined;
  conversation_id?: string | null | undefined;
  message_id?: string | null | undefined;
  gap_type: GapType;
  status: "open" | "reviewing" | "resolved" | "dismissed";
  priority: "low" | "medium" | "high";
  related_node_ids: string[];
  suggested_action?: string | null | undefined;
  created_at: string;
}

export interface RetrievalFeedback {
  id: string;
  retrieval_run_id: string;
  assistant_message_id: string;
  user_id?: string | null | undefined;
  rating: "helpful" | "not_helpful";
  feedback_type?:
    | "missing_knowledge"
    | "wrong_retrieval"
    | "wrong_source"
    | "outdated_knowledge"
    | "conflict_not_surfaced"
    | "other"
    | null
    | undefined;
  notes?: string | null | undefined;
  created_at: string;
}
