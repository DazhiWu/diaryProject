-- Phase 3A: administrator-only, auditable theme-timeline runs.
BEGIN;

CREATE TABLE public.understanding_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  analysis_type TEXT NOT NULL CHECK (analysis_type = 'theme_timeline'),
  theme TEXT NOT NULL CHECK (length(trim(theme)) BETWEEN 1 AND 200),
  start_date DATE NOT NULL,
  end_date DATE NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'extracting', 'paused', 'ready_for_summary', 'completed', 'failed')),
  corpus_fingerprint TEXT NOT NULL CHECK (corpus_fingerprint ~ '^[0-9a-f]{32}$'),
  frozen_source_count INTEGER NOT NULL CHECK (frozen_source_count >= 1),
  eligible_source_count INTEGER NOT NULL CHECK (eligible_source_count >= 1),
  excluded_source_count INTEGER NOT NULL DEFAULT 0 CHECK (excluded_source_count >= 0),
  model_version TEXT NOT NULL CHECK (length(model_version) BETWEEN 1 AND 200),
  prompt_version TEXT NOT NULL CHECK (length(prompt_version) BETWEEN 1 AND 200),
  last_error TEXT,
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (start_date <= end_date),
  CHECK (eligible_source_count <= frozen_source_count)
);

CREATE INDEX understanding_runs_created_at_idx
  ON public.understanding_runs (created_at DESC, id);

CREATE TABLE public.understanding_run_sources (
  run_id UUID NOT NULL REFERENCES public.understanding_runs(id) ON DELETE CASCADE,
  source_id BIGINT NOT NULL,
  source_hash TEXT NOT NULL CHECK (source_hash ~ '^[0-9a-f]{64}$'),
  source_date DATE NOT NULL,
  source_title TEXT,
  in_date_range BOOLEAN NOT NULL,
  status TEXT NOT NULL
    CHECK (status IN ('out_of_range', 'pending', 'processing', 'completed', 'failed', 'stale')),
  attempts INTEGER NOT NULL DEFAULT 0 CHECK (attempts >= 0),
  last_error TEXT,
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (run_id, source_id),
  CHECK (
    (in_date_range AND status <> 'out_of_range')
    OR (NOT in_date_range AND status = 'out_of_range')
  )
);

CREATE INDEX understanding_run_sources_claim_idx
  ON public.understanding_run_sources (run_id, source_date, source_id)
  WHERE status = 'pending';

CREATE INDEX understanding_run_sources_processing_idx
  ON public.understanding_run_sources (run_id, started_at, source_id)
  WHERE status = 'processing';

CREATE TABLE public.understanding_observations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id UUID NOT NULL REFERENCES public.understanding_runs(id) ON DELETE CASCADE,
  source_id BIGINT NOT NULL,
  source_hash TEXT NOT NULL CHECK (source_hash ~ '^[0-9a-f]{64}$'),
  source_date DATE NOT NULL,
  statement TEXT NOT NULL CHECK (length(trim(statement)) BETWEEN 1 AND 2000),
  classification TEXT NOT NULL CHECK (classification IN ('fact', 'summary', 'inference')),
  review_state TEXT NOT NULL DEFAULT 'proposed'
    CHECK (review_state IN ('proposed', 'confirmed', 'edited', 'rejected', 'superseded')),
  model_version TEXT NOT NULL CHECK (length(model_version) BETWEEN 1 AND 200),
  prompt_version TEXT NOT NULL CHECK (length(prompt_version) BETWEEN 1 AND 200),
  generated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  reviewed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (run_id, source_id)
);

CREATE INDEX understanding_observations_run_date_idx
  ON public.understanding_observations (run_id, source_date, source_id);

CREATE TABLE public.understanding_observation_evidence (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  observation_id UUID NOT NULL REFERENCES public.understanding_observations(id) ON DELETE CASCADE,
  source_id BIGINT NOT NULL,
  source_hash TEXT NOT NULL CHECK (source_hash ~ '^[0-9a-f]{64}$'),
  chunk_id BIGINT NOT NULL,
  chunk_index INTEGER NOT NULL CHECK (chunk_index >= 0),
  char_start INTEGER NOT NULL CHECK (char_start >= 0),
  char_end INTEGER NOT NULL CHECK (char_end > char_start),
  excerpt TEXT NOT NULL CHECK (length(excerpt) > 0),
  chunk_content_hash TEXT NOT NULL CHECK (chunk_content_hash ~ '^[0-9a-f]{64}$'),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (observation_id, chunk_id)
);

CREATE INDEX understanding_observation_evidence_source_idx
  ON public.understanding_observation_evidence (source_id, chunk_index);

CREATE TABLE public.understanding_summaries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id UUID NOT NULL REFERENCES public.understanding_runs(id) ON DELETE CASCADE,
  statement TEXT NOT NULL CHECK (length(trim(statement)) BETWEEN 1 AND 5000),
  classification TEXT NOT NULL CHECK (classification IN ('summary', 'inference')),
  review_state TEXT NOT NULL DEFAULT 'proposed'
    CHECK (review_state IN ('proposed', 'confirmed', 'edited', 'rejected', 'superseded')),
  model_version TEXT NOT NULL CHECK (length(model_version) BETWEEN 1 AND 200),
  prompt_version TEXT NOT NULL CHECK (length(prompt_version) BETWEEN 1 AND 200),
  supersedes_summary_id UUID REFERENCES public.understanding_summaries(id) ON DELETE SET NULL,
  generated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  reviewed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX understanding_summaries_run_created_idx
  ON public.understanding_summaries (run_id, created_at DESC, id);

CREATE TABLE public.understanding_summary_observations (
  summary_id UUID NOT NULL REFERENCES public.understanding_summaries(id) ON DELETE CASCADE,
  observation_id UUID NOT NULL REFERENCES public.understanding_observations(id) ON DELETE RESTRICT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (summary_id, observation_id)
);

ALTER TABLE public.understanding_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.understanding_run_sources ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.understanding_observations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.understanding_observation_evidence ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.understanding_summaries ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.understanding_summary_observations ENABLE ROW LEVEL SECURITY;

REVOKE ALL PRIVILEGES ON TABLE
  public.understanding_runs,
  public.understanding_run_sources,
  public.understanding_observations,
  public.understanding_observation_evidence,
  public.understanding_summaries,
  public.understanding_summary_observations
FROM PUBLIC, anon, authenticated;

REVOKE ALL PRIVILEGES ON SEQUENCE
  public.understanding_observation_evidence_id_seq
FROM PUBLIC, anon, authenticated;

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE
  public.understanding_runs,
  public.understanding_run_sources,
  public.understanding_observations,
  public.understanding_observation_evidence,
  public.understanding_summaries,
  public.understanding_summary_observations
TO service_role;

GRANT USAGE, SELECT ON SEQUENCE
  public.understanding_observation_evidence_id_seq
TO service_role;

CREATE OR REPLACE FUNCTION public.create_theme_timeline_run(
  p_theme TEXT,
  p_start_date DATE,
  p_end_date DATE,
  p_expected_source_count INTEGER,
  p_expected_fingerprint TEXT,
  p_model_version TEXT,
  p_prompt_version TEXT
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
  v_run_id UUID;
  v_source_count INTEGER;
  v_eligible_count INTEGER;
  v_excluded_count INTEGER;
  v_fingerprint TEXT;
BEGIN
  LOCK TABLE
    public."diaryContent",
    public.knowledge_source_settings,
    public.knowledge_index_jobs,
    public.knowledge_chunks
  IN SHARE MODE;

  IF p_theme IS NULL
     OR length(trim(p_theme)) NOT BETWEEN 1 AND 200
     OR p_start_date IS NULL
     OR p_end_date IS NULL
     OR p_start_date > p_end_date
     OR p_expected_source_count IS NULL
     OR p_expected_source_count < 1
     OR p_expected_fingerprint IS NULL
     OR p_expected_fingerprint !~ '^[0-9a-f]{32}$'
     OR p_model_version IS NULL
     OR length(p_model_version) NOT BETWEEN 1 AND 200
     OR p_prompt_version IS NULL
     OR length(p_prompt_version) NOT BETWEEN 1 AND 200 THEN
    RAISE EXCEPTION 'Invalid theme timeline run request';
  END IF;

  SELECT
    count(*)::INTEGER,
    md5(string_agg(
      setting.source_id::TEXT || ':' || setting.indexed_content_hash,
      ',' ORDER BY setting.source_id
    ))
  INTO v_source_count, v_fingerprint
  FROM public.knowledge_source_settings AS setting
  JOIN public.knowledge_index_jobs AS job USING (source_id)
  WHERE setting.usage_scope = 'private'
    AND setting.indexed_content_hash IS NOT NULL
    AND job.status = 'completed'
    AND EXISTS (
      SELECT 1
      FROM public.knowledge_chunks AS chunk
      WHERE chunk.source_id = setting.source_id
    );

  IF v_source_count <> p_expected_source_count
     OR v_fingerprint IS DISTINCT FROM p_expected_fingerprint THEN
    RAISE EXCEPTION 'Frozen development corpus does not match the approved checkpoint';
  END IF;

  SELECT count(*)::INTEGER
  INTO v_eligible_count
  FROM public.knowledge_source_settings AS setting
  JOIN public.knowledge_index_jobs AS job USING (source_id)
  JOIN public."diaryContent" AS diary ON diary.id = setting.source_id
  WHERE setting.usage_scope = 'private'
    AND setting.indexed_content_hash IS NOT NULL
    AND job.status = 'completed'
    AND diary.date BETWEEN p_start_date AND p_end_date
    AND EXISTS (
      SELECT 1
      FROM public.knowledge_chunks AS chunk
      WHERE chunk.source_id = setting.source_id
    );

  IF v_eligible_count = 0 THEN
    RAISE EXCEPTION 'No frozen sources are eligible for the selected date range';
  END IF;

  SELECT count(*)::INTEGER
  INTO v_excluded_count
  FROM public.knowledge_source_settings AS setting
  JOIN public."diaryContent" AS diary ON diary.id = setting.source_id
  WHERE setting.usage_scope = 'excluded'
    AND diary.date BETWEEN p_start_date AND p_end_date;

  INSERT INTO public.understanding_runs (
    analysis_type,
    theme,
    start_date,
    end_date,
    status,
    corpus_fingerprint,
    frozen_source_count,
    eligible_source_count,
    excluded_source_count,
    model_version,
    prompt_version
  )
  VALUES (
    'theme_timeline',
    trim(p_theme),
    p_start_date,
    p_end_date,
    'pending',
    v_fingerprint,
    v_source_count,
    v_eligible_count,
    v_excluded_count,
    p_model_version,
    p_prompt_version
  )
  RETURNING id INTO v_run_id;

  INSERT INTO public.understanding_run_sources (
    run_id,
    source_id,
    source_hash,
    source_date,
    source_title,
    in_date_range,
    status
  )
  SELECT
    v_run_id,
    setting.source_id,
    setting.indexed_content_hash,
    diary.date,
    diary.subtitle,
    diary.date BETWEEN p_start_date AND p_end_date,
    CASE
      WHEN diary.date BETWEEN p_start_date AND p_end_date THEN 'pending'
      ELSE 'out_of_range'
    END
  FROM public.knowledge_source_settings AS setting
  JOIN public.knowledge_index_jobs AS job USING (source_id)
  JOIN public."diaryContent" AS diary ON diary.id = setting.source_id
  WHERE setting.usage_scope = 'private'
    AND setting.indexed_content_hash IS NOT NULL
    AND job.status = 'completed'
    AND EXISTS (
      SELECT 1
      FROM public.knowledge_chunks AS chunk
      WHERE chunk.source_id = setting.source_id
    )
  ORDER BY setting.source_id;

  RETURN v_run_id;
END;
$$;

REVOKE ALL ON FUNCTION public.create_theme_timeline_run(
  TEXT, DATE, DATE, INTEGER, TEXT, TEXT, TEXT
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.create_theme_timeline_run(
  TEXT, DATE, DATE, INTEGER, TEXT, TEXT, TEXT
) TO service_role;

CREATE OR REPLACE FUNCTION public.claim_theme_timeline_source(p_run_id UUID)
RETURNS TABLE (
  source_id BIGINT,
  source_hash TEXT,
  source_date DATE,
  source_title TEXT,
  chunks JSONB
)
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
BEGIN
  UPDATE public.understanding_run_sources AS run_source
  SET status = 'stale',
      last_error = 'Source no longer matches the frozen corpus snapshot',
      updated_at = now()
  WHERE run_source.run_id = p_run_id
    AND run_source.in_date_range
    AND run_source.status IN ('pending', 'processing')
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
    );

  RETURN QUERY
  WITH candidate AS (
    SELECT selected.run_id, selected.source_id
    FROM public.understanding_run_sources AS selected
    WHERE selected.run_id = p_run_id
      AND selected.in_date_range
      AND (
        selected.status = 'pending'
        OR (
          selected.status = 'processing'
          AND selected.started_at < now() - interval '10 minutes'
        )
      )
    ORDER BY selected.source_date, selected.source_id
    FOR UPDATE SKIP LOCKED
    LIMIT 1
  ), claimed AS (
    UPDATE public.understanding_run_sources AS selected
    SET status = 'processing',
        attempts = selected.attempts + 1,
        started_at = now(),
        completed_at = NULL,
        last_error = NULL,
        updated_at = now()
    FROM candidate
    WHERE selected.run_id = candidate.run_id
      AND selected.source_id = candidate.source_id
    RETURNING
      selected.source_id,
      selected.source_hash,
      selected.source_date,
      selected.source_title
  )
  SELECT
    claimed.source_id,
    claimed.source_hash,
    claimed.source_date,
    claimed.source_title,
    jsonb_agg(
      jsonb_build_object(
        'chunkId', chunk.id,
        'chunkIndex', chunk.chunk_index,
        'charStart', chunk.char_start,
        'charEnd', chunk.char_end,
        'content', chunk.content,
        'contentHash', chunk.content_hash
      )
      ORDER BY chunk.chunk_index
    ) AS chunks
  FROM claimed
  JOIN public.knowledge_chunks AS chunk ON chunk.source_id = claimed.source_id
  GROUP BY
    claimed.source_id,
    claimed.source_hash,
    claimed.source_date,
    claimed.source_title;

  UPDATE public.understanding_runs
  SET status = CASE
        WHEN EXISTS (
          SELECT 1
          FROM public.understanding_run_sources
          WHERE run_id = p_run_id AND status = 'processing'
        ) THEN 'extracting'
        WHEN EXISTS (
          SELECT 1
          FROM public.understanding_run_sources
          WHERE run_id = p_run_id AND status IN ('failed', 'stale')
        ) THEN 'paused'
        WHEN EXISTS (
          SELECT 1
          FROM public.understanding_run_sources
          WHERE run_id = p_run_id AND status = 'pending'
        ) THEN status
        ELSE 'ready_for_summary'
      END,
      started_at = coalesce(started_at, now()),
      updated_at = now()
  WHERE id = p_run_id
    AND status <> 'completed';
END;
$$;

REVOKE ALL ON FUNCTION public.claim_theme_timeline_source(UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_theme_timeline_source(UUID) TO service_role;

CREATE OR REPLACE FUNCTION public.get_theme_timeline_stale_sources(p_run_id UUID)
RETURNS TABLE(source_id BIGINT)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = ''
AS $$
  SELECT run_source.source_id
  FROM public.understanding_run_sources AS run_source
  WHERE run_source.run_id = p_run_id
    AND run_source.in_date_range
    AND (
      run_source.status = 'stale'
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
  ORDER BY run_source.source_id;
$$;

REVOKE ALL ON FUNCTION public.get_theme_timeline_stale_sources(UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_theme_timeline_stale_sources(UUID) TO service_role;

CREATE OR REPLACE FUNCTION public.complete_theme_timeline_source(
  p_run_id UUID,
  p_source_id BIGINT,
  p_source_hash TEXT,
  p_statement TEXT,
  p_classification TEXT,
  p_evidence_chunk_indexes INTEGER[]
)
RETURNS void
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
  v_observation_id UUID;
  v_expected_evidence_count INTEGER;
  v_inserted_evidence_count INTEGER;
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM public.understanding_run_sources AS run_source
    WHERE run_source.run_id = p_run_id
      AND run_source.source_id = p_source_id
      AND run_source.source_hash = p_source_hash
      AND run_source.status = 'processing'
    FOR UPDATE
  ) THEN
    RAISE EXCEPTION 'Theme timeline source is not currently claimed';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.knowledge_source_settings AS setting
    JOIN public.knowledge_index_jobs AS job USING (source_id)
    WHERE setting.source_id = p_source_id
      AND setting.usage_scope = 'private'
      AND setting.indexed_content_hash = p_source_hash
      AND job.status = 'completed'
  ) THEN
    UPDATE public.understanding_run_sources
    SET status = 'stale',
        last_error = 'Source no longer matches the frozen corpus snapshot',
        updated_at = now()
    WHERE run_id = p_run_id AND source_id = p_source_id;
    RETURN;
  END IF;

  IF p_statement IS NOT NULL THEN
    IF length(trim(p_statement)) NOT BETWEEN 1 AND 2000
       OR p_classification NOT IN ('fact', 'summary', 'inference')
       OR p_evidence_chunk_indexes IS NULL
       OR cardinality(p_evidence_chunk_indexes) < 1
       OR cardinality(p_evidence_chunk_indexes) > 20 THEN
      RAISE EXCEPTION 'Invalid theme timeline observation';
    END IF;

    SELECT count(DISTINCT value)::INTEGER
    INTO v_expected_evidence_count
    FROM unnest(p_evidence_chunk_indexes) AS evidence_index(value);

    INSERT INTO public.understanding_observations (
      run_id,
      source_id,
      source_hash,
      source_date,
      statement,
      classification,
      review_state,
      model_version,
      prompt_version
    )
    SELECT
      run_source.run_id,
      run_source.source_id,
      run_source.source_hash,
      run_source.source_date,
      trim(p_statement),
      p_classification,
      'proposed',
      run.model_version,
      run.prompt_version
    FROM public.understanding_run_sources AS run_source
    JOIN public.understanding_runs AS run ON run.id = run_source.run_id
    WHERE run_source.run_id = p_run_id
      AND run_source.source_id = p_source_id
    ON CONFLICT (run_id, source_id) DO NOTHING
    RETURNING id INTO v_observation_id;

    IF v_observation_id IS NULL THEN
      SELECT observation.id
      INTO v_observation_id
      FROM public.understanding_observations AS observation
      WHERE observation.run_id = p_run_id
        AND observation.source_id = p_source_id;
    END IF;

    INSERT INTO public.understanding_observation_evidence (
      observation_id,
      source_id,
      source_hash,
      chunk_id,
      chunk_index,
      char_start,
      char_end,
      excerpt,
      chunk_content_hash
    )
    SELECT
      v_observation_id,
      p_source_id,
      p_source_hash,
      chunk.id,
      chunk.chunk_index,
      chunk.char_start,
      chunk.char_end,
      chunk.content,
      chunk.content_hash
    FROM public.knowledge_chunks AS chunk
    WHERE chunk.source_id = p_source_id
      AND chunk.chunk_index = ANY (p_evidence_chunk_indexes)
    ON CONFLICT (observation_id, chunk_id) DO NOTHING;

    SELECT count(*)::INTEGER
    INTO v_inserted_evidence_count
    FROM public.understanding_observation_evidence
    WHERE observation_id = v_observation_id;

    IF v_inserted_evidence_count <> v_expected_evidence_count THEN
      RAISE EXCEPTION 'Theme timeline evidence does not match current source chunks';
    END IF;
  ELSIF p_classification IS NOT NULL
        OR coalesce(cardinality(p_evidence_chunk_indexes), 0) <> 0 THEN
    RAISE EXCEPTION 'Irrelevant source cannot include an observation';
  END IF;

  UPDATE public.understanding_run_sources
  SET status = 'completed',
      completed_at = now(),
      last_error = NULL,
      updated_at = now()
  WHERE run_id = p_run_id AND source_id = p_source_id;

  UPDATE public.understanding_runs
  SET status = CASE
        WHEN EXISTS (
          SELECT 1 FROM public.understanding_run_sources
          WHERE run_id = p_run_id AND status IN ('failed', 'stale')
        ) THEN 'paused'
        WHEN EXISTS (
          SELECT 1 FROM public.understanding_run_sources
          WHERE run_id = p_run_id AND status IN ('pending', 'processing')
        ) THEN 'extracting'
        ELSE 'ready_for_summary'
      END,
      updated_at = now()
  WHERE id = p_run_id;
END;
$$;

REVOKE ALL ON FUNCTION public.complete_theme_timeline_source(
  UUID, BIGINT, TEXT, TEXT, TEXT, INTEGER[]
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.complete_theme_timeline_source(
  UUID, BIGINT, TEXT, TEXT, TEXT, INTEGER[]
) TO service_role;

CREATE OR REPLACE FUNCTION public.fail_theme_timeline_source(
  p_run_id UUID,
  p_source_id BIGINT,
  p_error TEXT
)
RETURNS void
LANGUAGE sql
SECURITY INVOKER
SET search_path = ''
AS $$
  WITH failed AS (
    UPDATE public.understanding_run_sources
    SET status = 'failed',
        last_error = left(coalesce(p_error, 'Theme extraction failed'), 1000),
        updated_at = now()
    WHERE run_id = p_run_id
      AND source_id = p_source_id
      AND status = 'processing'
    RETURNING run_id
  )
  UPDATE public.understanding_runs
  SET status = 'paused',
      last_error = 'One or more theme extraction sources failed',
      updated_at = now()
  WHERE id IN (SELECT run_id FROM failed);
$$;

REVOKE ALL ON FUNCTION public.fail_theme_timeline_source(UUID, BIGINT, TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fail_theme_timeline_source(UUID, BIGINT, TEXT) TO service_role;

CREATE OR REPLACE FUNCTION public.release_theme_timeline_source(
  p_run_id UUID,
  p_source_id BIGINT,
  p_reason TEXT
)
RETURNS void
LANGUAGE sql
SECURITY INVOKER
SET search_path = ''
AS $$
  WITH released AS (
    UPDATE public.understanding_run_sources
    SET status = 'pending',
        started_at = NULL,
        last_error = left(coalesce(p_reason, 'Theme extraction paused'), 1000),
        updated_at = now()
    WHERE run_id = p_run_id
      AND source_id = p_source_id
      AND status = 'processing'
    RETURNING run_id
  )
  UPDATE public.understanding_runs
  SET status = 'paused',
      last_error = left(coalesce(p_reason, 'Theme extraction paused'), 1000),
      updated_at = now()
  WHERE id IN (SELECT run_id FROM released);
$$;

REVOKE ALL ON FUNCTION public.release_theme_timeline_source(UUID, BIGINT, TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.release_theme_timeline_source(UUID, BIGINT, TEXT) TO service_role;

CREATE OR REPLACE FUNCTION public.retry_theme_timeline_sources(p_run_id UUID)
RETURNS void
LANGUAGE sql
SECURITY INVOKER
SET search_path = ''
AS $$
  WITH retried AS (
    UPDATE public.understanding_run_sources AS run_source
    SET status = 'pending',
        started_at = NULL,
        completed_at = NULL,
        last_error = NULL,
        updated_at = now()
    WHERE run_source.run_id = p_run_id
      AND run_source.status = 'failed'
      AND EXISTS (
        SELECT 1
        FROM public.knowledge_source_settings AS setting
        JOIN public.knowledge_index_jobs AS job USING (source_id)
        WHERE setting.source_id = run_source.source_id
          AND setting.usage_scope = 'private'
          AND setting.indexed_content_hash = run_source.source_hash
          AND job.status = 'completed'
      )
    RETURNING run_id
  )
  UPDATE public.understanding_runs
  SET status = 'extracting',
      last_error = NULL,
      updated_at = now()
  WHERE id IN (SELECT run_id FROM retried);
$$;

REVOKE ALL ON FUNCTION public.retry_theme_timeline_sources(UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.retry_theme_timeline_sources(UUID) TO service_role;

CREATE OR REPLACE FUNCTION public.finalize_theme_timeline_run(
  p_run_id UUID,
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
  v_expected_count INTEGER;
  v_actual_count INTEGER;
BEGIN
  IF length(trim(coalesce(p_statement, ''))) NOT BETWEEN 1 AND 5000
     OR p_classification NOT IN ('summary', 'inference')
     OR p_observation_ids IS NULL
     OR cardinality(p_observation_ids) > 500 THEN
    RAISE EXCEPTION 'Invalid theme timeline summary';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.understanding_runs
    WHERE id = p_run_id AND status = 'ready_for_summary'
    FOR UPDATE
  ) THEN
    RAISE EXCEPTION 'Theme timeline run is not ready for summary';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.understanding_run_sources
    WHERE run_id = p_run_id
      AND in_date_range
      AND status <> 'completed'
  ) THEN
    RAISE EXCEPTION 'Theme timeline run has incomplete sources';
  END IF;

  SELECT count(DISTINCT value)::INTEGER
  INTO v_expected_count
  FROM unnest(p_observation_ids) AS observation_id(value);

  SELECT count(*)::INTEGER
  INTO v_actual_count
  FROM public.understanding_observations
  WHERE run_id = p_run_id
    AND id = ANY (p_observation_ids);

  IF v_actual_count <> v_expected_count THEN
    RAISE EXCEPTION 'Theme timeline summary references invalid observations';
  END IF;

  INSERT INTO public.understanding_summaries (
    run_id,
    statement,
    classification,
    review_state,
    model_version,
    prompt_version
  )
  SELECT
    id,
    trim(p_statement),
    p_classification,
    'proposed',
    model_version,
    prompt_version
  FROM public.understanding_runs
  WHERE id = p_run_id
  RETURNING id INTO v_summary_id;

  INSERT INTO public.understanding_summary_observations (summary_id, observation_id)
  SELECT v_summary_id, observation.id
  FROM public.understanding_observations AS observation
  WHERE observation.run_id = p_run_id
    AND observation.id = ANY (p_observation_ids)
  ON CONFLICT DO NOTHING;

  UPDATE public.understanding_runs
  SET status = 'completed',
      completed_at = now(),
      last_error = NULL,
      updated_at = now()
  WHERE id = p_run_id;

  RETURN v_summary_id;
END;
$$;

REVOKE ALL ON FUNCTION public.finalize_theme_timeline_run(
  UUID, TEXT, TEXT, UUID[]
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.finalize_theme_timeline_run(
  UUID, TEXT, TEXT, UUID[]
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
