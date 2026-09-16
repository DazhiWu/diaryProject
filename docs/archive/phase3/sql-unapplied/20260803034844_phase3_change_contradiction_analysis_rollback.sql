-- Remove only Phase 3D comparison records and functions.
BEGIN;

DROP FUNCTION IF EXISTS public.get_theme_timeline_comparison_stale_reasons(UUID);
DROP FUNCTION IF EXISTS public.review_theme_timeline_comparison_finding(UUID, TEXT, TEXT, TEXT);
DROP FUNCTION IF EXISTS public.store_theme_timeline_period_comparison(UUID, DATE, DATE, UUID, TEXT, TEXT, JSONB, JSONB);

DROP TABLE IF EXISTS public.understanding_comparison_finding_reviews;
DROP TABLE IF EXISTS public.understanding_comparison_finding_observations;
DROP TABLE IF EXISTS public.understanding_comparison_findings;
DROP TABLE IF EXISTS public.understanding_comparisons;

COMMIT;
