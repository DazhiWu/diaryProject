-- Phase 3D: reviewable period comparisons over one immutable Phase 3C aggregate.
BEGIN;

CREATE TABLE public.understanding_comparisons (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  aggregate_id UUID NOT NULL
    REFERENCES public.understanding_aggregates(id) ON DELETE CASCADE,
  comparison_type TEXT NOT NULL
    CHECK (comparison_type = 'theme_timeline_period_change'),
  status TEXT NOT NULL DEFAULT 'current'
    CHECK (status IN ('current', 'superseded')),
  supersedes_comparison_id UUID
    REFERENCES public.understanding_comparisons(id) ON DELETE SET NULL,
  left_period_start DATE NOT NULL,
  right_period_start DATE NOT NULL,
  left_processed_source_count INTEGER NOT NULL CHECK (left_processed_source_count >= 0),
  right_processed_source_count INTEGER NOT NULL CHECK (right_processed_source_count >= 0),
  left_accepted_observation_count INTEGER NOT NULL CHECK (left_accepted_observation_count >= 0),
  right_accepted_observation_count INTEGER NOT NULL CHECK (right_accepted_observation_count >= 0),
  left_distinct_diary_count INTEGER NOT NULL CHECK (left_distinct_diary_count >= 0),
  right_distinct_diary_count INTEGER NOT NULL CHECK (right_distinct_diary_count >= 0),
  analysis_model_version TEXT NOT NULL CHECK (length(analysis_model_version) BETWEEN 1 AND 200),
  analysis_prompt_version TEXT NOT NULL CHECK (length(analysis_prompt_version) BETWEEN 1 AND 200),
  analysis_config JSONB NOT NULL CHECK (jsonb_typeof(analysis_config) = 'object'),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (EXTRACT(DAY FROM left_period_start) = 1),
  CHECK (EXTRACT(DAY FROM right_period_start) = 1),
  CHECK (left_period_start < right_period_start)
);

CREATE UNIQUE INDEX understanding_comparisons_one_current_pair_idx
  ON public.understanding_comparisons (
    aggregate_id,
    left_period_start,
    right_period_start
  )
  WHERE status = 'current';

CREATE INDEX understanding_comparisons_aggregate_created_idx
  ON public.understanding_comparisons (aggregate_id, created_at DESC, id DESC);

CREATE INDEX understanding_comparisons_supersedes_idx
  ON public.understanding_comparisons (supersedes_comparison_id)
  WHERE supersedes_comparison_id IS NOT NULL;

CREATE TABLE public.understanding_comparison_findings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  comparison_id UUID NOT NULL
    REFERENCES public.understanding_comparisons(id) ON DELETE CASCADE,
  position INTEGER NOT NULL CHECK (position BETWEEN 1 AND 12),
  finding_type TEXT NOT NULL
    CHECK (finding_type IN ('continuity', 'change', 'possible_contradiction', 'turning_point')),
  statement TEXT NOT NULL CHECK (length(trim(statement)) BETWEEN 1 AND 2000),
  classification TEXT NOT NULL CHECK (classification IN ('fact', 'summary', 'inference')),
  review_state TEXT NOT NULL DEFAULT 'proposed'
    CHECK (review_state IN ('proposed', 'confirmed', 'edited', 'rejected')),
  reviewed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (comparison_id, position),
  CHECK (
    finding_type NOT IN ('possible_contradiction', 'turning_point')
    OR classification = 'inference'
  )
);

CREATE INDEX understanding_comparison_findings_comparison_idx
  ON public.understanding_comparison_findings (comparison_id, position, id);

CREATE TABLE public.understanding_comparison_finding_observations (
  finding_id UUID NOT NULL
    REFERENCES public.understanding_comparison_findings(id) ON DELETE CASCADE,
  aggregate_id UUID NOT NULL,
  observation_id UUID NOT NULL,
  period_side TEXT NOT NULL CHECK (period_side IN ('left', 'right')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (finding_id, period_side, observation_id),
  FOREIGN KEY (aggregate_id, observation_id)
    REFERENCES public.understanding_aggregate_observations(aggregate_id, observation_id)
    ON DELETE CASCADE
);

CREATE INDEX understanding_comparison_finding_observations_aggregate_idx
  ON public.understanding_comparison_finding_observations (
    aggregate_id,
    observation_id,
    finding_id
  );

CREATE TABLE public.understanding_comparison_finding_reviews (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  finding_id UUID NOT NULL
    REFERENCES public.understanding_comparison_findings(id) ON DELETE CASCADE,
  action TEXT NOT NULL CHECK (action IN ('confirm', 'edit', 'reject')),
  previous_statement TEXT NOT NULL CHECK (length(trim(previous_statement)) BETWEEN 1 AND 2000),
  previous_classification TEXT NOT NULL
    CHECK (previous_classification IN ('fact', 'summary', 'inference')),
  previous_review_state TEXT NOT NULL
    CHECK (previous_review_state IN ('proposed', 'confirmed', 'edited')),
  resulting_statement TEXT NOT NULL CHECK (length(trim(resulting_statement)) BETWEEN 1 AND 2000),
  resulting_classification TEXT NOT NULL
    CHECK (resulting_classification IN ('fact', 'summary', 'inference')),
  resulting_review_state TEXT NOT NULL
    CHECK (resulting_review_state IN ('confirmed', 'edited', 'rejected')),
  reviewed_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX understanding_comparison_finding_reviews_finding_idx
  ON public.understanding_comparison_finding_reviews (finding_id, reviewed_at DESC, id DESC);

ALTER TABLE public.understanding_comparisons ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.understanding_comparison_findings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.understanding_comparison_finding_observations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.understanding_comparison_finding_reviews ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE
  public.understanding_comparisons,
  public.understanding_comparison_findings,
  public.understanding_comparison_finding_observations,
  public.understanding_comparison_finding_reviews
FROM PUBLIC, anon, authenticated;

REVOKE ALL ON SEQUENCE public.understanding_comparison_finding_reviews_id_seq
FROM PUBLIC, anon, authenticated;

GRANT SELECT, INSERT, UPDATE ON TABLE
  public.understanding_comparisons,
  public.understanding_comparison_findings,
  public.understanding_comparison_finding_observations,
  public.understanding_comparison_finding_reviews
TO service_role;

GRANT USAGE, SELECT ON SEQUENCE public.understanding_comparison_finding_reviews_id_seq
TO service_role;

CREATE OR REPLACE FUNCTION public.store_theme_timeline_period_comparison(
  p_aggregate_id UUID,
  p_left_period_start DATE,
  p_right_period_start DATE,
  p_previous_comparison_id UUID,
  p_analysis_model_version TEXT,
  p_analysis_prompt_version TEXT,
  p_analysis_config JSONB,
  p_findings JSONB
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
  v_aggregate public.understanding_aggregates%ROWTYPE;
  v_left_period public.understanding_aggregate_periods%ROWTYPE;
  v_right_period public.understanding_aggregate_periods%ROWTYPE;
  v_current_comparison_id UUID;
  v_comparison_id UUID;
  v_finding_id UUID;
  v_item RECORD;
  v_finding JSONB;
  v_position INTEGER;
  v_finding_type TEXT;
  v_statement TEXT;
  v_classification TEXT;
  v_observation_id UUID;
  v_observation_id_text TEXT;
BEGIN
  SELECT *
  INTO v_aggregate
  FROM public.understanding_aggregates
  WHERE id = p_aggregate_id
  FOR UPDATE;

  IF NOT FOUND OR v_aggregate.status <> 'current' THEN
    RAISE EXCEPTION 'Theme timeline aggregate is not current';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.get_theme_timeline_aggregate_stale_reasons(p_aggregate_id)
  ) THEN
    RAISE EXCEPTION 'Stale theme timeline aggregate cannot be compared';
  END IF;

  IF p_left_period_start IS NULL
     OR p_right_period_start IS NULL
     OR EXTRACT(DAY FROM p_left_period_start) <> 1
     OR EXTRACT(DAY FROM p_right_period_start) <> 1
     OR p_left_period_start >= p_right_period_start THEN
    RAISE EXCEPTION 'Theme timeline comparison periods are invalid';
  END IF;

  SELECT *
  INTO v_left_period
  FROM public.understanding_aggregate_periods
  WHERE aggregate_id = p_aggregate_id
    AND period_start = p_left_period_start;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Theme timeline left comparison period is missing';
  END IF;

  SELECT *
  INTO v_right_period
  FROM public.understanding_aggregate_periods
  WHERE aggregate_id = p_aggregate_id
    AND period_start = p_right_period_start;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Theme timeline right comparison period is missing';
  END IF;

  IF v_left_period.accepted_observation_count = 0
     OR v_right_period.accepted_observation_count = 0 THEN
    RAISE EXCEPTION 'Theme timeline comparison periods need reviewed observations';
  END IF;

  IF length(trim(coalesce(p_analysis_model_version, ''))) NOT BETWEEN 1 AND 200
     OR length(trim(coalesce(p_analysis_prompt_version, ''))) NOT BETWEEN 1 AND 200
     OR p_analysis_config IS NULL
     OR jsonb_typeof(p_analysis_config) <> 'object' THEN
    RAISE EXCEPTION 'Theme timeline comparison generation metadata is invalid';
  END IF;

  IF p_findings IS NULL
     OR jsonb_typeof(p_findings) <> 'array'
     OR jsonb_array_length(p_findings) NOT BETWEEN 1 AND 12 THEN
    RAISE EXCEPTION 'Theme timeline comparison findings are invalid';
  END IF;

  LOCK TABLE
    public.understanding_aggregate_periods,
    public.understanding_aggregate_observations,
    public.understanding_comparisons,
    public.understanding_comparison_findings,
    public.understanding_comparison_finding_observations
  IN SHARE ROW EXCLUSIVE MODE;

  SELECT comparison.id
  INTO v_current_comparison_id
  FROM public.understanding_comparisons AS comparison
  WHERE comparison.aggregate_id = p_aggregate_id
    AND comparison.left_period_start = p_left_period_start
    AND comparison.right_period_start = p_right_period_start
    AND comparison.status = 'current'
  ORDER BY comparison.created_at DESC, comparison.id DESC
  LIMIT 1
  FOR UPDATE;

  IF v_current_comparison_id IS DISTINCT FROM p_previous_comparison_id THEN
    RAISE EXCEPTION 'Theme timeline comparison history changed';
  END IF;

  IF v_current_comparison_id IS NOT NULL THEN
    UPDATE public.understanding_comparisons
    SET status = 'superseded'
    WHERE id = v_current_comparison_id;
  END IF;

  INSERT INTO public.understanding_comparisons (
    aggregate_id,
    comparison_type,
    status,
    supersedes_comparison_id,
    left_period_start,
    right_period_start,
    left_processed_source_count,
    right_processed_source_count,
    left_accepted_observation_count,
    right_accepted_observation_count,
    left_distinct_diary_count,
    right_distinct_diary_count,
    analysis_model_version,
    analysis_prompt_version,
    analysis_config
  ) VALUES (
    p_aggregate_id,
    'theme_timeline_period_change',
    'current',
    v_current_comparison_id,
    p_left_period_start,
    p_right_period_start,
    v_left_period.processed_source_count,
    v_right_period.processed_source_count,
    v_left_period.accepted_observation_count,
    v_right_period.accepted_observation_count,
    v_left_period.distinct_diary_count,
    v_right_period.distinct_diary_count,
    trim(p_analysis_model_version),
    trim(p_analysis_prompt_version),
    p_analysis_config
  )
  RETURNING id INTO v_comparison_id;

  FOR v_item IN
    SELECT item.value, item.ordinality
    FROM jsonb_array_elements(p_findings) WITH ORDINALITY AS item(value, ordinality)
  LOOP
    v_finding := v_item.value;
    v_position := v_item.ordinality::INTEGER;

    IF jsonb_typeof(v_finding) <> 'object'
       OR (SELECT count(*) FROM jsonb_object_keys(v_finding)) <> 5
       OR EXISTS (
         SELECT 1
         FROM jsonb_object_keys(v_finding) AS field_name
         WHERE field_name NOT IN (
           'findingType',
           'statement',
           'classification',
           'leftObservationIds',
           'rightObservationIds'
         )
       ) THEN
      RAISE EXCEPTION 'Theme timeline comparison finding shape is invalid';
    END IF;

    v_finding_type := v_finding ->> 'findingType';
    v_statement := trim(coalesce(v_finding ->> 'statement', ''));
    v_classification := v_finding ->> 'classification';

    IF v_finding_type NOT IN ('continuity', 'change', 'possible_contradiction', 'turning_point')
       OR length(v_statement) NOT BETWEEN 1 AND 2000
       OR v_classification NOT IN ('fact', 'summary', 'inference')
       OR (
         v_finding_type IN ('possible_contradiction', 'turning_point')
         AND v_classification <> 'inference'
       )
       OR jsonb_typeof(v_finding -> 'leftObservationIds') <> 'array'
       OR jsonb_typeof(v_finding -> 'rightObservationIds') <> 'array'
       OR jsonb_array_length(v_finding -> 'leftObservationIds') NOT BETWEEN 1 AND 100
       OR jsonb_array_length(v_finding -> 'rightObservationIds') NOT BETWEEN 1 AND 100 THEN
      RAISE EXCEPTION 'Theme timeline comparison finding content is invalid';
    END IF;

    INSERT INTO public.understanding_comparison_findings (
      comparison_id,
      position,
      finding_type,
      statement,
      classification,
      review_state
    ) VALUES (
      v_comparison_id,
      v_position,
      v_finding_type,
      v_statement,
      v_classification,
      'proposed'
    )
    RETURNING id INTO v_finding_id;

    FOR v_observation_id_text IN
      SELECT jsonb_array_elements_text(v_finding -> 'leftObservationIds')
    LOOP
      v_observation_id := v_observation_id_text::UUID;
      IF NOT EXISTS (
        SELECT 1
        FROM public.understanding_aggregate_observations AS observation
        WHERE observation.aggregate_id = p_aggregate_id
          AND observation.observation_id = v_observation_id
          AND date_trunc('month', observation.source_date)::DATE = p_left_period_start
      ) THEN
        RAISE EXCEPTION 'Theme timeline comparison references an invalid left observation';
      END IF;

      INSERT INTO public.understanding_comparison_finding_observations (
        finding_id,
        aggregate_id,
        observation_id,
        period_side
      ) VALUES (
        v_finding_id,
        p_aggregate_id,
        v_observation_id,
        'left'
      );
    END LOOP;

    FOR v_observation_id_text IN
      SELECT jsonb_array_elements_text(v_finding -> 'rightObservationIds')
    LOOP
      v_observation_id := v_observation_id_text::UUID;
      IF NOT EXISTS (
        SELECT 1
        FROM public.understanding_aggregate_observations AS observation
        WHERE observation.aggregate_id = p_aggregate_id
          AND observation.observation_id = v_observation_id
          AND date_trunc('month', observation.source_date)::DATE = p_right_period_start
      ) THEN
        RAISE EXCEPTION 'Theme timeline comparison references an invalid right observation';
      END IF;

      INSERT INTO public.understanding_comparison_finding_observations (
        finding_id,
        aggregate_id,
        observation_id,
        period_side
      ) VALUES (
        v_finding_id,
        p_aggregate_id,
        v_observation_id,
        'right'
      );
    END LOOP;
  END LOOP;

  RETURN v_comparison_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.review_theme_timeline_comparison_finding(
  p_finding_id UUID,
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
  v_finding public.understanding_comparison_findings%ROWTYPE;
  v_comparison public.understanding_comparisons%ROWTYPE;
  v_resulting_statement TEXT;
  v_resulting_classification TEXT;
  v_resulting_review_state TEXT;
BEGIN
  SELECT *
  INTO v_finding
  FROM public.understanding_comparison_findings
  WHERE id = p_finding_id
  FOR UPDATE;

  IF NOT FOUND OR v_finding.review_state = 'rejected' THEN
    RAISE EXCEPTION 'Theme timeline comparison finding is not reviewable';
  END IF;

  SELECT *
  INTO v_comparison
  FROM public.understanding_comparisons
  WHERE id = v_finding.comparison_id
  FOR UPDATE;

  IF NOT FOUND OR v_comparison.status <> 'current' THEN
    RAISE EXCEPTION 'Theme timeline comparison is not current';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.get_theme_timeline_comparison_stale_reasons(v_comparison.id)
  ) THEN
    RAISE EXCEPTION 'Stale theme timeline comparison cannot be reviewed';
  END IF;

  IF p_action = 'confirm' THEN
    v_resulting_statement := v_finding.statement;
    v_resulting_classification := v_finding.classification;
    v_resulting_review_state := 'confirmed';
  ELSIF p_action = 'edit' THEN
    v_resulting_statement := trim(coalesce(p_statement, ''));
    v_resulting_classification := p_classification;
    v_resulting_review_state := 'edited';

    IF length(v_resulting_statement) NOT BETWEEN 1 AND 2000
       OR v_resulting_classification NOT IN ('fact', 'summary', 'inference')
       OR (
         v_finding.finding_type IN ('possible_contradiction', 'turning_point')
         AND v_resulting_classification <> 'inference'
       ) THEN
      RAISE EXCEPTION 'Theme timeline comparison finding edit is invalid';
    END IF;
  ELSIF p_action = 'reject' THEN
    v_resulting_statement := v_finding.statement;
    v_resulting_classification := v_finding.classification;
    v_resulting_review_state := 'rejected';
  ELSE
    RAISE EXCEPTION 'Invalid theme timeline comparison finding action';
  END IF;

  INSERT INTO public.understanding_comparison_finding_reviews (
    finding_id,
    action,
    previous_statement,
    previous_classification,
    previous_review_state,
    resulting_statement,
    resulting_classification,
    resulting_review_state
  ) VALUES (
    v_finding.id,
    p_action,
    v_finding.statement,
    v_finding.classification,
    v_finding.review_state,
    v_resulting_statement,
    v_resulting_classification,
    v_resulting_review_state
  );

  UPDATE public.understanding_comparison_findings
  SET statement = v_resulting_statement,
      classification = v_resulting_classification,
      review_state = v_resulting_review_state,
      reviewed_at = now(),
      updated_at = now()
  WHERE id = v_finding.id;

  RETURN v_comparison.id;
END;
$$;

CREATE OR REPLACE FUNCTION public.get_theme_timeline_comparison_stale_reasons(
  p_comparison_id UUID
)
RETURNS TABLE(reason TEXT)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = ''
AS $$
  WITH target AS (
    SELECT comparison.*, aggregate.status AS aggregate_status
    FROM public.understanding_comparisons AS comparison
    JOIN public.understanding_aggregates AS aggregate
      ON aggregate.id = comparison.aggregate_id
    WHERE comparison.id = p_comparison_id
  )
  SELECT 'comparison_superseded'::TEXT
  FROM target
  WHERE status <> 'current'

  UNION ALL

  SELECT 'aggregate_changed'::TEXT
  FROM target
  WHERE aggregate_status <> 'current'
     OR EXISTS (
       SELECT 1
       FROM public.get_theme_timeline_aggregate_stale_reasons(target.aggregate_id)
     )

  UNION ALL

  SELECT 'period_snapshot_changed'::TEXT
  FROM target
  WHERE NOT EXISTS (
    SELECT 1
    FROM public.understanding_aggregate_periods AS period
    WHERE period.aggregate_id = target.aggregate_id
      AND period.period_start = target.left_period_start
      AND period.processed_source_count = target.left_processed_source_count
      AND period.accepted_observation_count = target.left_accepted_observation_count
      AND period.distinct_diary_count = target.left_distinct_diary_count
  ) OR NOT EXISTS (
    SELECT 1
    FROM public.understanding_aggregate_periods AS period
    WHERE period.aggregate_id = target.aggregate_id
      AND period.period_start = target.right_period_start
      AND period.processed_source_count = target.right_processed_source_count
      AND period.accepted_observation_count = target.right_accepted_observation_count
      AND period.distinct_diary_count = target.right_distinct_diary_count
  )

  UNION ALL

  SELECT 'finding_links_changed'::TEXT
  FROM target
  WHERE EXISTS (
    SELECT 1
    FROM public.understanding_comparison_findings AS finding
    WHERE finding.comparison_id = target.id
      AND (
        NOT EXISTS (
          SELECT 1
          FROM public.understanding_comparison_finding_observations AS link
          JOIN public.understanding_aggregate_observations AS observation
            ON observation.aggregate_id = link.aggregate_id
           AND observation.observation_id = link.observation_id
          WHERE link.finding_id = finding.id
            AND link.aggregate_id = target.aggregate_id
            AND link.period_side = 'left'
            AND date_trunc('month', observation.source_date)::DATE = target.left_period_start
        )
        OR NOT EXISTS (
          SELECT 1
          FROM public.understanding_comparison_finding_observations AS link
          JOIN public.understanding_aggregate_observations AS observation
            ON observation.aggregate_id = link.aggregate_id
           AND observation.observation_id = link.observation_id
          WHERE link.finding_id = finding.id
            AND link.aggregate_id = target.aggregate_id
            AND link.period_side = 'right'
            AND date_trunc('month', observation.source_date)::DATE = target.right_period_start
        )
      )
  );
$$;

REVOKE ALL ON FUNCTION public.store_theme_timeline_period_comparison(
  UUID, DATE, DATE, UUID, TEXT, TEXT, JSONB, JSONB
) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.review_theme_timeline_comparison_finding(
  UUID, TEXT, TEXT, TEXT
) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.get_theme_timeline_comparison_stale_reasons(UUID)
FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.store_theme_timeline_period_comparison(
  UUID, DATE, DATE, UUID, TEXT, TEXT, JSONB, JSONB
) TO service_role;
GRANT EXECUTE ON FUNCTION public.review_theme_timeline_comparison_finding(
  UUID, TEXT, TEXT, TEXT
) TO service_role;
GRANT EXECUTE ON FUNCTION public.get_theme_timeline_comparison_stale_reasons(UUID)
TO service_role;

COMMIT;
