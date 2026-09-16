-- Read-only Phase 3D schema, privilege, provenance, and review checks.
BEGIN;
SET TRANSACTION READ ONLY;

DO $$
DECLARE
  v_table REGCLASS;
  v_function REGPROCEDURE;
BEGIN
  FOREACH v_table IN ARRAY ARRAY[
    'public.understanding_comparisons'::REGCLASS,
    'public.understanding_comparison_findings'::REGCLASS,
    'public.understanding_comparison_finding_observations'::REGCLASS,
    'public.understanding_comparison_finding_reviews'::REGCLASS
  ] LOOP
    IF NOT EXISTS (
      SELECT 1 FROM pg_class WHERE oid = v_table AND relrowsecurity
    ) THEN
      RAISE EXCEPTION 'Phase 3D table % must have RLS enabled', v_table;
    END IF;

    IF has_table_privilege('anon', v_table, 'SELECT')
       OR has_table_privilege('authenticated', v_table, 'SELECT')
       OR has_table_privilege('anon', v_table, 'INSERT')
       OR has_table_privilege('authenticated', v_table, 'INSERT')
       OR EXISTS (
         SELECT 1
         FROM pg_class AS relation
         CROSS JOIN LATERAL aclexplode(
           coalesce(relation.relacl, acldefault('r', relation.relowner))
         ) AS acl
         WHERE relation.oid = v_table
           AND acl.grantee = 0
           AND acl.privilege_type IN ('SELECT', 'INSERT', 'UPDATE', 'DELETE')
       ) THEN
      RAISE EXCEPTION 'Phase 3D table % exposes browser privileges', v_table;
    END IF;

    IF NOT has_table_privilege('service_role', v_table, 'SELECT') THEN
      RAISE EXCEPTION 'Phase 3D table % is unavailable to service_role', v_table;
    END IF;
  END LOOP;

  FOREACH v_function IN ARRAY ARRAY[
    'public.store_theme_timeline_period_comparison(uuid,date,date,uuid,text,text,jsonb,jsonb)'::REGPROCEDURE,
    'public.review_theme_timeline_comparison_finding(uuid,text,text,text)'::REGPROCEDURE,
    'public.get_theme_timeline_comparison_stale_reasons(uuid)'::REGPROCEDURE
  ] LOOP
    IF EXISTS (SELECT 1 FROM pg_proc WHERE oid = v_function AND prosecdef) THEN
      RAISE EXCEPTION 'Phase 3D function % must remain SECURITY INVOKER', v_function;
    END IF;

    IF has_function_privilege('anon', v_function, 'EXECUTE')
       OR has_function_privilege('authenticated', v_function, 'EXECUTE')
       OR EXISTS (
         SELECT 1
         FROM pg_proc AS procedure
         CROSS JOIN LATERAL aclexplode(
           coalesce(procedure.proacl, acldefault('f', procedure.proowner))
         ) AS acl
         WHERE procedure.oid = v_function
           AND acl.grantee = 0
           AND acl.privilege_type = 'EXECUTE'
       )
       OR NOT has_function_privilege('service_role', v_function, 'EXECUTE') THEN
      RAISE EXCEPTION 'Phase 3D function % has invalid EXECUTE grants', v_function;
    END IF;
  END LOOP;

  IF EXISTS (
    SELECT 1
    FROM pg_index
    WHERE indexrelid IN (
      'public.understanding_comparisons_one_current_pair_idx'::REGCLASS,
      'public.understanding_comparisons_supersedes_idx'::REGCLASS,
      'public.understanding_comparison_finding_observations_aggregate_idx'::REGCLASS,
      'public.understanding_comparison_finding_reviews_finding_idx'::REGCLASS
    )
      AND (NOT indisvalid OR NOT indisready)
  ) THEN
    RAISE EXCEPTION 'One or more Phase 3D indexes are not valid and ready';
  END IF;

  IF EXISTS (
    SELECT aggregate_id, left_period_start, right_period_start
    FROM public.understanding_comparisons
    WHERE status = 'current'
    GROUP BY aggregate_id, left_period_start, right_period_start
    HAVING count(*) > 1
  ) THEN
    RAISE EXCEPTION 'A period pair has more than one current comparison';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.understanding_comparison_findings AS finding
    WHERE NOT EXISTS (
      SELECT 1
      FROM public.understanding_comparison_finding_observations AS link
      WHERE link.finding_id = finding.id AND link.period_side = 'left'
    ) OR NOT EXISTS (
      SELECT 1
      FROM public.understanding_comparison_finding_observations AS link
      WHERE link.finding_id = finding.id AND link.period_side = 'right'
    )
  ) THEN
    RAISE EXCEPTION 'A Phase 3D finding is missing one side of provenance';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.understanding_comparison_finding_observations AS link
    JOIN public.understanding_comparison_findings AS finding ON finding.id = link.finding_id
    JOIN public.understanding_comparisons AS comparison ON comparison.id = finding.comparison_id
    LEFT JOIN public.understanding_aggregate_observations AS observation
      ON observation.aggregate_id = link.aggregate_id
     AND observation.observation_id = link.observation_id
    WHERE link.aggregate_id <> comparison.aggregate_id
       OR observation.observation_id IS NULL
       OR (
         link.period_side = 'left'
         AND date_trunc('month', observation.source_date)::DATE <> comparison.left_period_start
       )
       OR (
         link.period_side = 'right'
         AND date_trunc('month', observation.source_date)::DATE <> comparison.right_period_start
       )
  ) THEN
    RAISE EXCEPTION 'A Phase 3D provenance link crosses its aggregate or selected period';
  END IF;
END;
$$;

SELECT
  (SELECT count(*) FROM public.understanding_comparisons) AS comparison_count,
  (SELECT count(*) FROM public.understanding_comparison_findings) AS finding_count,
  (SELECT count(*) FROM public.understanding_comparison_finding_observations) AS finding_observation_count,
  (SELECT count(*) FROM public.understanding_comparison_finding_reviews) AS finding_review_count,
  (SELECT count(*) FROM public.understanding_aggregates) AS preserved_aggregate_count,
  (SELECT count(*) FROM public.understanding_aggregate_observations) AS preserved_aggregate_observation_count,
  (SELECT count(*) FROM public.understanding_observation_evidence) AS preserved_evidence_count;

ROLLBACK;
