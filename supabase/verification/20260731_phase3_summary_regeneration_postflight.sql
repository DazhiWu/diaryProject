-- Read-only postflight for the Phase 3B summary-regeneration function.
BEGIN;
SET TRANSACTION READ ONLY;

DO $$
BEGIN
  IF to_regprocedure(
    'public.regenerate_theme_timeline_summary(uuid,uuid,text,text,uuid[])'
  ) IS NULL THEN
    RAISE EXCEPTION 'Phase 3B summary-regeneration function is missing';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM pg_proc
    WHERE oid = to_regprocedure(
      'public.regenerate_theme_timeline_summary(uuid,uuid,text,text,uuid[])'
    )
      AND prosecdef
  ) THEN
    RAISE EXCEPTION 'Phase 3B summary-regeneration function must remain SECURITY INVOKER';
  END IF;

  IF has_function_privilege(
       'anon',
       'public.regenerate_theme_timeline_summary(uuid,uuid,text,text,uuid[])',
       'EXECUTE'
     )
     OR has_function_privilege(
       'authenticated',
       'public.regenerate_theme_timeline_summary(uuid,uuid,text,text,uuid[])',
       'EXECUTE'
     )
     OR EXISTS (
       SELECT 1
       FROM pg_proc AS procedure
       CROSS JOIN LATERAL aclexplode(coalesce(procedure.proacl, acldefault('f', procedure.proowner))) AS acl
       WHERE procedure.oid = to_regprocedure(
         'public.regenerate_theme_timeline_summary(uuid,uuid,text,text,uuid[])'
       )
         AND acl.grantee = 0
         AND acl.privilege_type = 'EXECUTE'
     )
     OR NOT has_function_privilege(
       'service_role',
       'public.regenerate_theme_timeline_summary(uuid,uuid,text,text,uuid[])',
       'EXECUTE'
     ) THEN
    RAISE EXCEPTION 'Phase 3B summary-regeneration function has invalid privileges';
  END IF;
END
$$;

SELECT
  count(*) AS summary_count,
  count(*) FILTER (WHERE review_state = 'proposed') AS proposed_summary_count,
  count(*) FILTER (WHERE review_state = 'superseded') AS superseded_summary_count
FROM public.understanding_summaries;

ROLLBACK;
