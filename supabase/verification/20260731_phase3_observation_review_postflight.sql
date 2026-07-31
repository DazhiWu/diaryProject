-- Read-only postflight for the Phase 3B observation-review extension.
BEGIN;

DO $$
DECLARE
  v_review_function REGPROCEDURE := to_regprocedure(
    'public.review_theme_timeline_observation(uuid,text,text,text)'
  );
  v_summary_function REGPROCEDURE := to_regprocedure(
    'public.review_theme_timeline_summary(uuid,text,text)'
  );
BEGIN
  IF to_regclass('public.understanding_observation_reviews') IS NULL
     OR to_regclass('public.understanding_observation_review_summary_impacts') IS NULL THEN
    RAISE EXCEPTION 'Phase 3B observation-review tables are missing';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM pg_class
    WHERE oid IN (
      'public.understanding_observation_reviews'::regclass,
      'public.understanding_observation_review_summary_impacts'::regclass
    )
      AND NOT relrowsecurity
  ) THEN
    RAISE EXCEPTION 'Phase 3B observation-review RLS is disabled';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM pg_class AS relation
    CROSS JOIN LATERAL aclexplode(
      coalesce(relation.relacl, acldefault('r', relation.relowner))
    ) AS privilege
    WHERE relation.oid IN (
      'public.understanding_observation_reviews'::regclass,
      'public.understanding_observation_review_summary_impacts'::regclass
    )
      AND privilege.grantee = 0
  )
     OR has_table_privilege('anon', 'public.understanding_observation_reviews', 'SELECT')
     OR has_table_privilege('authenticated', 'public.understanding_observation_reviews', 'SELECT')
     OR has_table_privilege('anon', 'public.understanding_observation_review_summary_impacts', 'SELECT')
     OR has_table_privilege('authenticated', 'public.understanding_observation_review_summary_impacts', 'SELECT') THEN
    RAISE EXCEPTION 'Phase 3B observation-review tables are exposed';
  END IF;

  IF v_review_function IS NULL OR v_summary_function IS NULL THEN
    RAISE EXCEPTION 'Phase 3B review functions are missing';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM pg_proc
    WHERE oid IN (v_review_function, v_summary_function)
      AND prosecdef
  ) THEN
    RAISE EXCEPTION 'Phase 3B review functions must remain SECURITY INVOKER';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM pg_proc AS procedure
    CROSS JOIN LATERAL aclexplode(
      coalesce(procedure.proacl, acldefault('f', procedure.proowner))
    ) AS privilege
    WHERE procedure.oid = v_review_function
      AND privilege.grantee = 0
  )
     OR has_function_privilege('anon', v_review_function, 'EXECUTE')
     OR has_function_privilege('authenticated', v_review_function, 'EXECUTE')
     OR NOT has_function_privilege('service_role', v_review_function, 'EXECUTE') THEN
    RAISE EXCEPTION 'Phase 3B observation review has invalid execute privileges';
  END IF;
END;
$$;

SELECT
  (SELECT count(*) FROM public.understanding_observations) AS observation_count,
  (SELECT count(*) FROM public.understanding_observation_evidence) AS evidence_count,
  (SELECT count(*) FROM public.understanding_observation_reviews) AS review_count,
  (SELECT count(*) FROM public.understanding_observation_review_summary_impacts) AS summary_impact_count;

ROLLBACK;
