-- Add an append-only, service-role-only review lifecycle for Phase 3 observations.
BEGIN;

CREATE TABLE public.understanding_observation_reviews (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  observation_id UUID NOT NULL
    REFERENCES public.understanding_observations(id) ON DELETE CASCADE,
  action TEXT NOT NULL CHECK (action IN ('confirm', 'edit', 'reject')),
  previous_statement TEXT NOT NULL
    CHECK (length(trim(previous_statement)) BETWEEN 1 AND 2000),
  previous_classification TEXT NOT NULL
    CHECK (previous_classification IN ('fact', 'summary', 'inference')),
  previous_review_state TEXT NOT NULL
    CHECK (previous_review_state IN ('proposed', 'confirmed', 'edited')),
  previous_reviewed_at TIMESTAMPTZ,
  previous_updated_at TIMESTAMPTZ NOT NULL,
  resulting_statement TEXT NOT NULL
    CHECK (length(trim(resulting_statement)) BETWEEN 1 AND 2000),
  resulting_classification TEXT NOT NULL
    CHECK (resulting_classification IN ('fact', 'summary', 'inference')),
  resulting_review_state TEXT NOT NULL
    CHECK (resulting_review_state IN ('confirmed', 'edited', 'rejected')),
  reviewed_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX understanding_observation_reviews_observation_idx
  ON public.understanding_observation_reviews (observation_id, reviewed_at DESC, id DESC);

CREATE TABLE public.understanding_observation_review_summary_impacts (
  review_id BIGINT NOT NULL
    REFERENCES public.understanding_observation_reviews(id) ON DELETE CASCADE,
  summary_id UUID NOT NULL
    REFERENCES public.understanding_summaries(id) ON DELETE CASCADE,
  previous_review_state TEXT NOT NULL
    CHECK (previous_review_state IN ('proposed', 'confirmed', 'edited')),
  previous_reviewed_at TIMESTAMPTZ,
  previous_updated_at TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (review_id, summary_id)
);

CREATE INDEX understanding_observation_review_summary_impacts_summary_idx
  ON public.understanding_observation_review_summary_impacts (summary_id, review_id);

ALTER TABLE public.understanding_observation_reviews ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.understanding_observation_review_summary_impacts ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE
  public.understanding_observation_reviews,
  public.understanding_observation_review_summary_impacts
FROM PUBLIC, anon, authenticated;

GRANT SELECT, INSERT ON TABLE
  public.understanding_observation_reviews,
  public.understanding_observation_review_summary_impacts
TO service_role;

REVOKE ALL ON SEQUENCE public.understanding_observation_reviews_id_seq
FROM PUBLIC, anon, authenticated;
GRANT USAGE, SELECT ON SEQUENCE public.understanding_observation_reviews_id_seq
TO service_role;

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
  SELECT *
  INTO v_observation
  FROM public.understanding_observations
  WHERE id = p_observation_id
  FOR UPDATE;

  IF NOT FOUND
     OR v_observation.review_state IN ('rejected', 'superseded') THEN
    RAISE EXCEPTION 'Theme timeline observation is not reviewable';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.understanding_runs AS run
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
          SELECT 1
          FROM public.knowledge_chunks AS chunk
          WHERE chunk.source_id = run_source.source_id
        )
      )
  ) THEN
    RAISE EXCEPTION 'Stale theme timeline observation cannot be reviewed';
  END IF;

  IF p_action = 'confirm' THEN
    IF v_observation.review_state = 'confirmed' THEN
      RETURN v_observation.id;
    END IF;
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
  )
  VALUES (
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
  )
  RETURNING id INTO v_review_id;

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
    JOIN public.understanding_summaries AS summary
      ON summary.id = link.summary_id
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
    RAISE EXCEPTION 'Stale theme timeline summary cannot be reviewed';
  END IF;

  IF p_action <> 'reject' AND EXISTS (
    SELECT 1
    FROM public.understanding_summary_observations AS link
    JOIN public.understanding_observations AS observation
      ON observation.id = link.observation_id
    WHERE link.summary_id = v_summary.id
      AND observation.review_state NOT IN ('confirmed', 'edited')
  ) THEN
    RAISE EXCEPTION 'Theme timeline summary has unreviewed observations';
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
