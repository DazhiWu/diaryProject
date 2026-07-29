-- Read-only postflight for the deployed private knowledge-index migration.
-- Run as an operator role with catalog visibility. The transaction is rolled back
-- even though the assertions perform no persistent writes.
BEGIN;

DO $$
DECLARE
  claim_definition TEXT;
BEGIN
  IF to_regclass('public.knowledge_source_settings') IS NULL
     OR to_regclass('public.knowledge_chunks') IS NULL
     OR to_regclass('public.knowledge_index_jobs') IS NULL THEN
    RAISE EXCEPTION 'Knowledge-index table is missing';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_catalog.pg_trigger AS trigger_row
    WHERE trigger_row.tgrelid = 'public."diaryContent"'::regclass
      AND trigger_row.tgname = 'diary_knowledge_index_queue'
      AND NOT trigger_row.tgisinternal
      AND trigger_row.tgenabled <> 'D'
  ) THEN
    RAISE EXCEPTION 'Knowledge-index queue trigger is missing or disabled';
  END IF;

  SELECT pg_catalog.pg_get_functiondef(
    'public.claim_knowledge_index_jobs(integer)'::regprocedure
  )
  INTO claim_definition;

  IF claim_definition NOT ILIKE '%FOR UPDATE SKIP LOCKED%'
     OR claim_definition NOT ILIKE '%started_at < now() - interval ''10 minutes''%' THEN
    RAISE EXCEPTION 'Knowledge-index claim concurrency contract is incomplete';
  END IF;

  IF to_regclass('public.knowledge_index_jobs_pending_queue_idx') IS NULL
     OR to_regclass('public.knowledge_index_jobs_processing_started_idx') IS NULL THEN
    RAISE EXCEPTION 'Knowledge-index queue index is missing';
  END IF;

  IF has_table_privilege('anon', 'public.knowledge_source_settings', 'SELECT')
     OR has_table_privilege('anon', 'public.knowledge_chunks', 'SELECT')
     OR has_table_privilege('anon', 'public.knowledge_index_jobs', 'SELECT')
     OR has_table_privilege('authenticated', 'public.knowledge_source_settings', 'SELECT')
     OR has_table_privilege('authenticated', 'public.knowledge_chunks', 'SELECT')
     OR has_table_privilege('authenticated', 'public.knowledge_index_jobs', 'SELECT') THEN
    RAISE EXCEPTION 'Knowledge-index table privilege is exposed';
  END IF;

  IF has_function_privilege('anon', 'public.claim_knowledge_index_jobs(integer)', 'EXECUTE')
     OR has_function_privilege('authenticated', 'public.claim_knowledge_index_jobs(integer)', 'EXECUTE')
     OR has_function_privilege('anon', 'public.replace_diary_knowledge_chunks(bigint,date,text,text,text,jsonb)', 'EXECUTE')
     OR has_function_privilege('authenticated', 'public.replace_diary_knowledge_chunks(bigint,date,text,text,text,jsonb)', 'EXECUTE')
     OR has_function_privilege('anon', 'public.search_private_knowledge(extensions.vector,text,integer,date,date)', 'EXECUTE')
     OR has_function_privilege('authenticated', 'public.search_private_knowledge(extensions.vector,text,integer,date,date)', 'EXECUTE') THEN
    RAISE EXCEPTION 'Knowledge-index function privilege is exposed';
  END IF;

  IF NOT has_function_privilege('service_role', 'public.claim_knowledge_index_jobs(integer)', 'EXECUTE')
     OR NOT has_function_privilege('service_role', 'public.replace_diary_knowledge_chunks(bigint,date,text,text,text,jsonb)', 'EXECUTE')
     OR NOT has_function_privilege('service_role', 'public.search_private_knowledge(extensions.vector,text,integer,date,date)', 'EXECUTE') THEN
    RAISE EXCEPTION 'Knowledge-index service-role function privilege is missing';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public."diaryContent" AS diary
    LEFT JOIN public.knowledge_source_settings AS setting ON setting.source_id = diary.id
    LEFT JOIN public.knowledge_index_jobs AS job ON job.source_id = diary.id
    WHERE setting.source_id IS NULL OR job.source_id IS NULL
  ) THEN
    RAISE EXCEPTION 'Diary source is missing knowledge-index state';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.knowledge_index_jobs AS job
    JOIN public.knowledge_source_settings AS setting USING (source_id)
    WHERE job.status = 'completed'
      AND (setting.indexed_content_hash IS NULL OR setting.indexed_model IS NULL)
  ) THEN
    RAISE EXCEPTION 'Completed knowledge-index job has incomplete metadata';
  END IF;
END
$$;

SELECT
  (SELECT count(*) FROM public."diaryContent") AS diary_sources,
  (SELECT count(*) FROM public.knowledge_source_settings) AS source_settings,
  (SELECT count(*) FROM public.knowledge_chunks) AS chunks,
  (SELECT count(*) FROM public.knowledge_index_jobs WHERE status = 'pending') AS pending,
  (SELECT count(*) FROM public.knowledge_index_jobs WHERE status = 'processing') AS processing,
  (SELECT count(*) FROM public.knowledge_index_jobs WHERE status = 'failed') AS failed,
  (SELECT count(*) FROM public.knowledge_index_jobs WHERE status = 'completed') AS completed;

ROLLBACK;
