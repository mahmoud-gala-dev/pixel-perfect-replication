-- =====================================================================
-- KNOWLEDGE BRAIN — PHASE 8: KNOWLEDGE INTEGRITY ENGINE
-- Versioning, Evidence Engine, Conflict Detection, Temporal Knowledge & Rollback
-- =====================================================================

-- 1. Extend knowledge_claims with temporal and conflict fields
ALTER TABLE public.knowledge_claims
  ADD COLUMN IF NOT EXISTS knowledge_state TEXT NOT NULL DEFAULT 'known',
  ADD COLUMN IF NOT EXISTS superseded_by UUID REFERENCES public.knowledge_claims(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS superseded_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS deprecated_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS valid_from TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS valid_until TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS observed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS last_verified_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS temporal_context JSONB DEFAULT '{}'::jsonb;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'knowledge_claims_knowledge_state_check'
  ) THEN
    ALTER TABLE public.knowledge_claims
      ADD CONSTRAINT knowledge_claims_knowledge_state_check
      CHECK (knowledge_state IN ('known', 'probable', 'uncertain', 'conflicted', 'outdated', 'deprecated', 'superseded', 'unknown'));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_kc_knowledge_state ON public.knowledge_claims (knowledge_state);
CREATE INDEX IF NOT EXISTS idx_kc_superseded_by ON public.knowledge_claims (superseded_by);
CREATE INDEX IF NOT EXISTS idx_kc_valid_range ON public.knowledge_claims (valid_from, valid_until);

-- 2. Extend sources with quality and availability
ALTER TABLE public.sources
  ADD COLUMN IF NOT EXISTS source_quality TEXT NOT NULL DEFAULT 'unknown',
  ADD COLUMN IF NOT EXISTS availability TEXT NOT NULL DEFAULT 'active',
  ADD COLUMN IF NOT EXISTS content_hash TEXT,
  ADD COLUMN IF NOT EXISTS last_checked_at TIMESTAMPTZ DEFAULT now();

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'sources_source_quality_check'
  ) THEN
    ALTER TABLE public.sources
      ADD CONSTRAINT sources_source_quality_check
      CHECK (source_quality IN ('official', 'primary', 'secondary', 'community', 'user-provided', 'ai-generated', 'unknown'));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'sources_availability_check'
  ) THEN
    ALTER TABLE public.sources
      ADD CONSTRAINT sources_availability_check
      CHECK (availability IN ('active', 'unavailable', 'broken', 'archived', 'unknown'));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_sources_availability ON public.sources (availability);
CREATE INDEX IF NOT EXISTS idx_sources_quality ON public.sources (source_quality);

-- 3. Extend evidence with location and content metadata
ALTER TABLE public.evidence
  ADD COLUMN IF NOT EXISTS source_location TEXT,
  ADD COLUMN IF NOT EXISTS content_hash TEXT,
  ADD COLUMN IF NOT EXISTS observed_at TIMESTAMPTZ DEFAULT now();

CREATE INDEX IF NOT EXISTS idx_evidence_claim_stance ON public.evidence (claim_id, stance);

-- 4. Extend knowledge_versions with lineage and operation references
ALTER TABLE public.knowledge_versions
  ADD COLUMN IF NOT EXISTS previous_version_id UUID REFERENCES public.knowledge_versions(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS change_type TEXT,
  ADD COLUMN IF NOT EXISTS knowledge_transaction_id UUID REFERENCES public.knowledge_transactions(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS knowledge_operation_id UUID REFERENCES public.knowledge_operations(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS reason_summary TEXT,
  ADD COLUMN IF NOT EXISTS metadata JSONB DEFAULT '{}'::jsonb;

CREATE INDEX IF NOT EXISTS idx_kv_transaction_id ON public.knowledge_versions (knowledge_transaction_id);
CREATE INDEX IF NOT EXISTS idx_kv_operation_id ON public.knowledge_versions (knowledge_operation_id);

-- 5. Extend knowledge_changes with diff and tracking references
ALTER TABLE public.knowledge_changes
  ADD COLUMN IF NOT EXISTS diff JSONB DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS reason_summary TEXT,
  ADD COLUMN IF NOT EXISTS operation_id UUID REFERENCES public.knowledge_operations(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS transaction_id UUID REFERENCES public.knowledge_transactions(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS message_id UUID REFERENCES public.messages(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS metadata JSONB DEFAULT '{}'::jsonb;

CREATE INDEX IF NOT EXISTS idx_kc_tx_id ON public.knowledge_changes (transaction_id);
CREATE INDEX IF NOT EXISTS idx_kc_op_id ON public.knowledge_changes (operation_id);

-- 6. Knowledge Conflicts Table
CREATE TABLE IF NOT EXISTS public.knowledge_conflicts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  claim_a_id UUID NOT NULL REFERENCES public.knowledge_claims(id) ON DELETE CASCADE,
  claim_b_id UUID NOT NULL REFERENCES public.knowledge_claims(id) ON DELETE CASCADE,
  conflict_type TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'OPEN',
  severity TEXT NOT NULL DEFAULT 'MEDIUM',
  reason_summary TEXT,
  detected_by TEXT NOT NULL DEFAULT 'system',
  resolution_type TEXT,
  resolution_notes TEXT,
  resolved_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  resolved_at TIMESTAMPTZ,
  metadata JSONB DEFAULT '{}'::jsonb,
  created_by UUID NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT knowledge_conflicts_type_valid CHECK (conflict_type IN (
    'DIRECT_CONTRADICTION', 'TEMPORAL_CONFLICT', 'SCOPE_CONFLICT', 'SOURCE_DISAGREEMENT',
    'DEFINITION_CONFLICT', 'ENTITY_AMBIGUITY', 'VERSION_CONFLICT', 'POSSIBLE_CONFLICT'
  )),
  CONSTRAINT knowledge_conflicts_status_valid CHECK (status IN (
    'OPEN', 'UNDER_REVIEW', 'RESOLVED', 'NOT_A_CONFLICT', 'SUPERSEDED'
  )),
  CONSTRAINT knowledge_conflicts_severity_valid CHECK (severity IN (
    'LOW', 'MEDIUM', 'HIGH'
  )),
  CONSTRAINT knowledge_conflicts_resolution_valid CHECK (resolution_type IS NULL OR resolution_type IN (
    'A_SUPPORTED', 'B_SUPPORTED', 'BOTH_VALID_DIFFERENT_CONTEXT', 'BOTH_VALID_DIFFERENT_TIME',
    'ONE_SUPERSEDES_ANOTHER', 'INSUFFICIENT_EVIDENCE', 'NOT_A_CONFLICT'
  )),
  CONSTRAINT knowledge_conflicts_distinct_claims CHECK (claim_a_id <> claim_b_id)
);

CREATE INDEX IF NOT EXISTS idx_conflicts_claim_a ON public.knowledge_conflicts (claim_a_id);
CREATE INDEX IF NOT EXISTS idx_conflicts_claim_b ON public.knowledge_conflicts (claim_b_id);
CREATE INDEX IF NOT EXISTS idx_conflicts_status ON public.knowledge_conflicts (status);
CREATE INDEX IF NOT EXISTS idx_conflicts_owner ON public.knowledge_conflicts (created_by, created_at DESC);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.knowledge_conflicts TO authenticated;
GRANT ALL ON public.knowledge_conflicts TO service_role;

ALTER TABLE public.knowledge_conflicts ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'knowledge_conflicts' AND policyname = 'conflicts_own'
  ) THEN
    CREATE POLICY "conflicts_own" ON public.knowledge_conflicts FOR ALL TO authenticated
      USING (created_by = auth.uid()) WITH CHECK (created_by = auth.uid());
  END IF;
END $$;

CREATE TRIGGER knowledge_conflicts_updated_at BEFORE UPDATE ON public.knowledge_conflicts
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- 7. Extend knowledge_operations allowed types
ALTER TABLE public.knowledge_operations DROP CONSTRAINT IF EXISTS knowledge_operations_type_valid;
ALTER TABLE public.knowledge_operations ADD CONSTRAINT knowledge_operations_type_valid CHECK (operation_type IN (
  'CREATE_NODE','UPDATE_NODE','MOVE_NODE','MERGE_NODE','ARCHIVE_NODE',
  'CREATE_ENTRY','UPDATE_ENTRY',
  'CREATE_RELATION','UPDATE_RELATION','DEPRECATE_RELATION',
  'ADD_ALIAS','REMOVE_ALIAS',
  'ADD_CLAIM','UPDATE_CLAIM','DEPRECATE_CLAIM','VERIFY_CLAIM','DISPUTE_CLAIM',
  'ADD_SOURCE','UPDATE_SOURCE',
  'ADD_EVIDENCE','UPDATE_EVIDENCE',
  'NO_OP','QUARANTINE_CLAIM','QUARANTINE_NODE',
  'ROLLBACK','RESTORE','SUPERSEDE_CLAIM','MARK_OUTDATED','RESOLVE_CONFLICT'
));

-- 8. Transactional Rollback RPC Function
CREATE OR REPLACE FUNCTION public.rollback_entity_to_version(
  p_subject_table TEXT,
  p_subject_id UUID,
  p_target_version INT
)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_user_id UUID := auth.uid();
  v_target_ver RECORD;
  v_current_ver RECORD;
  v_next_version INT;
  v_new_tx_id UUID;
  v_new_op_id UUID;
  v_prev_snapshot JSONB;
  v_restored_snapshot JSONB;
BEGIN
  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Authentication required for rollback.');
  END IF;

  -- 1. Fetch Target Version
  SELECT * INTO v_target_ver FROM public.knowledge_versions
  WHERE subject_table = p_subject_table AND subject_id = p_subject_id AND version = p_target_version;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Target version ' || p_target_version || ' not found.');
  END IF;

  v_restored_snapshot := v_target_ver.snapshot;

  -- 2. Fetch Latest Version
  SELECT * INTO v_current_ver FROM public.knowledge_versions
  WHERE subject_table = p_subject_table AND subject_id = p_subject_id
  ORDER BY version DESC LIMIT 1;

  IF NOT FOUND THEN
    v_next_version := 1;
    v_prev_snapshot := NULL;
  ELSE
    v_next_version := v_current_ver.version + 1;
    v_prev_snapshot := v_current_ver.snapshot;
  END IF;

  -- 3. Create Audit Transaction
  INSERT INTO public.knowledge_transactions (
    status, operation_count, summary, initiated_by, started_at, completed_at
  ) VALUES (
    'committed', 1,
    jsonb_build_object('rollback_to_version', p_target_version, 'subject_table', p_subject_table, 'subject_id', p_subject_id),
    v_user_id, now(), now()
  ) RETURNING id INTO v_new_tx_id;

  -- 4. Apply Restoration to Target Canonical Table
  IF p_subject_table = 'knowledge_nodes' THEN
    UPDATE public.knowledge_nodes
    SET
      name = COALESCE(v_restored_snapshot->>'name', name),
      description = v_restored_snapshot->>'description',
      summary = v_restored_snapshot->>'summary',
      node_type = COALESCE((v_restored_snapshot->>'node_type')::public.node_type, node_type),
      parent_id = (v_restored_snapshot->>'parent_id')::UUID,
      status = COALESCE((v_restored_snapshot->>'status')::public.knowledge_status, 'active'),
      updated_at = now()
    WHERE id = p_subject_id;
  ELSIF p_subject_table = 'knowledge_claims' THEN
    UPDATE public.knowledge_claims
    SET
      claim_text = COALESCE(v_restored_snapshot->>'claim_text', claim_text),
      claim_type = COALESCE(v_restored_snapshot->>'claim_type', 'fact'),
      status = COALESCE((v_restored_snapshot->>'status')::public.knowledge_status, 'active'),
      knowledge_state = COALESCE(v_restored_snapshot->>'knowledge_state', 'known'),
      verification = COALESCE((v_restored_snapshot->>'verification')::public.verification_status, 'unverified'),
      confidence = COALESCE((v_restored_snapshot->>'confidence')::numeric, confidence),
      updated_at = now()
    WHERE id = p_subject_id;
  END IF;

  -- 5. Create new Version v(N+1) pointing back to previous version
  INSERT INTO public.knowledge_versions (
    subject_table, subject_id, version, snapshot, change_type,
    previous_version_id, knowledge_transaction_id, reason_summary, created_by
  ) VALUES (
    p_subject_table, p_subject_id, v_next_version, v_restored_snapshot, 'ROLLBACK',
    v_current_ver.id, v_new_tx_id, 'Rollback to version ' || p_target_version, v_user_id
  );

  -- 6. Record Change
  INSERT INTO public.knowledge_changes (
    subject_table, subject_id, change_type, previous_state, new_state,
    reason, reason_summary, transaction_id, changed_by
  ) VALUES (
    p_subject_table, p_subject_id, 'ROLLBACK', v_prev_snapshot, v_restored_snapshot,
    'Rollback to version ' || p_target_version, 'Restored state from version ' || p_target_version,
    v_new_tx_id, v_user_id
  );

  RETURN jsonb_build_object(
    'success', true,
    'new_version', v_next_version,
    'target_version', p_target_version,
    'transaction_id', v_new_tx_id,
    'restored_snapshot', v_restored_snapshot
  );
END;
$$;

-- 9. Explain Claim Knowledge RPC Function ("Why does the Brain know this?")
CREATE OR REPLACE FUNCTION public.explain_claim_knowledge(p_claim_id UUID)
RETURNS JSONB LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_claim RECORD;
  v_node RECORD;
  v_supporting JSONB;
  v_counter JSONB;
  v_sources JSONB;
  v_conflicts JSONB;
  v_history JSONB;
BEGIN
  SELECT * INTO v_claim FROM public.knowledge_claims WHERE id = p_claim_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('found', false, 'error', 'Claim not found');
  END IF;

  SELECT id, name, node_type INTO v_node FROM public.knowledge_nodes WHERE id = v_claim.node_id;

  -- Supporting evidence
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'id', e.id, 'stance', e.stance, 'excerpt', e.excerpt, 'locator', e.locator,
    'strength', e.strength, 'source_id', e.source_id, 'created_at', e.created_at
  )), '[]'::jsonb) INTO v_supporting
  FROM public.evidence e
  WHERE e.claim_id = p_claim_id AND e.stance IN ('supported', 'verified');

  -- Counter evidence
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'id', e.id, 'stance', e.stance, 'excerpt', e.excerpt, 'locator', e.locator,
    'strength', e.strength, 'source_id', e.source_id, 'created_at', e.created_at
  )), '[]'::jsonb) INTO v_counter
  FROM public.evidence e
  WHERE e.claim_id = p_claim_id AND e.stance IN ('contradicted', 'rejected', 'disputed');

  -- Sources referenced
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'id', s.id, 'title', s.title, 'url', s.url, 'source_quality', s.source_quality,
    'availability', s.availability, 'reliability', s.reliability
  )), '[]'::jsonb) INTO v_sources
  FROM public.sources s
  WHERE s.id IN (
    SELECT DISTINCT source_id FROM public.evidence WHERE claim_id = p_claim_id
    UNION
    SELECT v_claim.source_id WHERE v_claim.source_id IS NOT NULL
  );

  -- Conflicts
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'id', c.id, 'conflict_type', c.conflict_type, 'status', c.status, 'severity', c.severity,
    'reason_summary', c.reason_summary, 'detected_at', c.created_at,
    'other_claim_id', CASE WHEN c.claim_a_id = p_claim_id THEN c.claim_b_id ELSE c.claim_a_id END
  )), '[]'::jsonb) INTO v_conflicts
  FROM public.knowledge_conflicts c
  WHERE c.claim_a_id = p_claim_id OR c.claim_b_id = p_claim_id;

  -- Version history
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'id', v.id, 'version', v.version, 'change_type', v.change_type,
    'reason_summary', v.reason_summary, 'created_at', v.created_at
  ) ORDER BY v.version DESC), '[]'::jsonb) INTO v_history
  FROM public.knowledge_versions v
  WHERE v.subject_table = 'knowledge_claims' AND v.subject_id = p_claim_id;

  RETURN jsonb_build_object(
    'found', true,
    'claim', jsonb_build_object(
      'id', v_claim.id,
      'statement', v_claim.claim_text,
      'claim_type', v_claim.claim_type,
      'knowledge_state', v_claim.knowledge_state,
      'verification', v_claim.verification,
      'confidence', v_claim.confidence,
      'valid_from', v_claim.valid_from,
      'valid_until', v_claim.valid_until,
      'superseded_by', v_claim.superseded_by,
      'created_at', v_claim.created_at,
      'updated_at', v_claim.updated_at
    ),
    'node', to_jsonb(v_node),
    'supporting_evidence', v_supporting,
    'counter_evidence', v_counter,
    'sources', v_sources,
    'conflicts', v_conflicts,
    'version_history', v_history
  );
END;
$$;
