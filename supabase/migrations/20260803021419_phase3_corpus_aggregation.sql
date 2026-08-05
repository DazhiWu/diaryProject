-- Phase 3C: deterministic, versioned corpus aggregation over reviewed observations.
BEGIN;

CREATE TABLE public.understanding_aggregates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id UUID NOT NULL REFERENCES public.understanding_runs(id) ON DELETE CASCADE,
  aggregate_type TEXT NOT NULL
    CHECK (aggregate_type = 'theme_timeline_monthly'),
  status TEXT NOT NULL DEFAULT 'current'
    CHECK (status IN ('current', 'superseded')),
  supersedes_aggregate_id UUID
    REFERENCES public.understanding_aggregates(id) ON DELETE SET NULL,
  corpus_fingerprint TEXT NOT NULL CHECK (corpus_fingerprint ~ '^[0-9a-f]{32}$'),
  frozen_source_count INTEGER NOT NULL CHECK (frozen_source_count >= 1),
  eligible_source_count INTEGER NOT NULL CHECK (eligible_source_count >= 1),
  processed_source_count INTEGER NOT NULL CHECK (processed_source_count >= 0),
  excluded_source_count INTEGER NOT NULL CHECK (excluded_source_count >= 0),
  accepted_observation_count INTEGER NOT NULL CHECK (accepted_observation_count >= 0),
  confirmed_observation_count INTEGER NOT NULL CHECK (confirmed_observation_count >= 0),
  edited_observation_count INTEGER NOT NULL CHECK (edited_observation_count >= 0),
  distinct_diary_count INTEGER NOT NULL CHECK (distinct_diary_count >= 0),
  first_supported_date DATE,
  last_supported_date DATE,
  model_version TEXT NOT NULL CHECK (length(model_version) BETWEEN 1 AND 200),
  prompt_version TEXT NOT NULL CHECK (length(prompt_version) BETWEEN 1 AND 200),
  generation_config JSONB NOT NULL
    CHECK (jsonb_typeof(generation_config) = 'object'),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (processed_source_count <= eligible_source_count),
  CHECK (accepted_observation_count = confirmed_observation_count + edited_observation_count),
  CHECK (distinct_diary_count <= accepted_observation_count),
  CHECK (
    (accepted_observation_count = 0 AND first_supported_date IS NULL AND last_supported_date IS NULL)
    OR (
      accepted_observation_count > 0
      AND first_supported_date IS NOT NULL
      AND last_supported_date IS NOT NULL
      AND first_supported_date <= last_supported_date
    )
  )
);

CREATE UNIQUE INDEX understanding_aggregates_one_current_run_idx
  ON public.understanding_aggregates (run_id)
  WHERE status = 'current';

CREATE INDEX understanding_aggregates_run_created_idx
  ON public.understanding_aggregates (run_id, created_at DESC, id DESC);

CREATE INDEX understanding_aggregates_supersedes_idx
  ON public.understanding_aggregates (supersedes_aggregate_id)
  WHERE supersedes_aggregate_id IS NOT NULL;

CREATE TABLE public.understanding_aggregate_periods (
  aggregate_id UUID NOT NULL
    REFERENCES public.understanding_aggregates(id) ON DELETE CASCADE,
  period_start DATE NOT NULL,
  eligible_source_count INTEGER NOT NULL CHECK (eligible_source_count >= 0),
  processed_source_count INTEGER NOT NULL CHECK (processed_source_count >= 0),
  accepted_observation_count INTEGER NOT NULL CHECK (accepted_observation_count >= 0),
  confirmed_observation_count INTEGER NOT NULL CHECK (confirmed_observation_count >= 0),
  edited_observation_count INTEGER NOT NULL CHECK (edited_observation_count >= 0),
  distinct_diary_count INTEGER NOT NULL CHECK (distinct_diary_count >= 0),
  first_supported_date DATE,
  last_supported_date DATE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (aggregate_id, period_start),
  CHECK (EXTRACT(DAY FROM period_start) = 1),
  CHECK (processed_source_count <= eligible_source_count),
  CHECK (accepted_observation_count = confirmed_observation_count + edited_observation_count),
  CHECK (distinct_diary_count <= accepted_observation_count),
  CHECK (
    (accepted_observation_count = 0 AND first_supported_date IS NULL AND last_supported_date IS NULL)
    OR (
      accepted_observation_count > 0
      AND first_supported_date IS NOT NULL
      AND last_supported_date IS NOT NULL
      AND first_supported_date <= last_supported_date
    )
  )
);

CREATE TABLE public.understanding_aggregate_observations (
  aggregate_id UUID NOT NULL
    REFERENCES public.understanding_aggregates(id) ON DELETE CASCADE,
  observation_id UUID NOT NULL
    REFERENCES public.understanding_observations(id) ON DELETE CASCADE,
  source_id BIGINT NOT NULL,
  source_hash TEXT NOT NULL CHECK (source_hash ~ '^[0-9a-f]{64}$'),
  source_date DATE NOT NULL,
  statement TEXT NOT NULL CHECK (length(trim(statement)) BETWEEN 1 AND 2000),
  classification TEXT NOT NULL CHECK (classification IN ('fact', 'summary', 'inference')),
  review_state TEXT NOT NULL CHECK (review_state IN ('confirmed', 'edited')),
  observation_updated_at TIMESTAMPTZ NOT NULL,
  evidence_count INTEGER NOT NULL CHECK (evidence_count >= 1),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (aggregate_id, observation_id)
);

CREATE INDEX understanding_aggregate_observations_observation_idx
  ON public.understanding_aggregate_observations (observation_id, aggregate_id);

CREATE INDEX understanding_aggregate_observations_source_idx
  ON public.understanding_aggregate_observations (source_id, source_date, aggregate_id);

ALTER TABLE public.understanding_aggregates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.understanding_aggregate_periods ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.understanding_aggregate_observations ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE
  public.understanding_aggregates,
  public.understanding_aggregate_periods,
  public.understanding_aggregate_observations
FROM PUBLIC, anon, authenticated;

GRANT SELECT, INSERT, UPDATE ON TABLE
  public.understanding_aggregates,
  public.understanding_aggregate_periods,
  public.understanding_aggregate_observations
TO service_role;

CREATE OR REPLACE FUNCTION public.regenerate_theme_timeline_aggregate(
  p_run_id UUID,
  p_previous_aggregate_id UUID DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
  v_run public.understanding_runs%ROWTYPE;
  v_current_aggregate_id UUID;
  v_aggregate_id UUID;
  v_frozen_snapshot_count INTEGER;
  v_eligible_snapshot_count INTEGER;
  v_processed_source_count INTEGER;
  v_snapshot_fingerprint TEXT;
  v_accepted_observation_count INTEGER;
  v_confirmed_observation_count INTEGER;
  v_edited_observation_count INTEGER;
  v_distinct_diary_count INTEGER;
  v_first_supported_date DATE;
  v_last_supported_date DATE;
  v_inserted_observation_count INTEGER;
BEGIN
  SELECT *
  INTO v_run
  FROM public.understanding_runs
  WHERE id = p_run_id
    AND analysis_type = 'theme_timeline'
  FOR UPDATE;

  IF NOT FOUND OR v_run.status <> 'completed' THEN
    RAISE EXCEPTION 'Theme timeline run is not completed';
  END IF;

  IF v_run.generation_config IS NULL
     OR jsonb_typeof(v_run.generation_config) <> 'object' THEN
    RAISE EXCEPTION 'Theme timeline run has invalid generation metadata';
  END IF;

  LOCK TABLE
    public.understanding_run_sources,
    public.understanding_observations,
    public.understanding_observation_evidence,
    public.knowledge_source_settings,
    public.knowledge_index_jobs,
    public.knowledge_chunks
  IN SHARE MODE;

  SELECT aggregate.id
  INTO v_current_aggregate_id
  FROM public.understanding_aggregates AS aggregate
  WHERE aggregate.run_id = p_run_id
    AND aggregate.status = 'current'
  ORDER BY aggregate.created_at DESC, aggregate.id DESC
  LIMIT 1
  FOR UPDATE;

  IF v_current_aggregate_id IS DISTINCT FROM p_previous_aggregate_id THEN
    RAISE EXCEPTION 'Theme timeline aggregate history changed';
  END IF;

  SELECT
    count(*)::INTEGER,
    count(*) FILTER (WHERE in_date_range)::INTEGER,
    count(*) FILTER (WHERE in_date_range AND status = 'completed')::INTEGER,
    md5(string_agg(source_id::TEXT || ':' || source_hash, ',' ORDER BY source_id))
  INTO
    v_frozen_snapshot_count,
    v_eligible_snapshot_count,
    v_processed_source_count,
    v_snapshot_fingerprint
  FROM public.understanding_run_sources
  WHERE run_id = p_run_id;

  IF v_frozen_snapshot_count <> v_run.frozen_source_count
     OR v_eligible_snapshot_count <> v_run.eligible_source_count
     OR v_snapshot_fingerprint IS DISTINCT FROM v_run.corpus_fingerprint THEN
    RAISE EXCEPTION 'Theme timeline run coverage metadata is inconsistent';
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
    RAISE EXCEPTION 'Stale theme timeline run cannot be aggregated';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.understanding_observations
    WHERE run_id = p_run_id
      AND review_state NOT IN ('confirmed', 'edited', 'rejected')
  ) THEN
    RAISE EXCEPTION 'Theme timeline run has unreviewed observations';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.understanding_observations AS observation
    WHERE observation.run_id = p_run_id
      AND observation.review_state IN ('confirmed', 'edited')
      AND NOT EXISTS (
        SELECT 1
        FROM public.understanding_observation_evidence AS evidence
        WHERE evidence.observation_id = observation.id
      )
  ) THEN
    RAISE EXCEPTION 'Reviewed observation is missing immutable evidence';
  END IF;

  SELECT
    count(*)::INTEGER,
    count(*) FILTER (WHERE review_state = 'confirmed')::INTEGER,
    count(*) FILTER (WHERE review_state = 'edited')::INTEGER,
    count(DISTINCT source_id)::INTEGER,
    min(source_date),
    max(source_date)
  INTO
    v_accepted_observation_count,
    v_confirmed_observation_count,
    v_edited_observation_count,
    v_distinct_diary_count,
    v_first_supported_date,
    v_last_supported_date
  FROM public.understanding_observations
  WHERE run_id = p_run_id
    AND review_state IN ('confirmed', 'edited');

  IF v_current_aggregate_id IS NOT NULL THEN
    UPDATE public.understanding_aggregates
    SET status = 'superseded'
    WHERE id = v_current_aggregate_id;
  END IF;

  INSERT INTO public.understanding_aggregates (
    run_id,
    aggregate_type,
    status,
    supersedes_aggregate_id,
    corpus_fingerprint,
    frozen_source_count,
    eligible_source_count,
    processed_source_count,
    excluded_source_count,
    accepted_observation_count,
    confirmed_observation_count,
    edited_observation_count,
    distinct_diary_count,
    first_supported_date,
    last_supported_date,
    model_version,
    prompt_version,
    generation_config
  )
  VALUES (
    v_run.id,
    'theme_timeline_monthly',
    'current',
    v_current_aggregate_id,
    v_run.corpus_fingerprint,
    v_frozen_snapshot_count,
    v_eligible_snapshot_count,
    v_processed_source_count,
    v_run.excluded_source_count,
    v_accepted_observation_count,
    v_confirmed_observation_count,
    v_edited_observation_count,
    v_distinct_diary_count,
    v_first_supported_date,
    v_last_supported_date,
    v_run.model_version,
    v_run.prompt_version,
    v_run.generation_config
  )
  RETURNING id INTO v_aggregate_id;

  INSERT INTO public.understanding_aggregate_observations (
    aggregate_id,
    observation_id,
    source_id,
    source_hash,
    source_date,
    statement,
    classification,
    review_state,
    observation_updated_at,
    evidence_count
  )
  SELECT
    v_aggregate_id,
    observation.id,
    observation.source_id,
    observation.source_hash,
    observation.source_date,
    observation.statement,
    observation.classification,
    observation.review_state,
    observation.updated_at,
    count(evidence.id)::INTEGER
  FROM public.understanding_observations AS observation
  JOIN public.understanding_observation_evidence AS evidence
    ON evidence.observation_id = observation.id
  WHERE observation.run_id = p_run_id
    AND observation.review_state IN ('confirmed', 'edited')
  GROUP BY observation.id;

  GET DIAGNOSTICS v_inserted_observation_count = ROW_COUNT;
  IF v_inserted_observation_count <> v_accepted_observation_count THEN
    RAISE EXCEPTION 'Theme timeline aggregate observation snapshot is incomplete';
  END IF;

  INSERT INTO public.understanding_aggregate_periods (
    aggregate_id,
    period_start,
    eligible_source_count,
    processed_source_count,
    accepted_observation_count,
    confirmed_observation_count,
    edited_observation_count,
    distinct_diary_count,
    first_supported_date,
    last_supported_date
  )
  WITH source_periods AS (
    SELECT
      date_trunc('month', run_source.source_date)::DATE AS period_start,
      count(*)::INTEGER AS eligible_source_count,
      count(*) FILTER (WHERE run_source.status = 'completed')::INTEGER AS processed_source_count
    FROM public.understanding_run_sources AS run_source
    WHERE run_source.run_id = p_run_id
      AND run_source.in_date_range
    GROUP BY date_trunc('month', run_source.source_date)::DATE
  ), observation_periods AS (
    SELECT
      date_trunc('month', observation.source_date)::DATE AS period_start,
      count(*)::INTEGER AS accepted_observation_count,
      count(*) FILTER (WHERE observation.review_state = 'confirmed')::INTEGER AS confirmed_observation_count,
      count(*) FILTER (WHERE observation.review_state = 'edited')::INTEGER AS edited_observation_count,
      count(DISTINCT observation.source_id)::INTEGER AS distinct_diary_count,
      min(observation.source_date) AS first_supported_date,
      max(observation.source_date) AS last_supported_date
    FROM public.understanding_observations AS observation
    WHERE observation.run_id = p_run_id
      AND observation.review_state IN ('confirmed', 'edited')
    GROUP BY date_trunc('month', observation.source_date)::DATE
  )
  SELECT
    v_aggregate_id,
    source_period.period_start,
    source_period.eligible_source_count,
    source_period.processed_source_count,
    coalesce(observation_period.accepted_observation_count, 0),
    coalesce(observation_period.confirmed_observation_count, 0),
    coalesce(observation_period.edited_observation_count, 0),
    coalesce(observation_period.distinct_diary_count, 0),
    observation_period.first_supported_date,
    observation_period.last_supported_date
  FROM source_periods AS source_period
  LEFT JOIN observation_periods AS observation_period USING (period_start)
  ORDER BY source_period.period_start;

  RETURN v_aggregate_id;
END;
$$;

REVOKE ALL ON FUNCTION public.regenerate_theme_timeline_aggregate(UUID, UUID)
FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.regenerate_theme_timeline_aggregate(UUID, UUID)
TO service_role;

CREATE OR REPLACE FUNCTION public.get_theme_timeline_aggregate_stale_reasons(
  p_aggregate_id UUID
)
RETURNS TABLE(reason TEXT)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = ''
AS $$
  WITH target AS (
    SELECT aggregate.*, run.status AS run_status, run.corpus_fingerprint AS run_corpus_fingerprint,
      run.frozen_source_count AS run_frozen_source_count,
      run.eligible_source_count AS run_eligible_source_count,
      run.excluded_source_count AS run_excluded_source_count,
      run.model_version AS run_model_version, run.prompt_version AS run_prompt_version,
      run.generation_config AS run_generation_config
    FROM public.understanding_aggregates AS aggregate
    JOIN public.understanding_runs AS run ON run.id = aggregate.run_id
    WHERE aggregate.id = p_aggregate_id
  )
  SELECT 'aggregate_superseded'::TEXT
  FROM target
  WHERE status <> 'current'

  UNION ALL

  SELECT 'run_metadata_changed'::TEXT
  FROM target
  WHERE run_status <> 'completed'
     OR corpus_fingerprint IS DISTINCT FROM run_corpus_fingerprint
     OR frozen_source_count IS DISTINCT FROM run_frozen_source_count
     OR eligible_source_count IS DISTINCT FROM run_eligible_source_count
     OR excluded_source_count IS DISTINCT FROM run_excluded_source_count
     OR model_version IS DISTINCT FROM run_model_version
     OR prompt_version IS DISTINCT FROM run_prompt_version
     OR generation_config IS DISTINCT FROM run_generation_config

  UNION ALL

  SELECT 'source_snapshot_changed'::TEXT
  FROM target
  WHERE eligible_source_count IS DISTINCT FROM (
    SELECT count(*)::INTEGER
    FROM public.understanding_run_sources AS counted_source
    WHERE counted_source.run_id = target.run_id
      AND counted_source.in_date_range
  )
  OR processed_source_count IS DISTINCT FROM (
    SELECT count(*)::INTEGER
    FROM public.understanding_run_sources AS counted_source
    WHERE counted_source.run_id = target.run_id
      AND counted_source.in_date_range
      AND counted_source.status = 'completed'
  )
  OR EXISTS (
    SELECT 1
    FROM public.understanding_run_sources AS run_source
    WHERE run_source.run_id = target.run_id
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
  )

  UNION ALL

  SELECT 'observation_snapshot_changed'::TEXT
  FROM target
  WHERE EXISTS (
    SELECT 1
    FROM public.understanding_observations AS observation
    WHERE observation.run_id = target.run_id
      AND observation.review_state IN ('confirmed', 'edited')
      AND NOT EXISTS (
        SELECT 1
        FROM public.understanding_aggregate_observations AS link
        WHERE link.aggregate_id = target.id
          AND link.observation_id = observation.id
      )
  ) OR EXISTS (
    SELECT 1
    FROM public.understanding_aggregate_observations AS link
    LEFT JOIN public.understanding_observations AS observation
      ON observation.id = link.observation_id
    WHERE link.aggregate_id = target.id
      AND (
        observation.id IS NULL
        OR observation.run_id <> target.run_id
        OR observation.review_state NOT IN ('confirmed', 'edited')
        OR observation.source_id IS DISTINCT FROM link.source_id
        OR observation.source_hash IS DISTINCT FROM link.source_hash
        OR observation.source_date IS DISTINCT FROM link.source_date
        OR observation.statement IS DISTINCT FROM link.statement
        OR observation.classification IS DISTINCT FROM link.classification
        OR observation.review_state IS DISTINCT FROM link.review_state
        OR observation.updated_at IS DISTINCT FROM link.observation_updated_at
        OR link.evidence_count IS DISTINCT FROM (
          SELECT count(*)::INTEGER
          FROM public.understanding_observation_evidence AS evidence
          WHERE evidence.observation_id = link.observation_id
        )
      )
  );
$$;

REVOKE ALL ON FUNCTION public.get_theme_timeline_aggregate_stale_reasons(UUID)
FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_theme_timeline_aggregate_stale_reasons(UUID)
TO service_role;

COMMIT;
