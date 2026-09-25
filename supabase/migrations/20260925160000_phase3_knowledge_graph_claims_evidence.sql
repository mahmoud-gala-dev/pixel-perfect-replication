-- ============================================================================
-- KNOWLEDGE BRAIN — PHASE 3: Knowledge Graph, Relations, Claims, Sources & Evidence
-- ============================================================================

-- 1. Extend enums if possible
DO $$
BEGIN
  ALTER TYPE public.verification_status ADD VALUE IF NOT EXISTS 'qualifies';
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$
BEGIN
  ALTER TYPE public.verification_status ADD VALUE IF NOT EXISTS 'mentions';
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$
BEGIN
  ALTER TYPE public.verification_status ADD VALUE IF NOT EXISTS 'disputed';
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

-- 2. Relation Types Table
CREATE TABLE IF NOT EXISTS public.relation_types (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  key TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  description TEXT,
  inverse_key TEXT,
  is_symmetric BOOLEAN NOT NULL DEFAULT false,
  allows_self_relation BOOLEAN NOT NULL DEFAULT false,
  status public.knowledge_status NOT NULL DEFAULT 'active',
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS relation_types_key_idx ON public.relation_types (key);
CREATE INDEX IF NOT EXISTS relation_types_inverse_idx ON public.relation_types (inverse_key);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.relation_types TO authenticated;
GRANT ALL ON public.relation_types TO service_role;
ALTER TABLE public.relation_types ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'relation_types' AND policyname = 'relation_types_read'
  ) THEN
    CREATE POLICY "relation_types_read" ON public.relation_types FOR SELECT TO authenticated USING (true);
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'relation_types' AND policyname = 'relation_types_write'
  ) THEN
    CREATE POLICY "relation_types_write" ON public.relation_types FOR ALL TO authenticated USING (true) WITH CHECK (true);
  END IF;
END $$;

-- Seed default relation types
INSERT INTO public.relation_types (key, name, description, inverse_key, is_symmetric, allows_self_relation)
VALUES
  ('related_to', 'Related To', 'General semantic relationship between concepts', 'related_to', true, false),
  ('uses', 'Uses', 'Concept utilizes or depends on another technology/concept', 'used_by', false, false),
  ('used_by', 'Used By', 'Inverse of uses', 'uses', false, false),
  ('requires', 'Requires', 'Strict dependency or prerequisite', 'prerequisite_of', false, false),
  ('prerequisite_of', 'Prerequisite Of', 'Must be learned or established before target', 'requires', false, false),
  ('part_of', 'Part Of', 'Component or subsystem of a larger entity', 'has_part', false, false),
  ('has_part', 'Has Part', 'Contains target concept as component', 'part_of', false, false),
  ('depends_on', 'Depends On', 'Functional dependency', 'depended_on_by', false, false),
  ('depended_on_by', 'Depended On By', 'Target concept depends on this', 'depends_on', false, false),
  ('implements', 'Implements', 'Implements an interface, protocol, or design pattern', 'implemented_by', false, false),
  ('implemented_by', 'Implemented By', 'Implemented by target concept', 'implements', false, false),
  ('explains', 'Explains', 'Explains or elaborates upon target concept', 'explained_by', false, false),
  ('explained_by', 'Explained By', 'Explained by target concept', 'explains', false, false),
  ('example_of', 'Example Of', 'Concrete instance or example of target concept', 'has_example', false, false),
  ('has_example', 'Has Example', 'Target concept is an example of this', 'example_of', false, false),
  ('similar_to', 'Similar To', 'Shares fundamental characteristics', 'similar_to', true, false),
  ('contrasts_with', 'Contrasts With', 'Has significant differences or opposing traits', 'contrasts_with', true, false),
  ('contradicts', 'Contradicts', 'Mutually exclusive or contradictory', 'contradicts', true, false),
  ('supports', 'Supports', 'Provides evidence or foundation for target', 'supported_by', false, false),
  ('supported_by', 'Supported By', 'Supported by target concept', 'supports', false, false),
  ('causes', 'Causes', 'Causal relationship', 'caused_by', false, false),
  ('caused_by', 'Caused By', 'Result or effect of target concept', 'causes', false, false),
  ('influences', 'Influences', 'Has notable impact on target concept', 'influenced_by', false, false),
  ('derived_from', 'Derived From', 'Originated or evolved from target concept', 'origin_of', false, false),
  ('associated_with', 'Associated With', 'General contextual association', 'associated_with', true, false),
  ('can_use', 'Can Use', 'Optional or compatible integration', 'can_be_used_by', false, false),
  ('can_be_used_by', 'Can Be Used By', 'Can be integrated into target', 'can_use', false, false),
  ('alternative_to', 'Alternative To', 'Interchangeable alternative', 'alternative_to', true, false)
ON CONFLICT (key) DO UPDATE
SET name = EXCLUDED.name,
    description = EXCLUDED.description,
    inverse_key = EXCLUDED.inverse_key,
    is_symmetric = EXCLUDED.is_symmetric,
    allows_self_relation = EXCLUDED.allows_self_relation;

-- 3. Extend knowledge_claims with claim_type and normalized_statement
ALTER TABLE public.knowledge_claims
  ADD COLUMN IF NOT EXISTS claim_type TEXT NOT NULL DEFAULT 'fact',
  ADD COLUMN IF NOT EXISTS normalized_statement TEXT GENERATED ALWAYS AS (lower(regexp_replace(btrim(claim_text), '\s+', ' ', 'g'))) STORED;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'knowledge_claims_claim_type_check'
  ) THEN
    ALTER TABLE public.knowledge_claims
      ADD CONSTRAINT knowledge_claims_claim_type_check
      CHECK (claim_type IN ('fact','definition','rule','observation','opinion','interpretation','historical','procedural','technical'));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS knowledge_claims_status_idx ON public.knowledge_claims (status);
CREATE INDEX IF NOT EXISTS knowledge_claims_verification_idx ON public.knowledge_claims (verification);
CREATE INDEX IF NOT EXISTS knowledge_claims_type_idx ON public.knowledge_claims (claim_type);
CREATE INDEX IF NOT EXISTS knowledge_claims_norm_trgm ON public.knowledge_claims USING gin (normalized_statement gin_trgm_ops);

-- 4. Extend sources with publisher and accessed_at
ALTER TABLE public.sources
  ADD COLUMN IF NOT EXISTS publisher TEXT,
  ADD COLUMN IF NOT EXISTS accessed_at TIMESTAMPTZ DEFAULT now();

CREATE INDEX IF NOT EXISTS sources_kind_idx ON public.sources (source_kind);

-- 5. Extend evidence with evidence_type and strength
ALTER TABLE public.evidence
  ADD COLUMN IF NOT EXISTS evidence_type TEXT NOT NULL DEFAULT 'direct_quote',
  ADD COLUMN IF NOT EXISTS strength NUMERIC(4,3) CHECK (strength IS NULL OR (strength >= 0 AND strength <= 1));

CREATE INDEX IF NOT EXISTS evidence_node_idx ON public.evidence (node_id);
CREATE INDEX IF NOT EXISTS evidence_stance_idx ON public.evidence (stance);

-- 6. Extend knowledge_operations allowed types
ALTER TABLE public.knowledge_operations DROP CONSTRAINT IF EXISTS knowledge_operations_type_valid;
ALTER TABLE public.knowledge_operations ADD CONSTRAINT knowledge_operations_type_valid CHECK (operation_type IN (
  'CREATE_NODE','UPDATE_NODE','MOVE_NODE','MERGE_NODE','ARCHIVE_NODE',
  'CREATE_ENTRY','UPDATE_ENTRY',
  'CREATE_RELATION','UPDATE_RELATION','DEPRECATE_RELATION',
  'ADD_ALIAS','REMOVE_ALIAS',
  'ADD_CLAIM','UPDATE_CLAIM','DEPRECATE_CLAIM','VERIFY_CLAIM','DISPUTE_CLAIM',
  'ADD_SOURCE','UPDATE_SOURCE',
  'ADD_EVIDENCE','UPDATE_EVIDENCE'
));

-- 7. Graph RPC: Safe Create Relation
CREATE OR REPLACE FUNCTION public.safe_create_relation(
  p_source_node_id UUID,
  p_target_node_id UUID,
  p_relation_type TEXT,
  p_description TEXT DEFAULT NULL,
  p_confidence NUMERIC DEFAULT 1.0,
  p_status public.knowledge_status DEFAULT 'active',
  p_metadata JSONB DEFAULT '{}'::jsonb
)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_user_id UUID := auth.uid();
  v_source RECORD;
  v_target RECORD;
  v_rel_type RECORD;
  v_existing RECORD;
  v_new_edge RECORD;
  v_meta JSONB := coalesce(p_metadata, '{}'::jsonb);
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required to create graph relations.';
  END IF;

  -- 1. Validate Source Node
  SELECT * INTO v_source FROM public.knowledge_nodes WHERE id = p_source_node_id AND deleted_at IS NULL;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Source knowledge node not found or deleted.';
  END IF;

  -- 2. Validate Target Node
  SELECT * INTO v_target FROM public.knowledge_nodes WHERE id = p_target_node_id AND deleted_at IS NULL;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Target knowledge node not found or deleted.';
  END IF;

  -- 3. Validate Relation Type
  SELECT * INTO v_rel_type FROM public.relation_types WHERE key = p_relation_type;
  IF NOT FOUND THEN
    -- Fallback insertion of dynamic relation type if not yet registered
    INSERT INTO public.relation_types (key, name, description)
    VALUES (p_relation_type, initcap(replace(p_relation_type, '_', ' ')), 'Dynamic user-defined relation')
    RETURNING * INTO v_rel_type;
  END IF;

  -- 4. Check Self-relation
  IF p_source_node_id = p_target_node_id AND NOT v_rel_type.allows_self_relation THEN
    RAISE EXCEPTION 'Self-relations are not permitted for relation type "%".', p_relation_type;
  END IF;

  -- 5. Check Duplicate Edge (direct or symmetric)
  SELECT * INTO v_existing
  FROM public.knowledge_edges
  WHERE created_by = v_user_id
    AND (
      (source_node_id = p_source_node_id AND target_node_id = p_target_node_id AND relation_type = p_relation_type)
      OR
      (v_rel_type.is_symmetric AND source_node_id = p_target_node_id AND target_node_id = p_source_node_id AND relation_type = p_relation_type)
    );

  IF FOUND THEN
    RETURN jsonb_build_object(
      'created', false,
      'status', 'existing',
      'edge', to_jsonb(v_existing),
      'message', 'Equivalent relation already exists in the graph.'
    );
  END IF;

  -- 6. Insert new edge
  INSERT INTO public.knowledge_edges (
    source_node_id,
    target_node_id,
    relation_type,
    description,
    confidence,
    status,
    metadata,
    created_by
  )
  VALUES (
    p_source_node_id,
    p_target_node_id,
    p_relation_type,
    nullif(btrim(p_description), ''),
    p_confidence,
    p_status,
    v_meta,
    v_user_id
  )
  RETURNING * INTO v_new_edge;

  -- Record knowledge operation audit log
  INSERT INTO public.knowledge_operations (
    operation_type,
    status,
    payload,
    result,
    confidence,
    reason,
    requested_by,
    executed_at
  )
  VALUES (
    'CREATE_RELATION',
    'executed',
    jsonb_build_object(
      'source_node_id', p_source_node_id,
      'target_node_id', p_target_node_id,
      'relation_type', p_relation_type
    ),
    to_jsonb(v_new_edge),
    p_confidence,
    'Manual or structured graph relation creation',
    v_user_id,
    now()
  );

  RETURN jsonb_build_object(
    'created', true,
    'status', 'created',
    'edge', to_jsonb(v_new_edge)
  );
END;
$$;

-- 8. Graph RPC: Get Node Relations (Outgoing, Incoming & Symmetric with Inverse Labels)
CREATE OR REPLACE FUNCTION public.get_node_relations(p_node_id UUID)
RETURNS JSONB LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path = public AS $$
DECLARE
  v_outgoing JSONB := '[]'::jsonb;
  v_incoming JSONB := '[]'::jsonb;
  v_rec RECORD;
BEGIN
  -- Outgoing relations
  FOR v_rec IN
    SELECT e.id, e.relation_type, e.description, e.confidence, e.status, e.created_at,
           rt.name AS relation_name, rt.inverse_key, rt.is_symmetric,
           t.id AS target_id, t.name AS target_name, t.node_type AS target_type, t.slug AS target_slug
    FROM public.knowledge_edges e
    JOIN public.knowledge_nodes t ON t.id = e.target_node_id
    LEFT JOIN public.relation_types rt ON rt.key = e.relation_type
    WHERE e.source_node_id = p_node_id
    ORDER BY e.created_at DESC
  LOOP
    v_outgoing := v_outgoing || jsonb_build_object(
      'id', v_rec.id,
      'direction', 'outgoing',
      'relation_type', v_rec.relation_type,
      'relation_name', coalesce(v_rec.relation_name, v_rec.relation_type),
      'inverse_key', v_rec.inverse_key,
      'is_symmetric', coalesce(v_rec.is_symmetric, false),
      'description', v_rec.description,
      'confidence', v_rec.confidence,
      'status', v_rec.status,
      'other_node', jsonb_build_object(
        'id', v_rec.target_id,
        'name', v_rec.target_name,
        'node_type', v_rec.target_type,
        'slug', v_rec.target_slug
      )
    );
  END LOOP;

  -- Incoming relations (with derived inverse representation)
  FOR v_rec IN
    SELECT e.id, e.relation_type, e.description, e.confidence, e.status, e.created_at,
           rt.name AS relation_name, rt.inverse_key, rt.is_symmetric,
           s.id AS source_id, s.name AS source_name, s.node_type AS source_type, s.slug AS source_slug
    FROM public.knowledge_edges e
    JOIN public.knowledge_nodes s ON s.id = e.source_node_id
    LEFT JOIN public.relation_types rt ON rt.key = e.relation_type
    WHERE e.target_node_id = p_node_id
    ORDER BY e.created_at DESC
  LOOP
    v_incoming := v_incoming || jsonb_build_object(
      'id', v_rec.id,
      'direction', 'incoming',
      'relation_type', v_rec.relation_type,
      'display_relation', CASE
        WHEN v_rec.is_symmetric THEN v_rec.relation_type
        WHEN v_rec.inverse_key IS NOT NULL THEN v_rec.inverse_key
        ELSE 'inverse_of_' || v_rec.relation_type
      END,
      'inverse_key', v_rec.inverse_key,
      'is_symmetric', coalesce(v_rec.is_symmetric, false),
      'description', v_rec.description,
      'confidence', v_rec.confidence,
      'status', v_rec.status,
      'other_node', jsonb_build_object(
        'id', v_rec.source_id,
        'name', v_rec.source_name,
        'node_type', v_rec.source_type,
        'slug', v_rec.source_slug
      )
    );
  END LOOP;

  RETURN jsonb_build_object(
    'node_id', p_node_id,
    'outgoing', v_outgoing,
    'incoming', v_incoming,
    'total', jsonb_array_length(v_outgoing) + jsonb_array_length(v_incoming)
  );
END;
$$;

-- 9. Graph RPC: Get Graph Neighborhood for Lightweight Visualization
CREATE OR REPLACE FUNCTION public.get_graph_neighborhood(p_node_id UUID, p_depth INT DEFAULT 1)
RETURNS JSONB LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path = public AS $$
DECLARE
  v_depth INT := least(greatest(coalesce(p_depth, 1), 1), 3);
  v_nodes JSONB := '[]'::jsonb;
  v_edges JSONB := '[]'::jsonb;
  v_rec RECORD;
BEGIN
  -- Collect nodes in neighborhood
  WITH RECURSIVE neighborhood AS (
    SELECT p_node_id AS node_id, 0 AS depth
    UNION
    SELECT CASE WHEN e.source_node_id = n.node_id THEN e.target_node_id ELSE e.source_node_id END, n.depth + 1
    FROM public.knowledge_edges e
    JOIN neighborhood n ON (e.source_node_id = n.node_id OR e.target_node_id = n.node_id)
    WHERE n.depth < v_depth
  )
  SELECT DISTINCT kn.id, kn.name, kn.canonical_name, kn.slug, kn.node_type, kn.status, kn.parent_id
  INTO v_rec
  FROM public.knowledge_nodes kn
  WHERE kn.id IN (SELECT node_id FROM neighborhood) AND kn.deleted_at IS NULL;

  -- Build Nodes Array
  SELECT coalesce(jsonb_agg(jsonb_build_object(
    'id', kn.id,
    'name', kn.name,
    'canonical_name', kn.canonical_name,
    'slug', kn.slug,
    'node_type', kn.node_type,
    'status', kn.status,
    'parent_id', kn.parent_id,
    'is_center', (kn.id = p_node_id)
  )), '[]'::jsonb)
  INTO v_nodes
  FROM public.knowledge_nodes kn
  WHERE kn.id IN (
    WITH RECURSIVE neighborhood AS (
      SELECT p_node_id AS node_id, 0 AS depth
      UNION
      SELECT CASE WHEN e.source_node_id = n.node_id THEN e.target_node_id ELSE e.source_node_id END, n.depth + 1
      FROM public.knowledge_edges e
      JOIN neighborhood n ON (e.source_node_id = n.node_id OR e.target_node_id = n.node_id)
      WHERE n.depth < v_depth
    ) SELECT node_id FROM neighborhood
  ) AND kn.deleted_at IS NULL;

  -- Build Edges Array connecting those nodes
  SELECT coalesce(jsonb_agg(jsonb_build_object(
    'id', e.id,
    'source', e.source_node_id,
    'target', e.target_node_id,
    'relation_type', e.relation_type,
    'description', e.description,
    'confidence', e.confidence,
    'status', e.status
  )), '[]'::jsonb)
  INTO v_edges
  FROM public.knowledge_edges e
  WHERE e.source_node_id IN (SELECT (elem->>'id')::uuid FROM jsonb_array_elements(v_nodes) elem)
    AND e.target_node_id IN (SELECT (elem->>'id')::uuid FROM jsonb_array_elements(v_nodes) elem);

  RETURN jsonb_build_object(
    'center_node_id', p_node_id,
    'depth', v_depth,
    'nodes', v_nodes,
    'edges', v_edges
  );
END;
$$;

-- 10. Claim RPC: Safe Create Atomic Claim
CREATE OR REPLACE FUNCTION public.safe_create_claim(
  p_node_id UUID,
  p_statement TEXT,
  p_claim_type TEXT DEFAULT 'fact',
  p_confidence NUMERIC DEFAULT 1.0,
  p_status public.knowledge_status DEFAULT 'active',
  p_metadata JSONB DEFAULT '{}'::jsonb
)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_user_id UUID := auth.uid();
  v_node RECORD;
  v_new_claim RECORD;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required to create claims.';
  END IF;

  IF p_statement IS NULL OR btrim(p_statement) = '' THEN
    RAISE EXCEPTION 'Claim statement cannot be empty.';
  END IF;

  IF p_node_id IS NOT NULL THEN
    SELECT * INTO v_node FROM public.knowledge_nodes WHERE id = p_node_id AND deleted_at IS NULL;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Target knowledge node not found.';
    END IF;
  END IF;

  INSERT INTO public.knowledge_claims (
    node_id,
    claim_text,
    claim_type,
    confidence,
    status,
    verification,
    metadata,
    created_by
  )
  VALUES (
    p_node_id,
    btrim(p_statement),
    coalesce(p_claim_type, 'fact'),
    p_confidence,
    p_status,
    'unverified',
    coalesce(p_metadata, '{}'::jsonb),
    v_user_id
  )
  RETURNING * INTO v_new_claim;

  -- Record operation
  INSERT INTO public.knowledge_operations (
    operation_type,
    status,
    payload,
    result,
    confidence,
    reason,
    requested_by,
    executed_at
  )
  VALUES (
    'ADD_CLAIM',
    'executed',
    jsonb_build_object('node_id', p_node_id, 'claim_type', p_claim_type, 'statement', p_statement),
    to_jsonb(v_new_claim),
    p_confidence,
    'Atomic claim creation',
    v_user_id,
    now()
  );

  RETURN jsonb_build_object(
    'created', true,
    'claim', to_jsonb(v_new_claim)
  );
END;
$$;

-- 11. Evidence RPC: Safe Attach Evidence to Claim
CREATE OR REPLACE FUNCTION public.safe_attach_evidence(
  p_claim_id UUID,
  p_source_id UUID,
  p_stance public.verification_status DEFAULT 'supported',
  p_excerpt TEXT DEFAULT NULL,
  p_locator TEXT DEFAULT NULL,
  p_evidence_type TEXT DEFAULT 'direct_quote',
  p_confidence NUMERIC DEFAULT 1.0,
  p_metadata JSONB DEFAULT '{}'::jsonb
)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_user_id UUID := auth.uid();
  v_claim RECORD;
  v_source RECORD;
  v_evidence RECORD;
  v_supporting_count INT;
  v_contradicting_count INT;
  v_next_verification public.verification_status;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required to attach evidence.';
  END IF;

  -- Validate Claim
  SELECT * INTO v_claim FROM public.knowledge_claims WHERE id = p_claim_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Claim not found.';
  END IF;

  -- Validate Source
  SELECT * INTO v_source FROM public.sources WHERE id = p_source_id AND deleted_at IS NULL;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Source not found.';
  END IF;

  -- Insert Evidence
  INSERT INTO public.evidence (
    claim_id,
    source_id,
    node_id,
    stance,
    excerpt,
    locator,
    evidence_type,
    confidence,
    metadata,
    created_by
  )
  VALUES (
    p_claim_id,
    p_source_id,
    v_claim.node_id,
    p_stance,
    nullif(btrim(p_excerpt), ''),
    nullif(btrim(p_locator), ''),
    coalesce(p_evidence_type, 'direct_quote'),
    p_confidence,
    coalesce(p_metadata, '{}'::jsonb),
    v_user_id
  )
  RETURNING * INTO v_evidence;

  -- Re-evaluate verification status of the claim based on evidence stances
  SELECT count(*) INTO v_supporting_count FROM public.evidence WHERE claim_id = p_claim_id AND stance = 'supported';
  SELECT count(*) INTO v_contradicting_count FROM public.evidence WHERE claim_id = p_claim_id AND stance = 'contradicted';

  IF v_supporting_count > 0 AND v_contradicting_count > 0 THEN
    v_next_verification := 'contradicted'; -- disputed/conflicted evidence
  ELSIF v_supporting_count > 0 THEN
    v_next_verification := 'verified';
  ELSIF v_contradicting_count > 0 THEN
    v_next_verification := 'rejected';
  ELSE
    v_next_verification := 'unverified';
  END IF;

  UPDATE public.knowledge_claims
  SET verification = v_next_verification,
      updated_at = now()
  WHERE id = p_claim_id;

  -- Record Operation
  INSERT INTO public.knowledge_operations (
    operation_type,
    status,
    payload,
    result,
    confidence,
    reason,
    requested_by,
    executed_at
  )
  VALUES (
    'ADD_EVIDENCE',
    'executed',
    jsonb_build_object('claim_id', p_claim_id, 'source_id', p_source_id, 'stance', p_stance),
    to_jsonb(v_evidence),
    p_confidence,
    'Evidence attachment to atomic claim',
    v_user_id,
    now()
  );

  RETURN jsonb_build_object(
    'created', true,
    'evidence', to_jsonb(v_evidence),
    'claim_verification', v_next_verification
  );
END;
$$;

-- Grant execution permissions
GRANT EXECUTE ON FUNCTION public.safe_create_relation(UUID, UUID, TEXT, TEXT, NUMERIC, public.knowledge_status, JSONB) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_node_relations(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_graph_neighborhood(UUID, INT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.safe_create_claim(UUID, TEXT, TEXT, NUMERIC, public.knowledge_status, JSONB) TO authenticated;
GRANT EXECUTE ON FUNCTION public.safe_attach_evidence(UUID, UUID, public.verification_status, TEXT, TEXT, TEXT, NUMERIC, JSONB) TO authenticated;
