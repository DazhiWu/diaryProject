-- Persist the exact local Ollama generation configuration for each Phase 3A run.
BEGIN;

ALTER TABLE public.understanding_runs
  ADD COLUMN generation_config JSONB;

ALTER TABLE public.understanding_runs
  ADD CONSTRAINT understanding_runs_generation_config_object_check
  CHECK (generation_config IS NULL OR jsonb_typeof(generation_config) = 'object');

CREATE OR REPLACE FUNCTION public.create_theme_timeline_run_with_config(
  p_theme TEXT,
  p_start_date DATE,
  p_end_date DATE,
  p_expected_source_count INTEGER,
  p_expected_fingerprint TEXT,
  p_model_version TEXT,
  p_prompt_version TEXT,
  p_generation_config JSONB
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
  v_run_id UUID;
BEGIN
  IF p_generation_config IS NULL OR jsonb_typeof(p_generation_config) <> 'object' THEN
    RAISE EXCEPTION 'Theme timeline generation config must be an object';
  END IF;

  v_run_id := public.create_theme_timeline_run(
    p_theme,
    p_start_date,
    p_end_date,
    p_expected_source_count,
    p_expected_fingerprint,
    p_model_version,
    p_prompt_version
  );

  UPDATE public.understanding_runs
  SET generation_config = p_generation_config,
      updated_at = now()
  WHERE id = v_run_id;

  RETURN v_run_id;
END;
$$;

REVOKE ALL ON FUNCTION public.create_theme_timeline_run_with_config(
  TEXT, DATE, DATE, INTEGER, TEXT, TEXT, TEXT, JSONB
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.create_theme_timeline_run_with_config(
  TEXT, DATE, DATE, INTEGER, TEXT, TEXT, TEXT, JSONB
) TO service_role;

COMMIT;
