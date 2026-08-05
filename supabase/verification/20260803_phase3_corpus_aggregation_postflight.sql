-- Read-only Phase 3C schema, privilege, provenance, and deterministic-count checks.
BEGIN;
SET TRANSACTION READ ONLY;

DO $$
DECLARE
  v_table REGCLASS;
  v_function REGPROCEDURE;
BEGIN
  FOREACH v_table IN ARRAY ARRAY[
    'public.understanding_aggregates'::REGCLASS,
    'public.understanding_aggregate_periods'::REGCLASS,
    'public.understanding_aggregate_observations'::REGCLASS
  ] LOOP
    IF NOT EXISTS (
      SELECT 1
      FROM pg_class
      WHERE oid = v_table
        AND relrowsecurity
    ) THEN
      RAISE EXCEPTION 'Phase 3C table % must have RLS enabled', v_table;
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
      RAISE EXCEPTION 'Phase 3C table % exposes browser privileges', v_table;
    END IF;

    IF NOT has_table_privilege('service_role', v_table, 'SELECT') THEN
      RAISE EXCEPTION 'Phase 3C table % is unavailable to service_role', v_table;
    END IF;
  END LOOP;

  FOREACH v_function IN ARRAY ARRAY[
    'public.regenerate_theme_timeline_aggregate(uuid,uuid)'::REGPROCEDURE,
    'public.get_theme_timeline_aggregate_stale_reasons(uuid)'::REGPROCEDURE
  ] LOOP
    IF EXISTS (
      SELECT 1
      FROM pg_proc
      WHERE oid = v_function
        AND prosecdef
    ) THEN
      RAISE EXCEPTION 'Phase 3C function % must remain SECURITY INVOKER', v_function;
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
      RAISE EXCEPTION 'Phase 3C function % has invalid EXECUTE grants', v_function;
    END IF;
  END LOOP;

  IF EXISTS (
    SELECT 1
    FROM pg_index
    WHERE indexrelid IN (
      'public.understanding_aggregates_one_current_run_idx'::REGCLASS,
      'public.understanding_aggregates_supersedes_idx'::REGCLASS,
      'public.understanding_aggregate_observations_observation_idx'::REGCLASS
    )
      AND (NOT indisvalid OR NOT indisready)
  ) THEN
    RAISE EXCEPTION 'One or more Phase 3C indexes are not valid and ready';
  END IF;

  IF EXISTS (
    SELECT run_id
    FROM public.understanding_aggregates
    WHERE status = 'current'
    GROUP BY run_id
    HAVING count(*) > 1
  ) THEN
    RAISE EXCEPTION 'A theme timeline run has more than one current aggregate';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.understanding_aggregates AS aggregate
    WHERE aggregate.accepted_observation_count <> (
      SELECT count(*)::INTEGER
      FROM public.understanding_aggregate_observations AS link
      WHERE link.aggregate_id = aggregate.id
    )
       OR aggregate.confirmed_observation_count <> (
         SELECT count(*) FILTER (WHERE link.review_state = 'confirmed')::INTEGER
         FROM public.understanding_aggregate_observations AS link
         WHERE link.aggregate_id = aggregate.id
       )
       OR aggregate.edited_observation_count <> (
         SELECT count(*) FILTER (WHERE link.review_state = 'edited')::INTEGER
         FROM public.understanding_aggregate_observations AS link
         WHERE link.aggregate_id = aggregate.id
       )
       OR aggregate.distinct_diary_count <> (
         SELECT count(DISTINCT link.source_id)::INTEGER
         FROM public.understanding_aggregate_observations AS link
         WHERE link.aggregate_id = aggregate.id
       )
       OR aggregate.accepted_observation_count < aggregate.distinct_diary_count
  ) THEN
    RAISE EXCEPTION 'Phase 3C aggregate counts do not match frozen observation links';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.understanding_aggregate_observations AS link
    LEFT JOIN public.understanding_observations AS observation
      ON observation.id = link.observation_id
    LEFT JOIN public.understanding_observation_evidence AS evidence
      ON evidence.observation_id = link.observation_id
    GROUP BY link.aggregate_id, link.observation_id, link.evidence_count, observation.id
    HAVING observation.id IS NULL OR count(evidence.id)::INTEGER <> link.evidence_count
  ) THEN
    RAISE EXCEPTION 'Phase 3C provenance links are incomplete';
  END IF;
END;
$$;

SELECT
  (SELECT count(*) FROM public.understanding_aggregates) AS aggregate_count,
  (SELECT count(*) FROM public.understanding_aggregate_periods) AS aggregate_period_count,
  (SELECT count(*) FROM public.understanding_aggregate_observations) AS aggregate_observation_count,
  (SELECT count(*) FROM public.understanding_runs) AS preserved_run_count,
  (SELECT count(*) FROM public.understanding_observations) AS preserved_observation_count,
  (SELECT count(*) FROM public.understanding_observation_evidence) AS preserved_evidence_count;

ROLLBACK;
