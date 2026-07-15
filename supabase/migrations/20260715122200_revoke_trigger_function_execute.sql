-- Trigger functions do not need to be directly executable by client roles.
BEGIN;

REVOKE EXECUTE ON FUNCTION public.enforce_diary_image_invariants() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.rls_auto_enable() FROM PUBLIC, anon, authenticated;

COMMIT;
