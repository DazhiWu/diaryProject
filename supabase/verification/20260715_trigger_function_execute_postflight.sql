-- Run after 20260715122200_revoke_trigger_function_execute.sql.
-- The transaction intentionally rolls back its trigger-behavior fixtures.
BEGIN;

DO $$
BEGIN
  IF has_function_privilege('anon', 'public.enforce_diary_image_invariants()', 'EXECUTE')
    OR has_function_privilege('authenticated', 'public.enforce_diary_image_invariants()', 'EXECUTE')
    OR has_function_privilege('anon', 'public.rls_auto_enable()', 'EXECUTE')
    OR has_function_privilege('authenticated', 'public.rls_auto_enable()', 'EXECUTE') THEN
    RAISE EXCEPTION 'a protected function remains publicly executable';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger
    WHERE tgrelid = 'public."diaryContent"'::regclass
      AND tgname = 'diary_image_invariants_trigger'
      AND tgenabled <> 'D'
  ) THEN
    RAISE EXCEPTION 'diary image invariant trigger is missing or disabled';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public."diaryContent") THEN
    RAISE EXCEPTION 'cannot exercise diary image invariant trigger without a diary row';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_event_trigger e
    JOIN pg_proc p ON p.oid = e.evtfoid
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE e.evtname = 'ensure_rls' AND e.evtenabled <> 'D'
      AND n.nspname = 'public' AND p.proname = 'rls_auto_enable'
  ) THEN
    RAISE EXCEPTION 'RLS event trigger is missing or disabled';
  END IF;
END $$;

-- Fires enforce_diary_image_invariants() through its trigger without retaining a change.
UPDATE public."diaryContent"
SET image_paths = image_paths
WHERE id = (SELECT id FROM public."diaryContent" ORDER BY id LIMIT 1);

-- Fires rls_auto_enable() and proves that it still enables RLS for new public tables.
CREATE TABLE public.__rls_trigger_postflight_20260715 (id integer PRIMARY KEY);
DO $$
BEGIN
  IF NOT (
    SELECT relrowsecurity
    FROM pg_class
    WHERE oid = 'public.__rls_trigger_postflight_20260715'::regclass
  ) THEN
    RAISE EXCEPTION 'RLS event trigger did not enable RLS';
  END IF;
END $$;
DROP TABLE public.__rls_trigger_postflight_20260715;

ROLLBACK;
