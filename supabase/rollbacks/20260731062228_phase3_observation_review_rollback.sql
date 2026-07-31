-- Roll back Phase 3B observation reviews and restore all affected current records.
BEGIN;

DO $$
DECLARE
  v_observation RECORD;
  v_summary RECORD;
BEGIN
  IF to_regclass('public.understanding_observation_reviews') IS NOT NULL THEN
    FOR v_observation IN
      SELECT DISTINCT ON (review.observation_id)
        review.observation_id,
        review.previous_statement,
        review.previous_classification,
        review.previous_review_state,
        review.previous_reviewed_at,
        review.previous_updated_at
      FROM public.understanding_observation_reviews AS review
      ORDER BY review.observation_id, review.reviewed_at, review.id
    LOOP
      UPDATE public.understanding_observations
      SET statement = v_observation.previous_statement,
          classification = v_observation.previous_classification,
          review_state = v_observation.previous_review_state,
          reviewed_at = v_observation.previous_reviewed_at,
          updated_at = v_observation.previous_updated_at
      WHERE id = v_observation.observation_id;
    END LOOP;
  END IF;

  IF to_regclass('public.understanding_observation_review_summary_impacts') IS NOT NULL THEN
    FOR v_summary IN
      SELECT DISTINCT ON (impact.summary_id)
        impact.summary_id,
        impact.previous_review_state,
        impact.previous_reviewed_at,
        impact.previous_updated_at
      FROM public.understanding_observation_review_summary_impacts AS impact
      JOIN public.understanding_observation_reviews AS review
        ON review.id = impact.review_id
      ORDER BY impact.summary_id, review.reviewed_at, review.id
    LOOP
      UPDATE public.understanding_summaries
      SET review_state = v_summary.previous_review_state,
          reviewed_at = v_summary.previous_reviewed_at,
          updated_at = v_summary.previous_updated_at
      WHERE id = v_summary.summary_id;
    END LOOP;
  END IF;
END;
$$;

DROP FUNCTION IF EXISTS public.review_theme_timeline_observation(
  UUID, TEXT, TEXT, TEXT
);

DROP TABLE IF EXISTS public.understanding_observation_review_summary_impacts;
DROP TABLE IF EXISTS public.understanding_observation_reviews;

CREATE OR REPLACE FUNCTION public.review_theme_timeline_summary(
  p_summary_id UUID,
  p_action TEXT,
  p_statement TEXT DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
  v_summary public.understanding_summaries%ROWTYPE;
  v_new_summary_id UUID;
BEGIN
  SELECT *
  INTO v_summary
  FROM public.understanding_summaries
  WHERE id = p_summary_id
  FOR UPDATE;

  IF NOT FOUND OR v_summary.review_state IN ('rejected', 'superseded') THEN
    RAISE EXCEPTION 'Theme timeline summary is not reviewable';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.understanding_run_sources AS run_source
    WHERE run_source.run_id = v_summary.run_id
      AND run_source.in_date_range
      AND (
        NOT EXISTS (
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
    RAISE EXCEPTION 'Stale theme timeline summary cannot be reviewed';
  END IF;

  IF p_action = 'confirm' THEN
    UPDATE public.understanding_summaries
    SET review_state = 'confirmed',
        reviewed_at = now(),
        updated_at = now()
    WHERE id = p_summary_id
    RETURNING id INTO v_new_summary_id;
    RETURN v_new_summary_id;
  END IF;

  IF p_action = 'reject' THEN
    UPDATE public.understanding_summaries
    SET review_state = 'rejected',
        reviewed_at = now(),
        updated_at = now()
    WHERE id = p_summary_id
    RETURNING id INTO v_new_summary_id;
    RETURN v_new_summary_id;
  END IF;

  IF p_action NOT IN ('edit', 'supersede')
     OR length(trim(coalesce(p_statement, ''))) NOT BETWEEN 1 AND 5000 THEN
    RAISE EXCEPTION 'Invalid theme timeline review action';
  END IF;

  UPDATE public.understanding_summaries
  SET review_state = 'superseded',
      reviewed_at = now(),
      updated_at = now()
  WHERE id = p_summary_id;

  INSERT INTO public.understanding_summaries (
    run_id,
    statement,
    classification,
    review_state,
    model_version,
    prompt_version,
    supersedes_summary_id,
    reviewed_at
  )
  VALUES (
    v_summary.run_id,
    trim(p_statement),
    v_summary.classification,
    'edited',
    v_summary.model_version,
    v_summary.prompt_version,
    p_summary_id,
    now()
  )
  RETURNING id INTO v_new_summary_id;

  INSERT INTO public.understanding_summary_observations (summary_id, observation_id)
  SELECT v_new_summary_id, link.observation_id
  FROM public.understanding_summary_observations AS link
  WHERE link.summary_id = p_summary_id;

  RETURN v_new_summary_id;
END;
$$;

REVOKE ALL ON FUNCTION public.review_theme_timeline_summary(
  UUID, TEXT, TEXT
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.review_theme_timeline_summary(
  UUID, TEXT, TEXT
) TO service_role;

COMMIT;
