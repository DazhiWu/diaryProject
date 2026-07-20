-- Roll back the private diary knowledge index without touching source diaries.
-- The vector extension is intentionally retained because it may be shared.
BEGIN;

DROP TRIGGER IF EXISTS diary_knowledge_index_queue ON public."diaryContent";

DROP FUNCTION IF EXISTS public.search_private_knowledge(
  extensions.vector,
  TEXT,
  INTEGER,
  DATE,
  DATE
);
DROP FUNCTION IF EXISTS public.replace_diary_knowledge_chunks(
  BIGINT,
  DATE,
  TEXT,
  TEXT,
  TEXT,
  JSONB
);
DROP FUNCTION IF EXISTS public.claim_knowledge_index_jobs(INTEGER);
DROP FUNCTION IF EXISTS public.queue_diary_knowledge_index();

DROP TABLE IF EXISTS public.knowledge_index_jobs;
DROP TABLE IF EXISTS public.knowledge_chunks;
DROP TABLE IF EXISTS public.knowledge_source_settings;

COMMIT;
