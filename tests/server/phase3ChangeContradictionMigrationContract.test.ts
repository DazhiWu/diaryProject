import { readFileSync } from 'node:fs'
import path from 'node:path'

import { describe, expect, it } from 'vitest'

const migration = readFileSync(
  path.resolve(process.cwd(), 'supabase/migrations/20260803034844_phase3_change_contradiction_analysis.sql'),
  'utf8',
)
const rollback = readFileSync(
  path.resolve(process.cwd(), 'supabase/rollbacks/20260803034844_phase3_change_contradiction_analysis_rollback.sql'),
  'utf8',
)
const postflight = readFileSync(
  path.resolve(process.cwd(), 'supabase/verification/20260803_phase3_change_contradiction_analysis_postflight.sql'),
  'utf8',
)

const normalizedMigration = migration.replace(/\s+/g, ' ').trim().toLowerCase()
const normalizedRollback = rollback.replace(/\s+/g, ' ').trim().toLowerCase()

describe('Phase 3D change and contradiction migration contract', () => {
  it('is atomic and leaves source, review, and aggregate records intact on rollback', () => {
    expect(normalizedMigration).toMatch(/^-- .* begin; /)
    expect(normalizedMigration).toMatch(/ commit;$/)
    expect(normalizedRollback).toContain('begin;')
    expect(normalizedRollback).toContain('commit;')
    expect(normalizedRollback).toContain('drop table if exists public.understanding_comparisons')
    expect(normalizedRollback).not.toContain('drop table if exists public.understanding_aggregates')
    expect(normalizedRollback).not.toContain('drop table if exists public.understanding_observations')
    expect(normalizedRollback).not.toContain('drop table if exists public.understanding_observation_evidence')
    expect(normalizedRollback).not.toContain('drop table if exists public."diarycontent"')
  })

  it('compares two real months from one current non-stale aggregate', () => {
    expect(normalizedMigration).toContain("comparison_type = 'theme_timeline_period_change'")
    expect(normalizedMigration).toContain('left_period_start < right_period_start')
    expect(normalizedMigration).toContain("v_aggregate.status <> 'current'")
    expect(normalizedMigration).toContain('get_theme_timeline_aggregate_stale_reasons')
    expect(normalizedMigration).toContain('understanding_aggregate_periods')
    expect(normalizedMigration).toContain('theme timeline comparison periods need reviewed observations')
  })

  it('freezes proposed findings and both sides of aggregate-owned provenance', () => {
    expect(normalizedMigration).toContain('create table public.understanding_comparison_findings')
    expect(normalizedMigration).toContain("finding_type in ('continuity', 'change', 'possible_contradiction', 'turning_point')")
    expect(normalizedMigration).toContain("review_state text not null default 'proposed'")
    expect(normalizedMigration).toContain("period_side text not null check (period_side in ('left', 'right'))")
    expect(normalizedMigration).toContain('references public.understanding_aggregate_observations(aggregate_id, observation_id)')
    expect(normalizedMigration).toContain('date_trunc(\'month\', observation.source_date)')
  })

  it('keeps possible contradictions and turning points as explicit inferences', () => {
    expect(normalizedMigration).toContain("finding_type not in ('possible_contradiction', 'turning_point') or classification = 'inference'")
    expect(normalizedMigration).toContain("v_finding_type in ('possible_contradiction', 'turning_point')")
    expect(normalizedMigration).toContain("v_resulting_classification <> 'inference'")
  })

  it('versions regeneration, exposes stale reasons, and appends review history', () => {
    expect(normalizedMigration).toContain('p_previous_comparison_id uuid')
    expect(normalizedMigration).toContain('theme timeline comparison history changed')
    expect(normalizedMigration).toContain("set status = 'superseded'")
    expect(normalizedMigration).toContain('get_theme_timeline_comparison_stale_reasons')
    expect(normalizedMigration).toContain("'aggregate_changed'::text")
    expect(normalizedMigration).toContain("'period_snapshot_changed'::text")
    expect(normalizedMigration).toContain('understanding_comparison_finding_reviews')
  })

  it('keeps all tables and invoker functions service-role-only', () => {
    expect(normalizedMigration).toContain('alter table public.understanding_comparisons enable row level security')
    expect(normalizedMigration).toContain('from public, anon, authenticated')
    expect(normalizedMigration).toContain('to service_role')
    expect(normalizedMigration).toContain('security invoker')
    expect(normalizedMigration).not.toContain('security definer')
    expect(postflight).toContain("has_table_privilege('anon'")
    expect(postflight).toContain("has_function_privilege('authenticated'")
    expect(postflight).toContain('preserved_aggregate_count')
    expect(postflight).toContain('preserved_evidence_count')
  })
})
