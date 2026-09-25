-- =====================================================================
-- KNOWLEDGE BRAIN — PHASE 4: AI Chat System, Conversation Memory & Secure LLM Gateway
-- Migration: 20260925170000_phase4_ai_chat_gateway_brain_context.sql
-- =====================================================================

-- 1. Conversation Search & Performance Indexes
CREATE INDEX IF NOT EXISTS idx_conversations_user_updated 
  ON public.conversations (user_id, updated_at DESC);

CREATE INDEX IF NOT EXISTS idx_conversations_status 
  ON public.conversations (status);

CREATE INDEX IF NOT EXISTS idx_messages_conv_created 
  ON public.messages (conversation_id, created_at ASC);

-- 2. Read-Only Brain Context Query RPC
-- Retrieves existing relevant nodes, claims, relations, and sources for a user question.
-- STRICTLY READ-ONLY (STABLE). No data is created or modified.
CREATE OR REPLACE FUNCTION public.get_brain_context_for_query(
  p_query TEXT,
  p_max_nodes INT DEFAULT 5,
  p_max_claims INT DEFAULT 8,
  p_max_edges INT DEFAULT 8
)
RETURNS JSONB LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path = public AS $$
DECLARE
  v_cleaned TEXT;
  v_limit_nodes INT := least(greatest(coalesce(p_max_nodes, 5), 1), 20);
  v_limit_claims INT := least(greatest(coalesce(p_max_claims, 8), 1), 30);
  v_limit_edges INT := least(greatest(coalesce(p_max_edges, 8), 1), 30);
  v_node_ids UUID[];
  v_nodes JSONB := '[]'::jsonb;
  v_claims JSONB := '[]'::jsonb;
  v_relations JSONB := '[]'::jsonb;
  v_rec RECORD;
BEGIN
  v_cleaned := lower(trim(coalesce(p_query, '')));
  IF length(v_cleaned) = 0 THEN
    RETURN jsonb_build_object(
      'nodes', '[]'::jsonb,
      'claims', '[]'::jsonb,
      'relations', '[]'::jsonb,
      'total_nodes', 0
    );
  END IF;

  -- 1. Find matching nodes by canonical name, description, or alias
  WITH matched_nodes AS (
    SELECT DISTINCT n.id, n.canonical_name, n.node_type, n.status, n.description, n.summary,
           CASE 
             WHEN lower(n.canonical_name) = v_cleaned THEN 1.0
             WHEN lower(n.canonical_name) LIKE '%' || v_cleaned || '%' THEN 0.8
             ELSE 0.5
           END AS match_score
    FROM public.knowledge_nodes n
    LEFT JOIN public.knowledge_aliases a ON a.node_id = n.id
    WHERE n.deleted_at IS NULL
      AND n.status IN ('active', 'verified', 'review', 'proposed')
      AND (
        lower(n.canonical_name) LIKE '%' || v_cleaned || '%'
        OR lower(coalesce(n.description, '')) LIKE '%' || v_cleaned || '%'
        OR lower(coalesce(a.alias, '')) LIKE '%' || v_cleaned || '%'
      )
    ORDER BY match_score DESC, n.canonical_name ASC
    LIMIT v_limit_nodes
  )
  SELECT array_agg(id), jsonb_agg(
    jsonb_build_object(
      'id', id,
      'name', canonical_name,
      'node_type', node_type,
      'status', status,
      'description', description,
      'summary', summary
    )
  )
  INTO v_node_ids, v_nodes
  FROM matched_nodes;

  IF v_node_ids IS NULL OR array_length(v_node_ids, 1) = 0 THEN
    RETURN jsonb_build_object(
      'nodes', '[]'::jsonb,
      'claims', '[]'::jsonb,
      'relations', '[]'::jsonb,
      'total_nodes', 0
    );
  END IF;

  -- 2. Find relevant claims associated with these nodes
  FOR v_rec IN
    SELECT c.id, c.node_id, n.canonical_name AS node_name, c.claim_text, 
           coalesce(c.claim_type, 'fact') AS claim_type, c.status, c.verification, c.confidence,
           s.title AS source_title, s.url AS source_url
    FROM public.knowledge_claims c
    JOIN public.knowledge_nodes n ON n.id = c.node_id
    LEFT JOIN public.sources s ON s.id = c.source_id
    WHERE c.node_id = ANY(v_node_ids)
      AND c.status IN ('active', 'verified', 'review', 'proposed')
    ORDER BY c.confidence DESC NULLS LAST, c.created_at DESC
    LIMIT v_limit_claims
  LOOP
    v_claims := v_claims || jsonb_build_object(
      'id', v_rec.id,
      'node_id', v_rec.node_id,
      'node_name', v_rec.node_name,
      'statement', v_rec.claim_text,
      'claim_type', v_rec.claim_type,
      'status', v_rec.status,
      'verification', v_rec.verification,
      'confidence', v_rec.confidence,
      'source', CASE 
        WHEN v_rec.source_title IS NOT NULL THEN jsonb_build_object(
          'title', v_rec.source_title,
          'url', v_rec.source_url
        )
        ELSE NULL
      END
    );
  END LOOP;

  -- 3. Find relevant relations (edges) connecting these nodes
  FOR v_rec IN
    SELECT e.id, e.relation_type, e.description, e.confidence, e.status,
           src.id AS source_id, src.canonical_name AS source_name,
           tgt.id AS target_id, tgt.canonical_name AS target_name
    FROM public.knowledge_edges e
    JOIN public.knowledge_nodes src ON src.id = e.source_node_id
    JOIN public.knowledge_nodes tgt ON tgt.id = e.target_node_id
    WHERE (e.source_node_id = ANY(v_node_ids) OR e.target_node_id = ANY(v_node_ids))
      AND e.status IN ('active', 'verified', 'review', 'proposed')
    ORDER BY e.created_at DESC
    LIMIT v_limit_edges
  LOOP
    v_relations := v_relations || jsonb_build_object(
      'id', v_rec.id,
      'relation_type', v_rec.relation_type,
      'description', v_rec.description,
      'confidence', v_rec.confidence,
      'status', v_rec.status,
      'source', jsonb_build_object('id', v_rec.source_id, 'name', v_rec.source_name),
      'target', jsonb_build_object('id', v_rec.target_id, 'name', v_rec.target_name)
    );
  END LOOP;

  RETURN jsonb_build_object(
    'nodes', coalesce(v_nodes, '[]'::jsonb),
    'claims', coalesce(v_claims, '[]'::jsonb),
    'relations', coalesce(v_relations, '[]'::jsonb),
    'total_nodes', coalesce(array_length(v_node_ids, 1), 0)
  );
END;
$$;

-- 3. Helper RPC to Archive a Conversation Safely
CREATE OR REPLACE FUNCTION public.archive_conversation(p_conversation_id UUID)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_user_id UUID := auth.uid();
  v_found BOOLEAN;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required to archive conversations.';
  END IF;

  UPDATE public.conversations
  SET status = 'archived',
      updated_at = now()
  WHERE id = p_conversation_id AND user_id = v_user_id;

  GET DIAGNOSTICS v_found = ROW_COUNT;

  IF NOT v_found THEN
    RETURN jsonb_build_object('success', false, 'error', 'Conversation not found or not owned by user.');
  END IF;

  RETURN jsonb_build_object('success', true, 'conversation_id', p_conversation_id);
END;
$$;
