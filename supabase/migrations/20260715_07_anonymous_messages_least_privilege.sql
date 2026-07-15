-- Final reviewed SQL; execution requires separate production approval.
BEGIN;
DROP POLICY "Allow public insert access" ON public.anonymous_messages;
DROP POLICY "Allow public read access" ON public.anonymous_messages;
REVOKE ALL PRIVILEGES ON TABLE public.anonymous_messages FROM anon, authenticated;
GRANT SELECT, INSERT ON TABLE public.anonymous_messages TO anon;
CREATE POLICY "Allow anon insert access" ON public.anonymous_messages FOR INSERT TO anon WITH CHECK (true);
CREATE POLICY "Allow anon read access" ON public.anonymous_messages FOR SELECT TO anon USING (true);
COMMIT;
