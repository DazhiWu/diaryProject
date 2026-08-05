-- Phase 3A v4: frozen theme contracts, precise sentence evidence, uncertain scope,
-- and reviewed-observation-only first summary generation.
BEGIN;

ALTER TABLE public.understanding_runs
  DROP CONSTRAINT understanding_runs_status_check;

ALTER TABLE public.understanding_runs
  ADD CONSTRAINT understanding_runs_status_check
  CHECK (status IN (
    'pending',
    'extracting',
    'paused',
    'ready_for_summary',
    'awaiting_review',
    'completed',
    'failed'
  ));

ALTER TABLE public.understanding_observation_evidence
  DROP CONSTRAINT understanding_observation_evidence_observation_id_chunk_id_key;

ALTER TABLE public.understanding_observation_evidence
  ADD CONSTRAINT understanding_observation_evidence_precise_range_key
  UNIQUE (observation_id, chunk_id, char_start, char_end);

CREATE TABLE public.understanding_run_semantic_configs (
  run_id UUID PRIMARY KEY
    REFERENCES public.understanding_runs(id) ON DELETE CASCADE,
  pipeline_version TEXT NOT NULL
    CHECK (length(pipeline_version) BETWEEN 1 AND 200),
  theme_spec JSONB NOT NULL
    CHECK (
      jsonb_typeof(theme_spec) = 'object'
      AND jsonb_typeof(theme_spec -> 'name') = 'string'
      AND jsonb_typeof(theme_spec -> 'definition') = 'string'
      AND jsonb_typeof(theme_spec -> 'include') = 'array'
      AND jsonb_typeof(theme_spec -> 'exclude') = 'array'
      AND jsonb_typeof(theme_spec -> 'ambiguous') = 'array'
      AND length(trim(theme_spec ->> 'name')) BETWEEN 1 AND 120
      AND length(trim(theme_spec ->> 'definition')) BETWEEN 1 AND 1000
      AND jsonb_array_length(theme_spec -> 'include') BETWEEN 1 AND 12
      AND jsonb_array_length(theme_spec -> 'exclude') BETWEEN 0 AND 12
      AND jsonb_array_length(theme_spec -> 'ambiguous') BETWEEN 0 AND 12
    ),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE public.understanding_observation_scopes (
  observation_id UUID PRIMARY KEY
    REFERENCES public.understanding_observations(id) ON DELETE CASCADE,
  decision TEXT NOT NULL CHECK (decision IN ('relevant', 'uncertain')),
  reason TEXT NOT NULL CHECK (length(trim(reason)) BETWEEN 1 AND 500),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.understanding_run_semantic_configs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.understanding_observation_scopes ENABLE ROW LEVEL SECURITY;

REVOKE ALL PRIVILEGES ON TABLE
  public.understanding_run_semantic_configs,
  public.understanding_observation_scopes
FROM PUBLIC, anon, authenticated;

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE
  public.understanding_run_semantic_configs,
  public.understanding_observation_scopes
TO service_role;

CREATE OR REPLACE FUNCTION public.create_theme_timeline_run_v4(
  p_theme TEXT,
  p_theme_spec JSONB,
  p_pipeline_version TEXT,
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
  IF p_theme_spec IS NULL
     OR jsonb_typeof(p_theme_spec) <> 'object'
     OR jsonb_typeof(p_theme_spec -> 'name') <> 'string'
     OR jsonb_typeof(p_theme_spec -> 'definition') <> 'string'
     OR jsonb_typeof(p_theme_spec -> 'include') <> 'array'
     OR jsonb_typeof(p_theme_spec -> 'exclude') <> 'array'
     OR jsonb_typeof(p_theme_spec -> 'ambiguous') <> 'array'
     OR jsonb_array_length(p_theme_spec -> 'include') < 1
     OR jsonb_array_length(p_theme_spec -> 'include') > 12
     OR jsonb_array_length(p_theme_spec -> 'exclude') > 12
     OR jsonb_array_length(p_theme_spec -> 'ambiguous') > 12
     OR length(trim(p_theme_spec ->> 'name')) NOT BETWEEN 1 AND 120
     OR length(trim(p_theme_spec ->> 'definition')) NOT BETWEEN 1 AND 1000
     OR (SELECT count(*) FROM jsonb_object_keys(p_theme_spec)) <> 5
     OR EXISTS (
       SELECT 1
       FROM jsonb_array_elements(
         (p_theme_spec -> 'include')
         || (p_theme_spec -> 'exclude')
         || (p_theme_spec -> 'ambiguous')
       ) AS rule(value)
       WHERE jsonb_typeof(rule.value) <> 'string'
         OR length(trim(rule.value #>> '{}')) NOT BETWEEN 1 AND 400
     )
     OR length(trim(coalesce(p_pipeline_version, ''))) NOT BETWEEN 1 AND 200 THEN
    RAISE EXCEPTION 'Invalid theme timeline semantic config';
  END IF;

  v_run_id := public.create_theme_timeline_run_with_config(
    p_theme,
    p_start_date,
    p_end_date,
    p_expected_source_count,
    p_expected_fingerprint,
    p_model_version,
    p_prompt_version,
    p_generation_config
  );

  INSERT INTO public.understanding_run_semantic_configs (
    run_id,
    pipeline_version,
    theme_spec
  ) VALUES (
    v_run_id,
    trim(p_pipeline_version),
    p_theme_spec
  );

  RETURN v_run_id;
END;
$$;

REVOKE ALL ON FUNCTION public.create_theme_timeline_run_v4(
  TEXT, JSONB, TEXT, DATE, DATE, INTEGER, TEXT, TEXT, TEXT, JSONB
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.create_theme_timeline_run_v4(
  TEXT, JSONB, TEXT, DATE, DATE, INTEGER, TEXT, TEXT, TEXT, JSONB
) TO service_role;

CREATE OR REPLACE FUNCTION public.complete_theme_timeline_source_v4(
  p_run_id UUID,
  p_source_id BIGINT,
  p_source_hash TEXT,
  p_scope_decision TEXT,
  p_scope_reason TEXT,
  p_statement TEXT,
  p_classification TEXT,
  p_evidence_units JSONB
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
    JOIN public.understanding_run_semantic_configs AS semantic
      ON semantic.run_id = run_source.run_id
    WHERE run_source.run_id = p_run_id
      AND run_source.source_id = p_source_id
      AND run_source.source_hash = p_source_hash
      AND run_source.status = 'processing'
      AND semantic.pipeline_version = 'theme-timeline-semantic-v4'
    FOR UPDATE OF run_source
  ) THEN
    RAISE EXCEPTION 'Theme timeline v4 source is not currently claimed';
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

  IF p_statement IS NULL THEN
    IF p_scope_decision IS NOT NULL
       OR p_scope_reason IS NOT NULL
       OR p_classification IS NOT NULL
       OR p_evidence_units IS NULL
       OR jsonb_typeof(p_evidence_units) <> 'array'
       OR jsonb_array_length(p_evidence_units) <> 0 THEN
      RAISE EXCEPTION 'Irrelevant v4 source cannot include an observation';
    END IF;
  ELSE
    IF p_scope_decision NOT IN ('relevant', 'uncertain')
       OR length(trim(coalesce(p_scope_reason, ''))) NOT BETWEEN 1 AND 500
       OR length(trim(p_statement)) NOT BETWEEN 1 AND 2000
       OR p_classification NOT IN ('fact', 'summary', 'inference')
       OR p_evidence_units IS NULL
       OR jsonb_typeof(p_evidence_units) <> 'array'
       OR jsonb_array_length(p_evidence_units) NOT BETWEEN 1 AND 20 THEN
      RAISE EXCEPTION 'Invalid v4 theme timeline observation';
    END IF;

    SELECT count(*)::INTEGER
    INTO v_expected_evidence_count
    FROM jsonb_to_recordset(p_evidence_units) AS evidence(
      "unitId" TEXT,
      "chunkId" BIGINT,
      "chunkIndex" INTEGER,
      "charStart" INTEGER,
      "charEnd" INTEGER,
      excerpt TEXT,
      "chunkContentHash" TEXT
    )
    JOIN public.knowledge_chunks AS chunk
      ON chunk.id = evidence."chunkId"
     AND chunk.source_id = p_source_id
     AND chunk.chunk_index = evidence."chunkIndex"
     AND chunk.content_hash = evidence."chunkContentHash"
     AND evidence."unitId" = (
       'c' || evidence."chunkIndex"::TEXT || ':'
       || evidence."charStart"::TEXT || '-' || evidence."charEnd"::TEXT
     )
     AND evidence."charStart" >= chunk.char_start
     AND evidence."charEnd" <= chunk.char_end
     AND evidence."charEnd" > evidence."charStart"
     AND evidence.excerpt = substring(
       chunk.content
       FROM evidence."charStart" - chunk.char_start + 1
       FOR evidence."charEnd" - evidence."charStart"
     );

    IF v_expected_evidence_count <> jsonb_array_length(p_evidence_units)
       OR v_expected_evidence_count <> (
         SELECT count(DISTINCT evidence."unitId")
         FROM jsonb_to_recordset(p_evidence_units) AS evidence("unitId" TEXT)
       ) THEN
      RAISE EXCEPTION 'V4 theme timeline evidence does not match current source text';
    END IF;

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
      RAISE EXCEPTION 'V4 theme timeline observation already exists';
    END IF;

    INSERT INTO public.understanding_observation_scopes (
      observation_id,
      decision,
      reason
    ) VALUES (
      v_observation_id,
      p_scope_decision,
      trim(p_scope_reason)
    );

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
      evidence."chunkId",
      evidence."chunkIndex",
      evidence."charStart",
      evidence."charEnd",
      evidence.excerpt,
      evidence."chunkContentHash"
    FROM jsonb_to_recordset(p_evidence_units) AS evidence(
      "unitId" TEXT,
      "chunkId" BIGINT,
      "chunkIndex" INTEGER,
      "charStart" INTEGER,
      "charEnd" INTEGER,
      excerpt TEXT,
      "chunkContentHash" TEXT
    );

    SELECT count(*)::INTEGER
    INTO v_inserted_evidence_count
    FROM public.understanding_observation_evidence
    WHERE observation_id = v_observation_id;

    IF v_inserted_evidence_count <> v_expected_evidence_count THEN
      RAISE EXCEPTION 'V4 theme timeline evidence persistence is incomplete';
    END IF;
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
        ELSE 'awaiting_review'
      END,
      last_error = NULL,
      updated_at = now()
  WHERE id = p_run_id;
END;
$$;

REVOKE ALL ON FUNCTION public.complete_theme_timeline_source_v4(
  UUID, BIGINT, TEXT, TEXT, TEXT, TEXT, TEXT, JSONB
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.complete_theme_timeline_source_v4(
  UUID, BIGINT, TEXT, TEXT, TEXT, TEXT, TEXT, JSONB
) TO service_role;

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
      AND run.status IN ('awaiting_review', 'completed')
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

CREATE OR REPLACE FUNCTION public.finalize_reviewed_theme_timeline_run_v4(
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
  v_accepted_count INTEGER;
BEGIN
  IF length(trim(coalesce(p_statement, ''))) NOT BETWEEN 1 AND 5000
     OR p_classification NOT IN ('summary', 'inference')
     OR p_observation_ids IS NULL
     OR cardinality(p_observation_ids) > 500 THEN
    RAISE EXCEPTION 'Invalid reviewed theme timeline summary';
  END IF;

  PERFORM 1
  FROM public.understanding_runs AS run
  JOIN public.understanding_run_semantic_configs AS semantic ON semantic.run_id = run.id
  WHERE run.id = p_run_id
    AND run.status = 'awaiting_review'
    AND semantic.pipeline_version = 'theme-timeline-semantic-v4'
  FOR UPDATE OF run;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Theme timeline v4 run is not awaiting review completion';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.understanding_run_sources
    WHERE run_id = p_run_id AND in_date_range AND status <> 'completed'
  ) OR EXISTS (
    SELECT 1 FROM public.understanding_observations
    WHERE run_id = p_run_id
      AND review_state NOT IN ('confirmed', 'edited', 'rejected')
  ) OR EXISTS (
    SELECT 1 FROM public.understanding_summaries WHERE run_id = p_run_id
  ) THEN
    RAISE EXCEPTION 'Theme timeline v4 run is not ready for its first summary';
  END IF;

  SELECT count(DISTINCT value)::INTEGER
  INTO v_expected_count
  FROM unnest(p_observation_ids) AS observation_id(value);

  IF v_expected_count <> cardinality(p_observation_ids) THEN
    RAISE EXCEPTION 'Reviewed theme timeline summary has duplicate observations';
  END IF;

  SELECT count(*)::INTEGER
  INTO v_accepted_count
  FROM public.understanding_observations
  WHERE run_id = p_run_id
    AND review_state IN ('confirmed', 'edited');

  IF v_accepted_count <> v_expected_count
     OR v_expected_count <> (
       SELECT count(*)::INTEGER
       FROM public.understanding_observations
       WHERE run_id = p_run_id
         AND review_state IN ('confirmed', 'edited')
         AND id = ANY (p_observation_ids)
     ) THEN
    RAISE EXCEPTION 'Reviewed theme timeline summary must include every accepted observation';
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
    AND observation.review_state IN ('confirmed', 'edited')
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

REVOKE ALL ON FUNCTION public.finalize_reviewed_theme_timeline_run_v4(
  UUID, TEXT, TEXT, UUID[]
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.finalize_reviewed_theme_timeline_run_v4(
  UUID, TEXT, TEXT, UUID[]
) TO service_role;

COMMIT;
