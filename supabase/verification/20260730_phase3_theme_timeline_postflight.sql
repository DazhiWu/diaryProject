-- Read-only postflight for the Phase 3A auditable theme-timeline schema.
BEGIN;

DO $$
DECLARE
  claim_definition TEXT;
BEGIN
  IF to_regclass('public.understanding_runs') IS NULL
     OR to_regclass('public.understanding_run_sources') IS NULL
     OR to_regclass('public.understanding_observations') IS NULL
     OR to_regclass('public.understanding_observation_evidence') IS NULL
     OR to_regclass('public.understanding_summaries') IS NULL
     OR to_regclass('public.understanding_summary_observations') IS NULL THEN
    RAISE EXCEPTION 'Phase 3A understanding table is missing';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM (
      VALUES
        ('public.understanding_runs'),
        ('public.understanding_run_sources'),
        ('public.understanding_observations'),
        ('public.understanding_observation_evidence'),
        ('public.understanding_summaries'),
        ('public.understanding_summary_observations')
    ) AS locked_table(name)
    WHERE has_table_privilege('anon', locked_table.name, 'SELECT')
       OR has_table_privilege('authenticated', locked_table.name, 'SELECT')
  ) THEN
    RAISE EXCEPTION 'Phase 3A table privilege is exposed';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_catalog.pg_class AS relation
    WHERE relation.oid = 'public.understanding_runs'::regclass
      AND relation.relrowsecurity
  ) OR NOT EXISTS (
    SELECT 1
    FROM pg_catalog.pg_class AS relation
    WHERE relation.oid = 'public.understanding_run_sources'::regclass
      AND relation.relrowsecurity
  ) THEN
    RAISE EXCEPTION 'Phase 3A RLS is not enabled';
  END IF;

  SELECT pg_catalog.pg_get_functiondef(
    'public.claim_theme_timeline_source(uuid)'::regprocedure
  )
  INTO claim_definition;

  IF claim_definition NOT ILIKE '%FOR UPDATE SKIP LOCKED%'
     OR claim_definition NOT ILIKE '%started_at < now() - interval ''10 minutes''%' THEN
    RAISE EXCEPTION 'Phase 3A claim/resume contract is incomplete';
  END IF;

  IF has_function_privilege('anon', 'public.create_theme_timeline_run(text,date,date,integer,text,text,text)', 'EXECUTE')
     OR has_function_privilege('authenticated', 'public.create_theme_timeline_run(text,date,date,integer,text,text,text)', 'EXECUTE')
     OR has_function_privilege('anon', 'public.claim_theme_timeline_source(uuid)', 'EXECUTE')
     OR has_function_privilege('authenticated', 'public.claim_theme_timeline_source(uuid)', 'EXECUTE')
     OR has_function_privilege('anon', 'public.get_theme_timeline_stale_sources(uuid)', 'EXECUTE')
     OR has_function_privilege('authenticated', 'public.get_theme_timeline_stale_sources(uuid)', 'EXECUTE')
     OR has_function_privilege('anon', 'public.review_theme_timeline_summary(uuid,text,text)', 'EXECUTE')
     OR has_function_privilege('authenticated', 'public.review_theme_timeline_summary(uuid,text,text)', 'EXECUTE') THEN
    RAISE EXCEPTION 'Phase 3A function privilege is exposed';
  END IF;

  IF NOT has_function_privilege('service_role', 'public.create_theme_timeline_run(text,date,date,integer,text,text,text)', 'EXECUTE')
     OR NOT has_function_privilege('service_role', 'public.claim_theme_timeline_source(uuid)', 'EXECUTE')
     OR NOT has_function_privilege('service_role', 'public.get_theme_timeline_stale_sources(uuid)', 'EXECUTE')
     OR NOT has_function_privilege('service_role', 'public.review_theme_timeline_summary(uuid,text,text)', 'EXECUTE') THEN
    RAISE EXCEPTION 'Phase 3A service-role function privilege is missing';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.understanding_run_sources AS run_source
    LEFT JOIN public.understanding_runs AS run ON run.id = run_source.run_id
    WHERE run.id IS NULL
  ) THEN
    RAISE EXCEPTION 'Phase 3A orphan run source exists';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.understanding_observation_evidence AS evidence
    LEFT JOIN public.understanding_observations AS observation
      ON observation.id = evidence.observation_id
    WHERE observation.id IS NULL
  ) THEN
    RAISE EXCEPTION 'Phase 3A orphan observation evidence exists';
  END IF;
END
$$;

SELECT
  (SELECT count(*) FROM public.understanding_runs) AS runs,
  (SELECT count(*) FROM public.understanding_run_sources) AS run_sources,
  (SELECT count(*) FROM public.understanding_observations) AS observations,
  (SELECT count(*) FROM public.understanding_summaries) AS summaries,
  (SELECT count(*) FROM public."diaryContent") AS source_diaries,
  (SELECT count(*) FROM public.knowledge_chunks) AS knowledge_chunks;

ROLLBACK;
