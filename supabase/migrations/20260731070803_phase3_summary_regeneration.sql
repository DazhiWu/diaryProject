-- Add an atomic, reviewed-observation-only summary regeneration boundary.
BEGIN;

CREATE OR REPLACE FUNCTION public.regenerate_theme_timeline_summary(
  p_run_id UUID,
  p_previous_summary_id UUID,
  p_statement TEXT,
  p_classification TEXT,
  p_observation_ids UUID[]
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
  v_summary_id UUID;
  v_latest_summary_id UUID;
  v_expected_count INTEGER;
  v_actual_count INTEGER;
BEGIN
  IF p_previous_summary_id IS NULL
     OR length(trim(coalesce(p_statement, ''))) NOT BETWEEN 1 AND 5000
     OR p_classification NOT IN ('summary', 'inference')
     OR p_observation_ids IS NULL
     OR cardinality(p_observation_ids) > 500 THEN
    RAISE EXCEPTION 'Invalid regenerated theme timeline summary';
  END IF;

  PERFORM 1
  FROM public.understanding_runs
  WHERE id = p_run_id
    AND status = 'completed'
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Theme timeline run is not completed';
  END IF;

  SELECT summary.id
  INTO v_latest_summary_id
  FROM public.understanding_summaries AS summary
  WHERE summary.run_id = p_run_id
  ORDER BY summary.created_at DESC, summary.id DESC
  LIMIT 1
  FOR UPDATE;

  IF v_latest_summary_id IS DISTINCT FROM p_previous_summary_id THEN
    RAISE EXCEPTION 'Theme timeline summary history changed';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.understanding_summaries
    WHERE run_id = p_run_id
      AND review_state IN ('proposed', 'confirmed', 'edited')
  ) THEN
    RAISE EXCEPTION 'Theme timeline run already has an active summary';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.understanding_run_sources AS run_source
    WHERE run_source.run_id = p_run_id
      AND run_source.in_date_range
      AND (
        run_source.status <> 'completed'
        OR NOT EXISTS (
          SELECT 1
          FROM public.knowledge_source_settings AS setting
          JOIN public.knowledge_index_jobs AS job USING (source_id)
          WHERE setting.source_id = run_source.source_id
            AND setting.usage_scope = 'private'
            AND setting.indexed_content_hash = run_source.source_hash
            AND job.status = 'completed'
        )
        OR NOT EXISTS (
          SELECT 1
          FROM public.knowledge_chunks AS chunk
          WHERE chunk.source_id = run_source.source_id
        )
      )
  ) THEN
    RAISE EXCEPTION 'Stale theme timeline run cannot regenerate a summary';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.understanding_observations
    WHERE run_id = p_run_id
      AND review_state NOT IN ('confirmed', 'edited', 'rejected')
  ) THEN
    RAISE EXCEPTION 'Theme timeline run has unreviewed observations';
  END IF;

  SELECT count(DISTINCT value)::INTEGER
  INTO v_expected_count
  FROM unnest(p_observation_ids) AS observation_id(value);

  IF v_expected_count <> cardinality(p_observation_ids) THEN
    RAISE EXCEPTION 'Regenerated theme timeline summary has duplicate observations';
  END IF;

  SELECT count(*)::INTEGER
  INTO v_actual_count
  FROM public.understanding_observations
  WHERE run_id = p_run_id
    AND review_state IN ('confirmed', 'edited')
    AND id = ANY (p_observation_ids);

  IF v_actual_count <> v_expected_count THEN
    RAISE EXCEPTION 'Regenerated theme timeline summary references invalid observations';
  END IF;

  INSERT INTO public.understanding_summaries (
    run_id,
    statement,
    classification,
    review_state,
    model_version,
    prompt_version,
    supersedes_summary_id
  )
  SELECT
    run.id,
    trim(p_statement),
    p_classification,
    'proposed',
    run.model_version,
    run.prompt_version,
    p_previous_summary_id
  FROM public.understanding_runs AS run
  WHERE run.id = p_run_id
  RETURNING id INTO v_summary_id;

  INSERT INTO public.understanding_summary_observations (summary_id, observation_id)
  SELECT v_summary_id, observation.id
  FROM public.understanding_observations AS observation
  WHERE observation.run_id = p_run_id
    AND observation.review_state IN ('confirmed', 'edited')
    AND observation.id = ANY (p_observation_ids)
  ON CONFLICT DO NOTHING;

  RETURN v_summary_id;
END;
$$;

REVOKE ALL ON FUNCTION public.regenerate_theme_timeline_summary(
  UUID, UUID, TEXT, TEXT, UUID[]
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.regenerate_theme_timeline_summary(
  UUID, UUID, TEXT, TEXT, UUID[]
) TO service_role;

COMMIT;
