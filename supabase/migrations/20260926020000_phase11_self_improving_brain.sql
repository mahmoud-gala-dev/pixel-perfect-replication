-- =====================================================================
-- KNOWLEDGE BRAIN — PHASE 11: SELF-IMPROVING BRAIN
-- Missions, Observations, Agent Runs, Research, Revalidation,
-- Garbage Collection, Compression, Goals, Alerts & Autonomy Governance
-- =====================================================================

-- 1. Brain Observations Table
CREATE TABLE IF NOT EXISTS public.brain_observations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  observation_type TEXT NOT NULL,
  target_type TEXT NOT NULL,
  target_id TEXT NOT NULL,
  severity TEXT NOT NULL DEFAULT 'medium',
  confidence NUMERIC(4,3) DEFAULT 0.900,
  status TEXT NOT NULL DEFAULT 'open',
  summary TEXT NOT NULL,
  signals JSONB DEFAULT '{}'::jsonb,
  detected_by TEXT NOT NULL DEFAULT 'brain_observer',
  first_detected_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_detected_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  occurrence_count INT NOT NULL DEFAULT 1,
  resolved_at TIMESTAMPTZ,
  metadata JSONB DEFAULT '{}'::jsonb,
  CONSTRAINT brain_observations_severity_valid CHECK (severity IN ('low', 'medium', 'high', 'critical')),
  CONSTRAINT brain_observations_status_valid CHECK (status IN ('open', 'in_progress', 'resolved', 'dismissed'))
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_brain_observations_dedup
  ON public.brain_observations (user_id, observation_type, target_type, target_id);

CREATE INDEX IF NOT EXISTS idx_brain_observations_status
  ON public.brain_observations (user_id, status, severity);

CREATE INDEX IF NOT EXISTS idx_brain_observations_target
  ON public.brain_observations (target_type, target_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.brain_observations TO authenticated;
GRANT ALL ON public.brain_observations TO service_role;

ALTER TABLE public.brain_observations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "brain_observations_own" ON public.brain_observations FOR ALL TO authenticated
  USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());


-- 2. Brain Missions Table
CREATE TABLE IF NOT EXISTS public.brain_missions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  mission_type TEXT NOT NULL,
  title TEXT NOT NULL,
  description TEXT,
  status TEXT NOT NULL DEFAULT 'PROPOSED',
  priority TEXT NOT NULL DEFAULT 'MEDIUM',
  risk_level TEXT NOT NULL DEFAULT 'LOW',
  target_type TEXT,
  target_id TEXT,
  trigger_observation_id UUID REFERENCES public.brain_observations(id) ON DELETE SET NULL,
  goal TEXT NOT NULL,
  constraints JSONB DEFAULT '{}'::jsonb,
  budget JSONB DEFAULT '{"max_steps": 10, "max_ai_calls": 5, "max_research_queries": 5, "max_sources": 5}'::jsonb,
  budget_used JSONB DEFAULT '{"steps": 0, "ai_calls": 0, "research_queries": 0, "sources": 0}'::jsonb,
  assigned_agent TEXT NOT NULL DEFAULT 'ResearchAgent',
  outcome TEXT,
  outcome_summary TEXT,
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  reviewed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  metadata JSONB DEFAULT '{}'::jsonb,
  CONSTRAINT brain_missions_status_valid CHECK (status IN (
    'PROPOSED', 'QUEUED', 'RUNNING', 'WAITING_FOR_REVIEW', 'BLOCKED', 'COMPLETED', 'FAILED', 'CANCELLED', 'PAUSED'
  )),
  CONSTRAINT brain_missions_priority_valid CHECK (priority IN ('LOW', 'MEDIUM', 'HIGH', 'CRITICAL')),
  CONSTRAINT brain_missions_risk_valid CHECK (risk_level IN ('LOW', 'MEDIUM', 'HIGH')),
  CONSTRAINT brain_missions_outcome_valid CHECK (outcome IS NULL OR outcome IN (
    'IMPROVED', 'NO_CHANGE_NEEDED', 'PARTIALLY_IMPROVED', 'NEEDS_HUMAN_REVIEW', 'INSUFFICIENT_EVIDENCE', 'FAILED', 'BLOCKED'
  ))
);

CREATE INDEX IF NOT EXISTS idx_brain_missions_user_status
  ON public.brain_missions (user_id, status, priority);

CREATE INDEX IF NOT EXISTS idx_brain_missions_trigger
  ON public.brain_missions (trigger_observation_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.brain_missions TO authenticated;
GRANT ALL ON public.brain_missions TO service_role;

ALTER TABLE public.brain_missions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "brain_missions_own" ON public.brain_missions FOR ALL TO authenticated
  USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());


-- 3. Agent Runs Table
CREATE TABLE IF NOT EXISTS public.agent_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  mission_id UUID REFERENCES public.brain_missions(id) ON DELETE CASCADE,
  agent_type TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'running',
  input JSONB DEFAULT '{}'::jsonb,
  structured_output JSONB DEFAULT '{}'::jsonb,
  reason_summary TEXT,
  model TEXT,
  provider TEXT,
  usage_metadata JSONB DEFAULT '{}'::jsonb,
  error TEXT,
  started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT agent_runs_status_valid CHECK (status IN ('running', 'completed', 'failed', 'blocked', 'cancelled'))
);

CREATE INDEX IF NOT EXISTS idx_agent_runs_mission
  ON public.agent_runs (mission_id, created_at DESC);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.agent_runs TO authenticated;
GRANT ALL ON public.agent_runs TO service_role;

ALTER TABLE public.agent_runs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "agent_runs_own" ON public.agent_runs FOR ALL TO authenticated
  USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());


-- 4. Research Runs Table
CREATE TABLE IF NOT EXISTS public.research_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  mission_id UUID REFERENCES public.brain_missions(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'running',
  research_question TEXT NOT NULL,
  search_plan JSONB DEFAULT '{}'::jsonb,
  sources_checked JSONB DEFAULT '[]'::jsonb,
  findings_summary TEXT,
  budget_used JSONB DEFAULT '{}'::jsonb,
  error TEXT,
  started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at TIMESTAMPTZ,
  metadata JSONB DEFAULT '{}'::jsonb,
  CONSTRAINT research_runs_status_valid CHECK (status IN ('running', 'completed', 'failed', 'insufficient_evidence'))
);

CREATE INDEX IF NOT EXISTS idx_research_runs_mission
  ON public.research_runs (mission_id, created_at DESC);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.research_runs TO authenticated;
GRANT ALL ON public.research_runs TO service_role;

ALTER TABLE public.research_runs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "research_runs_own" ON public.research_runs FOR ALL TO authenticated
  USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());


-- 5. Research Findings Table
CREATE TABLE IF NOT EXISTS public.research_findings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  research_run_id UUID REFERENCES public.research_runs(id) ON DELETE CASCADE,
  finding_type TEXT NOT NULL,
  statement TEXT NOT NULL,
  related_entity_refs JSONB DEFAULT '[]'::jsonb,
  source_id UUID REFERENCES public.sources(id) ON DELETE SET NULL,
  source_url TEXT,
  source_title TEXT,
  evidence_excerpt TEXT,
  confidence NUMERIC(4,3) DEFAULT 0.900,
  status TEXT NOT NULL DEFAULT 'proposed',
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT research_findings_type_valid CHECK (finding_type IN (
    'SUPPORTING_EVIDENCE', 'CONTRADICTING_EVIDENCE', 'NEW_CLAIM', 'UPDATED_CLAIM', 'SUPERSEDED_CLAIM', 'BROKEN_SOURCE_REPAIR', 'DUPLICATE_CANDIDATE', 'TAXONOMY_CANDIDATE'
  )),
  CONSTRAINT research_findings_status_valid CHECK (status IN ('proposed', 'converted_to_proposal', 'dismissed'))
);

CREATE INDEX IF NOT EXISTS idx_research_findings_run
  ON public.research_findings (research_run_id, created_at DESC);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.research_findings TO authenticated;
GRANT ALL ON public.research_findings TO service_role;

ALTER TABLE public.research_findings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "research_findings_own" ON public.research_findings FOR ALL TO authenticated
  USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());


-- 6. Brain Goals Table
CREATE TABLE IF NOT EXISTS public.brain_goals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT,
  status TEXT NOT NULL DEFAULT 'ACTIVE',
  priority TEXT NOT NULL DEFAULT 'MEDIUM',
  scope JSONB DEFAULT '{}'::jsonb,
  success_criteria JSONB DEFAULT '[]'::jsonb,
  target_date DATE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  metadata JSONB DEFAULT '{}'::jsonb,
  CONSTRAINT brain_goals_status_valid CHECK (status IN ('ACTIVE', 'COMPLETED', 'PAUSED', 'ARCHIVED')),
  CONSTRAINT brain_goals_priority_valid CHECK (priority IN ('LOW', 'MEDIUM', 'HIGH'))
);

CREATE INDEX IF NOT EXISTS idx_brain_goals_user
  ON public.brain_goals (user_id, status);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.brain_goals TO authenticated;
GRANT ALL ON public.brain_goals TO service_role;

ALTER TABLE public.brain_goals ENABLE ROW LEVEL SECURITY;

CREATE POLICY "brain_goals_own" ON public.brain_goals FOR ALL TO authenticated
  USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());


-- 7. Brain Alerts Table
CREATE TABLE IF NOT EXISTS public.brain_alerts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  alert_type TEXT NOT NULL,
  severity TEXT NOT NULL DEFAULT 'medium',
  target_type TEXT,
  target_id TEXT,
  summary TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'unread',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  acknowledged_at TIMESTAMPTZ,
  metadata JSONB DEFAULT '{}'::jsonb,
  CONSTRAINT brain_alerts_severity_valid CHECK (severity IN ('low', 'medium', 'high', 'critical')),
  CONSTRAINT brain_alerts_status_valid CHECK (status IN ('unread', 'acknowledged', 'dismissed'))
);

CREATE INDEX IF NOT EXISTS idx_brain_alerts_user
  ON public.brain_alerts (user_id, status, created_at DESC);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.brain_alerts TO authenticated;
GRANT ALL ON public.brain_alerts TO service_role;

ALTER TABLE public.brain_alerts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "brain_alerts_own" ON public.brain_alerts FOR ALL TO authenticated
  USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());


-- 8. Extend Knowledge Settings Table with Autonomy Controls
ALTER TABLE public.knowledge_settings
  ADD COLUMN IF NOT EXISTS autonomy_mode TEXT NOT NULL DEFAULT 'SUGGEST',
  ADD COLUMN IF NOT EXISTS daily_mission_budget INT NOT NULL DEFAULT 20,
  ADD COLUMN IF NOT EXISTS max_concurrent_missions INT NOT NULL DEFAULT 3,
  ADD COLUMN IF NOT EXISTS max_research_calls_per_mission INT NOT NULL DEFAULT 5,
  ADD COLUMN IF NOT EXISTS max_ai_calls_per_mission INT NOT NULL DEFAULT 5,
  ADD COLUMN IF NOT EXISTS max_sources_per_mission INT NOT NULL DEFAULT 5,
  ADD COLUMN IF NOT EXISTS allowed_domains JSONB DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS blocked_domains JSONB DEFAULT '[]'::jsonb;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'knowledge_settings_autonomy_mode_valid'
  ) THEN
    ALTER TABLE public.knowledge_settings
      ADD CONSTRAINT knowledge_settings_autonomy_mode_valid
      CHECK (autonomy_mode IN ('OFF', 'OBSERVE_ONLY', 'SUGGEST', 'RESEARCH', 'SAFE_AUTO'));
  END IF;
END $$;


-- 9. RPC: record_brain_observation
CREATE OR REPLACE FUNCTION public.record_brain_observation(
  p_observation_type TEXT,
  p_target_type TEXT,
  p_target_id TEXT,
  p_summary TEXT,
  p_severity TEXT DEFAULT 'medium',
  p_confidence NUMERIC DEFAULT 0.90,
  p_signals JSONB DEFAULT '{}'::jsonb,
  p_detected_by TEXT DEFAULT 'brain_observer',
  p_metadata JSONB DEFAULT '{}'::jsonb
)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_user_id UUID := auth.uid();
  v_obs RECORD;
BEGIN
  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Authentication required.');
  END IF;

  INSERT INTO public.brain_observations (
    user_id, observation_type, target_type, target_id, severity, confidence,
    status, summary, signals, detected_by, first_detected_at, last_detected_at,
    occurrence_count, metadata
  ) VALUES (
    v_user_id, p_observation_type, p_target_type, p_target_id, p_severity, p_confidence,
    'open', p_summary, p_signals, p_detected_by, now(), now(), 1, p_metadata
  )
  ON CONFLICT (user_id, observation_type, target_type, target_id)
  DO UPDATE SET
    last_detected_at = now(),
    occurrence_count = public.brain_observations.occurrence_count + 1,
    summary = EXCLUDED.summary,
    severity = CASE
      WHEN EXCLUDED.severity = 'critical' OR public.brain_observations.severity = 'critical' THEN 'critical'
      WHEN EXCLUDED.severity = 'high' OR public.brain_observations.severity = 'high' THEN 'high'
      ELSE EXCLUDED.severity
    END,
    signals = public.brain_observations.signals || EXCLUDED.signals,
    status = CASE
      WHEN public.brain_observations.status = 'resolved' THEN 'open'
      ELSE public.brain_observations.status
    END,
    metadata = public.brain_observations.metadata || EXCLUDED.metadata
  RETURNING * INTO v_obs;

  RETURN jsonb_build_object('success', true, 'observation', row_to_json(v_obs));
END;
$$;


-- 10. RPC: get_brain_maintenance_summary
CREATE OR REPLACE FUNCTION public.get_brain_maintenance_summary()
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_user_id UUID := auth.uid();
  v_open_observations INT := 0;
  v_high_severity_obs INT := 0;
  v_active_missions INT := 0;
  v_completed_missions INT := 0;
  v_active_goals INT := 0;
  v_unread_alerts INT := 0;
  v_autonomy_mode TEXT := 'SUGGEST';
BEGIN
  IF v_user_id IS NOT NULL THEN
    SELECT count(*) INTO v_open_observations FROM public.brain_observations WHERE user_id = v_user_id AND status = 'open';
    SELECT count(*) INTO v_high_severity_obs FROM public.brain_observations WHERE user_id = v_user_id AND status = 'open' AND severity IN ('high', 'critical');
    SELECT count(*) INTO v_active_missions FROM public.brain_missions WHERE user_id = v_user_id AND status IN ('QUEUED', 'RUNNING');
    SELECT count(*) INTO v_completed_missions FROM public.brain_missions WHERE user_id = v_user_id AND status = 'COMPLETED';
    SELECT count(*) INTO v_active_goals FROM public.brain_goals WHERE user_id = v_user_id AND status = 'ACTIVE';
    SELECT count(*) INTO v_unread_alerts FROM public.brain_alerts WHERE user_id = v_user_id AND status = 'unread';
    SELECT COALESCE(autonomy_mode, 'SUGGEST') INTO v_autonomy_mode FROM public.knowledge_settings WHERE user_id = v_user_id;
  END IF;

  RETURN jsonb_build_object(
    'open_observations', v_open_observations,
    'high_severity_observations', v_high_severity_obs,
    'active_missions', v_active_missions,
    'completed_missions', v_completed_missions,
    'active_goals', v_active_goals,
    'unread_alerts', v_unread_alerts,
    'autonomy_mode', COALESCE(v_autonomy_mode, 'SUGGEST')
  );
END;
$$;
