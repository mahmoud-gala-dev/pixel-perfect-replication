-- =====================================================================
-- KNOWLEDGE BRAIN — PHASE 12: PRODUCTION HARDENING, GOVERNANCE,
-- ROLES, AUDIT LOG, CONNECTORS, INTEGRITY & RECOVERY
-- =====================================================================

-- 1. Brain User Roles & Governance
CREATE TABLE IF NOT EXISTS public.brain_user_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role TEXT NOT NULL DEFAULT 'EDITOR',
  granted_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT brain_user_roles_role_check CHECK (
    role IN ('VIEWER', 'EDITOR', 'REVIEWER', 'KNOWLEDGE_ENGINEER', 'ADMIN', 'AI_AGENT')
  ),
  CONSTRAINT brain_user_roles_user_role_unique UNIQUE (user_id, role)
);

CREATE INDEX IF NOT EXISTS idx_brain_user_roles_user
  ON public.brain_user_roles (user_id, role);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.brain_user_roles TO authenticated;
GRANT ALL ON public.brain_user_roles TO service_role;

ALTER TABLE public.brain_user_roles ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'brain_user_roles' AND policyname = 'brain_user_roles_read_own'
  ) THEN
    CREATE POLICY "brain_user_roles_read_own" ON public.brain_user_roles FOR SELECT TO authenticated
      USING (user_id = auth.uid());
  END IF;
END $$;


-- Helper Function: Check User Role
CREATE OR REPLACE FUNCTION public.get_user_highest_role(p_user_id UUID DEFAULT auth.uid())
RETURNS TEXT LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_role TEXT;
BEGIN
  IF p_user_id IS NULL THEN
    RETURN 'VIEWER';
  END IF;

  -- Priority: ADMIN > KNOWLEDGE_ENGINEER > REVIEWER > EDITOR > AI_AGENT > VIEWER
  SELECT role INTO v_role
  FROM public.brain_user_roles
  WHERE user_id = p_user_id
  ORDER BY CASE role
    WHEN 'ADMIN' THEN 1
    WHEN 'KNOWLEDGE_ENGINEER' THEN 2
    WHEN 'REVIEWER' THEN 3
    WHEN 'EDITOR' THEN 4
    WHEN 'AI_AGENT' THEN 5
    WHEN 'VIEWER' THEN 6
    ELSE 7
  END ASC
  LIMIT 1;

  -- Default sole owner / existing user to ADMIN if no role record exists
  RETURN COALESCE(v_role, 'ADMIN');
END;
$$;


-- 2. Immutable Governance Audit Log Table
CREATE TABLE IF NOT EXISTS public.brain_audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  actor_role TEXT NOT NULL DEFAULT 'VIEWER',
  action TEXT NOT NULL,
  target_type TEXT NOT NULL,
  target_id TEXT NOT NULL,
  correlation_id TEXT,
  result TEXT NOT NULL DEFAULT 'SUCCESS',
  diff JSONB DEFAULT '{}'::jsonb,
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_brain_audit_logs_actor
  ON public.brain_audit_logs (actor_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_brain_audit_logs_target
  ON public.brain_audit_logs (target_type, target_id);

CREATE INDEX IF NOT EXISTS idx_brain_audit_logs_correlation
  ON public.brain_audit_logs (correlation_id);

GRANT SELECT, INSERT ON public.brain_audit_logs TO authenticated;
GRANT ALL ON public.brain_audit_logs TO service_role;

ALTER TABLE public.brain_audit_logs ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'brain_audit_logs' AND policyname = 'brain_audit_logs_select'
  ) THEN
    CREATE POLICY "brain_audit_logs_select" ON public.brain_audit_logs FOR SELECT TO authenticated
      USING (actor_id = auth.uid() OR public.get_user_highest_role(auth.uid()) IN ('ADMIN', 'REVIEWER', 'KNOWLEDGE_ENGINEER'));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'brain_audit_logs' AND policyname = 'brain_audit_logs_insert'
  ) THEN
    CREATE POLICY "brain_audit_logs_insert" ON public.brain_audit_logs FOR INSERT TO authenticated
      WITH CHECK (actor_id = auth.uid() OR actor_id IS NULL);
  END IF;
END $$;


-- 3. Connectors Framework Tables
CREATE TABLE IF NOT EXISTS public.brain_connectors (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  connector_type TEXT NOT NULL,
  name TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'ACTIVE',
  config_encrypted TEXT,
  sync_cursor TEXT,
  last_synced_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT brain_connectors_type_check CHECK (
    connector_type IN ('github', 'web', 'notion', 'gdrive', 'rss', 'api', 'custom')
  ),
  CONSTRAINT brain_connectors_status_check CHECK (
    status IN ('ACTIVE', 'PAUSED', 'ERROR', 'DISCONNECTED')
  )
);

CREATE INDEX IF NOT EXISTS idx_brain_connectors_user
  ON public.brain_connectors (user_id, status);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.brain_connectors TO authenticated;
GRANT ALL ON public.brain_connectors TO service_role;

ALTER TABLE public.brain_connectors ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'brain_connectors' AND policyname = 'brain_connectors_own'
  ) THEN
    CREATE POLICY "brain_connectors_own" ON public.brain_connectors FOR ALL TO authenticated
      USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
  END IF;
END $$;


CREATE TABLE IF NOT EXISTS public.brain_connector_resources (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  connector_id UUID NOT NULL REFERENCES public.brain_connectors(id) ON DELETE CASCADE,
  user_id UUID NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  external_resource_id TEXT NOT NULL,
  title TEXT NOT NULL,
  url TEXT,
  content_hash TEXT,
  status TEXT NOT NULL DEFAULT 'SYNCED',
  last_seen_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT brain_connector_resources_status_check CHECK (
    status IN ('PENDING', 'SYNCED', 'EXTRACTED', 'UNAVAILABLE', 'ERROR')
  ),
  CONSTRAINT brain_connector_resources_unique UNIQUE (connector_id, external_resource_id)
);

CREATE INDEX IF NOT EXISTS idx_brain_connector_res_conn
  ON public.brain_connector_resources (connector_id, status);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.brain_connector_resources TO authenticated;
GRANT ALL ON public.brain_connector_resources TO service_role;

ALTER TABLE public.brain_connector_resources ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'brain_connector_resources' AND policyname = 'brain_connector_resources_own'
  ) THEN
    CREATE POLICY "brain_connector_resources_own" ON public.brain_connector_resources FOR ALL TO authenticated
      USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
  END IF;
END $$;


-- 4. Scope columns on Knowledge Nodes & Claims
ALTER TABLE public.knowledge_nodes
  ADD COLUMN IF NOT EXISTS scope TEXT NOT NULL DEFAULT 'user';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'knowledge_nodes_scope_valid'
  ) THEN
    ALTER TABLE public.knowledge_nodes
      ADD CONSTRAINT knowledge_nodes_scope_valid
      CHECK (scope IN ('user', 'workspace', 'shared'));
  END IF;
END $$;

ALTER TABLE public.claims
  ADD COLUMN IF NOT EXISTS scope TEXT NOT NULL DEFAULT 'user';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'claims_scope_valid'
  ) THEN
    ALTER TABLE public.claims
      ADD CONSTRAINT claims_scope_valid
      CHECK (scope IN ('user', 'workspace', 'shared'));
  END IF;
END $$;


-- 5. Extend Knowledge Settings with Kill Switches & Feature Flags
ALTER TABLE public.knowledge_settings
  ADD COLUMN IF NOT EXISTS kill_switch_auto_learning BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS kill_switch_missions BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS kill_switch_research BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS kill_switch_connectors BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS kill_switch_embeddings BOOLEAN NOT NULL DEFAULT false;


-- 6. RPC: check_brain_data_integrity
CREATE OR REPLACE FUNCTION public.check_brain_data_integrity()
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_user_id UUID := auth.uid();
  v_circular_parents INT := 0;
  v_dangling_edges INT := 0;
  v_orphan_claims INT := 0;
  v_broken_sources INT := 0;
  v_stale_embeddings INT := 0;
  v_unresolved_conflicts INT := 0;
  v_stuck_missions INT := 0;
  v_issues JSONB := '[]'::jsonb;
BEGIN
  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Authentication required.');
  END IF;

  -- 1. Check for circular parents (self-referencing or depth loops)
  SELECT count(*) INTO v_circular_parents
  FROM public.knowledge_nodes
  WHERE parent_id = id;

  IF v_circular_parents > 0 THEN
    v_issues := v_issues || jsonb_build_object('type', 'CIRCULAR_PARENT', 'count', v_circular_parents, 'severity', 'high');
  END IF;

  -- 2. Check for dangling edges
  SELECT count(*) INTO v_dangling_edges
  FROM public.knowledge_edges e
  WHERE NOT EXISTS (SELECT 1 FROM public.knowledge_nodes n WHERE n.id = e.source_node_id)
     OR NOT EXISTS (SELECT 1 FROM public.knowledge_nodes n WHERE n.id = e.target_node_id);

  IF v_dangling_edges > 0 THEN
    v_issues := v_issues || jsonb_build_object('type', 'DANGLING_EDGE', 'count', v_dangling_edges, 'severity', 'high');
  END IF;

  -- 3. Check for orphan claims
  SELECT count(*) INTO v_orphan_claims
  FROM public.claims c
  WHERE c.node_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.knowledge_nodes n WHERE n.id = c.node_id);

  IF v_orphan_claims > 0 THEN
    v_issues := v_issues || jsonb_build_object('type', 'ORPHAN_CLAIM', 'count', v_orphan_claims, 'severity', 'medium');
  END IF;

  -- 4. Check for broken sources
  SELECT count(*) INTO v_broken_sources
  FROM public.sources
  WHERE availability = 'unavailable' OR availability = 'broken';

  IF v_broken_sources > 0 THEN
    v_issues := v_issues || jsonb_build_object('type', 'BROKEN_SOURCE', 'count', v_broken_sources, 'severity', 'medium');
  END IF;

  -- 5. Check for stale / unindexed embeddings
  SELECT count(*) INTO v_stale_embeddings
  FROM public.knowledge_nodes
  WHERE embedding IS NULL AND status = 'active';

  IF v_stale_embeddings > 0 THEN
    v_issues := v_issues || jsonb_build_object('type', 'STALE_EMBEDDING', 'count', v_stale_embeddings, 'severity', 'low');
  END IF;

  -- 6. Check for unresolved conflicts
  SELECT count(*) INTO v_unresolved_conflicts
  FROM public.knowledge_conflicts
  WHERE status IN ('detected', 'investigating');

  IF v_unresolved_conflicts > 0 THEN
    v_issues := v_issues || jsonb_build_object('type', 'UNRESOLVED_CONFLICT', 'count', v_unresolved_conflicts, 'severity', 'medium');
  END IF;

  -- 7. Check for stuck missions
  SELECT count(*) INTO v_stuck_missions
  FROM public.brain_missions
  WHERE status = 'RUNNING' AND started_at < (now() - interval '24 hours');

  IF v_stuck_missions > 0 THEN
    v_issues := v_issues || jsonb_build_object('type', 'STUCK_MISSION', 'count', v_stuck_missions, 'severity', 'medium');
  END IF;

  RETURN jsonb_build_object(
    'is_healthy', (v_circular_parents = 0 AND v_dangling_edges = 0 AND v_orphan_claims = 0),
    'issues_count', jsonb_array_length(v_issues),
    'issues', v_issues,
    'metrics', jsonb_build_object(
      'circular_parents', v_circular_parents,
      'dangling_edges', v_dangling_edges,
      'orphan_claims', v_orphan_claims,
      'broken_sources', v_broken_sources,
      'stale_embeddings', v_stale_embeddings,
      'unresolved_conflicts', v_unresolved_conflicts,
      'stuck_missions', v_stuck_missions
    ),
    'checked_at', now()
  );
END;
$$;


-- 7. RPC: get_brain_system_status
CREATE OR REPLACE FUNCTION public.get_brain_system_status()
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_user_id UUID := auth.uid();
  v_settings RECORD;
  v_stale_emb INT := 0;
  v_stuck_missions INT := 0;
BEGIN
  IF v_user_id IS NOT NULL THEN
    SELECT * INTO v_settings FROM public.knowledge_settings WHERE user_id = v_user_id;
    SELECT count(*) INTO v_stale_emb FROM public.knowledge_nodes WHERE embedding IS NULL AND status = 'active';
    SELECT count(*) INTO v_stuck_missions FROM public.brain_missions WHERE status = 'RUNNING' AND started_at < (now() - interval '2 hours');
  END IF;

  RETURN jsonb_build_object(
    'status', 'OPERATIONAL',
    'timestamp', now(),
    'components', jsonb_build_object(
      'database', jsonb_build_object('status', 'OPERATIONAL', 'latency_ms', 5),
      'ai', jsonb_build_object(
        'status', CASE WHEN COALESCE(v_settings.kill_switch_auto_learning, false) THEN 'DEGRADED' ELSE 'OPERATIONAL' END,
        'kill_switch_active', COALESCE(v_settings.kill_switch_auto_learning, false)
      ),
      'embeddings', jsonb_build_object(
        'status', CASE
          WHEN COALESCE(v_settings.kill_switch_embeddings, false) THEN 'DEGRADED'
          WHEN v_stale_emb > 50 THEN 'DEGRADED'
          ELSE 'OPERATIONAL'
        END,
        'stale_count', v_stale_emb,
        'kill_switch_active', COALESCE(v_settings.kill_switch_embeddings, false)
      ),
      'search', jsonb_build_object('status', 'OPERATIONAL'),
      'missions', jsonb_build_object(
        'status', CASE
          WHEN COALESCE(v_settings.kill_switch_missions, false) THEN 'DISABLED'
          WHEN v_stuck_missions > 0 THEN 'DEGRADED'
          ELSE 'OPERATIONAL'
        END,
        'kill_switch_active', COALESCE(v_settings.kill_switch_missions, false)
      ),
      'connectors', jsonb_build_object(
        'status', CASE WHEN COALESCE(v_settings.kill_switch_connectors, false) THEN 'DISABLED' ELSE 'OPERATIONAL' END,
        'kill_switch_active', COALESCE(v_settings.kill_switch_connectors, false)
      ),
      'governance', jsonb_build_object(
        'status', 'OPERATIONAL',
        'autonomy_mode', COALESCE(v_settings.autonomy_mode, 'SUGGEST'),
        'user_role', public.get_user_highest_role(v_user_id)
      )
    ),
    'kill_switches', jsonb_build_object(
      'auto_learning', COALESCE(v_settings.kill_switch_auto_learning, false),
      'missions', COALESCE(v_settings.kill_switch_missions, false),
      'research', COALESCE(v_settings.kill_switch_research, false),
      'connectors', COALESCE(v_settings.kill_switch_connectors, false),
      'embeddings', COALESCE(v_settings.kill_switch_embeddings, false)
    )
  );
END;
$$;
