-- Final reviewed SQL; execution requires separate production approval.
BEGIN;
DROP POLICY "Enable read access for all users" ON public.health_conditions;
REVOKE ALL PRIVILEGES ON TABLE public.health_conditions FROM anon, authenticated;
COMMIT;
