-- =====================================================================
-- KNOWLEDGE BRAIN: CLOUD-ENCRYPTED AI KEY SYNC
-- Allows optional client-side encrypted cross-device AI key synchronization
-- =====================================================================

ALTER TABLE public.knowledge_settings
ADD COLUMN IF NOT EXISTS sync_keys_to_cloud BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN IF NOT EXISTS synced_ai_keys_encrypted TEXT;
