BEGIN;
DROP POLICY "Allow anon insert access" ON public.anonymous_messages;
DROP POLICY "Allow anon read access" ON public.anonymous_messages;
REVOKE ALL PRIVILEGES ON TABLE public.anonymous_messages FROM anon;
GRANT ALL PRIVILEGES ON TABLE public.anonymous_messages TO anon, authenticated;
CREATE POLICY "Allow public insert access" ON public.anonymous_messages FOR INSERT TO anon, authenticated WITH CHECK (true);
CREATE POLICY "Allow public read access" ON public.anonymous_messages FOR SELECT TO anon, authenticated USING (true);
COMMIT;
