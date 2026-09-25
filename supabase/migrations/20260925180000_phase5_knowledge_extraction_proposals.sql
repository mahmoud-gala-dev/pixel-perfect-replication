-- =====================================================================
-- KNOWLEDGE BRAIN — PHASE 5: Chat-to-Knowledge Extraction, Classification
-- & Knowledge Proposal Engine
-- Migration: 20260925180000_phase5_knowledge_extraction_proposals.sql
-- =====================================================================

-- 1. Knowledge Extraction Runs Table
-- Represents single extraction executions on conversation episodes/checkpoints
CREATE TABLE IF NOT EXISTS public.knowledge_extraction_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  conversation_id UUID NOT NULL REFERENCES public.conversations(id) ON DELETE CASCADE,
  trigger_message_id UUID REFERENCES public.messages(id) ON DELETE SET NULL,
  status TEXT NOT NULL DEFAULT 'queued' 
    CHECK (status IN ('queued', 'processing', 'completed', 'partial', 'failed')),
  relevance TEXT NOT NULL DEFAULT 'UNCERTAIN' 
    CHECK (relevance IN ('KNOWLEDGE_RICH', 'PARTIALLY_RELEVANT', 'CONVERSATIONAL_ONLY', 'USER_PREFERENCE', 'INSTRUCTION', 'QUESTION_ONLY', 'UNCERTAIN')),
  model TEXT,
  provider TEXT,
  metrics JSONB NOT NULL DEFAULT '{}'::jsonb,
  error TEXT,
  started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 2. Knowledge Proposals Table
-- Stores candidate entities, topics, concepts, claims, relations, hierarchy suggestions,
-- aliases, sources, open questions, and conflicts for Phase 6 resolution.
-- STRICT ISOLATION: No direct writes to canonical knowledge_nodes, claims, or edges.
CREATE TABLE IF NOT EXISTS public.knowledge_proposals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  extraction_run_id UUID REFERENCES public.knowledge_extraction_runs(id) ON DELETE CASCADE,
  user_id UUID NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  conversation_id UUID NOT NULL REFERENCES public.conversations(id) ON DELETE CASCADE,
  source_message_id UUID REFERENCES public.messages(id) ON DELETE SET NULL,
  proposal_type TEXT NOT NULL 
    CHECK (proposal_type IN ('ENTITY', 'TOPIC', 'CONCEPT', 'CLAIM', 'RELATION', 'HIERARCHY', 'ALIAS', 'SOURCE', 'EVIDENCE', 'OPEN_QUESTION', 'CONFLICT')),
  status TEXT NOT NULL DEFAULT 'pending' 
    CHECK (status IN ('pending', 'analyzed', 'needs_resolution', 'needs_review', 'approved', 'rejected', 'committed', 'failed')),
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  original_payload JSONB,
  rejection_reason TEXT,
  extraction_confidence NUMERIC(4,3) 
    CHECK (extraction_confidence IS NULL OR (extraction_confidence >= 0 AND extraction_confidence <= 1)),
  validation_status TEXT NOT NULL DEFAULT 'unvalidated' 
    CHECK (validation_status IN ('unvalidated', 'valid', 'invalid', 'warning')),
  model TEXT,
  provider TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 3. Indexes for Fast Retrieval & Filtering
CREATE INDEX IF NOT EXISTS idx_extraction_runs_conv 
  ON public.knowledge_extraction_runs (conversation_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_extraction_runs_user 
  ON public.knowledge_extraction_runs (user_id);

CREATE INDEX IF NOT EXISTS idx_proposals_run 
  ON public.knowledge_proposals (extraction_run_id);

CREATE INDEX IF NOT EXISTS idx_proposals_conv 
  ON public.knowledge_proposals (conversation_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_proposals_type_status 
  ON public.knowledge_proposals (proposal_type, status);

CREATE INDEX IF NOT EXISTS idx_proposals_user 
  ON public.knowledge_proposals (user_id);

CREATE INDEX IF NOT EXISTS idx_proposals_source_msg 
  ON public.knowledge_proposals (source_message_id);

-- 4. Row Level Security (RLS)
ALTER TABLE public.knowledge_extraction_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.knowledge_proposals ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "extraction_runs_own" ON public.knowledge_extraction_runs;
CREATE POLICY "extraction_runs_own" ON public.knowledge_extraction_runs 
  FOR ALL TO authenticated
  USING (user_id = auth.uid()) 
  WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "proposals_own" ON public.knowledge_proposals;
CREATE POLICY "proposals_own" ON public.knowledge_proposals 
  FOR ALL TO authenticated
  USING (user_id = auth.uid()) 
  WITH CHECK (user_id = auth.uid());

GRANT SELECT, INSERT, UPDATE, DELETE ON public.knowledge_extraction_runs TO authenticated;
GRANT ALL ON public.knowledge_extraction_runs TO service_role;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.knowledge_proposals TO authenticated;
GRANT ALL ON public.knowledge_proposals TO service_role;

-- 5. Helper RPC to Fetch Proposal Summary for a Conversation
CREATE OR REPLACE FUNCTION public.get_conversation_extraction_summary(p_conversation_id UUID)
RETURNS JSONB LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path = public AS $$
DECLARE
  v_summary JSONB;
BEGIN
  SELECT jsonb_build_object(
    'total_proposals', count(*),
    'entities', count(*) FILTER (WHERE proposal_type IN ('ENTITY', 'TOPIC', 'CONCEPT')),
    'claims', count(*) FILTER (WHERE proposal_type = 'CLAIM'),
    'relations', count(*) FILTER (WHERE proposal_type = 'RELATION'),
    'hierarchy', count(*) FILTER (WHERE proposal_type = 'HIERARCHY'),
    'sources', count(*) FILTER (WHERE proposal_type IN ('SOURCE', 'EVIDENCE')),
    'open_questions', count(*) FILTER (WHERE proposal_type = 'OPEN_QUESTION'),
    'conflicts', count(*) FILTER (WHERE proposal_type = 'CONFLICT'),
    'pending', count(*) FILTER (WHERE status = 'pending'),
    'approved', count(*) FILTER (WHERE status = 'approved'),
    'rejected', count(*) FILTER (WHERE status = 'rejected')
  )
  INTO v_summary
  FROM public.knowledge_proposals
  WHERE conversation_id = p_conversation_id;

  RETURN coalesce(v_summary, '{}'::jsonb);
END;
$$;
