-- =====================================================================
-- KNOWLEDGE BRAIN — PHASE 7: AUTOMATIC BRAIN LEARNING ENGINE
-- Knowledge Diff, Knowledge Plans, Operations, Transactions & Controlled Commit
-- =====================================================================

-- 1. Knowledge Plans Table
CREATE TABLE IF NOT EXISTS public.knowledge_plans (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  extraction_run_id UUID REFERENCES public.knowledge_extraction_runs(id) ON DELETE SET NULL,
  conversation_id UUID REFERENCES public.conversations(id) ON DELETE SET NULL,
  status TEXT NOT NULL DEFAULT 'draft',
  learning_mode TEXT NOT NULL DEFAULT 'review',
  risk_level TEXT NOT NULL DEFAULT 'low',
  overall_confidence NUMERIC(4,3) CHECK (overall_confidence IS NULL OR (overall_confidence >= 0 AND overall_confidence <= 1)),
  plan_version INT NOT NULL DEFAULT 1,
  diff_summary JSONB DEFAULT '{}'::jsonb,
  summary JSONB DEFAULT '{}'::jsonb,
  metadata JSONB DEFAULT '{}'::jsonb,
  created_by UUID NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  approved_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  approved_at TIMESTAMPTZ,
  committed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT knowledge_plans_status_valid CHECK (status IN (
    'draft', 'validating', 'ready', 'needs_review', 'approved', 'committing', 'committed', 'partially_committed', 'rejected', 'failed', 'quarantined'
  )),
  CONSTRAINT knowledge_plans_mode_valid CHECK (learning_mode IN ('review', 'auto')),
  CONSTRAINT knowledge_plans_risk_valid CHECK (risk_level IN ('low', 'medium', 'high'))
);

CREATE INDEX IF NOT EXISTS idx_kp_created_by ON public.knowledge_plans (created_by, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_kp_status ON public.knowledge_plans (status);
CREATE INDEX IF NOT EXISTS idx_kp_conversation_id ON public.knowledge_plans (conversation_id);
CREATE INDEX IF NOT EXISTS idx_kp_run_id ON public.knowledge_plans (extraction_run_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.knowledge_plans TO authenticated;
GRANT ALL ON public.knowledge_plans TO service_role;

ALTER TABLE public.knowledge_plans ENABLE ROW LEVEL SECURITY;

CREATE POLICY "plans_own" ON public.knowledge_plans FOR ALL TO authenticated
  USING (created_by = auth.uid()) WITH CHECK (created_by = auth.uid());

CREATE TRIGGER knowledge_plans_updated_at BEFORE UPDATE ON public.knowledge_plans
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- 2. Knowledge Transactions Table
CREATE TABLE IF NOT EXISTS public.knowledge_transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  plan_id UUID REFERENCES public.knowledge_plans(id) ON DELETE CASCADE,
  conversation_id UUID REFERENCES public.conversations(id) ON DELETE SET NULL,
  status TEXT NOT NULL DEFAULT 'started',
  operation_count INT NOT NULL DEFAULT 0,
  summary JSONB DEFAULT '{}'::jsonb,
  initiated_by UUID NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  approved_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at TIMESTAMPTZ,
  metadata JSONB DEFAULT '{}'::jsonb,
  CONSTRAINT knowledge_transactions_status_valid CHECK (status IN (
    'started', 'committed', 'partially_committed', 'failed', 'rolled_back'
  ))
);

CREATE INDEX IF NOT EXISTS idx_kt_initiated_by ON public.knowledge_transactions (initiated_by, started_at DESC);
CREATE INDEX IF NOT EXISTS idx_kt_plan_id ON public.knowledge_transactions (plan_id);
CREATE INDEX IF NOT EXISTS idx_kt_status ON public.knowledge_transactions (status);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.knowledge_transactions TO authenticated;
GRANT ALL ON public.knowledge_transactions TO service_role;

ALTER TABLE public.knowledge_transactions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "transactions_own" ON public.knowledge_transactions FOR ALL TO authenticated
  USING (initiated_by = auth.uid()) WITH CHECK (initiated_by = auth.uid());

-- 3. Extend Knowledge Operations Table
ALTER TABLE public.knowledge_operations
  ADD COLUMN IF NOT EXISTS plan_id UUID REFERENCES public.knowledge_plans(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS proposal_id UUID REFERENCES public.knowledge_proposals(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS transaction_id UUID REFERENCES public.knowledge_transactions(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS target_type TEXT,
  ADD COLUMN IF NOT EXISTS target_id UUID,
  ADD COLUMN IF NOT EXISTS previous_state JSONB,
  ADD COLUMN IF NOT EXISTS proposed_state JSONB,
  ADD COLUMN IF NOT EXISTS diff JSONB,
  ADD COLUMN IF NOT EXISTS risk_level TEXT DEFAULT 'low',
  ADD COLUMN IF NOT EXISTS trust_tier TEXT DEFAULT 'tier_b',
  ADD COLUMN IF NOT EXISTS reason_summary TEXT,
  ADD COLUMN IF NOT EXISTS approved_by UUID REFERENCES auth.users(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_ko_plan_id ON public.knowledge_operations (plan_id);
CREATE INDEX IF NOT EXISTS idx_ko_proposal_id ON public.knowledge_operations (proposal_id);
CREATE INDEX IF NOT EXISTS idx_ko_transaction_id ON public.knowledge_operations (transaction_id);

-- Update Allowed Operation Types
ALTER TABLE public.knowledge_operations DROP CONSTRAINT IF EXISTS knowledge_operations_type_valid;
ALTER TABLE public.knowledge_operations ADD CONSTRAINT knowledge_operations_type_valid CHECK (operation_type IN (
  'CREATE_NODE','UPDATE_NODE','MOVE_NODE','MERGE_NODE','ARCHIVE_NODE',
  'CREATE_ENTRY','UPDATE_ENTRY',
  'CREATE_RELATION','UPDATE_RELATION','DEPRECATE_RELATION',
  'ADD_ALIAS','REMOVE_ALIAS',
  'ADD_CLAIM','UPDATE_CLAIM','DEPRECATE_CLAIM','VERIFY_CLAIM','DISPUTE_CLAIM',
  'ADD_SOURCE','UPDATE_SOURCE',
  'ADD_EVIDENCE','UPDATE_EVIDENCE',
  'NO_OP','QUARANTINE_CLAIM','QUARANTINE_NODE'
));

-- 4. Brain Learning Settings Table
CREATE TABLE IF NOT EXISTS public.knowledge_settings (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  learning_mode TEXT NOT NULL DEFAULT 'review',
  auto_create_nodes BOOLEAN NOT NULL DEFAULT false,
  auto_add_aliases BOOLEAN NOT NULL DEFAULT true,
  auto_add_relations BOOLEAN NOT NULL DEFAULT true,
  auto_add_claims BOOLEAN NOT NULL DEFAULT false,
  require_evidence_for_claims BOOLEAN NOT NULL DEFAULT true,
  min_node_confidence NUMERIC(3,2) NOT NULL DEFAULT 0.90,
  min_relation_confidence NUMERIC(3,2) NOT NULL DEFAULT 0.85,
  min_claim_confidence NUMERIC(3,2) NOT NULL DEFAULT 0.90,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT knowledge_settings_mode_valid CHECK (learning_mode IN ('review', 'auto'))
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.knowledge_settings TO authenticated;
GRANT ALL ON public.knowledge_settings TO service_role;

ALTER TABLE public.knowledge_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "settings_own" ON public.knowledge_settings FOR ALL TO authenticated
  USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

-- 5. Transactional Commit RPC: commit_knowledge_plan
CREATE OR REPLACE FUNCTION public.commit_knowledge_plan(
  p_plan_id UUID,
  p_approved_operation_ids UUID[] DEFAULT NULL
)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_user_id UUID := auth.uid();
  v_plan RECORD;
  v_op RECORD;
  v_tx_id UUID;
  v_temp_to_canonical JSONB := '{}'::jsonb;
  v_created_nodes_count INT := 0;
  v_updated_nodes_count INT := 0;
  v_created_relations_count INT := 0;
  v_added_claims_count INT := 0;
  v_no_ops_count INT := 0;
  v_quarantined_count INT := 0;
  v_new_node_id UUID;
  v_source_id UUID;
  v_target_id UUID;
  v_subject_id UUID;
  v_source_ref TEXT;
  v_target_ref TEXT;
  v_subject_ref TEXT;
BEGIN
  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Authentication required.');
  END IF;

  -- Load plan and lock for update
  SELECT * INTO v_plan FROM public.knowledge_plans
  WHERE id = p_plan_id AND created_by = v_user_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Knowledge plan not found or access denied.');
  END IF;

  IF v_plan.status = 'committed' THEN
    RETURN jsonb_build_object('success', false, 'error', 'Plan has already been committed.');
  END IF;

  -- Create Transaction Record
  INSERT INTO public.knowledge_transactions (
    plan_id, conversation_id, status, initiated_by, approved_by, metadata
  ) VALUES (
    p_plan_id, v_plan.conversation_id, 'started', v_user_id, v_user_id,
    jsonb_build_object('plan_version', v_plan.plan_version, 'mode', v_plan.learning_mode)
  ) RETURNING id INTO v_tx_id;

  -- Update plan status to committing
  UPDATE public.knowledge_plans
  SET status = 'committing', approved_by = v_user_id, approved_at = now()
  WHERE id = p_plan_id;

  -- Process ordered operations for this plan
  FOR v_op IN
    SELECT * FROM public.knowledge_operations
    WHERE plan_id = p_plan_id
      AND (p_approved_operation_ids IS NULL OR id = ANY(p_approved_operation_ids))
    ORDER BY
      CASE operation_type
        WHEN 'NO_OP' THEN 1
        WHEN 'CREATE_NODE' THEN 2
        WHEN 'UPDATE_NODE' THEN 3
        WHEN 'ADD_ALIAS' THEN 4
        WHEN 'CREATE_RELATION' THEN 5
        WHEN 'ADD_CLAIM' THEN 6
        WHEN 'QUARANTINE_CLAIM' THEN 7
        WHEN 'QUARANTINE_NODE' THEN 8
        ELSE 9
      END, created_at ASC
  LOOP
    -- -------------------------------------------------------------
    -- A. NO_OP
    -- -------------------------------------------------------------
    IF v_op.operation_type = 'NO_OP' THEN
      v_no_ops_count := v_no_ops_count + 1;
      UPDATE public.knowledge_operations
      SET status = 'executed', transaction_id = v_tx_id, executed_at = now()
      WHERE id = v_op.id;

    -- -------------------------------------------------------------
    -- B. CREATE_NODE
    -- -------------------------------------------------------------
    ELSIF v_op.operation_type = 'CREATE_NODE' THEN
      -- Check if node with same name or slug already exists under same parent
      SELECT id INTO v_new_node_id FROM public.knowledge_nodes
      WHERE created_by = v_user_id
        AND deleted_at IS NULL
        AND (name ILIKE (v_op.payload->>'name') OR slug = (v_op.payload->>'slug'))
      LIMIT 1;

      IF v_new_node_id IS NULL THEN
        INSERT INTO public.knowledge_nodes (
          name, canonical_name, slug, node_type, parent_id, description, summary, created_by, embedding_status
        ) VALUES (
          v_op.payload->>'name',
          COALESCE(v_op.payload->>'canonical_name', v_op.payload->>'name'),
          COALESCE(v_op.payload->>'slug', lower(regexp_replace(v_op.payload->>'name', '[^a-zA-Z0-9]+', '-', 'g'))),
          (COALESCE(v_op.payload->>'node_type', 'concept'))::public.node_type,
          (v_op.payload->>'parent_id')::UUID,
          v_op.payload->>'description',
          v_op.payload->>'summary',
          v_user_id,
          'pending'
        ) RETURNING id INTO v_new_node_id;

        v_created_nodes_count := v_created_nodes_count + 1;
      ELSE
        -- Reuse existing node
        v_no_ops_count := v_no_ops_count + 1;
      END IF;

      -- Map temporary reference if present
      IF (v_op.payload->>'temp_id') IS NOT NULL THEN
        v_temp_to_canonical := jsonb_set(v_temp_to_canonical, ARRAY[v_op.payload->>'temp_id'], to_jsonb(v_new_node_id::text));
      END IF;
      v_temp_to_canonical := jsonb_set(v_temp_to_canonical, ARRAY[v_op.payload->>'name'], to_jsonb(v_new_node_id::text));

      UPDATE public.knowledge_operations
      SET status = 'executed', target_id = v_new_node_id, transaction_id = v_tx_id, executed_at = now(),
          result = jsonb_build_object('node_id', v_new_node_id)
      WHERE id = v_op.id;

    -- -------------------------------------------------------------
    -- C. UPDATE_NODE (Field-level update)
    -- -------------------------------------------------------------
    ELSIF v_op.operation_type = 'UPDATE_NODE' THEN
      v_new_node_id := (v_op.payload->>'node_id')::UUID;
      IF v_new_node_id IS NOT NULL THEN
        UPDATE public.knowledge_nodes
        SET
          description = COALESCE(v_op.payload->>'description', description),
          summary = COALESCE(v_op.payload->>'summary', summary),
          embedding_status = 'stale',
          updated_at = now()
        WHERE id = v_new_node_id AND created_by = v_user_id;

        v_updated_nodes_count := v_updated_nodes_count + 1;
      END IF;

      UPDATE public.knowledge_operations
      SET status = 'executed', transaction_id = v_tx_id, executed_at = now()
      WHERE id = v_op.id;

    -- -------------------------------------------------------------
    -- D. ADD_ALIAS
    -- -------------------------------------------------------------
    ELSIF v_op.operation_type = 'ADD_ALIAS' THEN
      v_new_node_id := (v_op.payload->>'node_id')::UUID;
      IF v_new_node_id IS NOT NULL AND (v_op.payload->>'alias') IS NOT NULL THEN
        -- Check if alias already exists for node
        IF NOT EXISTS (
          SELECT 1 FROM public.knowledge_aliases
          WHERE node_id = v_new_node_id AND lower(alias) = lower(v_op.payload->>'alias')
        ) THEN
          INSERT INTO public.knowledge_aliases (
            node_id, alias, normalized_alias, language, is_primary, created_by
          ) VALUES (
            v_new_node_id,
            v_op.payload->>'alias',
            lower(v_op.payload->>'alias'),
            COALESCE(v_op.payload->>'language', 'en'),
            COALESCE((v_op.payload->>'is_primary')::boolean, false),
            v_user_id
          );
        ELSE
          v_no_ops_count := v_no_ops_count + 1;
        END IF;
      END IF;

      UPDATE public.knowledge_operations
      SET status = 'executed', transaction_id = v_tx_id, executed_at = now()
      WHERE id = v_op.id;

    -- -------------------------------------------------------------
    -- E. CREATE_RELATION
    -- -------------------------------------------------------------
    ELSIF v_op.operation_type = 'CREATE_RELATION' THEN
      v_source_ref := v_op.payload->>'source_id';
      v_target_ref := v_op.payload->>'target_id';

      -- Resolve temporary reference if necessary
      IF (v_temp_to_canonical->>v_source_ref) IS NOT NULL THEN
        v_source_id := (v_temp_to_canonical->>v_source_ref)::UUID;
      ELSE
        v_source_id := v_source_ref::UUID;
      END IF;

      IF (v_temp_to_canonical->>v_target_ref) IS NOT NULL THEN
        v_target_id := (v_temp_to_canonical->>v_target_ref)::UUID;
      ELSE
        v_target_id := v_target_ref::UUID;
      END IF;

      IF v_source_id IS NOT NULL AND v_target_id IS NOT NULL AND v_source_id <> v_target_id THEN
        -- Check if identical edge already exists
        IF NOT EXISTS (
          SELECT 1 FROM public.knowledge_edges
          WHERE source_node_id = v_source_id
            AND target_node_id = v_target_id
            AND relation_type = (v_op.payload->>'relation_type')
            AND deleted_at IS NULL
        ) THEN
          INSERT INTO public.knowledge_edges (
            source_node_id, target_node_id, relation_type, description, confidence, created_by
          ) VALUES (
            v_source_id,
            v_target_id,
            v_op.payload->>'relation_type',
            v_op.payload->>'description',
            COALESCE((v_op.payload->>'confidence')::numeric, 1.0),
            v_user_id
          );
          v_created_relations_count := v_created_relations_count + 1;
        ELSE
          v_no_ops_count := v_no_ops_count + 1;
        END IF;
      END IF;

      UPDATE public.knowledge_operations
      SET status = 'executed', transaction_id = v_tx_id, executed_at = now()
      WHERE id = v_op.id;

    -- -------------------------------------------------------------
    -- F. ADD_CLAIM
    -- -------------------------------------------------------------
    ELSIF v_op.operation_type = 'ADD_CLAIM' THEN
      v_subject_ref := v_op.payload->>'subject_node_id';
      IF (v_temp_to_canonical->>v_subject_ref) IS NOT NULL THEN
        v_subject_id := (v_temp_to_canonical->>v_subject_ref)::UUID;
      ELSE
        v_subject_id := v_subject_ref::UUID;
      END IF;

      -- Check duplicate statement
      IF NOT EXISTS (
        SELECT 1 FROM public.knowledge_claims
        WHERE subject_node_id = v_subject_id
          AND statement = (v_op.payload->>'statement')
          AND deleted_at IS NULL
      ) THEN
        INSERT INTO public.knowledge_claims (
          subject_node_id, statement, claim_type, confidence, created_by
        ) VALUES (
          v_subject_id,
          v_op.payload->>'statement',
          COALESCE(v_op.payload->>'claim_type', 'fact'),
          COALESCE((v_op.payload->>'confidence')::numeric, 0.9),
          v_user_id
        );
        v_added_claims_count := v_added_claims_count + 1;
      ELSE
        v_no_ops_count := v_no_ops_count + 1;
      END IF;

      UPDATE public.knowledge_operations
      SET status = 'executed', transaction_id = v_tx_id, executed_at = now()
      WHERE id = v_op.id;

    -- -------------------------------------------------------------
    -- G. QUARANTINE
    -- -------------------------------------------------------------
    ELSIF v_op.operation_type IN ('QUARANTINE_CLAIM', 'QUARANTINE_NODE') THEN
      v_quarantined_count := v_quarantined_count + 1;
      UPDATE public.knowledge_operations
      SET status = 'executed', transaction_id = v_tx_id, executed_at = now()
      WHERE id = v_op.id;
    END IF;
  END LOOP;

  -- Complete Transaction Record
  UPDATE public.knowledge_transactions
  SET
    status = 'committed',
    completed_at = now(),
    operation_count = v_created_nodes_count + v_updated_nodes_count + v_created_relations_count + v_added_claims_count + v_no_ops_count + v_quarantined_count,
    summary = jsonb_build_object(
      'created_nodes', v_created_nodes_count,
      'updated_nodes', v_updated_nodes_count,
      'created_relations', v_created_relations_count,
      'added_claims', v_added_claims_count,
      'no_ops', v_no_ops_count,
      'quarantined', v_quarantined_count
    )
  WHERE id = v_tx_id;

  -- Complete Plan Record
  UPDATE public.knowledge_plans
  SET
    status = 'committed',
    committed_at = now(),
    summary = jsonb_build_object(
      'created_nodes', v_created_nodes_count,
      'updated_nodes', v_updated_nodes_count,
      'created_relations', v_created_relations_count,
      'added_claims', v_added_claims_count,
      'no_ops', v_no_ops_count,
      'quarantined', v_quarantined_count
    )
  WHERE id = p_plan_id;

  RETURN jsonb_build_object(
    'success', true,
    'plan_id', p_plan_id,
    'transaction_id', v_tx_id,
    'summary', jsonb_build_object(
      'created_nodes', v_created_nodes_count,
      'updated_nodes', v_updated_nodes_count,
      'created_relations', v_created_relations_count,
      'added_claims', v_added_claims_count,
      'no_ops', v_no_ops_count,
      'quarantined', v_quarantined_count
    )
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.commit_knowledge_plan(UUID, UUID[]) TO authenticated;
GRANT EXECUTE ON FUNCTION public.commit_knowledge_plan(UUID, UUID[]) TO service_role;
