-- ============================================================================
-- KNOWLEDGE BRAIN — PHASE 2: Knowledge Structure Engine Migration
-- Enhances hierarchy traversal, aliases, name normalization, cycle prevention,
-- search-before-create lookup, and safe node resolution & creation.
-- ============================================================================

-- 1. Ensure required extensions exist
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- 2. Extend knowledge_aliases with alias_type and normalized_alias
ALTER TABLE public.knowledge_aliases
  ADD COLUMN IF NOT EXISTS alias_type TEXT NOT NULL DEFAULT 'alternate_name',
  ADD COLUMN IF NOT EXISTS normalized_alias TEXT GENERATED ALWAYS AS (lower(regexp_replace(btrim(alias), '\s+', ' ', 'g'))) STORED;

-- Add check constraint for alias types if not exists
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'knowledge_aliases_alias_type_check'
  ) THEN
    ALTER TABLE public.knowledge_aliases
      ADD CONSTRAINT knowledge_aliases_alias_type_check
      CHECK (alias_type IN ('abbreviation', 'translation', 'alternate_name', 'common_name', 'legacy_name'));
  END IF;
END $$;

-- Indexes for knowledge_aliases
CREATE INDEX IF NOT EXISTS knowledge_aliases_canonical_idx ON public.knowledge_aliases (canonical_alias);
CREATE INDEX IF NOT EXISTS knowledge_aliases_type_idx ON public.knowledge_aliases (alias_type);
CREATE INDEX IF NOT EXISTS knowledge_aliases_node_idx ON public.knowledge_aliases (node_id);
CREATE INDEX IF NOT EXISTS knowledge_aliases_norm_trgm ON public.knowledge_aliases USING gin (normalized_alias gin_trgm_ops);

-- Additional indexes for knowledge_nodes performance
CREATE INDEX IF NOT EXISTS knowledge_nodes_type_idx ON public.knowledge_nodes (created_by, node_type);
CREATE INDEX IF NOT EXISTS knowledge_nodes_status_idx ON public.knowledge_nodes (created_by, status);
CREATE INDEX IF NOT EXISTS knowledge_nodes_canonical_idx ON public.knowledge_nodes (created_by, canonical_name);
CREATE INDEX IF NOT EXISTS knowledge_nodes_slug_idx ON public.knowledge_nodes (created_by, slug);

-- 3. Name Normalization Function
-- Trims, collapses repeated whitespace, lowercases, and strips non-semantic diacritics/tashkeel
-- without destructively mutating Arabic character semantics.
CREATE OR REPLACE FUNCTION public.normalize_knowledge_name(p_name TEXT)
RETURNS TEXT LANGUAGE plpgsql IMMUTABLE LEAKPROOF AS $$
DECLARE
  cleaned TEXT;
BEGIN
  IF p_name IS NULL THEN
    RETURN NULL;
  END IF;

  -- Trim whitespace
  cleaned := btrim(p_name);
  -- Collapse consecutive whitespace characters into a single space
  cleaned := regexp_replace(cleaned, '\s+', ' ', 'g');
  -- Remove zero-width characters (ZWSP, ZWNJ, ZWJ, BOM)
  cleaned := regexp_replace(cleaned, '[\u200B\u200C\u200D\uFEFF]', '', 'g');
  -- Strip Arabic diacritics / tashkeel (fatha, damma, kasra, tanwin, sukun, shadda, dagger alef)
  -- so search works with or without diacritics while preserving letters
  cleaned := regexp_replace(cleaned, '[\u064B-\u0652\u0670]', '', 'g');
  -- Convert to lowercase
  cleaned := lower(cleaned);

  RETURN cleaned;
END;
$$;

-- 4. Hierarchy Path Function
-- Returns the full ordered ancestor trail from root down to the target node
CREATE OR REPLACE FUNCTION public.get_node_path(p_node_id UUID)
RETURNS TABLE (
  id UUID,
  name TEXT,
  canonical_name TEXT,
  slug TEXT,
  node_type public.node_type,
  depth INT
) LANGUAGE sql STABLE SECURITY INVOKER SET search_path = public AS $$
  WITH RECURSIVE chain AS (
    SELECT n.id, n.name, n.canonical_name, n.slug, n.node_type, n.parent_id, 0 AS depth
      FROM public.knowledge_nodes n
      WHERE n.id = p_node_id AND n.deleted_at IS NULL
    UNION ALL
    SELECT p.id, p.name, p.canonical_name, p.slug, p.node_type, p.parent_id, c.depth + 1
      FROM public.knowledge_nodes p
      JOIN chain c ON p.id = c.parent_id
      WHERE p.deleted_at IS NULL
  )
  SELECT chain.id, chain.name, chain.canonical_name, chain.slug, chain.node_type, chain.depth
  FROM chain
  ORDER BY depth DESC;
$$;

-- 5. Descendants Function
-- Returns all descendant nodes of a given node (unlimited depth)
CREATE OR REPLACE FUNCTION public.get_node_descendants(p_node_id UUID)
RETURNS TABLE (
  id UUID,
  parent_id UUID,
  name TEXT,
  canonical_name TEXT,
  slug TEXT,
  node_type public.node_type,
  status public.knowledge_status,
  depth INT
) LANGUAGE sql STABLE SECURITY INVOKER SET search_path = public AS $$
  WITH RECURSIVE tree AS (
    SELECT n.id, n.parent_id, n.name, n.canonical_name, n.slug, n.node_type, n.status, 0 AS depth
      FROM public.knowledge_nodes n
      WHERE n.id = p_node_id AND n.deleted_at IS NULL
    UNION ALL
    SELECT c.id, c.parent_id, c.name, c.canonical_name, c.slug, c.node_type, c.status, t.depth + 1
      FROM public.knowledge_nodes c
      JOIN tree t ON c.parent_id = t.id
      WHERE c.deleted_at IS NULL
  )
  SELECT tree.id, tree.parent_id, tree.name, tree.canonical_name, tree.slug, tree.node_type, tree.status, tree.depth
  FROM tree
  WHERE tree.id <> p_node_id
  ORDER BY tree.depth ASC, tree.name ASC;
$$;

-- 6. Move Validation Function
-- Validates whether moving p_node_id to p_new_parent_id is structurally safe (no cycles, no self-parenting)
CREATE OR REPLACE FUNCTION public.validate_node_move(p_node_id UUID, p_new_parent_id UUID)
RETURNS JSONB LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path = public AS $$
DECLARE
  v_node RECORD;
  v_target RECORD;
  v_cur UUID;
  v_depth INT := 0;
BEGIN
  -- If new parent is NULL (moving to root), it is always structurally valid
  IF p_new_parent_id IS NULL THEN
    RETURN jsonb_build_object('valid', true);
  END IF;

  -- Cannot parent to itself
  IF p_node_id = p_new_parent_id THEN
    RETURN jsonb_build_object('valid', false, 'error', 'A node cannot become its own parent.');
  END IF;

  -- Ensure node exists
  SELECT * INTO v_node FROM public.knowledge_nodes WHERE id = p_node_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('valid', false, 'error', 'Source node not found.');
  END IF;

  -- Ensure target parent exists
  SELECT * INTO v_target FROM public.knowledge_nodes WHERE id = p_new_parent_id AND deleted_at IS NULL;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('valid', false, 'error', 'Target parent node does not exist or has been deleted.');
  END IF;

  -- Walk up target's ancestry to ensure p_node_id is not an ancestor of p_new_parent_id
  v_cur := p_new_parent_id;
  WHILE v_cur IS NOT NULL AND v_depth < 200 LOOP
    IF v_cur = p_node_id THEN
      RETURN jsonb_build_object('valid', false, 'error', 'Circular hierarchy prevented: target is a descendant of this node.');
    END IF;
    SELECT parent_id INTO v_cur FROM public.knowledge_nodes WHERE id = v_cur;
    v_depth := v_depth + 1;
  END LOOP;

  -- Check if a node with the exact canonical name already exists under new parent
  IF EXISTS (
    SELECT 1 FROM public.knowledge_nodes
    WHERE parent_id = p_new_parent_id
      AND canonical_name = v_node.canonical_name
      AND id <> p_node_id
      AND deleted_at IS NULL
  ) THEN
    RETURN jsonb_build_object('valid', false, 'error', 'A node with this name already exists under the target parent.');
  END IF;

  RETURN jsonb_build_object('valid', true);
END;
$$;

-- 7. Safe Node Move RPC
CREATE OR REPLACE FUNCTION public.safe_move_knowledge_node(p_node_id UUID, p_new_parent_id UUID)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_val JSONB;
  v_updated RECORD;
BEGIN
  v_val := public.validate_node_move(p_node_id, p_new_parent_id);
  IF NOT (v_val->>'valid')::boolean THEN
    RAISE EXCEPTION '%', (v_val->>'error');
  END IF;

  UPDATE public.knowledge_nodes
  SET parent_id = p_new_parent_id,
      updated_at = now()
  WHERE id = p_node_id AND created_by = auth.uid()
  RETURNING * INTO v_updated;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Node not found or you are not authorized to move it.';
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'node_id', v_updated.id,
    'parent_id', v_updated.parent_id
  );
END;
$$;

-- 8. Knowledge Lookup & Resolution RPC
-- Pipeline:
-- 1. Exact canonical name match under specified parent
-- 2. Exact alias match under specified parent
-- 3. Exact canonical name match globally (different parent) -> possible duplicate / ambiguous
-- 4. Global alias match -> possible duplicate
-- 5. Slug match
-- 6. Fuzzy trigram similarity on name & aliases
CREATE OR REPLACE FUNCTION public.resolve_knowledge_node(
  p_name TEXT,
  p_parent_id UUID DEFAULT NULL,
  p_node_type public.node_type DEFAULT 'topic'
)
RETURNS JSONB LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_user_id UUID := auth.uid();
  v_normalized TEXT;
  v_slug TEXT;
  v_exact_parent RECORD;
  v_alias_parent RECORD;
  v_candidates JSONB := '[]'::jsonb;
  v_cand RECORD;
  v_path_str TEXT;
BEGIN
  IF p_name IS NULL OR btrim(p_name) = '' THEN
    RETURN jsonb_build_object(
      'status', 'new',
      'node_id', null,
      'confidence', 1.0,
      'reason', 'Empty name provided',
      'candidates', '[]'::jsonb
    );
  END IF;

  v_normalized := public.normalize_knowledge_name(p_name);
  v_slug := lower(regexp_replace(btrim(p_name), '[^a-zA-Z0-9\u0621-\u064A]+', '-', 'g'));
  v_slug := trim(both '-' from v_slug);

  -- Step 1: Check for exact canonical name or normalized match under SAME parent
  SELECT n.* INTO v_exact_parent
  FROM public.knowledge_nodes n
  WHERE n.created_by = v_user_id
    AND n.deleted_at IS NULL
    AND coalesce(n.parent_id, '00000000-0000-0000-0000-000000000000'::uuid) = coalesce(p_parent_id, '00000000-0000-0000-0000-000000000000'::uuid)
    AND (n.canonical_name = lower(btrim(p_name)) OR public.normalize_knowledge_name(n.name) = v_normalized)
  LIMIT 1;

  IF FOUND THEN
    RETURN jsonb_build_object(
      'status', 'existing',
      'node_id', v_exact_parent.id,
      'confidence', 1.0,
      'reason', 'Exact match found in this hierarchy level.',
      'candidates', jsonb_build_array(jsonb_build_object(
        'id', v_exact_parent.id,
        'name', v_exact_parent.name,
        'canonical_name', v_exact_parent.canonical_name,
        'slug', v_exact_parent.slug,
        'node_type', v_exact_parent.node_type,
        'parent_id', v_exact_parent.parent_id,
        'match_type', 'exact_parent',
        'confidence', 1.0
      ))
    );
  END IF;

  -- Step 2: Check for exact alias match under SAME parent
  SELECT n.*, a.alias AS matched_alias INTO v_alias_parent
  FROM public.knowledge_aliases a
  JOIN public.knowledge_nodes n ON n.id = a.node_id
  WHERE a.created_by = v_user_id
    AND n.deleted_at IS NULL
    AND coalesce(n.parent_id, '00000000-0000-0000-0000-000000000000'::uuid) = coalesce(p_parent_id, '00000000-0000-0000-0000-000000000000'::uuid)
    AND (a.canonical_alias = lower(btrim(p_name)) OR public.normalize_knowledge_name(a.alias) = v_normalized)
  LIMIT 1;

  IF FOUND THEN
    RETURN jsonb_build_object(
      'status', 'existing',
      'node_id', v_alias_parent.id,
      'confidence', 0.98,
      'reason', 'Matches an alias of an existing node in this hierarchy level.',
      'candidates', jsonb_build_array(jsonb_build_object(
        'id', v_alias_parent.id,
        'name', v_alias_parent.name,
        'canonical_name', v_alias_parent.canonical_name,
        'slug', v_alias_parent.slug,
        'node_type', v_alias_parent.node_type,
        'parent_id', v_alias_parent.parent_id,
        'matched_alias', v_alias_parent.matched_alias,
        'match_type', 'alias_parent',
        'confidence', 0.98
      ))
    );
  END IF;

  -- Step 3: Collect candidate matches from global nodes and aliases
  -- (a) Exact canonical name match in other hierarchy locations
  FOR v_cand IN
    SELECT n.id, n.name, n.canonical_name, n.slug, n.node_type, n.parent_id,
           'exact_canonical' AS match_type, 0.90 AS confidence, NULL::text AS matched_alias
    FROM public.knowledge_nodes n
    WHERE n.created_by = v_user_id
      AND n.deleted_at IS NULL
      AND (n.canonical_name = lower(btrim(p_name)) OR public.normalize_knowledge_name(n.name) = v_normalized)
    LIMIT 5
  LOOP
    -- Build ancestor path string
    SELECT string_agg(p.name, ' > ' ORDER BY p.depth DESC) INTO v_path_str
    FROM public.get_node_path(v_cand.id) p;

    v_candidates := v_candidates || jsonb_build_object(
      'id', v_cand.id,
      'name', v_cand.name,
      'canonical_name', v_cand.canonical_name,
      'slug', v_cand.slug,
      'node_type', v_cand.node_type,
      'parent_id', v_cand.parent_id,
      'parent_path', coalesce(v_path_str, v_cand.name),
      'match_type', v_cand.match_type,
      'matched_alias', v_cand.matched_alias,
      'confidence', v_cand.confidence
    );
  END LOOP;

  -- (b) Global alias match
  FOR v_cand IN
    SELECT n.id, n.name, n.canonical_name, n.slug, n.node_type, n.parent_id,
           'alias' AS match_type, 0.85 AS confidence, a.alias AS matched_alias
    FROM public.knowledge_aliases a
    JOIN public.knowledge_nodes n ON n.id = a.node_id
    WHERE a.created_by = v_user_id
      AND n.deleted_at IS NULL
      AND (a.canonical_alias = lower(btrim(p_name)) OR public.normalize_knowledge_name(a.alias) = v_normalized)
      AND NOT EXISTS (
        SELECT 1 FROM jsonb_array_elements(v_candidates) elem WHERE (elem->>'id')::uuid = n.id
      )
    LIMIT 5
  LOOP
    SELECT string_agg(p.name, ' > ' ORDER BY p.depth DESC) INTO v_path_str
    FROM public.get_node_path(v_cand.id) p;

    v_candidates := v_candidates || jsonb_build_object(
      'id', v_cand.id,
      'name', v_cand.name,
      'canonical_name', v_cand.canonical_name,
      'slug', v_cand.slug,
      'node_type', v_cand.node_type,
      'parent_id', v_cand.parent_id,
      'parent_path', coalesce(v_path_str, v_cand.name),
      'match_type', v_cand.match_type,
      'matched_alias', v_cand.matched_alias,
      'confidence', v_cand.confidence
    );
  END LOOP;

  -- (c) Slug match
  FOR v_cand IN
    SELECT n.id, n.name, n.canonical_name, n.slug, n.node_type, n.parent_id,
           'slug' AS match_type, 0.75 AS confidence, NULL::text AS matched_alias
    FROM public.knowledge_nodes n
    WHERE n.created_by = v_user_id
      AND n.deleted_at IS NULL
      AND n.slug = v_slug
      AND NOT EXISTS (
        SELECT 1 FROM jsonb_array_elements(v_candidates) elem WHERE (elem->>'id')::uuid = n.id
      )
    LIMIT 3
  LOOP
    SELECT string_agg(p.name, ' > ' ORDER BY p.depth DESC) INTO v_path_str
    FROM public.get_node_path(v_cand.id) p;

    v_candidates := v_candidates || jsonb_build_object(
      'id', v_cand.id,
      'name', v_cand.name,
      'canonical_name', v_cand.canonical_name,
      'slug', v_cand.slug,
      'node_type', v_cand.node_type,
      'parent_id', v_cand.parent_id,
      'parent_path', coalesce(v_path_str, v_cand.name),
      'match_type', v_cand.match_type,
      'matched_alias', v_cand.matched_alias,
      'confidence', v_cand.confidence
    );
  END LOOP;

  -- (d) Fuzzy similarity using trigram (sim >= 0.4)
  IF length(v_normalized) >= 3 THEN
    FOR v_cand IN
      SELECT n.id, n.name, n.canonical_name, n.slug, n.node_type, n.parent_id,
             'fuzzy' AS match_type, round(similarity(n.canonical_name, v_normalized)::numeric, 2) AS confidence, NULL::text AS matched_alias
      FROM public.knowledge_nodes n
      WHERE n.created_by = v_user_id
        AND n.deleted_at IS NULL
        AND similarity(n.canonical_name, v_normalized) >= 0.4
        AND NOT EXISTS (
          SELECT 1 FROM jsonb_array_elements(v_candidates) elem WHERE (elem->>'id')::uuid = n.id
        )
      ORDER BY similarity(n.canonical_name, v_normalized) DESC
      LIMIT 3
    LOOP
      SELECT string_agg(p.name, ' > ' ORDER BY p.depth DESC) INTO v_path_str
      FROM public.get_node_path(v_cand.id) p;

      v_candidates := v_candidates || jsonb_build_object(
        'id', v_cand.id,
        'name', v_cand.name,
        'canonical_name', v_cand.canonical_name,
        'slug', v_cand.slug,
        'node_type', v_cand.node_type,
        'parent_id', v_cand.parent_id,
        'parent_path', coalesce(v_path_str, v_cand.name),
        'match_type', v_cand.match_type,
        'matched_alias', v_cand.matched_alias,
        'confidence', v_cand.confidence
      );
    END LOOP;
  END IF;

  -- Decide final resolution status
  IF jsonb_array_length(v_candidates) = 0 THEN
    RETURN jsonb_build_object(
      'status', 'new',
      'node_id', null,
      'confidence', 1.0,
      'reason', 'No matching or similar knowledge nodes found.',
      'candidates', '[]'::jsonb
    );
  ELSIF jsonb_array_length(v_candidates) = 1 THEN
    RETURN jsonb_build_object(
      'status', 'possible_duplicate',
      'node_id', (v_candidates->0->>'id')::uuid,
      'confidence', (v_candidates->0->>'confidence')::numeric,
      'reason', 'Possible duplicate found: ' || (v_candidates->0->>'name') || ' in ' || (v_candidates->0->>'parent_path'),
      'candidates', v_candidates
    );
  ELSE
    RETURN jsonb_build_object(
      'status', 'ambiguous',
      'node_id', null,
      'confidence', (v_candidates->0->>'confidence')::numeric,
      'reason', 'Multiple similar knowledge nodes found across the brain.',
      'candidates', v_candidates
    );
  END IF;
END;
$$;

-- 9. Controlled Safe Node Creation RPC
CREATE OR REPLACE FUNCTION public.safe_create_knowledge_node(
  p_name TEXT,
  p_parent_id UUID DEFAULT NULL,
  p_node_type public.node_type DEFAULT 'topic',
  p_description TEXT DEFAULT NULL,
  p_summary TEXT DEFAULT NULL,
  p_status public.knowledge_status DEFAULT 'active',
  p_metadata JSONB DEFAULT '{}'::jsonb,
  p_force BOOLEAN DEFAULT FALSE
)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_user_id UUID := auth.uid();
  v_res JSONB;
  v_status TEXT;
  v_slug TEXT;
  v_new_node RECORD;
  v_meta JSONB := coalesce(p_metadata, '{}'::jsonb);
  v_existing RECORD;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required to create knowledge nodes.';
  END IF;

  IF p_name IS NULL OR btrim(p_name) = '' THEN
    RAISE EXCEPTION 'Node name cannot be empty.';
  END IF;

  -- 1. Search before create via resolution pipeline
  v_res := public.resolve_knowledge_node(p_name, p_parent_id, p_node_type);
  v_status := v_res->>'status';

  -- If exact node already exists under this parent, return it directly
  IF v_status = 'existing' THEN
    SELECT * INTO v_existing FROM public.knowledge_nodes WHERE id = (v_res->>'node_id')::uuid;
    RETURN jsonb_build_object(
      'created', false,
      'status', 'existing',
      'node', to_jsonb(v_existing),
      'reason', v_res->>'reason',
      'candidates', v_res->'candidates'
    );
  END IF;

  -- If possible duplicate or ambiguous and not forced, return resolution warning without creating
  IF (v_status = 'possible_duplicate' OR v_status = 'ambiguous') AND NOT p_force THEN
    RETURN jsonb_build_object(
      'created', false,
      'status', v_status,
      'reason', v_res->>'reason',
      'candidates', v_res->'candidates'
    );
  END IF;

  -- If forced over duplicate warning, record audit trail in metadata
  IF p_force AND (v_status = 'possible_duplicate' OR v_status = 'ambiguous') THEN
    v_meta := v_meta || jsonb_build_object(
      'duplicate_warning_overridden', true,
      'overridden_status', v_status,
      'overridden_reason', v_res->>'reason',
      'candidate_ids', (SELECT jsonb_agg(elem->'id') FROM jsonb_array_elements(v_res->'candidates') elem)
    );
  END IF;

  -- Compute safe slug
  v_slug := lower(regexp_replace(btrim(p_name), '[^a-zA-Z0-9\u0621-\u064A]+', '-', 'g'));
  v_slug := trim(both '-' from v_slug);
  IF length(v_slug) = 0 THEN
    v_slug := 'node-' || substr(gen_random_uuid()::text, 1, 8);
  END IF;

  -- Ensure slug uniqueness under this parent if collision exists
  IF EXISTS (
    SELECT 1 FROM public.knowledge_nodes
    WHERE created_by = v_user_id
      AND coalesce(parent_id, '00000000-0000-0000-0000-000000000000'::uuid) = coalesce(p_parent_id, '00000000-0000-0000-0000-000000000000'::uuid)
      AND slug = v_slug
      AND deleted_at IS NULL
  ) THEN
    v_slug := v_slug || '-' || substr(gen_random_uuid()::text, 1, 6);
  END IF;

  -- Insert node
  INSERT INTO public.knowledge_nodes (
    parent_id,
    node_type,
    name,
    slug,
    description,
    summary,
    status,
    metadata,
    created_by
  )
  VALUES (
    p_parent_id,
    p_node_type,
    btrim(p_name),
    v_slug,
    nullif(btrim(p_description), ''),
    nullif(btrim(p_summary), ''),
    p_status,
    v_meta,
    v_user_id
  )
  RETURNING * INTO v_new_node;

  RETURN jsonb_build_object(
    'created', true,
    'status', 'created',
    'node', to_jsonb(v_new_node),
    'resolution', v_res
  );
END;
$$;

-- Grant execution permissions to authenticated users
GRANT EXECUTE ON FUNCTION public.normalize_knowledge_name(TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_node_path(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_node_descendants(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.validate_node_move(UUID, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.safe_move_knowledge_node(UUID, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.resolve_knowledge_node(TEXT, UUID, public.node_type) TO authenticated;
GRANT EXECUTE ON FUNCTION public.safe_create_knowledge_node(TEXT, UUID, public.node_type, TEXT, TEXT, public.knowledge_status, JSONB, BOOLEAN) TO authenticated;
