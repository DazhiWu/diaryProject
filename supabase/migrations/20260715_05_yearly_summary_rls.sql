-- Final reviewed SQL; execution requires separate production approval.
BEGIN;
DROP POLICY "Policy with security definer functions" ON public.yearly_summaries;
DROP POLICY "Policy with security definer functions" ON public.important_events;
DROP POLICY "Policy with security definer functions" ON public.ai_analysis_sections;
DROP POLICY "Policy with security definer functions" ON public.ai_analysis_opinions;
DROP POLICY "Policy with security definer functions" ON public.yearly_images;
REVOKE ALL PRIVILEGES ON TABLE public.yearly_summaries, public.important_events, public.ai_analysis_sections, public.ai_analysis_opinions, public.yearly_images FROM anon, authenticated;
COMMIT;
