-- Final reviewed SQL; execution requires separate production approval.
BEGIN;
DROP POLICY "Enable read access for all users" ON public.audio_messages;
REVOKE ALL PRIVILEGES ON TABLE public.audio_messages FROM anon, authenticated;
COMMIT;
