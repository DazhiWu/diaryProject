BEGIN;
GRANT ALL PRIVILEGES ON TABLE public.yearly_summaries, public.important_events, public.ai_analysis_sections, public.ai_analysis_opinions, public.yearly_images TO anon, authenticated;
CREATE POLICY "Policy with security definer functions" ON public.yearly_summaries FOR ALL TO public USING (true);
CREATE POLICY "Policy with security definer functions" ON public.important_events FOR ALL TO public USING (true);
CREATE POLICY "Policy with security definer functions" ON public.ai_analysis_sections FOR ALL TO public USING (true);
CREATE POLICY "Policy with security definer functions" ON public.ai_analysis_opinions FOR ALL TO public USING (true);
CREATE POLICY "Policy with security definer functions" ON public.yearly_images FOR ALL TO public USING (true);
COMMIT;
