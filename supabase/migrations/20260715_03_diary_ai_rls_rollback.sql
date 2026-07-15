BEGIN;
GRANT ALL PRIVILEGES ON TABLE public."diaryContent", public."diary_AI_analysis" TO anon, authenticated;
CREATE POLICY "Enable read access for all users" ON public."diaryContent" FOR ALL TO public USING (true);
CREATE POLICY "Enable read access for all users" ON public."diary_AI_analysis" FOR ALL TO public USING (true);
COMMIT;
