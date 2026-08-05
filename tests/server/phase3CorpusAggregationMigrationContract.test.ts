import { readFileSync } from 'node:fs'
import path from 'node:path'

import { describe, expect, it } from 'vitest'

const migration = readFileSync(
  path.resolve(process.cwd(), 'supabase/migrations/20260803021419_phase3_corpus_aggregation.sql'),
  'utf8',
)
const rollback = readFileSync(
  path.resolve(process.cwd(), 'supabase/rollbacks/20260803021419_phase3_corpus_aggregation_rollback.sql'),
  'utf8',
)
const postflight = readFileSync(
  path.resolve(process.cwd(), 'supabase/verification/20260803_phase3_corpus_aggregation_postflight.sql'),
  'utf8',
)

const normalizedMigration = migration.replace(/\s+/g, ' ').trim().toLowerCase()
const normalizedRollback = rollback.replace(/\s+/g, ' ').trim().toLowerCase()

describe('Phase 3C corpus aggregation migration contract', () => {
  it('is atomic and keeps rollback limited to derived Phase 3C objects', () => {
    expect(normalizedMigration).toMatch(/^-- .* begin; /)
    expect(normalizedMigration).toMatch(/ commit;$/)
    expect(normalizedRollback).toContain('begin;')
    expect(normalizedRollback).toContain('commit;')
    expect(normalizedRollback).toContain('drop table if exists public.understanding_aggregates')
    expect(normalizedRollback).not.toContain('drop table if exists public.understanding_runs')
    expect(normalizedRollback).not.toContain('drop table if exists public.understanding_observations')
    expect(normalizedRollback).not.toContain('drop table if exists public.understanding_observation_evidence')
    expect(normalizedRollback).not.toContain('drop table if exists public.knowledge_chunks')
    expect(normalizedRollback).not.toContain('drop table if exists public."diarycontent"')
  })

  it('accepts only terminally reviewed observations from a completed, current run', () => {
    expect(normalizedMigration).toContain("v_run.status <> 'completed'")
    expect(normalizedMigration).toContain("review_state not in ('confirmed', 'edited', 'rejected')")
    expect(normalizedMigration).toContain("review_state in ('confirmed', 'edited')")
    expect(normalizedMigration).toContain("run_source.status <> 'completed'")
    expect(normalizedMigration).toContain("setting.usage_scope = 'private'")
    expect(normalizedMigration).toContain('setting.indexed_content_hash = run_source.source_hash')
    expect(normalizedMigration).toContain("job.status = 'completed'")
    expect(normalizedMigration).toContain('stale theme timeline run cannot be aggregated')
  })

  it('computes literal coverage and semantic counts deterministically in PostgreSQL', () => {
    expect(normalizedMigration).toContain('processed_source_count')
    expect(normalizedMigration).toContain('accepted_observation_count')
    expect(normalizedMigration).toContain("count(*) filter (where review_state = 'confirmed')")
    expect(normalizedMigration).toContain("count(*) filter (where review_state = 'edited')")
    expect(normalizedMigration).toContain('count(distinct source_id)')
    expect(normalizedMigration).toContain('min(source_date)')
    expect(normalizedMigration).toContain('max(source_date)')
    expect(normalizedMigration).toContain("md5(string_agg(source_id::text || ':' || source_hash")
    expect(normalizedMigration).toContain('theme timeline run coverage metadata is inconsistent')
    expect(normalizedMigration).toContain("date_trunc('month', observation.source_date)")
    expect(normalizedMigration).not.toContain('ollama')
    expect(normalizedMigration).not.toContain('modelscope')
  })

  it('freezes semantic version metadata and the complete observation provenance path', () => {
    expect(normalizedMigration).toContain('corpus_fingerprint text not null')
    expect(normalizedMigration).toContain('model_version text not null')
    expect(normalizedMigration).toContain('prompt_version text not null')
    expect(normalizedMigration).toContain('generation_config jsonb not null')
    expect(normalizedMigration).toContain('create table public.understanding_aggregate_observations')
    expect(normalizedMigration).toContain('references public.understanding_observations(id)')
    expect(normalizedMigration).toContain('source_hash text not null')
    expect(normalizedMigration).toContain('observation_updated_at timestamptz not null')
    expect(normalizedMigration).toContain('evidence_count integer not null')
    expect(normalizedMigration).toContain('reviewed observation is missing immutable evidence')
  })

  it('versions explicit regeneration and detects source or observation drift', () => {
    expect(normalizedMigration).toContain('p_previous_aggregate_id uuid default null')
    expect(normalizedMigration).toContain('theme timeline aggregate history changed')
    expect(normalizedMigration).toContain("set status = 'superseded'")
    expect(normalizedMigration).toContain('supersedes_aggregate_id')
    expect(normalizedMigration).toContain('understanding_aggregates_one_current_run_idx')
    expect(normalizedMigration).toContain('get_theme_timeline_aggregate_stale_reasons')
    expect(normalizedMigration).toContain("'source_snapshot_changed'::text")
    expect(normalizedMigration).toContain("'observation_snapshot_changed'::text")
  })

  it('keeps tables and invoker functions service-role-only with a least-privilege postflight', () => {
    expect(normalizedMigration).toContain('alter table public.understanding_aggregates enable row level security')
    expect(normalizedMigration).toContain('from public, anon, authenticated')
    expect(normalizedMigration).toContain('to service_role')
    expect(normalizedMigration).toContain('security invoker')
    expect(normalizedMigration).not.toContain('security definer')
    expect(postflight).toContain("has_table_privilege('anon'")
    expect(postflight).toContain("has_function_privilege('authenticated'")
    expect(postflight).toContain('indisvalid')
    expect(postflight).toContain('preserved_run_count')
    expect(postflight).toContain('preserved_evidence_count')
  })
})
