// =====================================================================
// KNOWLEDGE BRAIN — PHASE 11: MEMORY MODELS
// Distinct cognitive memory layers: Semantic, Episodic, Procedural,
// Experience & Working Memory architectures
// =====================================================================

export type MemoryLayer =
  | "SEMANTIC"      // Canonical concepts, taxonomy, relations, atomic claims
  | "EPISODIC"      // Conversational events, episodes, user dialogue history
  | "PROCEDURAL"    // Step-by-step how-to workflows, preconditions, actions
  | "EXPERIENCE"    // Context-specific observations (e.g. project X configuration bug)
  | "WORKING";      // In-memory conversational state and active mission context

export interface ProcedureStep {
  step_number: number;
  title: string;
  instruction: string;
  command?: string;
  expected_output?: string;
  potential_pitfalls?: string[];
}

export interface ProceduralMemoryItem {
  id: string;
  title: string;
  summary: string;
  preconditions: string[];
  inputs: Record<string, string>;
  steps: ProcedureStep[];
  outputs: Record<string, string>;
  warnings: string[];
  related_node_ids: string[];
  source_id?: string | null;
  evidence_id?: string | null;
  version_context?: string;
  created_at: string;
  updated_at: string;
}

export interface ExperienceMemoryItem {
  id: string;
  title: string;
  project_context: string;
  environment: Record<string, string>;
  observation_summary: string;
  observed_behavior: string;
  root_cause?: string;
  remediation?: string;
  is_universal_fact: false; // Explicit guard: NOT a universal claim
  related_node_ids: string[];
  created_at: string;
}

export interface WorkingMemoryState {
  conversation_id: string;
  active_topic_node_ids: string[];
  temporary_assumptions: string[];
  unresolved_queries: string[];
  current_mission_id?: string | null;
  last_updated_at: string;
}
