-- =====================================================================
-- KNOWLEDGE BRAIN — PHASE 6: SMART SEARCH, ENTITY RESOLUTION & DUPLICATE DETECTION
-- Migration: 20260925190000_phase6_knowledge_resolution_engine.sql
-- =====================================================================

-- 1. Add Embedding Tracking Columns to knowledge_nodes
ALTER TABLE public.knowledge_nodes
  ADD COLUMN IF NOT EXISTS embedding_status TEXT DEFAULT 'pending',
  ADD COLUMN IF NOT EXISTS embedded_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_knowledge_nodes_embedding_status
  ON public.knowledge_nodes (embedding_status);

-- 2. Knowledge Resolution Results Table
CREATE TABLE IF NOT EXISTS public.knowledge_resolution_results (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  proposal_id UUID NOT NULL REFERENCES public.knowledge_proposals(id) ON DELETE CASCADE,
  extraction_run_id UUID REFERENCES public.knowledge_extraction_runs(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  status TEXT NOT NULL,
  canonical_node_id UUID REFERENCES public.knowledge_nodes(id) ON DELETE SET NULL,
  resolution_confidence DOUBLE PRECISION NOT NULL DEFAULT 0.0,
  extraction_confidence DOUBLE PRECISION,
  match_type TEXT NOT NULL DEFAULT 'NONE',
  selected_candidate_id UUID REFERENCES public.knowledge_nodes(id) ON DELETE SET NULL,
  reason_summary TEXT,
  manual_override BOOLEAN NOT NULL DEFAULT false,
  manual_override_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  manual_override_at TIMESTAMPTZ,
  resolver_version TEXT NOT NULL DEFAULT '1.0.0',
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT resolution_status_valid CHECK (status IN ('EXISTING', 'NEW', 'POSSIBLE_DUPLICATE', 'AMBIGUOUS', 'UNRESOLVED')),
  CONSTRAINT match_type_valid CHECK (match_type IN ('EXACT_NAME', 'NORMALIZED_NAME', 'SLUG', 'ALIAS', 'FULL_TEXT', 'SEMANTIC', 'HIERARCHY_CONTEXT', 'GRAPH_CONTEXT', 'MULTI_SIGNAL', 'NONE'))
);

-- 3. Knowledge Resolution Candidates Table (Ranked Candidates for Ambiguous / Possible Duplicate Review)
CREATE TABLE IF NOT EXISTS public.knowledge_resolution_candidates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  resolution_result_id UUID NOT NULL REFERENCES public.knowledge_resolution_results(id) ON DELETE CASCADE,
  candidate_node_id UUID NOT NULL REFERENCES public.knowledge_nodes(id) ON DELETE CASCADE,
  rank INT NOT NULL DEFAULT 1,
  exact_score DOUBLE PRECISION NOT NULL DEFAULT 0.0,
  alias_score DOUBLE PRECISION NOT NULL DEFAULT 0.0,
  text_score DOUBLE PRECISION NOT NULL DEFAULT 0.0,
  semantic_score DOUBLE PRECISION NOT NULL DEFAULT 0.0,
  type_score DOUBLE PRECISION NOT NULL DEFAULT 0.0,
  hierarchy_score DOUBLE PRECISION NOT NULL DEFAULT 0.0,
  graph_score DOUBLE PRECISION NOT NULL DEFAULT 0.0,
  combined_score DOUBLE PRECISION NOT NULL DEFAULT 0.0,
  signals JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 4. Indexes for Performant Resolution Lookups
CREATE INDEX IF NOT EXISTS idx_resolution_results_proposal
  ON public.knowledge_resolution_results (proposal_id);

CREATE INDEX IF NOT EXISTS idx_resolution_results_run
  ON public.knowledge_resolution_results (extraction_run_id);

CREATE INDEX IF NOT EXISTS idx_resolution_results_status
  ON public.knowledge_resolution_results (status);

CREATE INDEX IF NOT EXISTS idx_resolution_results_user
  ON public.knowledge_resolution_results (user_id);

CREATE INDEX IF NOT EXISTS idx_resolution_candidates_result
  ON public.knowledge_resolution_candidates (resolution_result_id, rank ASC);

CREATE INDEX IF NOT EXISTS idx_resolution_candidates_node
  ON public.knowledge_resolution_candidates (candidate_node_id);

-- 5. Row-Level Security (RLS)
ALTER TABLE public.knowledge_resolution_results ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.knowledge_resolution_candidates ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'knowledge_resolution_results' AND policyname = 'resolution_results_own'
  ) THEN
    CREATE POLICY "resolution_results_own" ON public.knowledge_resolution_results FOR ALL TO authenticated
      USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'knowledge_resolution_candidates' AND policyname = 'resolution_candidates_own'
  ) THEN
    CREATE POLICY "resolution_candidates_own" ON public.knowledge_resolution_candidates FOR ALL TO authenticated
      USING (
        EXISTS (
          SELECT 1 FROM public.knowledge_resolution_results r
          WHERE r.id = resolution_result_id AND r.user_id = auth.uid()
        )
      )
      WITH CHECK (
        EXISTS (
          SELECT 1 FROM public.knowledge_resolution_results r
          WHERE r.id = resolution_result_id AND r.user_id = auth.uid()
        )
      );
  END IF;
END $$;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.knowledge_resolution_results TO authenticated;
GRANT ALL ON public.knowledge_resolution_results TO service_role;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.knowledge_resolution_candidates TO authenticated;
GRANT ALL ON public.knowledge_resolution_candidates TO service_role;

-- 6. Trigger for updated_at
CREATE TRIGGER knowledge_resolution_results_updated_at BEFORE UPDATE ON public.knowledge_resolution_results
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- 7. Vector Similarity Matching RPC for Knowledge Nodes
CREATE OR REPLACE FUNCTION public.match_knowledge_nodes(
  query_embedding vector,
  match_threshold double precision DEFAULT 0.5,
  match_count int DEFAULT 10,
  p_node_type public.node_type DEFAULT NULL
)
RETURNS TABLE (
  id UUID,
  name TEXT,
  canonical_name TEXT,
  node_type public.node_type,
  description TEXT,
  similarity double precision,
  metadata JSONB
)
LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path = public AS $$
BEGIN
  RETURN QUERY
  SELECT 
    n.id,
    n.name,
    n.canonical_name,
    n.node_type,
    n.description,
    round((1 - (e.embedding <=> query_embedding))::numeric, 4)::double precision AS similarity,
    n.metadata
  FROM public.knowledge_embeddings e
  JOIN public.knowledge_nodes n ON n.id = e.subject_id
  WHERE e.subject_table = 'knowledge_nodes'
    AND n.deleted_at IS NULL
    AND (p_node_type IS NULL OR n.node_type = p_node_type)
    AND (1 - (e.embedding <=> query_embedding)) >= match_threshold
  ORDER BY e.embedding <=> query_embedding ASC
  LIMIT match_count;
END;
$$;

GRANT EXECUTE ON FUNCTION public.match_knowledge_nodes(vector, double precision, int, public.node_type) TO authenticated;

-- 8. Lexical & Trigram Search RPC for Candidates
CREATE OR REPLACE FUNCTION public.search_knowledge_nodes_lexical(
  p_query TEXT,
  p_limit INT DEFAULT 10
)
RETURNS TABLE (
  node_id UUID,
  name TEXT,
  canonical_name TEXT,
  slug TEXT,
  node_type public.node_type,
  parent_id UUID,
  description TEXT,
  exact_match BOOLEAN,
  alias_match BOOLEAN,
  matched_alias TEXT,
  text_similarity DOUBLE PRECISION
)
LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path = public AS $$
DECLARE
  v_cleaned TEXT := lower(btrim(coalesce(p_query, '')));
BEGIN
  RETURN QUERY
  WITH node_matches AS (
    SELECT 
      n.id AS n_id,
      n.name AS n_name,
      n.canonical_name AS n_canonical_name,
      n.slug AS n_slug,
      n.node_type AS n_type,
      n.parent_id AS n_parent_id,
      n.description AS n_desc,
      (n.canonical_name = v_cleaned) AS is_exact,
      false AS is_alias,
      NULL::TEXT AS a_alias,
      similarity(n.name, p_query)::double precision AS sim
    FROM public.knowledge_nodes n
    WHERE n.deleted_at IS NULL
      AND (
        n.canonical_name = v_cleaned
        OR n.canonical_name LIKE '%' || v_cleaned || '%'
        OR similarity(n.name, p_query) > 0.3
      )

    UNION ALL

    SELECT 
      n.id AS n_id,
      n.name AS n_name,
      n.canonical_name AS n_canonical_name,
      n.slug AS n_slug,
      n.node_type AS n_type,
      n.parent_id AS n_parent_id,
      n.description AS n_desc,
      false AS is_exact,
      true AS is_alias,
      a.alias AS a_alias,
      similarity(a.alias, p_query)::double precision AS sim
    FROM public.knowledge_aliases a
    JOIN public.knowledge_nodes n ON n.id = a.node_id
    WHERE n.deleted_at IS NULL
      AND (
        a.canonical_alias = v_cleaned
        OR a.canonical_alias LIKE '%' || v_cleaned || '%'
        OR similarity(a.alias, p_query) > 0.3
      )
  )
  SELECT DISTINCT ON (n_id)
    n_id,
    n_name,
    n_canonical_name,
    n_slug,
    n_type,
    n_parent_id,
    n_desc,
    bool_or(is_exact) OVER (PARTITION BY n_id),
    bool_or(is_alias) OVER (PARTITION BY n_id),
    a_alias,
    max(sim) OVER (PARTITION BY n_id)
  FROM node_matches
  ORDER BY n_id, sim DESC
  LIMIT p_limit;
END;
$$;

GRANT EXECUTE ON FUNCTION public.search_knowledge_nodes_lexical(TEXT, INT) TO authenticated;
