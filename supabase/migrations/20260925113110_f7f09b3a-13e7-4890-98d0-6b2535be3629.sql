
CREATE EXTENSION IF NOT EXISTS vector;
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- ============ shared helpers ============
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;

-- ============ profiles ============
CREATE TABLE public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users ON DELETE CASCADE,
  display_name TEXT,
  avatar_url TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.profiles TO authenticated;
GRANT ALL ON public.profiles TO service_role;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "profiles_own" ON public.profiles FOR ALL TO authenticated
  USING (id = auth.uid()) WITH CHECK (id = auth.uid());
CREATE TRIGGER profiles_updated_at BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.profiles (id, display_name)
  VALUES (NEW.id, COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.raw_user_meta_data->>'name', split_part(NEW.email,'@',1)))
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END; $$;
CREATE TRIGGER on_auth_user_created AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- ============ enums (extensible via ALTER TYPE ... ADD VALUE) ============
CREATE TYPE public.node_type AS ENUM ('category','topic','concept','technology','person','organization','event','method','tool','framework','theory','resource');
CREATE TYPE public.knowledge_status AS ENUM ('draft','active','proposed','review','archived','deprecated');
CREATE TYPE public.message_role AS ENUM ('user','assistant','system','tool');
CREATE TYPE public.source_kind AS ENUM ('ai_research','website','documentation','pdf','book','user','conversation','api','manual');
CREATE TYPE public.operation_status AS ENUM ('proposed','approved','rejected','executed','failed');
CREATE TYPE public.verification_status AS ENUM ('unverified','supported','contradicted','verified','rejected');
CREATE TYPE public.provenance_origin AS ENUM ('conversation','message','source','manual','ai_research','import');

-- ============ knowledge nodes ============
CREATE TABLE public.knowledge_nodes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  parent_id UUID REFERENCES public.knowledge_nodes(id) ON DELETE SET NULL,
  node_type public.node_type NOT NULL DEFAULT 'topic',
  name TEXT NOT NULL,
  canonical_name TEXT GENERATED ALWAYS AS (lower(btrim(name))) STORED,
  slug TEXT NOT NULL,
  description TEXT,
  summary TEXT,
  status public.knowledge_status NOT NULL DEFAULT 'active',
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_by UUID NOT NULL DEFAULT auth.uid() REFERENCES auth.users ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at TIMESTAMPTZ,
  CONSTRAINT knowledge_nodes_no_self_parent CHECK (parent_id IS NULL OR parent_id <> id)
);
CREATE UNIQUE INDEX knowledge_nodes_unique_slug_root ON public.knowledge_nodes (created_by, slug) WHERE parent_id IS NULL AND deleted_at IS NULL;
CREATE UNIQUE INDEX knowledge_nodes_unique_slug_child ON public.knowledge_nodes (created_by, parent_id, slug) WHERE parent_id IS NOT NULL AND deleted_at IS NULL;
CREATE UNIQUE INDEX knowledge_nodes_unique_canonical ON public.knowledge_nodes (created_by, node_type, canonical_name, coalesce(parent_id,'00000000-0000-0000-0000-000000000000'::uuid)) WHERE deleted_at IS NULL;
CREATE INDEX knowledge_nodes_parent_idx ON public.knowledge_nodes (parent_id);
CREATE INDEX knowledge_nodes_owner_idx ON public.knowledge_nodes (created_by);
CREATE INDEX knowledge_nodes_name_trgm ON public.knowledge_nodes USING gin (name gin_trgm_ops);
CREATE INDEX knowledge_nodes_metadata_idx ON public.knowledge_nodes USING gin (metadata);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.knowledge_nodes TO authenticated;
GRANT ALL ON public.knowledge_nodes TO service_role;
ALTER TABLE public.knowledge_nodes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "nodes_own" ON public.knowledge_nodes FOR ALL TO authenticated
  USING (created_by = auth.uid()) WITH CHECK (created_by = auth.uid());
CREATE TRIGGER knowledge_nodes_updated_at BEFORE UPDATE ON public.knowledge_nodes
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- prevent cycles when moving nodes
CREATE OR REPLACE FUNCTION public.knowledge_nodes_prevent_cycle()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
DECLARE cur UUID; depth INT := 0;
BEGIN
  cur := NEW.parent_id;
  WHILE cur IS NOT NULL AND depth < 200 LOOP
    IF cur = NEW.id THEN RAISE EXCEPTION 'Cannot move a node inside its own subtree'; END IF;
    SELECT parent_id INTO cur FROM public.knowledge_nodes WHERE id = cur;
    depth := depth + 1;
  END LOOP;
  RETURN NEW;
END; $$;
CREATE TRIGGER knowledge_nodes_cycle_check BEFORE INSERT OR UPDATE OF parent_id ON public.knowledge_nodes
  FOR EACH ROW EXECUTE FUNCTION public.knowledge_nodes_prevent_cycle();

-- ============ aliases ============
CREATE TABLE public.knowledge_aliases (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  node_id UUID NOT NULL REFERENCES public.knowledge_nodes(id) ON DELETE CASCADE,
  alias TEXT NOT NULL,
  canonical_alias TEXT GENERATED ALWAYS AS (lower(btrim(alias))) STORED,
  language TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_by UUID NOT NULL DEFAULT auth.uid() REFERENCES auth.users ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX knowledge_aliases_unique ON public.knowledge_aliases (node_id, canonical_alias);
CREATE INDEX knowledge_aliases_owner_idx ON public.knowledge_aliases (created_by);
CREATE INDEX knowledge_aliases_trgm ON public.knowledge_aliases USING gin (alias gin_trgm_ops);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.knowledge_aliases TO authenticated;
GRANT ALL ON public.knowledge_aliases TO service_role;
ALTER TABLE public.knowledge_aliases ENABLE ROW LEVEL SECURITY;
CREATE POLICY "aliases_own" ON public.knowledge_aliases FOR ALL TO authenticated
  USING (created_by = auth.uid()) WITH CHECK (created_by = auth.uid());
CREATE TRIGGER knowledge_aliases_updated_at BEFORE UPDATE ON public.knowledge_aliases
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ============ edges ============
CREATE TABLE public.knowledge_edges (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source_node_id UUID NOT NULL REFERENCES public.knowledge_nodes(id) ON DELETE CASCADE,
  target_node_id UUID NOT NULL REFERENCES public.knowledge_nodes(id) ON DELETE CASCADE,
  relation_type TEXT NOT NULL,
  description TEXT,
  confidence NUMERIC(4,3) CHECK (confidence IS NULL OR (confidence >= 0 AND confidence <= 1)),
  status public.knowledge_status NOT NULL DEFAULT 'active',
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_by UUID NOT NULL DEFAULT auth.uid() REFERENCES auth.users ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT knowledge_edges_no_self CHECK (source_node_id <> target_node_id)
);
CREATE UNIQUE INDEX knowledge_edges_unique ON public.knowledge_edges (source_node_id, target_node_id, relation_type);
CREATE INDEX knowledge_edges_source_idx ON public.knowledge_edges (source_node_id);
CREATE INDEX knowledge_edges_target_idx ON public.knowledge_edges (target_node_id);
CREATE INDEX knowledge_edges_owner_idx ON public.knowledge_edges (created_by);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.knowledge_edges TO authenticated;
GRANT ALL ON public.knowledge_edges TO service_role;
ALTER TABLE public.knowledge_edges ENABLE ROW LEVEL SECURITY;
CREATE POLICY "edges_own" ON public.knowledge_edges FOR ALL TO authenticated
  USING (created_by = auth.uid()) WITH CHECK (created_by = auth.uid());
CREATE TRIGGER knowledge_edges_updated_at BEFORE UPDATE ON public.knowledge_edges
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ============ entries ============
CREATE TABLE public.knowledge_entries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  slug TEXT NOT NULL,
  summary TEXT,
  content TEXT,
  status public.knowledge_status NOT NULL DEFAULT 'draft',
  language TEXT NOT NULL DEFAULT 'en',
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_by UUID NOT NULL DEFAULT auth.uid() REFERENCES auth.users ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at TIMESTAMPTZ
);
CREATE UNIQUE INDEX knowledge_entries_unique_slug ON public.knowledge_entries (created_by, slug) WHERE deleted_at IS NULL;
CREATE INDEX knowledge_entries_owner_idx ON public.knowledge_entries (created_by);
CREATE INDEX knowledge_entries_search_idx ON public.knowledge_entries USING gin (to_tsvector('simple', coalesce(title,'') || ' ' || coalesce(summary,'') || ' ' || coalesce(content,'')));
GRANT SELECT, INSERT, UPDATE, DELETE ON public.knowledge_entries TO authenticated;
GRANT ALL ON public.knowledge_entries TO service_role;
ALTER TABLE public.knowledge_entries ENABLE ROW LEVEL SECURITY;
CREATE POLICY "entries_own" ON public.knowledge_entries FOR ALL TO authenticated
  USING (created_by = auth.uid()) WITH CHECK (created_by = auth.uid());
CREATE TRIGGER knowledge_entries_updated_at BEFORE UPDATE ON public.knowledge_entries
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE public.knowledge_entry_nodes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  entry_id UUID NOT NULL REFERENCES public.knowledge_entries(id) ON DELETE CASCADE,
  node_id UUID NOT NULL REFERENCES public.knowledge_nodes(id) ON DELETE CASCADE,
  role TEXT NOT NULL DEFAULT 'about',
  relevance NUMERIC(4,3) CHECK (relevance IS NULL OR (relevance >= 0 AND relevance <= 1)),
  created_by UUID NOT NULL DEFAULT auth.uid() REFERENCES auth.users ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (entry_id, node_id, role)
);
CREATE INDEX knowledge_entry_nodes_node_idx ON public.knowledge_entry_nodes (node_id);
CREATE INDEX knowledge_entry_nodes_owner_idx ON public.knowledge_entry_nodes (created_by);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.knowledge_entry_nodes TO authenticated;
GRANT ALL ON public.knowledge_entry_nodes TO service_role;
ALTER TABLE public.knowledge_entry_nodes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "entry_nodes_own" ON public.knowledge_entry_nodes FOR ALL TO authenticated
  USING (created_by = auth.uid()) WITH CHECK (created_by = auth.uid());

-- ============ sources & evidence ============
CREATE TABLE public.sources (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source_kind public.source_kind NOT NULL DEFAULT 'manual',
  title TEXT NOT NULL,
  url TEXT,
  author TEXT,
  published_at TIMESTAMPTZ,
  reliability NUMERIC(4,3) CHECK (reliability IS NULL OR (reliability >= 0 AND reliability <= 1)),
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_by UUID NOT NULL DEFAULT auth.uid() REFERENCES auth.users ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at TIMESTAMPTZ
);
CREATE INDEX sources_owner_idx ON public.sources (created_by);
CREATE UNIQUE INDEX sources_unique_url ON public.sources (created_by, url) WHERE url IS NOT NULL AND deleted_at IS NULL;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.sources TO authenticated;
GRANT ALL ON public.sources TO service_role;
ALTER TABLE public.sources ENABLE ROW LEVEL SECURITY;
CREATE POLICY "sources_own" ON public.sources FOR ALL TO authenticated
  USING (created_by = auth.uid()) WITH CHECK (created_by = auth.uid());
CREATE TRIGGER sources_updated_at BEFORE UPDATE ON public.sources
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ============ conversations & messages ============
CREATE TABLE public.conversations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL DEFAULT auth.uid() REFERENCES auth.users ON DELETE CASCADE,
  title TEXT,
  status public.knowledge_status NOT NULL DEFAULT 'active',
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at TIMESTAMPTZ
);
CREATE INDEX conversations_user_idx ON public.conversations (user_id, updated_at DESC);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.conversations TO authenticated;
GRANT ALL ON public.conversations TO service_role;
ALTER TABLE public.conversations ENABLE ROW LEVEL SECURITY;
CREATE POLICY "conversations_own" ON public.conversations FOR ALL TO authenticated
  USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
CREATE TRIGGER conversations_updated_at BEFORE UPDATE ON public.conversations
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE public.messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id UUID NOT NULL REFERENCES public.conversations(id) ON DELETE CASCADE,
  user_id UUID NOT NULL DEFAULT auth.uid() REFERENCES auth.users ON DELETE CASCADE,
  role public.message_role NOT NULL,
  content TEXT NOT NULL,
  model TEXT,
  token_count INTEGER,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX messages_conversation_idx ON public.messages (conversation_id, created_at);
CREATE INDEX messages_user_idx ON public.messages (user_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.messages TO authenticated;
GRANT ALL ON public.messages TO service_role;
ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY;
CREATE POLICY "messages_own" ON public.messages FOR ALL TO authenticated
  USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

-- ============ claims ============
CREATE TABLE public.knowledge_claims (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  node_id UUID REFERENCES public.knowledge_nodes(id) ON DELETE CASCADE,
  entry_id UUID REFERENCES public.knowledge_entries(id) ON DELETE SET NULL,
  claim_text TEXT NOT NULL,
  status public.knowledge_status NOT NULL DEFAULT 'draft',
  verification public.verification_status NOT NULL DEFAULT 'unverified',
  confidence NUMERIC(4,3) CHECK (confidence IS NULL OR (confidence >= 0 AND confidence <= 1)),
  source_id UUID REFERENCES public.sources(id) ON DELETE SET NULL,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_by UUID NOT NULL DEFAULT auth.uid() REFERENCES auth.users ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX knowledge_claims_node_idx ON public.knowledge_claims (node_id);
CREATE INDEX knowledge_claims_owner_idx ON public.knowledge_claims (created_by);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.knowledge_claims TO authenticated;
GRANT ALL ON public.knowledge_claims TO service_role;
ALTER TABLE public.knowledge_claims ENABLE ROW LEVEL SECURITY;
CREATE POLICY "claims_own" ON public.knowledge_claims FOR ALL TO authenticated
  USING (created_by = auth.uid()) WITH CHECK (created_by = auth.uid());
CREATE TRIGGER knowledge_claims_updated_at BEFORE UPDATE ON public.knowledge_claims
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE public.evidence (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source_id UUID NOT NULL REFERENCES public.sources(id) ON DELETE CASCADE,
  claim_id UUID REFERENCES public.knowledge_claims(id) ON DELETE CASCADE,
  entry_id UUID REFERENCES public.knowledge_entries(id) ON DELETE CASCADE,
  node_id UUID REFERENCES public.knowledge_nodes(id) ON DELETE CASCADE,
  excerpt TEXT,
  locator TEXT,
  stance public.verification_status NOT NULL DEFAULT 'supported',
  confidence NUMERIC(4,3) CHECK (confidence IS NULL OR (confidence >= 0 AND confidence <= 1)),
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_by UUID NOT NULL DEFAULT auth.uid() REFERENCES auth.users ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX evidence_source_idx ON public.evidence (source_id);
CREATE INDEX evidence_claim_idx ON public.evidence (claim_id);
CREATE INDEX evidence_owner_idx ON public.evidence (created_by);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.evidence TO authenticated;
GRANT ALL ON public.evidence TO service_role;
ALTER TABLE public.evidence ENABLE ROW LEVEL SECURITY;
CREATE POLICY "evidence_own" ON public.evidence FOR ALL TO authenticated
  USING (created_by = auth.uid()) WITH CHECK (created_by = auth.uid());

-- ============ provenance ============
CREATE TABLE public.knowledge_provenance (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  subject_table TEXT NOT NULL,
  subject_id UUID NOT NULL,
  origin public.provenance_origin NOT NULL,
  conversation_id UUID REFERENCES public.conversations(id) ON DELETE SET NULL,
  message_id UUID REFERENCES public.messages(id) ON DELETE SET NULL,
  source_id UUID REFERENCES public.sources(id) ON DELETE SET NULL,
  note TEXT,
  confidence NUMERIC(4,3) CHECK (confidence IS NULL OR (confidence >= 0 AND confidence <= 1)),
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_by UUID NOT NULL DEFAULT auth.uid() REFERENCES auth.users ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT provenance_subject_table_valid CHECK (subject_table IN ('knowledge_nodes','knowledge_entries','knowledge_edges','knowledge_claims','knowledge_aliases'))
);
CREATE INDEX provenance_subject_idx ON public.knowledge_provenance (subject_table, subject_id);
CREATE INDEX provenance_owner_idx ON public.knowledge_provenance (created_by);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.knowledge_provenance TO authenticated;
GRANT ALL ON public.knowledge_provenance TO service_role;
ALTER TABLE public.knowledge_provenance ENABLE ROW LEVEL SECURITY;
CREATE POLICY "provenance_own" ON public.knowledge_provenance FOR ALL TO authenticated
  USING (created_by = auth.uid()) WITH CHECK (created_by = auth.uid());

-- ============ versions & changes ============
CREATE TABLE public.knowledge_versions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  subject_table TEXT NOT NULL,
  subject_id UUID NOT NULL,
  version INTEGER NOT NULL,
  snapshot JSONB NOT NULL,
  created_by UUID NOT NULL DEFAULT auth.uid() REFERENCES auth.users ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (subject_table, subject_id, version)
);
CREATE INDEX knowledge_versions_subject_idx ON public.knowledge_versions (subject_table, subject_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.knowledge_versions TO authenticated;
GRANT ALL ON public.knowledge_versions TO service_role;
ALTER TABLE public.knowledge_versions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "versions_own" ON public.knowledge_versions FOR ALL TO authenticated
  USING (created_by = auth.uid()) WITH CHECK (created_by = auth.uid());

CREATE TABLE public.knowledge_changes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  subject_table TEXT NOT NULL,
  subject_id UUID NOT NULL,
  change_type TEXT NOT NULL,
  previous_state JSONB,
  new_state JSONB,
  reason TEXT,
  confidence NUMERIC(4,3) CHECK (confidence IS NULL OR (confidence >= 0 AND confidence <= 1)),
  conversation_id UUID REFERENCES public.conversations(id) ON DELETE SET NULL,
  source_id UUID REFERENCES public.sources(id) ON DELETE SET NULL,
  changed_by UUID NOT NULL DEFAULT auth.uid() REFERENCES auth.users ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX knowledge_changes_subject_idx ON public.knowledge_changes (subject_table, subject_id, created_at DESC);
CREATE INDEX knowledge_changes_owner_idx ON public.knowledge_changes (changed_by, created_at DESC);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.knowledge_changes TO authenticated;
GRANT ALL ON public.knowledge_changes TO service_role;
ALTER TABLE public.knowledge_changes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "changes_own" ON public.knowledge_changes FOR ALL TO authenticated
  USING (changed_by = auth.uid()) WITH CHECK (changed_by = auth.uid());

-- version + change log trigger for nodes and entries
CREATE OR REPLACE FUNCTION public.record_knowledge_change()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE owner UUID; next_version INTEGER; prev JSONB; nxt JSONB; ctype TEXT;
BEGIN
  IF TG_OP = 'DELETE' THEN
    prev := to_jsonb(OLD); nxt := NULL; ctype := 'DELETE'; owner := OLD.created_by;
  ELSIF TG_OP = 'INSERT' THEN
    prev := NULL; nxt := to_jsonb(NEW); ctype := 'CREATE'; owner := NEW.created_by;
  ELSE
    prev := to_jsonb(OLD); nxt := to_jsonb(NEW); owner := NEW.created_by;
    ctype := CASE WHEN TG_TABLE_NAME = 'knowledge_nodes' AND OLD.parent_id IS DISTINCT FROM NEW.parent_id THEN 'MOVE' ELSE 'UPDATE' END;
    IF prev = nxt THEN RETURN NEW; END IF;
  END IF;

  INSERT INTO public.knowledge_changes (subject_table, subject_id, change_type, previous_state, new_state, changed_by)
  VALUES (TG_TABLE_NAME, COALESCE((nxt->>'id')::uuid, (prev->>'id')::uuid), ctype, prev, nxt, owner);

  IF nxt IS NOT NULL THEN
    SELECT COALESCE(MAX(version),0) + 1 INTO next_version FROM public.knowledge_versions
      WHERE subject_table = TG_TABLE_NAME AND subject_id = (nxt->>'id')::uuid;
    INSERT INTO public.knowledge_versions (subject_table, subject_id, version, snapshot, created_by)
    VALUES (TG_TABLE_NAME, (nxt->>'id')::uuid, next_version, nxt, owner);
  END IF;

  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END; $$;

CREATE TRIGGER knowledge_nodes_history AFTER INSERT OR UPDATE OR DELETE ON public.knowledge_nodes
  FOR EACH ROW EXECUTE FUNCTION public.record_knowledge_change();
CREATE TRIGGER knowledge_entries_history AFTER INSERT OR UPDATE OR DELETE ON public.knowledge_entries
  FOR EACH ROW EXECUTE FUNCTION public.record_knowledge_change();

-- ============ operations ============
CREATE TABLE public.knowledge_operations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  operation_type TEXT NOT NULL,
  status public.operation_status NOT NULL DEFAULT 'proposed',
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  result JSONB,
  confidence NUMERIC(4,3) CHECK (confidence IS NULL OR (confidence >= 0 AND confidence <= 1)),
  reason TEXT,
  error TEXT,
  conversation_id UUID REFERENCES public.conversations(id) ON DELETE SET NULL,
  message_id UUID REFERENCES public.messages(id) ON DELETE SET NULL,
  requested_by UUID NOT NULL DEFAULT auth.uid() REFERENCES auth.users ON DELETE CASCADE,
  executed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT knowledge_operations_type_valid CHECK (operation_type IN (
    'CREATE_NODE','UPDATE_NODE','MOVE_NODE','MERGE_NODE','ARCHIVE_NODE','CREATE_ENTRY','UPDATE_ENTRY',
    'CREATE_RELATION','UPDATE_RELATION','ADD_ALIAS','ADD_CLAIM','ADD_SOURCE','ADD_EVIDENCE'))
);
CREATE INDEX knowledge_operations_owner_idx ON public.knowledge_operations (requested_by, created_at DESC);
CREATE INDEX knowledge_operations_status_idx ON public.knowledge_operations (status);
CREATE INDEX knowledge_operations_payload_idx ON public.knowledge_operations USING gin (payload);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.knowledge_operations TO authenticated;
GRANT ALL ON public.knowledge_operations TO service_role;
ALTER TABLE public.knowledge_operations ENABLE ROW LEVEL SECURITY;
CREATE POLICY "operations_own" ON public.knowledge_operations FOR ALL TO authenticated
  USING (requested_by = auth.uid()) WITH CHECK (requested_by = auth.uid());
CREATE TRIGGER knowledge_operations_updated_at BEFORE UPDATE ON public.knowledge_operations
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ============ embeddings (prepared, no vectors generated yet) ============
CREATE TABLE public.knowledge_embeddings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  subject_table TEXT NOT NULL,
  subject_id UUID NOT NULL,
  chunk_index INTEGER NOT NULL DEFAULT 0,
  content TEXT,
  model TEXT NOT NULL,
  dimensions INTEGER NOT NULL,
  embedding vector,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_by UUID NOT NULL DEFAULT auth.uid() REFERENCES auth.users ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (subject_table, subject_id, chunk_index, model)
);
CREATE INDEX knowledge_embeddings_subject_idx ON public.knowledge_embeddings (subject_table, subject_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.knowledge_embeddings TO authenticated;
GRANT ALL ON public.knowledge_embeddings TO service_role;
ALTER TABLE public.knowledge_embeddings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "embeddings_own" ON public.knowledge_embeddings FOR ALL TO authenticated
  USING (created_by = auth.uid()) WITH CHECK (created_by = auth.uid());

-- ============ hierarchy helpers ============
CREATE OR REPLACE FUNCTION public.get_node_ancestors(p_node_id UUID)
RETURNS TABLE (id UUID, name TEXT, slug TEXT, depth INT)
LANGUAGE sql STABLE SECURITY INVOKER SET search_path = public AS $$
  WITH RECURSIVE chain AS (
    SELECT n.id, n.name, n.slug, n.parent_id, 0 AS depth
      FROM public.knowledge_nodes n WHERE n.id = p_node_id
    UNION ALL
    SELECT p.id, p.name, p.slug, p.parent_id, c.depth + 1
      FROM public.knowledge_nodes p JOIN chain c ON p.id = c.parent_id
  )
  SELECT chain.id, chain.name, chain.slug, chain.depth FROM chain ORDER BY depth DESC;
$$;

CREATE OR REPLACE FUNCTION public.get_node_subtree(p_node_id UUID)
RETURNS TABLE (id UUID, parent_id UUID, name TEXT, slug TEXT, node_type public.node_type, depth INT)
LANGUAGE sql STABLE SECURITY INVOKER SET search_path = public AS $$
  WITH RECURSIVE tree AS (
    SELECT n.id, n.parent_id, n.name, n.slug, n.node_type, 0 AS depth
      FROM public.knowledge_nodes n WHERE n.id = p_node_id AND n.deleted_at IS NULL
    UNION ALL
    SELECT c.id, c.parent_id, c.name, c.slug, c.node_type, t.depth + 1
      FROM public.knowledge_nodes c JOIN tree t ON c.parent_id = t.id
      WHERE c.deleted_at IS NULL
  )
  SELECT tree.id, tree.parent_id, tree.name, tree.slug, tree.node_type, tree.depth FROM tree;
$$;

CREATE OR REPLACE FUNCTION public.get_brain_stats()
RETURNS JSONB LANGUAGE sql STABLE SECURITY INVOKER SET search_path = public AS $$
  SELECT jsonb_build_object(
    'nodes', (SELECT count(*) FROM public.knowledge_nodes WHERE deleted_at IS NULL),
    'entries', (SELECT count(*) FROM public.knowledge_entries WHERE deleted_at IS NULL),
    'edges', (SELECT count(*) FROM public.knowledge_edges),
    'aliases', (SELECT count(*) FROM public.knowledge_aliases),
    'claims', (SELECT count(*) FROM public.knowledge_claims),
    'sources', (SELECT count(*) FROM public.sources WHERE deleted_at IS NULL),
    'conversations', (SELECT count(*) FROM public.conversations WHERE deleted_at IS NULL),
    'messages', (SELECT count(*) FROM public.messages),
    'operations', (SELECT count(*) FROM public.knowledge_operations),
    'changes', (SELECT count(*) FROM public.knowledge_changes)
  );
$$;
GRANT EXECUTE ON FUNCTION public.get_node_ancestors(UUID), public.get_node_subtree(UUID), public.get_brain_stats() TO authenticated;
