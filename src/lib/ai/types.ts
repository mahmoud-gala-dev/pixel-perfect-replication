// =====================================================================
// KNOWLEDGE BRAIN — PHASE 4: AI CHAT SYSTEM & GATEWAY TYPES
// =====================================================================

import type { Database } from "@/integrations/supabase/types";

export type MessageRole = Database["public"]["Enums"]["message_role"];
export type KnowledgeStatus = Database["public"]["Enums"]["knowledge_status"];
export type VerificationStatus = Database["public"]["Enums"]["verification_status"];

export interface ChatMessage {
  id?: string | undefined;
  role: "user" | "assistant" | "system" | "tool";
  content: string;
  created_at?: string | undefined;
  metadata?: Record<string, unknown> | undefined;
}

export interface BrainContextNode {
  id: string;
  name: string;
  node_type: string;
  status: string;
  description?: string | null | undefined;
  summary?: string | null | undefined;
}

export interface BrainContextClaim {
  id: string;
  node_id?: string | null | undefined;
  node_name?: string | null | undefined;
  statement: string;
  claim_type: string;
  status: string;
  verification: string;
  confidence?: number | null | undefined;
  knowledge_state?: string | undefined;
  is_conflicted?: boolean | undefined;
  is_outdated?: boolean | undefined;
  valid_from?: string | null | undefined;
  valid_until?: string | null | undefined;
  created_at?: string | null | undefined;
  source?: {
    title: string;
    url?: string | null | undefined;
  } | null | undefined;
}

export interface BrainContextRelation {
  id: string;
  relation_type: string;
  description?: string | null | undefined;
  confidence?: number | null | undefined;
  status: string;
  source: { id: string; name: string };
  target: { id: string; name: string };
}

export interface BrainContextPayload {
  nodes: BrainContextNode[];
  claims: BrainContextClaim[];
  relations: BrainContextRelation[];
  total_nodes: number;
}

export interface AIChatParams {
  messages: ChatMessage[];
  systemPrompt?: string | undefined;
  temperature?: number | undefined;
  maxTokens?: number | undefined;
  model?: string | undefined;
  stream?: boolean | undefined;
}

export interface AIChatResponse {
  content: string;
  model: string;
  provider: string;
  finishReason?: string | undefined;
  usage?: {
    promptTokens?: number | undefined;
    completionTokens?: number | undefined;
    totalTokens?: number | undefined;
  } | undefined;
}

export interface AIProvider {
  name: string;
  chat(params: AIChatParams): Promise<AIChatResponse>;
  streamChat?(params: AIChatParams): AsyncIterable<string>;
}

import type {
  AnswerMode,
  GroundingState,
  AnswerClaim,
  GraphPath,
} from "./rag/types";

export interface ChatRequestOptions {
  use_brain_context?: boolean | undefined;
  answer_mode?: AnswerMode | undefined;
  model?: string | undefined;
  temperature?: number | undefined;
  idempotency_key?: string | undefined;
  is_retry?: boolean | undefined;
  retry_user_message_id?: string | undefined;
}

export interface ChatRequestContract {
  conversation_id: string;
  message: string;
  options?: ChatRequestOptions | undefined;
}

export interface ChatResponseContract {
  message_id: string;
  conversation_id: string;
  content: string;
  status: "completed" | "failed";
  brain_context_used: boolean;
  grounding_state?: GroundingState | undefined;
  answer_mode?: AnswerMode | undefined;
  retrieval_run_id?: string | undefined;
  claim_ledger?: AnswerClaim[] | undefined;
  graph_paths?: GraphPath[] | undefined;
  sources?: Array<{
    id: string;
    title: string;
    url?: string | null | undefined;
    source_quality?: string | undefined;
    availability?: string | undefined;
  }> | undefined;
  conflicts_detected?: Array<{ claim_id: string; statement: string }> | undefined;
  references?: {
    nodes: BrainContextNode[];
    claims: BrainContextClaim[];
    relations: BrainContextRelation[];
  } | null | undefined;
  metadata?: {
    model?: string | undefined;
    provider?: string | undefined;
    latency_ms?: number | undefined;
    usage?: {
      promptTokens?: number | undefined;
      completionTokens?: number | undefined;
      totalTokens?: number | undefined;
    } | undefined;
    retrieval_summary?: Record<string, unknown> | undefined;
  } | undefined;
  error?: string | undefined;
}
