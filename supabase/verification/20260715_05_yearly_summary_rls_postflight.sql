-- Read-only, fail-closed postflight for the yearly-summary domain.
DO $$
DECLARE table_name text;
BEGIN
  FOREACH table_name IN ARRAY ARRAY['yearly_summaries', 'important_events', 'ai_analysis_sections', 'ai_analysis_opinions', 'yearly_images'] LOOP
    IF NOT EXISTS (SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relname=table_name AND c.relrowsecurity) THEN RAISE EXCEPTION 'RLS is disabled on %', table_name; END IF;
    IF EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename=table_name) THEN RAISE EXCEPTION 'A policy remains on %', table_name; END IF;
    IF EXISTS (SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace CROSS JOIN LATERAL aclexplode(COALESCE(c.relacl, acldefault('r', c.relowner))) x WHERE n.nspname='public' AND c.relname=table_name AND x.grantee=0) THEN RAISE EXCEPTION 'PUBLIC privilege remains on %', table_name; END IF;
    IF has_table_privilege('anon',format('public.%I',table_name),'SELECT') OR has_table_privilege('anon',format('public.%I',table_name),'INSERT') OR has_table_privilege('anon',format('public.%I',table_name),'UPDATE') OR has_table_privilege('anon',format('public.%I',table_name),'DELETE') OR has_table_privilege('authenticated',format('public.%I',table_name),'SELECT') OR has_table_privilege('authenticated',format('public.%I',table_name),'INSERT') OR has_table_privilege('authenticated',format('public.%I',table_name),'UPDATE') OR has_table_privilege('authenticated',format('public.%I',table_name),'DELETE') THEN RAISE EXCEPTION 'anon/authenticated privilege remains on %', table_name; END IF;
    IF NOT has_table_privilege('service_role',format('public.%I',table_name),'SELECT') OR NOT has_table_privilege('service_role',format('public.%I',table_name),'INSERT') OR NOT has_table_privilege('service_role',format('public.%I',table_name),'UPDATE') OR NOT has_table_privilege('service_role',format('public.%I',table_name),'DELETE') THEN RAISE EXCEPTION 'service_role CRUD privilege lost on %', table_name; END IF;
  END LOOP;
END $$;
