-- Final reviewed SQL; execution requires separate production approval.
BEGIN;
DROP POLICY "Enable read access for all users" ON public."diaryContent";
DROP POLICY "Enable read access for all users" ON public."diary_AI_analysis";
REVOKE ALL PRIVILEGES ON TABLE public."diaryContent", public."diary_AI_analysis" FROM anon, authenticated;
COMMIT;
