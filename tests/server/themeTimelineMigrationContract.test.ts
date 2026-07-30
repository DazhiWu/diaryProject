import { readFileSync } from 'node:fs'
import path from 'node:path'

import { describe, expect, it } from 'vitest'

const migration = readFileSync(
  path.resolve(process.cwd(), 'supabase/migrations/20260730071934_phase3_theme_timeline.sql'),
  'utf8',
)
const rollback = readFileSync(
  path.resolve(process.cwd(), 'supabase/rollbacks/20260730071934_phase3_theme_timeline_rollback.sql'),
  'utf8',
)
const postflight = readFileSync(
  path.resolve(process.cwd(), 'supabase/verification/20260730_phase3_theme_timeline_postflight.sql'),
  'utf8',
)
const indexMigration = readFileSync(
  path.resolve(
    process.cwd(),
    'supabase/migrations/20260730081229_phase3_theme_timeline_fk_indexes.sql',
  ),
  'utf8',
)
const indexRollback = readFileSync(
  path.resolve(
    process.cwd(),
    'supabase/rollbacks/20260730081229_phase3_theme_timeline_fk_indexes_rollback.sql',
  ),
  'utf8',
)
const indexPostflight = readFileSync(
  path.resolve(
    process.cwd(),
    'supabase/verification/20260730_phase3_theme_timeline_fk_indexes_postflight.sql',
  ),
  'utf8',
)
const normalizedMigration = migration.replace(/\s+/g, ' ').trim().toLowerCase()
const normalizedRollback = rollback.replace(/\s+/g, ' ').trim().toLowerCase()
const normalizedIndexMigration = indexMigration.replace(/\s+/g, ' ').trim().toLowerCase()
const normalizedIndexRollback = indexRollback.replace(/\s+/g, ' ').trim().toLowerCase()

describe('Phase 3A theme timeline migration contract', () => {
  it('keeps the migration atomic and rollback limited to derived Phase 3 data', () => {
    expect(normalizedMigration).toMatch(/^-- .* begin; /)
    expect(normalizedMigration).toMatch(/ commit;$/)
    expect(normalizedRollback).toContain('begin;')
    expect(normalizedRollback).toContain('commit;')
    expect(normalizedRollback).not.toContain('drop table if exists public."diarycontent"')
    expect(normalizedRollback).not.toContain('drop table if exists public.knowledge_chunks')
    expect(normalizedRollback).not.toContain('drop table if exists public.knowledge_source_settings')
  })

  it('snapshots exact source ids and indexed hashes behind the approved 598-source checkpoint', () => {
    expect(normalizedMigration).toContain('p_expected_source_count integer')
    expect(normalizedMigration).toContain('p_expected_fingerprint text')
    expect(normalizedMigration).toContain("setting.source_id::text || ':' || setting.indexed_content_hash")
    expect(normalizedMigration).toContain('v_source_count <> p_expected_source_count')
    expect(normalizedMigration).toContain('v_fingerprint is distinct from p_expected_fingerprint')
    expect(normalizedMigration).toContain('source_hash text not null')
    expect(normalizedMigration).toContain('primary key (run_id, source_id)')
  })

  it('excludes pending, excluded, hashless, and missing-chunk sources from the frozen corpus', () => {
    expect(normalizedMigration).toContain("setting.usage_scope = 'private'")
    expect(normalizedMigration).toContain('setting.indexed_content_hash is not null')
    expect(normalizedMigration).toContain("job.status = 'completed'")
    expect(normalizedMigration).toContain('from public.knowledge_chunks as chunk where chunk.source_id = setting.source_id')
    expect(normalizedMigration).toContain("setting.usage_scope = 'excluded'")
  })

  it('implements resumable single-source claims and idempotent observation creation', () => {
    expect(normalizedMigration).toContain('create or replace function public.claim_theme_timeline_source')
    expect(normalizedMigration).toContain('for update skip locked')
    expect(normalizedMigration).toContain("started_at < now() - interval '10 minutes'")
    expect(normalizedMigration).toContain('unique (run_id, source_id)')
    expect(normalizedMigration).toContain('on conflict (run_id, source_id) do nothing')
    expect(normalizedMigration).toContain('create or replace function public.retry_theme_timeline_sources')
  })

  it('preserves evidence and review history with stale-source checks', () => {
    expect(normalizedMigration).toContain('public.understanding_observation_evidence')
    expect(normalizedMigration).toContain('source_hash text not null')
    expect(normalizedMigration).toContain('chunk_content_hash text not null')
    expect(normalizedMigration).toContain("review_state in ('proposed', 'confirmed', 'edited', 'rejected', 'superseded')")
    expect(normalizedMigration).toContain("set review_state = 'superseded'")
    expect(normalizedMigration).toContain('stale theme timeline summary cannot be reviewed')
  })

  it('locks every table and function to the service role and supplies a postflight', () => {
    expect(normalizedMigration).toContain('alter table public.understanding_runs enable row level security')
    expect(normalizedMigration).toContain('from public, anon, authenticated')
    expect(normalizedMigration).toContain('to service_role')
    expect(normalizedMigration).not.toContain('security definer')
    expect(postflight).toContain("has_table_privilege('anon'")
    expect(postflight).toContain("has_function_privilege('authenticated'")
    expect(postflight).toContain('FOR UPDATE SKIP LOCKED')
  })

  it('covers both advisor-reported foreign keys with an atomic, index-only rollback', () => {
    expect(normalizedIndexMigration).toMatch(/^-- .* begin; /)
    expect(normalizedIndexMigration).toMatch(/ commit;$/)
    expect(normalizedIndexMigration).toContain(
      'understanding_summaries_supersedes_summary_id_idx',
    )
    expect(normalizedIndexMigration).toContain('(supersedes_summary_id)')
    expect(normalizedIndexMigration).toContain(
      'understanding_summary_observations_observation_id_idx',
    )
    expect(normalizedIndexMigration).toContain('(observation_id)')
    expect(normalizedIndexRollback).toContain('drop index if exists')
    expect(normalizedIndexRollback).not.toContain('drop table')
    expect(indexPostflight).toContain('indisvalid')
    expect(indexPostflight).toContain('indisready')
  })
})
