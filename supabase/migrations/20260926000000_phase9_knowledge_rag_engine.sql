-- =====================================================================
-- KNOWLEDGE BRAIN — PHASE 9: HYBRID RAG, VECTOR SEARCH, GRAPH RETRIEVAL,
-- EVIDENCE-AWARE ANSWERS & CLAIM LEDGER
-- =====================================================================

-- 1. Knowledge Chunks Table (Semantic/Structural chunking for long entries)
CREATE TABLE IF NOT EXISTS public.knowledge_chunks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  entry_id UUID REFERENCES public.knowledge_entries(id) ON DELETE CASCADE,
  source_id UUID REFERENCES public.sources(id) ON DELETE SET NULL,
  node_id UUID REFERENCES public.knowledge_nodes(id) ON DELETE CASCADE,
  content TEXT NOT NULL,
  chunk_index INT NOT NULL DEFAULT 0,
  section TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  embedding vector,
  embedding_model TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_knowledge_chunks_entry ON public.knowledge_chunks(entry_id);
CREATE INDEX IF NOT EXISTS idx_knowledge_chunks_node ON public.knowledge_chunks(node_id);
CREATE INDEX IF NOT EXISTS idx_knowledge_chunks_source ON public.knowledge_chunks(source_id);

ALTER TABLE public.knowledge_chunks ENABLE ROW LEVEL SECURITY;
CREATE POLICY "knowledge_chunks_read" ON public.knowledge_chunks
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "knowledge_chunks_write" ON public.knowledge_chunks
  FOR ALL TO authenticated USING (auth.uid() IS NOT NULL) WITH CHECK (auth.uid() IS NOT NULL);

-- 2. Retrieval Runs Table (Structured trace of retrieval queries)
CREATE TABLE IF NOT EXISTS public.retrieval_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id UUID REFERENCES public.conversations(id) ON DELETE CASCADE,
  user_message_id UUID REFERENCES public.messages(id) ON DELETE SET NULL,
  assistant_message_id UUID REFERENCES public.messages(id) ON DELETE SET NULL,
  query TEXT NOT NULL,
  normalized_query TEXT,
  query_type TEXT NOT NULL DEFAULT 'FACT',
  answer_mode TEXT NOT NULL DEFAULT 'BRAIN_PREFERRED',
  grounding_state TEXT NOT NULL DEFAULT 'UNKNOWN',
  duration_ms INT,
  status TEXT NOT NULL DEFAULT 'completed',
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_retrieval_runs_conv ON public.retrieval_runs(conversation_id);
CREATE INDEX IF NOT EXISTS idx_retrieval_runs_user_msg ON public.retrieval_runs(user_message_id);
CREATE INDEX IF NOT EXISTS idx_retrieval_runs_asst_msg ON public.retrieval_runs(assistant_message_id);

ALTER TABLE public.retrieval_runs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "retrieval_runs_read" ON public.retrieval_runs
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "retrieval_runs_write" ON public.retrieval_runs
  FOR ALL TO authenticated USING (auth.uid() IS NOT NULL) WITH CHECK (auth.uid() IS NOT NULL);

-- 3. Retrieval Items Table (Candidates retrieved & scored per run)
CREATE TABLE IF NOT EXISTS public.retrieval_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  retrieval_run_id UUID NOT NULL REFERENCES public.retrieval_runs(id) ON DELETE CASCADE,
  object_type TEXT NOT NULL, -- 'node', 'claim', 'edge', 'evidence', 'source', 'chunk'
  object_id UUID NOT NULL,
  retrieval_method TEXT NOT NULL, -- 'EXACT', 'ALIAS', 'LEXICAL', 'VECTOR', 'GRAPH', 'HIERARCHY', 'CLAIM', 'TEMPORAL', 'MULTI_SIGNAL'
  rank INT NOT NULL DEFAULT 1,
  score DOUBLE PRECISION NOT NULL DEFAULT 0.0,
  score_breakdown JSONB NOT NULL DEFAULT '{}'::jsonb,
  selected_for_context BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_retrieval_items_run ON public.retrieval_items(retrieval_run_id);
CREATE INDEX IF NOT EXISTS idx_retrieval_items_object ON public.retrieval_items(object_type, object_id);

ALTER TABLE public.retrieval_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY "retrieval_items_read" ON public.retrieval_items
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "retrieval_items_write" ON public.retrieval_items
  FOR ALL TO authenticated USING (auth.uid() IS NOT NULL) WITH CHECK (auth.uid() IS NOT NULL);

-- 4. Retrieval Feedback Table (Human review / eval feedback)
CREATE TABLE IF NOT EXISTS public.retrieval_feedback (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  retrieval_run_id UUID NOT NULL REFERENCES public.retrieval_runs(id) ON DELETE CASCADE,
  assistant_message_id UUID REFERENCES public.messages(id) ON DELETE CASCADE,
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  rating TEXT NOT NULL, -- 'helpful', 'not_helpful'
  feedback_type TEXT, -- 'missing_knowledge', 'wrong_retrieval', 'wrong_source', 'outdated_knowledge', 'conflict_not_surfaced', 'other'
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_retrieval_feedback_run ON public.retrieval_feedback(retrieval_run_id);
CREATE INDEX IF NOT EXISTS idx_retrieval_feedback_msg ON public.retrieval_feedback(assistant_message_id);

ALTER TABLE public.retrieval_feedback ENABLE ROW LEVEL SECURITY;
CREATE POLICY "retrieval_feedback_read" ON public.retrieval_feedback
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "retrieval_feedback_write" ON public.retrieval_feedback
  FOR ALL TO authenticated USING (auth.uid() IS NOT NULL) WITH CHECK (auth.uid() IS NOT NULL);

-- 5. Answer Claims Table (Claim Ledger for generated answers)
CREATE TABLE IF NOT EXISTS public.answer_claims (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  assistant_message_id UUID REFERENCES public.messages(id) ON DELETE CASCADE,
  statement TEXT NOT NULL,
  position INT NOT NULL DEFAULT 0,
  support_status TEXT NOT NULL DEFAULT 'UNKNOWN', -- 'SUPPORTED', 'PARTIALLY_SUPPORTED', 'CONFLICTED', 'UNSUPPORTED_BY_BRAIN', 'GENERAL_MODEL_KNOWLEDGE', 'UNKNOWN'
  confidence DOUBLE PRECISION,
  citation_token TEXT, -- e.g. '[C1]', '[1]'
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_answer_claims_msg ON public.answer_claims(assistant_message_id);

ALTER TABLE public.answer_claims ENABLE ROW LEVEL SECURITY;
CREATE POLICY "answer_claims_read" ON public.answer_claims
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "answer_claims_write" ON public.answer_claims
  FOR ALL TO authenticated USING (auth.uid() IS NOT NULL) WITH CHECK (auth.uid() IS NOT NULL);

-- 6. Answer Claim Support Table (Attribution linking answer claims to canonical claims/evidence/sources)
CREATE TABLE IF NOT EXISTS public.answer_claim_support (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  answer_claim_id UUID NOT NULL REFERENCES public.answer_claims(id) ON DELETE CASCADE,
  knowledge_claim_id UUID REFERENCES public.knowledge_claims(id) ON DELETE CASCADE,
  evidence_id UUID REFERENCES public.evidence(id) ON DELETE SET NULL,
  source_id UUID REFERENCES public.sources(id) ON DELETE SET NULL,
  support_type TEXT NOT NULL DEFAULT 'SUPPORT', -- 'SUPPORT', 'CONTRADICT', 'QUALIFY', 'MENTION'
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_answer_claim_support_claim ON public.answer_claim_support(answer_claim_id);
CREATE INDEX IF NOT EXISTS idx_answer_claim_support_kclaim ON public.answer_claim_support(knowledge_claim_id);

ALTER TABLE public.answer_claim_support ENABLE ROW LEVEL SECURITY;
CREATE POLICY "answer_claim_support_read" ON public.answer_claim_support
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "answer_claim_support_write" ON public.answer_claim_support
  FOR ALL TO authenticated USING (auth.uid() IS NOT NULL) WITH CHECK (auth.uid() IS NOT NULL);

-- 7. Knowledge Gaps Table (Detected gaps when Brain retrieval is insufficient)
CREATE TABLE IF NOT EXISTS public.knowledge_gaps (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  query TEXT NOT NULL,
  normalized_query TEXT,
  conversation_id UUID REFERENCES public.conversations(id) ON DELETE SET NULL,
  message_id UUID REFERENCES public.messages(id) ON DELETE SET NULL,
  gap_type TEXT NOT NULL DEFAULT 'INSUFFICIENT_CONTEXT', -- 'MISSING_ENTITY', 'MISSING_CLAIM', 'MISSING_EVIDENCE', 'OUTDATED_KNOWLEDGE', 'CONFLICTED_KNOWLEDGE', 'INSUFFICIENT_CONTEXT', 'MISSING_RELATION', 'UNKNOWN'
  status TEXT NOT NULL DEFAULT 'open', -- 'open', 'reviewing', 'resolved', 'dismissed'
  priority TEXT NOT NULL DEFAULT 'medium', -- 'low', 'medium', 'high'
  related_node_ids UUID[] NOT NULL DEFAULT '{}',
  suggested_action TEXT,
  resolved_at TIMESTAMPTZ,
  resolved_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_knowledge_gaps_status ON public.knowledge_gaps(status);
CREATE INDEX IF NOT EXISTS idx_knowledge_gaps_type ON public.knowledge_gaps(gap_type);

ALTER TABLE public.knowledge_gaps ENABLE ROW LEVEL SECURITY;
CREATE POLICY "knowledge_gaps_read" ON public.knowledge_gaps
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "knowledge_gaps_write" ON public.knowledge_gaps
  FOR ALL TO authenticated USING (auth.uid() IS NOT NULL) WITH CHECK (auth.uid() IS NOT NULL);

-- 8. Graph Path Retrieval RPC (Bounded BFS traversal for relationship queries)
CREATE OR REPLACE FUNCTION public.find_graph_paths(
  p_source_node_id UUID,
  p_target_node_id UUID,
  p_max_depth INT DEFAULT 3
)
RETURNS TABLE (
  path_nodes UUID[],
  path_edges UUID[],
  path_relations TEXT[],
  path_length INT
)
LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path = public AS $$
BEGIN
  RETURN QUERY
  WITH RECURSIVE bfs_paths AS (
    -- Base case: direct edges from source
    SELECT 
      ARRAY[e.source_node_id, e.target_node_id] AS nodes,
      ARRAY[e.id] AS edges,
      ARRAY[e.relation_type::TEXT] AS relations,
      1 AS depth,
      e.target_node_id AS current_node
    FROM public.knowledge_edges e
    WHERE e.source_node_id = p_source_node_id
      AND e.deleted_at IS NULL
      AND e.status != 'archived'

    UNION ALL

    -- Recursive case: traverse outward
    SELECT 
      p.nodes || e.target_node_id,
      p.edges || e.id,
      p.relations || e.relation_type::TEXT,
      p.depth + 1,
      e.target_node_id
    FROM bfs_paths p
    JOIN public.knowledge_edges e ON e.source_node_id = p.current_node
    WHERE p.depth < p_max_depth
      AND NOT (e.target_node_id = ANY(p.nodes)) -- Prevent cycles
      AND e.deleted_at IS NULL
      AND e.status != 'archived'
  )
  SELECT 
    nodes,
    edges,
    relations,
    depth
  FROM bfs_paths
  WHERE current_node = p_target_node_id
  ORDER BY depth ASC
  LIMIT 5;
END;
$$;

GRANT EXECUTE ON FUNCTION public.find_graph_paths(UUID, UUID, INT) TO authenticated;
