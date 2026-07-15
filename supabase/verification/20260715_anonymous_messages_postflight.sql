-- Run after 20260715122132_harden_anonymous_messages.sql.
BEGIN;

DO $$
BEGIN
  IF has_table_privilege('anon', 'public.anonymous_messages', 'INSERT')
    OR has_table_privilege('authenticated', 'public.anonymous_messages', 'SELECT')
    OR has_table_privilege('authenticated', 'public.anonymous_messages', 'INSERT') THEN
    RAISE EXCEPTION 'anonymous_messages retains an unexpected table privilege';
  END IF;

  IF NOT has_column_privilege('anon', 'public.anonymous_messages', 'id', 'SELECT')
    OR NOT has_column_privilege('anon', 'public.anonymous_messages', 'content', 'SELECT')
    OR NOT has_column_privilege('anon', 'public.anonymous_messages', 'created_at', 'SELECT')
    OR has_column_privilege('anon', 'public.anonymous_messages', 'user_agent', 'SELECT')
    OR has_column_privilege('anon', 'public.anonymous_messages', 'ip_address', 'SELECT') THEN
    RAISE EXCEPTION 'anonymous_messages column privileges are incorrect';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conrelid = 'public.anonymous_messages'::regclass
      AND conname = 'anonymous_messages_content_length_check'
      AND convalidated
      AND pg_get_constraintdef(oid, true) LIKE '%char_length(btrim(content)) >= 1%'
      AND pg_get_constraintdef(oid, true) LIKE '%char_length(btrim(content)) <= 2000%'
  ) THEN
    RAISE EXCEPTION 'anonymous_messages 1-2000 constraint is missing or changed';
  END IF;
END $$;

ROLLBACK;
