BEGIN;
GRANT ALL PRIVILEGES ON TABLE public.health_conditions TO anon, authenticated;
CREATE POLICY "Enable read access for all users" ON public.health_conditions FOR ALL TO public USING (true);
COMMIT;
