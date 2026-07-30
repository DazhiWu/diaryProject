-- Read-only postflight for the Phase 3A foreign-key covering indexes.
BEGIN;

DO $$
BEGIN
  IF to_regclass('public.understanding_summaries_supersedes_summary_id_idx') IS NULL
     OR to_regclass('public.understanding_summary_observations_observation_id_idx') IS NULL THEN
    RAISE EXCEPTION 'Phase 3A foreign-key covering index is missing';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_catalog.pg_index AS index_state
    WHERE index_state.indexrelid =
      'public.understanding_summaries_supersedes_summary_id_idx'::regclass
      AND index_state.indisvalid
      AND index_state.indisready
  ) OR NOT EXISTS (
    SELECT 1
    FROM pg_catalog.pg_index AS index_state
    WHERE index_state.indexrelid =
      'public.understanding_summary_observations_observation_id_idx'::regclass
      AND index_state.indisvalid
      AND index_state.indisready
  ) THEN
    RAISE EXCEPTION 'Phase 3A foreign-key covering index is not ready and valid';
  END IF;

  IF pg_catalog.pg_get_indexdef(
    'public.understanding_summaries_supersedes_summary_id_idx'::regclass
  ) NOT ILIKE '%(supersedes_summary_id)%'
     OR pg_catalog.pg_get_indexdef(
       'public.understanding_summary_observations_observation_id_idx'::regclass
     ) NOT ILIKE '%(observation_id)%' THEN
    RAISE EXCEPTION 'Phase 3A foreign-key covering index has unexpected columns';
  END IF;
END
$$;

SELECT
  (SELECT count(*) FROM public.understanding_summaries) AS summaries,
  (SELECT count(*) FROM public.understanding_summary_observations) AS summary_observations;

ROLLBACK;
