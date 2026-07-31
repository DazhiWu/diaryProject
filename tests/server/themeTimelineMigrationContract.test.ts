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
const ollamaConfigMigration = readFileSync(
  path.resolve(process.cwd(), 'supabase/migrations/20260731015350_phase3_ollama_run_config.sql'),
  'utf8',
)
const ollamaConfigRollback = readFileSync(
  path.resolve(process.cwd(), 'supabase/rollbacks/20260731015350_phase3_ollama_run_config_rollback.sql'),
  'utf8',
)
const ollamaConfigPostflight = readFileSync(
  path.resolve(process.cwd(), 'supabase/verification/20260731_phase3_ollama_run_config_postflight.sql'),
  'utf8',
)
const observationReviewMigration = readFileSync(
  path.resolve(process.cwd(), 'supabase/migrations/20260731062228_phase3_observation_review.sql'),
  'utf8',
)
const observationReviewRollback = readFileSync(
  path.resolve(process.cwd(), 'supabase/rollbacks/20260731062228_phase3_observation_review_rollback.sql'),
  'utf8',
)
const observationReviewPostflight = readFileSync(
  path.resolve(process.cwd(), 'supabase/verification/20260731_phase3_observation_review_postflight.sql'),
  'utf8',
)
const summaryRegenerationMigration = readFileSync(
  path.resolve(process.cwd(), 'supabase/migrations/20260731070803_phase3_summary_regeneration.sql'),
  'utf8',
)
const summaryRegenerationRollback = readFileSync(
  path.resolve(process.cwd(), 'supabase/rollbacks/20260731070803_phase3_summary_regeneration_rollback.sql'),
  'utf8',
)
const summaryRegenerationPostflight = readFileSync(
  path.resolve(process.cwd(), 'supabase/verification/20260731_phase3_summary_regeneration_postflight.sql'),
  'utf8',
)
const normalizedMigration = migration.replace(/\s+/g, ' ').trim().toLowerCase()
const normalizedRollback = rollback.replace(/\s+/g, ' ').trim().toLowerCase()
const normalizedIndexMigration = indexMigration.replace(/\s+/g, ' ').trim().toLowerCase()
const normalizedIndexRollback = indexRollback.replace(/\s+/g, ' ').trim().toLowerCase()
const normalizedOllamaConfigMigration = ollamaConfigMigration.replace(/\s+/g, ' ').trim().toLowerCase()
const normalizedOllamaConfigRollback = ollamaConfigRollback.replace(/\s+/g, ' ').trim().toLowerCase()
const normalizedObservationReviewMigration = observationReviewMigration.replace(/\s+/g, ' ').trim().toLowerCase()
const normalizedObservationReviewRollback = observationReviewRollback.replace(/\s+/g, ' ').trim().toLowerCase()
const normalizedSummaryRegenerationMigration = summaryRegenerationMigration.replace(/\s+/g, ' ').trim().toLowerCase()
const normalizedSummaryRegenerationRollback = summaryRegenerationRollback.replace(/\s+/g, ' ').trim().toLowerCase()

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

  it('persists local Ollama controls through a service-role-only atomic wrapper', () => {
    expect(normalizedOllamaConfigMigration).toMatch(/^-- .* begin; /)
    expect(normalizedOllamaConfigMigration).toMatch(/ commit;$/)
    expect(normalizedOllamaConfigMigration).toContain('generation_config jsonb')
    expect(normalizedOllamaConfigMigration).toContain('create_theme_timeline_run_with_config')
    expect(normalizedOllamaConfigMigration).toContain('security invoker')
    expect(normalizedOllamaConfigMigration).toContain('from public, anon, authenticated')
    expect(normalizedOllamaConfigMigration).toContain('to service_role')
    expect(normalizedOllamaConfigRollback).toContain('drop function if exists')
    expect(normalizedOllamaConfigRollback).toContain('drop column if exists generation_config')
    expect(ollamaConfigPostflight).toContain("has_function_privilege('anon'")
    expect(ollamaConfigPostflight).toContain('configured_run_count')
  })

  it('adds append-only observation review history without weakening source idempotency', () => {
    expect(normalizedObservationReviewMigration).toMatch(/^-- .* begin; /)
    expect(normalizedObservationReviewMigration).toMatch(/ commit;$/)
    expect(normalizedObservationReviewMigration).toContain('create table public.understanding_observation_reviews')
    expect(normalizedObservationReviewMigration).toContain("action in ('confirm', 'edit', 'reject')")
    expect(normalizedObservationReviewMigration).toContain('previous_statement text not null')
    expect(normalizedObservationReviewMigration).toContain('resulting_statement text not null')
    expect(normalizedObservationReviewMigration).toContain('create or replace function public.review_theme_timeline_observation')
    expect(normalizedObservationReviewMigration).toContain('stale theme timeline observation cannot be reviewed')
    expect(normalizedObservationReviewMigration).toContain("summary.review_state in ('proposed', 'confirmed', 'edited')")
    expect(normalizedObservationReviewMigration).not.toContain('drop constraint understanding_observations_run_id_source_id_key')
  })

  it('keeps observation reviews private and supplies a data-restoring rollback', () => {
    expect(normalizedObservationReviewMigration).toContain('enable row level security')
    expect(normalizedObservationReviewMigration).toContain('from public, anon, authenticated')
    expect(normalizedObservationReviewMigration).toContain('to service_role')
    expect(normalizedObservationReviewMigration).not.toContain('security definer')
    expect(normalizedObservationReviewRollback).toContain('previous_statement')
    expect(normalizedObservationReviewRollback).toContain('previous_review_state')
    expect(normalizedObservationReviewRollback).toContain('previous_updated_at')
    expect(normalizedObservationReviewRollback).toContain('drop function if exists public.review_theme_timeline_observation')
    expect(normalizedObservationReviewRollback).not.toContain('drop table if exists public.understanding_observations')
    expect(normalizedObservationReviewRollback).not.toContain('drop table if exists public.understanding_observation_evidence')
    expect(observationReviewPostflight).toContain("has_table_privilege('anon'")
    expect(observationReviewPostflight).toContain("has_function_privilege('authenticated'")
    expect(observationReviewPostflight).toContain('observation_count')
    expect(observationReviewPostflight).toContain('evidence_count')
  })

  it('regenerates summaries only from terminally reviewed observations', () => {
    expect(normalizedSummaryRegenerationMigration).toMatch(/^-- .* begin; /)
    expect(normalizedSummaryRegenerationMigration).toMatch(/ commit;$/)
    expect(normalizedSummaryRegenerationMigration).toContain(
      'create or replace function public.regenerate_theme_timeline_summary',
    )
    expect(normalizedSummaryRegenerationMigration).toContain("status = 'completed'")
    expect(normalizedSummaryRegenerationMigration).toContain(
      "review_state not in ('confirmed', 'edited', 'rejected')",
    )
    expect(normalizedSummaryRegenerationMigration).toContain(
      "review_state in ('confirmed', 'edited')",
    )
    expect(normalizedSummaryRegenerationMigration).toContain('p_previous_summary_id')
    expect(normalizedSummaryRegenerationMigration).toContain(
      'stale theme timeline run cannot regenerate a summary',
    )
  })

  it('keeps summary regeneration service-role-only with a non-destructive rollback', () => {
    expect(normalizedSummaryRegenerationMigration).toContain('security invoker')
    expect(normalizedSummaryRegenerationMigration).toContain('from public, anon, authenticated')
    expect(normalizedSummaryRegenerationMigration).toContain('to service_role')
    expect(normalizedSummaryRegenerationMigration).not.toContain('security definer')
    expect(normalizedSummaryRegenerationRollback).toContain(
      'drop function if exists public.regenerate_theme_timeline_summary',
    )
    expect(normalizedSummaryRegenerationRollback).not.toContain('delete from')
    expect(normalizedSummaryRegenerationRollback).not.toContain('drop table')
    expect(summaryRegenerationPostflight).toContain("has_function_privilege")
    expect(summaryRegenerationPostflight).toContain('summary_count')
  })
})
