-- Remove only Phase 3C aggregate records and functions.
BEGIN;

DROP FUNCTION IF EXISTS public.get_theme_timeline_aggregate_stale_reasons(UUID);
DROP FUNCTION IF EXISTS public.regenerate_theme_timeline_aggregate(UUID, UUID);

DROP TABLE IF EXISTS public.understanding_aggregate_observations;
DROP TABLE IF EXISTS public.understanding_aggregate_periods;
DROP TABLE IF EXISTS public.understanding_aggregates;

COMMIT;
