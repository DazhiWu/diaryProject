-- Remove only the Phase 3B summary-regeneration entry point.
BEGIN;

DROP FUNCTION IF EXISTS public.regenerate_theme_timeline_summary(
  UUID, UUID, TEXT, TEXT, UUID[]
);

COMMIT;
