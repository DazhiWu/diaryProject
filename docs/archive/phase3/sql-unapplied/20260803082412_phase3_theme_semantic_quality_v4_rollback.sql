-- Roll back only Phase 3A v4 semantic-quality objects when no v4 run has been created.
BEGIN;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.understanding_run_semantic_configs)
     OR EXISTS (SELECT 1 FROM public.understanding_runs WHERE status = 'awaiting_review') THEN
    RAISE EXCEPTION 'Cannot roll back Phase 3A v4 while v4 run data exists';
  END IF;
END;
$$;

DROP FUNCTION IF EXISTS public.finalize_reviewed_theme_timeline_run_v4(UUID, TEXT, TEXT, UUID[]);
DROP FUNCTION IF EXISTS public.complete_theme_timeline_source_v4(UUID, BIGINT, TEXT, TEXT, TEXT, TEXT, TEXT, JSONB);
DROP FUNCTION IF EXISTS public.create_theme_timeline_run_v4(TEXT, JSONB, TEXT, DATE, DATE, INTEGER, TEXT, TEXT, TEXT, JSONB);

DROP TABLE IF EXISTS public.understanding_observation_scopes;
DROP TABLE IF EXISTS public.understanding_run_semantic_configs;

ALTER TABLE public.understanding_observation_evidence
  DROP CONSTRAINT understanding_observation_evidence_precise_range_key;
ALTER TABLE public.understanding_observation_evidence
  ADD CONSTRAINT understanding_observation_evidence_observation_id_chunk_id_key
  UNIQUE (observation_id, chunk_id);

ALTER TABLE public.understanding_runs
  DROP CONSTRAINT understanding_runs_status_check;
ALTER TABLE public.understanding_runs
  ADD CONSTRAINT understanding_runs_status_check
  CHECK (status IN ('pending', 'extracting', 'paused', 'ready_for_summary', 'completed', 'failed'));

CREATE OR REPLACE FUNCTION public.review_theme_timeline_observation(
  p_observation_id UUID,
  p_action TEXT,
  p_statement TEXT DEFAULT NULL,
  p_classification TEXT DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
  v_observation public.understanding_observations%ROWTYPE;
  v_review_id BIGINT;
  v_resulting_statement TEXT;
  v_resulting_classification TEXT;
  v_resulting_review_state TEXT;
  v_reviewed_at TIMESTAMPTZ := clock_timestamp();
BEGIN
  SELECT * INTO v_observation
  FROM public.understanding_observations
  WHERE id = p_observation_id
  FOR UPDATE;

  IF NOT FOUND OR v_observation.review_state IN ('rejected', 'superseded') THEN
    RAISE EXCEPTION 'Theme timeline observation is not reviewable';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.understanding_runs AS run
    WHERE run.id = v_observation.run_id
      AND run.status = 'completed'
  ) OR EXISTS (
    SELECT 1
    FROM public.understanding_run_sources AS run_source
    WHERE run_source.run_id = v_observation.run_id
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
          SELECT 1 FROM public.knowledge_chunks AS chunk
          WHERE chunk.source_id = run_source.source_id
        )
      )
  ) THEN
    RAISE EXCEPTION 'Stale theme timeline observation cannot be reviewed';
  END IF;

  IF p_action = 'confirm' THEN
    IF v_observation.review_state = 'confirmed' THEN RETURN v_observation.id; END IF;
    v_resulting_statement := v_observation.statement;
    v_resulting_classification := v_observation.classification;
    v_resulting_review_state := 'confirmed';
  ELSIF p_action = 'reject' THEN
    v_resulting_statement := v_observation.statement;
    v_resulting_classification := v_observation.classification;
    v_resulting_review_state := 'rejected';
  ELSIF p_action = 'edit'
        AND length(trim(coalesce(p_statement, ''))) BETWEEN 1 AND 2000
        AND p_classification IN ('fact', 'summary', 'inference') THEN
    v_resulting_statement := trim(p_statement);
    v_resulting_classification := p_classification;
    v_resulting_review_state := 'edited';
    IF v_resulting_statement = v_observation.statement
       AND v_resulting_classification = v_observation.classification
       AND v_observation.review_state = 'edited' THEN
      RETURN v_observation.id;
    END IF;
  ELSE
    RAISE EXCEPTION 'Invalid theme timeline observation review action';
  END IF;

  INSERT INTO public.understanding_observation_reviews (
    observation_id,
    action,
    previous_statement,
    previous_classification,
    previous_review_state,
    previous_reviewed_at,
    previous_updated_at,
    resulting_statement,
    resulting_classification,
    resulting_review_state,
    reviewed_at
  ) VALUES (
    v_observation.id,
    p_action,
    v_observation.statement,
    v_observation.classification,
    v_observation.review_state,
    v_observation.reviewed_at,
    v_observation.updated_at,
    v_resulting_statement,
    v_resulting_classification,
    v_resulting_review_state,
    v_reviewed_at
  ) RETURNING id INTO v_review_id;

  IF p_action IN ('edit', 'reject') THEN
    INSERT INTO public.understanding_observation_review_summary_impacts (
      review_id,
      summary_id,
      previous_review_state,
      previous_reviewed_at,
      previous_updated_at
    )
    SELECT
      v_review_id,
      summary.id,
      summary.review_state,
      summary.reviewed_at,
      summary.updated_at
    FROM public.understanding_summary_observations AS link
    JOIN public.understanding_summaries AS summary ON summary.id = link.summary_id
    WHERE link.observation_id = v_observation.id
      AND summary.review_state IN ('proposed', 'confirmed', 'edited')
    FOR UPDATE OF summary;

    UPDATE public.understanding_summaries AS summary
    SET review_state = 'superseded',
        reviewed_at = coalesce(summary.reviewed_at, v_reviewed_at),
        updated_at = v_reviewed_at
    FROM public.understanding_observation_review_summary_impacts AS impact
    WHERE impact.review_id = v_review_id
      AND impact.summary_id = summary.id;
  END IF;

  UPDATE public.understanding_observations
  SET statement = v_resulting_statement,
      classification = v_resulting_classification,
      review_state = v_resulting_review_state,
      reviewed_at = v_reviewed_at,
      updated_at = v_reviewed_at
  WHERE id = v_observation.id;

  RETURN v_observation.id;
END;
$$;

REVOKE ALL ON FUNCTION public.review_theme_timeline_observation(
  UUID, TEXT, TEXT, TEXT
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.review_theme_timeline_observation(
  UUID, TEXT, TEXT, TEXT
) TO service_role;

COMMIT;
