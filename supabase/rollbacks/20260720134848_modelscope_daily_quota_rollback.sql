-- Emergency rollback for the global ModelScope daily call budget.
-- Applying this rollback removes the fail-closed protection from all AI features.
BEGIN;

DROP FUNCTION IF EXISTS public.reserve_modelscope_api_call();
DROP TABLE IF EXISTS public.modelscope_daily_usage;

COMMIT;
