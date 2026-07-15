BEGIN;
GRANT ALL PRIVILEGES ON TABLE public.audio_messages TO anon, authenticated;
CREATE POLICY "Enable read access for all users" ON public.audio_messages FOR ALL TO public USING (true);
COMMIT;
