-- Read-only Batch 5 production audit. It contains SELECT statements only.
-- Save output only in the approved operator-only rollback record; do not commit account metadata.

-- Fixed buckets: configuration and ownership.
SELECT id, name, public, file_size_limit, allowed_mime_types, owner, created_at, updated_at
FROM storage.buckets
ORDER BY id;

-- Export every policy on both Storage relations. Do not filter expressions by bucket name:
-- global USING (true), WITH CHECK (true), and function-based policies must remain visible.
SELECT schemaname, tablename, policyname, permissive, roles, cmd, qual, with_check
FROM pg_policies
WHERE schemaname = 'storage' AND tablename IN ('objects', 'buckets')
ORDER BY tablename, policyname;

-- Table-level ACLs for PUBLIC, anon, authenticated, and service_role. PUBLIC is ACL grantee 0.
WITH target_relations AS (
  SELECT c.oid, n.nspname, c.relname, c.relkind, c.relowner, c.relacl
  FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE (n.nspname = 'storage' AND c.relname IN ('objects', 'buckets'))
     OR (n.nspname = 'public' AND c.relname IN (
       'diaryContent', 'diary_AI_analysis', 'health_conditions', 'yearly_summaries',
       'important_events', 'ai_analysis_sections', 'ai_analysis_opinions', 'yearly_images',
       'audio_messages', 'anonymous_messages'
     ))
), expanded AS (
  SELECT r.*, x.grantor, x.grantee, x.privilege_type, x.is_grantable
  FROM target_relations r
  CROSS JOIN LATERAL aclexplode(COALESCE(r.relacl, acldefault('r', r.relowner))) x
)
SELECT nspname AS schema_name, relname AS relation_name, relkind,
       pg_get_userbyid(grantor) AS grantor,
       CASE WHEN grantee = 0 THEN 'PUBLIC' ELSE pg_get_userbyid(grantee) END AS grantee,
       privilege_type, is_grantable
FROM expanded
WHERE grantee = 0 OR pg_get_userbyid(grantee) IN ('anon', 'authenticated', 'service_role')
ORDER BY schema_name, relation_name, grantee, privilege_type;

-- Actual column-level ACLs. `information_schema.column_privileges` expands table ACLs,
-- so inspect pg_attribute.attacl directly; no rows means no column-specific grants exist.
SELECT n.nspname AS schema_name, c.relname AS relation_name, a.attname AS column_name,
       a.attacl AS column_acl
FROM pg_attribute a
JOIN pg_class c ON c.oid = a.attrelid
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE a.attnum > 0 AND NOT a.attisdropped AND a.attacl IS NOT NULL
  AND ((n.nspname = 'storage' AND c.relname IN ('objects', 'buckets'))
    OR (n.nspname = 'public' AND c.relname IN (
      'diaryContent', 'diary_AI_analysis', 'health_conditions', 'yearly_summaries',
      'important_events', 'ai_analysis_sections', 'ai_analysis_opinions', 'yearly_images',
      'audio_messages', 'anonymous_messages'
    )))
ORDER BY schema_name, relation_name, column_name;

-- RLS enabled/forced status and relation owner for every target public table.
SELECT n.nspname AS schema_name, c.relname AS table_name,
       c.relrowsecurity AS rls_enabled, c.relforcerowsecurity AS rls_forced,
       pg_get_userbyid(c.relowner) AS owner
FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public' AND c.relkind IN ('r', 'p') AND c.relname IN (
  'diaryContent', 'diary_AI_analysis', 'health_conditions', 'yearly_summaries',
  'important_events', 'ai_analysis_sections', 'ai_analysis_opinions', 'yearly_images',
  'audio_messages', 'anonymous_messages'
)
ORDER BY table_name;

-- Complete target-table policy inventory. Keep this separate from the ACL audit so
-- every policy predicate remains visible before a final migration is approved.
SELECT schemaname, tablename, policyname, roles, cmd, qual, with_check
FROM pg_policies
WHERE schemaname = 'public' AND tablename IN (
  'diaryContent', 'diary_AI_analysis', 'health_conditions', 'yearly_summaries',
  'important_events', 'ai_analysis_sections', 'ai_analysis_opinions', 'yearly_images',
  'audio_messages', 'anonymous_messages'
)
ORDER BY tablename, policyname;

-- All anonymous-message constraints, followed by a conservative explicit check for the required bound.
SELECT conname, contype, convalidated, pg_get_constraintdef(oid, true) AS definition
FROM pg_constraint
WHERE conrelid = 'public.anonymous_messages'::regclass
ORDER BY contype, conname;

SELECT EXISTS (
  SELECT 1 FROM pg_constraint
  WHERE conrelid = 'public.anonymous_messages'::regclass
    AND contype = 'c'
    AND pg_get_constraintdef(oid, true) ~* 'btrim'
    AND pg_get_constraintdef(oid, true) ~* '(char_length|length)'
    AND pg_get_constraintdef(oid, true) ~* '>= *1'
    AND pg_get_constraintdef(oid, true) ~* '<= *2000'
) AS has_trimmed_length_1_to_2000_check;

-- public-schema function exposure: owners, SECURITY DEFINER, ACLs, and definitions.
WITH functions AS (
  SELECT p.oid, p.oid::regprocedure AS function, p.proowner, p.prosecdef, p.proacl,
         pg_get_functiondef(p.oid) AS definition
  FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public'
), expanded AS (
  SELECT f.*, x.grantor, x.grantee, x.privilege_type, x.is_grantable
  FROM functions f
  CROSS JOIN LATERAL aclexplode(COALESCE(f.proacl, acldefault('f', f.proowner))) x
)
SELECT function, pg_get_userbyid(proowner) AS owner, prosecdef AS security_definer,
       CASE WHEN grantee = 0 THEN 'PUBLIC' ELSE pg_get_userbyid(grantee) END AS grantee,
       pg_get_userbyid(grantor) AS grantor, privilege_type, is_grantable, definition
FROM expanded
WHERE grantee = 0 OR pg_get_userbyid(grantee) IN ('anon', 'authenticated') OR prosecdef
ORDER BY function, grantee;

-- public-schema views that depend on a Batch 5 target table, plus ACL/owner state.
WITH targets AS (
  SELECT c.oid FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = 'public' AND c.relname IN (
    'diaryContent', 'diary_AI_analysis', 'health_conditions', 'yearly_summaries',
    'important_events', 'ai_analysis_sections', 'ai_analysis_opinions', 'yearly_images',
    'audio_messages', 'anonymous_messages'
  )
), views AS (
  SELECT DISTINCT v.oid, n.nspname, v.relname, v.relowner, v.relacl, v.reloptions,
         pg_get_viewdef(v.oid, true) AS definition
  FROM pg_class v JOIN pg_namespace n ON n.oid = v.relnamespace
  JOIN pg_rewrite rw ON rw.ev_class = v.oid
  JOIN pg_depend d ON d.objid = rw.oid
  WHERE n.nspname = 'public' AND v.relkind IN ('v', 'm') AND d.refobjid IN (SELECT oid FROM targets)
), expanded AS (
  SELECT v.*, x.grantor, x.grantee, x.privilege_type, x.is_grantable
  FROM views v CROSS JOIN LATERAL aclexplode(COALESCE(v.relacl, acldefault('r', v.relowner))) x
)
SELECT nspname AS schema_name, relname AS view_name, pg_get_userbyid(relowner) AS owner,
       reloptions, CASE WHEN grantee = 0 THEN 'PUBLIC' ELSE pg_get_userbyid(grantee) END AS grantee,
       pg_get_userbyid(grantor) AS grantor, privilege_type, is_grantable, definition
FROM expanded
WHERE grantee = 0 OR pg_get_userbyid(grantee) IN ('anon', 'authenticated')
ORDER BY view_name, grantee;

-- rls_auto_enable: inspect only. Do not change this function in Batch 5.
SELECT p.oid::regprocedure AS function, pg_get_userbyid(p.proowner) AS owner,
       p.prosecdef AS security_definer, p.proacl AS raw_acl, pg_get_functiondef(p.oid) AS definition
FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public' AND p.proname = 'rls_auto_enable';

SELECT CASE WHEN x.grantee = 0 THEN 'PUBLIC' ELSE pg_get_userbyid(x.grantee) END AS grantee,
       pg_get_userbyid(x.grantor) AS grantor, x.privilege_type, x.is_grantable
FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
CROSS JOIN LATERAL aclexplode(COALESCE(p.proacl, acldefault('f', p.proowner))) x
WHERE n.nspname = 'public' AND p.proname = 'rls_auto_enable'
ORDER BY grantee, privilege_type;

SELECT pg_describe_object(d.classid, d.objid, d.objsubid) AS dependent_object, d.deptype
FROM pg_depend d
WHERE d.refobjid IN (
  SELECT p.oid FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public' AND p.proname = 'rls_auto_enable'
)
ORDER BY pg_describe_object(d.classid, d.objid, d.objsubid);

SELECT evtname, evtevent, evtenabled, evttags, pg_get_userbyid(evtowner) AS owner,
       evtfoid::regprocedure AS function, pg_get_functiondef(evtfoid) AS function_definition
FROM pg_event_trigger
ORDER BY evtname;
