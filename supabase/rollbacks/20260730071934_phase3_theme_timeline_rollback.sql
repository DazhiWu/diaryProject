-- Emergency rollback for Phase 3A derived understanding data.
-- Original diaries and existing knowledge-index tables remain untouched.
BEGIN;

DROP FUNCTION IF EXISTS public.review_theme_timeline_summary(UUID, TEXT, TEXT);
DROP FUNCTION IF EXISTS public.finalize_theme_timeline_run(UUID, TEXT, TEXT, UUID[]);
DROP FUNCTION IF EXISTS public.retry_theme_timeline_sources(UUID);
DROP FUNCTION IF EXISTS public.release_theme_timeline_source(UUID, BIGINT, TEXT);
DROP FUNCTION IF EXISTS public.fail_theme_timeline_source(UUID, BIGINT, TEXT);
DROP FUNCTION IF EXISTS public.complete_theme_timeline_source(UUID, BIGINT, TEXT, TEXT, TEXT, INTEGER[]);
DROP FUNCTION IF EXISTS public.get_theme_timeline_stale_sources(UUID);
DROP FUNCTION IF EXISTS public.claim_theme_timeline_source(UUID);
DROP FUNCTION IF EXISTS public.create_theme_timeline_run(TEXT, DATE, DATE, INTEGER, TEXT, TEXT, TEXT);

DROP TABLE IF EXISTS public.understanding_summary_observations;
DROP TABLE IF EXISTS public.understanding_summaries;
DROP TABLE IF EXISTS public.understanding_observation_evidence;
DROP TABLE IF EXISTS public.understanding_observations;
DROP TABLE IF EXISTS public.understanding_run_sources;
DROP TABLE IF EXISTS public.understanding_runs;

COMMIT;
