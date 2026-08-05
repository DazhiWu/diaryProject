import { readFileSync } from 'node:fs'
import path from 'node:path'

import { describe, expect, it } from 'vitest'

const migration = readFileSync(
  path.resolve(process.cwd(), 'supabase/migrations/20260803082412_phase3_theme_semantic_quality_v4.sql'),
  'utf8',
)
const rollback = readFileSync(
  path.resolve(process.cwd(), 'supabase/rollbacks/20260803082412_phase3_theme_semantic_quality_v4_rollback.sql'),
  'utf8',
)
const postflight = readFileSync(
  path.resolve(process.cwd(), 'supabase/verification/20260803_phase3_theme_semantic_quality_v4_postflight.sql'),
  'utf8',
)

const normalizedMigration = migration.replace(/\s+/g, ' ').trim().toLowerCase()
const normalizedRollback = rollback.replace(/\s+/g, ' ').trim().toLowerCase()

describe('Phase 3A v4 semantic-quality migration contract', () => {
  it('is atomic and refuses destructive rollback after v4 data exists', () => {
    expect(normalizedMigration).toMatch(/^-- .* begin; /)
    expect(normalizedMigration).toMatch(/ commit;$/)
    expect(normalizedRollback).toContain('begin;')
    expect(normalizedRollback).toContain('commit;')
    expect(normalizedRollback).toContain('cannot roll back phase 3a v4 while v4 run data exists')
    expect(normalizedRollback).not.toContain('drop table if exists public.understanding_runs')
    expect(normalizedRollback).not.toContain('drop table if exists public.understanding_observations')
    expect(normalizedRollback).not.toContain('drop table if exists public.knowledge_chunks')
  })

  it('freezes a bounded structured theme contract and pipeline version per run', () => {
    expect(normalizedMigration).toContain('create table public.understanding_run_semantic_configs')
    expect(normalizedMigration).toContain('theme_spec jsonb not null')
    expect(normalizedMigration).toContain("jsonb_typeof(theme_spec -> 'include') = 'array'")
    expect(normalizedMigration).toContain("jsonb_array_length(theme_spec -> 'include') between 1 and 12")
    expect(normalizedMigration).toContain('create_theme_timeline_run_v4')
    expect(normalizedMigration).toContain('create_theme_timeline_run_with_config')
  })

  it('stores relevant or uncertain scope plus multiple exact sentence ranges', () => {
    expect(normalizedMigration).toContain('create table public.understanding_observation_scopes')
    expect(normalizedMigration).toContain("decision in ('relevant', 'uncertain')")
    expect(normalizedMigration).toContain('understanding_observation_evidence_precise_range_key')
    expect(normalizedMigration).toContain('unique (observation_id, chunk_id, char_start, char_end)')
    expect(normalizedMigration).toContain("evidence.\"unitid\" = (")
    expect(normalizedMigration).toContain('evidence.excerpt = substring(')
    expect(normalizedMigration).toContain('v_inserted_evidence_count <> v_expected_evidence_count')
  })

  it('requires observation review before the first summary can complete a run', () => {
    expect(normalizedMigration).toContain("else 'awaiting_review'")
    expect(normalizedMigration).toContain("run.status in ('awaiting_review', 'completed')")
    expect(normalizedMigration).toContain('finalize_reviewed_theme_timeline_run_v4')
    expect(normalizedMigration).toContain("review_state not in ('confirmed', 'edited', 'rejected')")
    expect(normalizedMigration).toContain("review_state in ('confirmed', 'edited')")
    expect(normalizedMigration).toContain('must include every accepted observation')
  })

  it('keeps new tables and invoker functions service-role-only and supplies a read-only postflight', () => {
    expect(normalizedMigration).toContain('alter table public.understanding_run_semantic_configs enable row level security')
    expect(normalizedMigration).toContain('from public, anon, authenticated')
    expect(normalizedMigration).toContain('security invoker')
    expect(normalizedMigration).not.toContain('security definer')
    expect(postflight).toContain('SET TRANSACTION READ ONLY')
    expect(postflight).toContain("has_table_privilege('anon'")
    expect(postflight).toContain("has_function_privilege('authenticated'")
    expect(postflight).toContain('review-before-first-summary lifecycle')
    expect(postflight).toContain('preserved_evidence_count')
  })
})
