-- Remove only the Phase 3A foreign-key covering indexes added by the paired migration.
BEGIN;

DROP INDEX IF EXISTS public.understanding_summary_observations_observation_id_idx;
DROP INDEX IF EXISTS public.understanding_summaries_supersedes_summary_id_idx;

COMMIT;
