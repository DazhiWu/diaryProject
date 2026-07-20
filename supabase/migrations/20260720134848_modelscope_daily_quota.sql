-- Global ModelScope call budget shared by every Worker instance and AI feature.
BEGIN;

CREATE TABLE public.modelscope_daily_usage (
  usage_date DATE PRIMARY KEY,
  call_count INTEGER NOT NULL DEFAULT 0 CHECK (call_count BETWEEN 0 AND 180),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.modelscope_daily_usage ENABLE ROW LEVEL SECURITY;

REVOKE ALL PRIVILEGES ON TABLE public.modelscope_daily_usage FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE ON TABLE public.modelscope_daily_usage TO service_role;

-- Calls made before this migration cannot be counted reliably. Conservatively
-- stop ModelScope traffic for the rest of the deployment day; the next Beijing
-- calendar day starts with a new row at zero.
INSERT INTO public.modelscope_daily_usage (usage_date, call_count)
VALUES ((now() AT TIME ZONE 'Asia/Shanghai')::date, 180);

CREATE OR REPLACE FUNCTION public.reserve_modelscope_api_call()
RETURNS TABLE (
  allowed BOOLEAN,
  usage_date DATE,
  used INTEGER,
  daily_limit INTEGER
)
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
  current_usage_date DATE := (now() AT TIME ZONE 'Asia/Shanghai')::date;
  current_count INTEGER;
BEGIN
  INSERT INTO public.modelscope_daily_usage AS usage (usage_date, call_count)
  VALUES (current_usage_date, 1)
  ON CONFLICT ON CONSTRAINT modelscope_daily_usage_pkey DO UPDATE
  SET call_count = usage.call_count + 1,
      updated_at = now()
  WHERE usage.call_count < 180
  RETURNING call_count INTO current_count;

  IF current_count IS NULL THEN
    SELECT usage.call_count
    INTO current_count
    FROM public.modelscope_daily_usage AS usage
    WHERE usage.usage_date = current_usage_date;

    RETURN QUERY SELECT false, current_usage_date, coalesce(current_count, 180), 180;
    RETURN;
  END IF;

  RETURN QUERY SELECT true, current_usage_date, current_count, 180;
END;
$$;

REVOKE ALL ON FUNCTION public.reserve_modelscope_api_call() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.reserve_modelscope_api_call() TO service_role;

COMMIT;
