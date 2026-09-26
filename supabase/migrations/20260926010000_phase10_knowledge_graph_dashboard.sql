-- ==============================================================================
-- KNOWLEDGE BRAIN — PHASE 10 MIGRATION
-- Advanced Knowledge Graph, Brain Dashboard, Health & Visual Maps
-- ==============================================================================

-- 1. Saved Graph Views Table (Visualization Preferences)
CREATE TABLE IF NOT EXISTS public.saved_graph_views (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  root_node_id UUID REFERENCES public.knowledge_nodes(id) ON DELETE SET NULL,
  depth INT NOT NULL DEFAULT 1,
  layout TEXT NOT NULL DEFAULT 'radial',
  filters JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_saved_graph_views_user ON public.saved_graph_views(user_id);

-- RLS on saved_graph_views
ALTER TABLE public.saved_graph_views ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage their own saved graph views"
  ON public.saved_graph_views
  FOR ALL
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- 2. Brain Dashboard Operational Stats RPC
CREATE OR REPLACE FUNCTION public.get_brain_dashboard_stats()
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_stats JSONB;
  v_nodes BIGINT;
  v_edges BIGINT;
  v_claims BIGINT;
  v_verified_claims BIGINT;
  v_unverified_claims BIGINT;
  v_conflicted_claims BIGINT;
  v_outdated_claims BIGINT;
  v_sources BIGINT;
  v_broken_sources BIGINT;
  v_evidence BIGINT;
  v_gaps BIGINT;
  v_conflicts BIGINT;
  v_pending_reviews BIGINT;
  v_quarantined BIGINT;
  v_recent_tx BIGINT;
  v_orphans BIGINT;
  v_stale_embeddings BIGINT;
BEGIN
  -- Nodes
  SELECT count(*) INTO v_nodes FROM public.knowledge_nodes WHERE deleted_at IS NULL;
  
  -- Edges
  SELECT count(*) INTO v_edges FROM public.knowledge_edges WHERE status != 'archived' AND status != 'deprecated';
  
  -- Claims
  SELECT count(*) INTO v_claims FROM public.knowledge_claims;
  SELECT count(*) INTO v_verified_claims FROM public.knowledge_claims WHERE verification_status = 'verified';
  SELECT count(*) INTO v_unverified_claims FROM public.knowledge_claims WHERE verification_status = 'unverified';
  SELECT count(*) INTO v_conflicted_claims FROM public.knowledge_claims WHERE status = 'conflicted';
  SELECT count(*) INTO v_outdated_claims FROM public.knowledge_claims WHERE is_outdated = TRUE OR status = 'outdated';
  
  -- Sources
  SELECT count(*) INTO v_sources FROM public.sources WHERE deleted_at IS NULL;
  SELECT count(*) INTO v_broken_sources FROM public.sources WHERE deleted_at IS NULL AND (availability = 'broken' OR availability = 'unavailable');
  
  -- Evidence
  SELECT count(*) INTO v_evidence FROM public.evidence;
  
  -- Gaps (open)
  SELECT count(*) INTO v_gaps FROM public.knowledge_gaps WHERE status = 'open';
  
  -- Conflicts (open)
  SELECT count(*) INTO v_conflicts FROM public.knowledge_conflicts WHERE status = 'open';
  
  -- Pending Reviews & Quarantined
  SELECT count(*) INTO v_pending_reviews FROM public.knowledge_proposals WHERE status = 'pending_review';
  SELECT count(*) INTO v_quarantined FROM public.knowledge_proposals WHERE status = 'quarantined';
  
  -- Recent Transactions (last 7 days)
  SELECT count(*) INTO v_recent_tx FROM public.knowledge_transactions WHERE created_at >= (now() - INTERVAL '7 days');
  
  -- Orphan Nodes (nodes with 0 edges and 0 claims, excluding root categories)
  SELECT count(*) INTO v_orphans
  FROM public.knowledge_nodes kn
  WHERE kn.deleted_at IS NULL
    AND kn.node_type != 'category'
    AND NOT EXISTS (
      SELECT 1 FROM public.knowledge_edges e
      WHERE e.source_node_id = kn.id OR e.target_node_id = kn.id
    )
    AND NOT EXISTS (
      SELECT 1 FROM public.knowledge_claims c
      WHERE c.node_id = kn.id
    );
    
  -- Stale/Failed Embeddings
  SELECT count(*) INTO v_stale_embeddings
  FROM public.knowledge_nodes
  WHERE deleted_at IS NULL AND (embedding_status = 'failed' OR embedding_status = 'pending');

  v_stats := jsonb_build_object(
    'nodes', v_nodes,
    'edges', v_edges,
    'claims', v_claims,
    'verified_claims', v_verified_claims,
    'unverified_claims', v_unverified_claims,
    'conflicted_claims', v_conflicted_claims,
    'outdated_claims', v_outdated_claims,
    'sources', v_sources,
    'broken_sources', v_broken_sources,
    'evidence', v_evidence,
    'knowledge_gaps', v_gaps,
    'open_conflicts', v_conflicts,
    'pending_reviews', v_pending_reviews,
    'quarantined_knowledge', v_quarantined,
    'recent_transactions', v_recent_tx,
    'orphan_nodes', v_orphans,
    'stale_embeddings', v_stale_embeddings
  );

  RETURN v_stats;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_brain_dashboard_stats() TO authenticated;

-- 3. Brain Health Operational Assessment RPC
CREATE OR REPLACE FUNCTION public.get_brain_health_report()
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_stats JSONB;
  v_nodes BIGINT;
  v_claims BIGINT;
  v_verified BIGINT;
  v_claims_with_evidence BIGINT;
  v_conflicts BIGINT;
  v_outdated BIGINT;
  v_broken_sources BIGINT;
  v_orphans BIGINT;
  v_pending_reviews BIGINT;
  v_stale_embeddings BIGINT;
  v_edges BIGINT;
  
  v_verification_rate NUMERIC := 0;
  v_evidence_rate NUMERIC := 0;
  v_avg_degree NUMERIC := 0;
  v_status TEXT := 'Healthy';
  v_reasons TEXT[] := ARRAY[]::TEXT[];
BEGIN
  -- Gather core metrics
  SELECT count(*) INTO v_nodes FROM public.knowledge_nodes WHERE deleted_at IS NULL;
  SELECT count(*) INTO v_edges FROM public.knowledge_edges WHERE status != 'archived' AND status != 'deprecated';
  SELECT count(*) INTO v_claims FROM public.knowledge_claims;
  SELECT count(*) INTO v_verified FROM public.knowledge_claims WHERE verification_status = 'verified';
  SELECT count(DISTINCT claim_id) INTO v_claims_with_evidence FROM public.evidence;
  SELECT count(*) INTO v_conflicts FROM public.knowledge_conflicts WHERE status = 'open';
  SELECT count(*) INTO v_outdated FROM public.knowledge_claims WHERE is_outdated = TRUE OR status = 'outdated';
  SELECT count(*) INTO v_broken_sources FROM public.sources WHERE deleted_at IS NULL AND (availability = 'broken' OR availability = 'unavailable');
  SELECT count(*) INTO v_pending_reviews FROM public.knowledge_proposals WHERE status = 'pending_review';
  SELECT count(*) INTO v_stale_embeddings FROM public.knowledge_nodes WHERE deleted_at IS NULL AND (embedding_status = 'failed' OR embedding_status = 'pending');

  -- Orphan calculation
  SELECT count(*) INTO v_orphans
  FROM public.knowledge_nodes kn
  WHERE kn.deleted_at IS NULL
    AND kn.node_type != 'category'
    AND NOT EXISTS (
      SELECT 1 FROM public.knowledge_edges e
      WHERE e.source_node_id = kn.id OR e.target_node_id = kn.id
    )
    AND NOT EXISTS (
      SELECT 1 FROM public.knowledge_claims c
      WHERE c.node_id = kn.id
    );

  -- Rates
  IF v_claims > 0 THEN
    v_verification_rate := round((v_verified::NUMERIC / v_claims::NUMERIC) * 100, 1);
    v_evidence_rate := round((v_claims_with_evidence::NUMERIC / v_claims::NUMERIC) * 100, 1);
  END IF;

  IF v_nodes > 0 THEN
    v_avg_degree := round(((v_edges * 2)::NUMERIC / v_nodes::NUMERIC), 2);
  END IF;

  -- Assess operational health status
  IF v_nodes = 0 THEN
    v_status := 'Unknown';
    v_reasons := array_append(v_reasons, 'Brain has no recorded knowledge nodes yet.');
  ELSIF v_conflicts > 5 OR v_broken_sources > 3 THEN
    v_status := 'Degraded';
    IF v_conflicts > 5 THEN
      v_reasons := array_append(v_reasons, format('High conflict load: %s open contradictions detected.', v_conflicts));
    END IF;
    IF v_broken_sources > 3 THEN
      v_reasons := array_append(v_reasons, format('%s broken sources impacting factual evidence.', v_broken_sources));
    END IF;
  ELSIF v_conflicts > 0 OR v_broken_sources > 0 OR v_orphans > 5 OR v_pending_reviews > 5 OR v_outdated > 5 THEN
    v_status := 'Needs Attention';
    IF v_conflicts > 0 THEN
      v_reasons := array_append(v_reasons, format('%s open conflict(s) requiring review.', v_conflicts));
    END IF;
    IF v_broken_sources > 0 THEN
      v_reasons := array_append(v_reasons, format('%s broken or unavailable source(s).', v_broken_sources));
    END IF;
    IF v_orphans > 0 THEN
      v_reasons := array_append(v_reasons, format('%s isolated orphan node(s) without relations or claims.', v_orphans));
    END IF;
    IF v_pending_reviews > 0 THEN
      v_reasons := array_append(v_reasons, format('%s pending knowledge proposal(s) awaiting review.', v_pending_reviews));
    END IF;
    IF v_outdated > 0 THEN
      v_reasons := array_append(v_reasons, format('%s outdated claim(s) preserved in memory.', v_outdated));
    END IF;
  ELSE
    v_status := 'Healthy';
    v_reasons := array_append(v_reasons, 'All knowledge verification, evidence grounding, and relational structures are stable.');
  END IF;

  RETURN jsonb_build_object(
    'status', v_status,
    'summary_reasons', to_jsonb(v_reasons),
    'metrics', jsonb_build_object(
      'total_nodes', v_nodes,
      'total_edges', v_edges,
      'total_claims', v_claims,
      'verification_rate', v_verification_rate,
      'evidence_coverage', v_evidence_rate,
      'average_degree', v_avg_degree,
      'open_conflicts', v_conflicts,
      'broken_sources', v_broken_sources,
      'orphan_nodes', v_orphans,
      'outdated_claims', v_outdated,
      'pending_reviews', v_pending_reviews,
      'stale_embeddings', v_stale_embeddings
    )
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_brain_health_report() TO authenticated;

-- 4. Knowledge Hotspots RPC (High Degree / Connectivity)
CREATE OR REPLACE FUNCTION public.get_knowledge_hotspots(p_limit INT DEFAULT 10)
RETURNS TABLE (
  node_id UUID,
  name TEXT,
  canonical_name TEXT,
  slug TEXT,
  node_type public.node_type,
  in_degree BIGINT,
  out_degree BIGINT,
  claim_count BIGINT,
  total_degree BIGINT
)
LANGUAGE plpgsql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_limit INT := least(greatest(coalesce(p_limit, 10), 1), 50);
BEGIN
  RETURN QUERY
  SELECT
    kn.id AS node_id,
    kn.name,
    kn.canonical_name,
    kn.slug,
    kn.node_type,
    coalesce(incoming.cnt, 0) AS in_degree,
    coalesce(outgoing.cnt, 0) AS out_degree,
    coalesce(claims.cnt, 0) AS claim_count,
    (coalesce(incoming.cnt, 0) + coalesce(outgoing.cnt, 0) + coalesce(claims.cnt, 0)) AS total_degree
  FROM public.knowledge_nodes kn
  LEFT JOIN (
    SELECT target_node_id, count(*) AS cnt
    FROM public.knowledge_edges
    WHERE status != 'archived' AND status != 'deprecated'
    GROUP BY target_node_id
  ) incoming ON incoming.target_node_id = kn.id
  LEFT JOIN (
    SELECT source_node_id, count(*) AS cnt
    FROM public.knowledge_edges
    WHERE status != 'archived' AND status != 'deprecated'
    GROUP BY source_node_id
  ) outgoing ON outgoing.source_node_id = kn.id
  LEFT JOIN (
    SELECT node_id, count(*) AS cnt
    FROM public.knowledge_claims
    GROUP BY node_id
  ) claims ON claims.node_id = kn.id
  WHERE kn.deleted_at IS NULL
  ORDER BY total_degree DESC, kn.name ASC
  LIMIT v_limit;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_knowledge_hotspots(INT) TO authenticated;

-- 5. Orphan Knowledge RPC (Isolated nodes for structural cleanup)
CREATE OR REPLACE FUNCTION public.get_orphan_nodes(p_limit INT DEFAULT 20)
RETURNS TABLE (
  node_id UUID,
  name TEXT,
  canonical_name TEXT,
  slug TEXT,
  node_type public.node_type,
  parent_id UUID,
  created_at TIMESTAMPTZ,
  orphan_reason TEXT
)
LANGUAGE plpgsql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_limit INT := least(greatest(coalesce(p_limit, 20), 1), 100);
BEGIN
  RETURN QUERY
  SELECT
    kn.id AS node_id,
    kn.name,
    kn.canonical_name,
    kn.slug,
    kn.node_type,
    kn.parent_id,
    kn.created_at,
    CASE 
      WHEN kn.parent_id IS NULL AND kn.node_type != 'category' THEN 'Missing parent hierarchy and zero connections'
      ELSE 'Zero graph edges and zero attached claims'
    END AS orphan_reason
  FROM public.knowledge_nodes kn
  WHERE kn.deleted_at IS NULL
    AND (
      (kn.parent_id IS NULL AND kn.node_type != 'category')
      OR (
        NOT EXISTS (
          SELECT 1 FROM public.knowledge_edges e
          WHERE e.source_node_id = kn.id OR e.target_node_id = kn.id
        )
        AND NOT EXISTS (
          SELECT 1 FROM public.knowledge_claims c
          WHERE c.node_id = kn.id
        )
      )
    )
  ORDER BY kn.created_at DESC
  LIMIT v_limit;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_orphan_nodes(INT) TO authenticated;

-- 6. Domain Dashboard Scoped Stats RPC
CREATE OR REPLACE FUNCTION public.get_domain_dashboard_stats(p_node_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_descendant_ids UUID[];
  v_nodes BIGINT;
  v_edges BIGINT;
  v_claims BIGINT;
  v_verified_claims BIGINT;
  v_conflicts BIGINT;
  v_gaps BIGINT;
  v_node_info JSONB;
BEGIN
  -- Get root node info
  SELECT jsonb_build_object(
    'id', kn.id,
    'name', kn.name,
    'canonical_name', kn.canonical_name,
    'slug', kn.slug,
    'node_type', kn.node_type,
    'summary', kn.summary
  )
  INTO v_node_info
  FROM public.knowledge_nodes kn
  WHERE kn.id = p_node_id AND kn.deleted_at IS NULL;

  IF v_node_info IS NULL THEN
    RETURN jsonb_build_object('error', 'Domain node not found');
  END IF;

  -- Collect subtree node IDs recursively
  WITH RECURSIVE domain_tree AS (
    SELECT id FROM public.knowledge_nodes WHERE id = p_node_id AND deleted_at IS NULL
    UNION ALL
    SELECT child.id FROM public.knowledge_nodes child
    JOIN domain_tree dt ON child.parent_id = dt.id
    WHERE child.deleted_at IS NULL
  )
  SELECT array_agg(id) INTO v_descendant_ids FROM domain_tree;

  -- Counts for domain
  v_nodes := coalesce(array_length(v_descendant_ids, 1), 0);

  SELECT count(*) INTO v_edges
  FROM public.knowledge_edges
  WHERE (source_node_id = ANY(v_descendant_ids) OR target_node_id = ANY(v_descendant_ids))
    AND status != 'archived' AND status != 'deprecated';

  SELECT count(*) INTO v_claims
  FROM public.knowledge_claims
  WHERE node_id = ANY(v_descendant_ids);

  SELECT count(*) INTO v_verified_claims
  FROM public.knowledge_claims
  WHERE node_id = ANY(v_descendant_ids) AND verification_status = 'verified';

  SELECT count(DISTINCT c.id) INTO v_conflicts
  FROM public.knowledge_conflicts c
  JOIN public.knowledge_claims ca ON c.claim_a_id = ca.id
  JOIN public.knowledge_claims cb ON c.claim_b_id = cb.id
  WHERE (ca.node_id = ANY(v_descendant_ids) OR cb.node_id = ANY(v_descendant_ids))
    AND c.status = 'open';

  SELECT count(*) INTO v_gaps
  FROM public.knowledge_gaps g
  WHERE g.related_node_ids && v_descendant_ids
    AND g.status = 'open';

  RETURN jsonb_build_object(
    'root_node', v_node_info,
    'total_nodes', v_nodes,
    'total_edges', v_edges,
    'total_claims', v_claims,
    'verified_claims', v_verified_claims,
    'open_conflicts', v_conflicts,
    'open_gaps', v_gaps
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_domain_dashboard_stats(UUID) TO authenticated;
