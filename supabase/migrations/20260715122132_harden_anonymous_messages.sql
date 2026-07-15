-- Restrict anonymous messages to public display columns and move writes behind
-- the same-origin, rate-limited service-role API.
BEGIN;

DROP POLICY IF EXISTS "Allow anon insert access" ON public.anonymous_messages;
DROP POLICY IF EXISTS "Allow anon read access" ON public.anonymous_messages;

REVOKE ALL PRIVILEGES ON TABLE public.anonymous_messages FROM anon, authenticated;
GRANT SELECT (id, content, created_at) ON TABLE public.anonymous_messages TO anon;

CREATE POLICY "Allow anon read access"
  ON public.anonymous_messages
  FOR SELECT
  TO anon
  USING (true);

ALTER TABLE public.anonymous_messages
  DROP CONSTRAINT anonymous_messages_content_length_check;
ALTER TABLE public.anonymous_messages
  ADD CONSTRAINT anonymous_messages_content_length_check
  CHECK (char_length(btrim(content)) BETWEEN 1 AND 2000);

COMMIT;
