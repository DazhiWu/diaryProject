-- Read-only postflight for the Phase 3A Ollama run-configuration extension.
BEGIN;

DO $$
DECLARE
  v_function_oid REGPROCEDURE := to_regprocedure(
    'public.create_theme_timeline_run_with_config(text,date,date,integer,text,text,text,jsonb)'
  );
  v_security_definer BOOLEAN;
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'understanding_runs'
      AND column_name = 'generation_config'
      AND data_type = 'jsonb'
  ) THEN
    RAISE EXCEPTION 'understanding_runs.generation_config is missing or not jsonb';
  END IF;

  IF v_function_oid IS NULL THEN
    RAISE EXCEPTION 'create_theme_timeline_run_with_config is missing';
  END IF;

  SELECT prosecdef INTO v_security_definer
  FROM pg_proc
  WHERE oid = v_function_oid;

  IF v_security_definer THEN
    RAISE EXCEPTION 'create_theme_timeline_run_with_config must remain SECURITY INVOKER';
  END IF;

  IF has_function_privilege('PUBLIC', v_function_oid, 'EXECUTE')
     OR has_function_privilege('anon', v_function_oid, 'EXECUTE')
     OR has_function_privilege('authenticated', v_function_oid, 'EXECUTE') THEN
    RAISE EXCEPTION 'Phase 3A Ollama run creation is exposed outside service_role';
  END IF;

  IF NOT has_function_privilege('service_role', v_function_oid, 'EXECUTE') THEN
    RAISE EXCEPTION 'service_role cannot create configured Phase 3A runs';
  END IF;
END;
$$;

SELECT
  count(*) AS stored_run_count,
  count(*) FILTER (WHERE generation_config IS NOT NULL) AS configured_run_count
FROM public.understanding_runs;

ROLLBACK;
