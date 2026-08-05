-- Read-only Phase 3A v4 schema, privilege, exact-evidence, and lifecycle checks.
BEGIN;
SET TRANSACTION READ ONLY;

DO $$
DECLARE
  v_table REGCLASS;
  v_function REGPROCEDURE;
BEGIN
  FOREACH v_table IN ARRAY ARRAY[
    'public.understanding_run_semantic_configs'::REGCLASS,
    'public.understanding_observation_scopes'::REGCLASS
  ] LOOP
    IF NOT EXISTS (SELECT 1 FROM pg_class WHERE oid = v_table AND relrowsecurity) THEN
      RAISE EXCEPTION 'Phase 3A v4 table % must have RLS enabled', v_table;
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
       )
       OR NOT has_table_privilege('service_role', v_table, 'SELECT') THEN
      RAISE EXCEPTION 'Phase 3A v4 table % has invalid grants', v_table;
    END IF;
  END LOOP;

  FOREACH v_function IN ARRAY ARRAY[
    'public.create_theme_timeline_run_v4(text,jsonb,text,date,date,integer,text,text,text,jsonb)'::REGPROCEDURE,
    'public.complete_theme_timeline_source_v4(uuid,bigint,text,text,text,text,text,jsonb)'::REGPROCEDURE,
    'public.finalize_reviewed_theme_timeline_run_v4(uuid,text,text,uuid[])'::REGPROCEDURE,
    'public.review_theme_timeline_observation(uuid,text,text,text)'::REGPROCEDURE
  ] LOOP
    IF EXISTS (SELECT 1 FROM pg_proc WHERE oid = v_function AND prosecdef) THEN
      RAISE EXCEPTION 'Phase 3A v4 function % must remain SECURITY INVOKER', v_function;
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
      RAISE EXCEPTION 'Phase 3A v4 function % has invalid EXECUTE grants', v_function;
    END IF;
  END LOOP;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conrelid = 'public.understanding_observation_evidence'::REGCLASS
      AND conname = 'understanding_observation_evidence_precise_range_key'
      AND contype = 'u'
      AND convalidated
  ) THEN
    RAISE EXCEPTION 'Precise theme evidence uniqueness constraint is missing';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.understanding_run_semantic_configs AS semantic
    WHERE semantic.pipeline_version = 'theme-timeline-semantic-v4'
      AND (
        jsonb_typeof(semantic.theme_spec) <> 'object'
        OR jsonb_array_length(semantic.theme_spec -> 'include') < 1
      )
  ) THEN
    RAISE EXCEPTION 'A v4 run has an invalid frozen theme contract';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.understanding_observation_scopes AS scope
    JOIN public.understanding_observations AS observation ON observation.id = scope.observation_id
    JOIN public.understanding_run_semantic_configs AS semantic ON semantic.run_id = observation.run_id
    WHERE semantic.pipeline_version = 'theme-timeline-semantic-v4'
      AND (
        scope.decision NOT IN ('relevant', 'uncertain')
        OR NOT EXISTS (
          SELECT 1 FROM public.understanding_observation_evidence AS evidence
          WHERE evidence.observation_id = observation.id
        )
      )
  ) THEN
    RAISE EXCEPTION 'A v4 observation has invalid scope or missing evidence';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.understanding_observation_evidence AS evidence
    JOIN public.understanding_observations AS observation ON observation.id = evidence.observation_id
    JOIN public.understanding_run_semantic_configs AS semantic ON semantic.run_id = observation.run_id
    JOIN public.knowledge_chunks AS chunk ON chunk.id = evidence.chunk_id
    WHERE semantic.pipeline_version = 'theme-timeline-semantic-v4'
      AND (
        chunk.source_id <> evidence.source_id
        OR chunk.chunk_index <> evidence.chunk_index
        OR chunk.content_hash <> evidence.chunk_content_hash
        OR evidence.char_start < chunk.char_start
        OR evidence.char_end > chunk.char_end
        OR evidence.excerpt <> substring(
          chunk.content
          FROM evidence.char_start - chunk.char_start + 1
          FOR evidence.char_end - evidence.char_start
        )
      )
  ) THEN
    RAISE EXCEPTION 'A v4 evidence range no longer matches its source chunk';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.understanding_runs AS run
    JOIN public.understanding_run_semantic_configs AS semantic ON semantic.run_id = run.id
    WHERE semantic.pipeline_version = 'theme-timeline-semantic-v4'
      AND (
        (run.status = 'awaiting_review' AND EXISTS (
          SELECT 1 FROM public.understanding_summaries AS summary WHERE summary.run_id = run.id
        ))
        OR (run.status = 'completed' AND NOT EXISTS (
          SELECT 1 FROM public.understanding_summaries AS summary WHERE summary.run_id = run.id
        ))
      )
  ) THEN
    RAISE EXCEPTION 'A v4 run violates the review-before-first-summary lifecycle';
  END IF;
END;
$$;

SELECT
  (SELECT count(*) FROM public.understanding_run_semantic_configs) AS v4_run_config_count,
  (SELECT count(*) FROM public.understanding_observation_scopes) AS v4_observation_scope_count,
  (SELECT count(*) FROM public.understanding_runs) AS preserved_run_count,
  (SELECT count(*) FROM public.understanding_observations) AS preserved_observation_count,
  (SELECT count(*) FROM public.understanding_observation_evidence) AS preserved_evidence_count;

ROLLBACK;
