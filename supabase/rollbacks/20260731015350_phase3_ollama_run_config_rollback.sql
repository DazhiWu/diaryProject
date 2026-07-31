-- Roll back only the Phase 3A Ollama run-configuration extension.
BEGIN;

DROP FUNCTION IF EXISTS public.create_theme_timeline_run_with_config(
  TEXT, DATE, DATE, INTEGER, TEXT, TEXT, TEXT, JSONB
);

ALTER TABLE public.understanding_runs
  DROP CONSTRAINT IF EXISTS understanding_runs_generation_config_object_check,
  DROP COLUMN IF EXISTS generation_config;

COMMIT;
