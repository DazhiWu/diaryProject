import { readFileSync } from 'node:fs'
import path from 'node:path'

import { describe, expect, it } from 'vitest'

const migration = readFileSync(
  path.resolve(process.cwd(), 'supabase/migrations/20260719155837_knowledge_base_index.sql'),
  'utf8',
)
const rollback = readFileSync(
  path.resolve(process.cwd(), 'supabase/rollbacks/20260719155837_knowledge_base_index_rollback.sql'),
  'utf8',
)
const normalizedMigration = migration.replace(/\s+/g, ' ').trim().toLowerCase()
const normalizedRollback = rollback.replace(/\s+/g, ' ').trim().toLowerCase()

describe('knowledge-index migration integration contract', () => {
  it('keeps schema creation atomic and source diaries outside rollback scope', () => {
    expect(normalizedMigration).toMatch(/^-- .* begin; /)
    expect(normalizedMigration).toMatch(/ commit;$/)
    expect(normalizedRollback).toContain('begin;')
    expect(normalizedRollback).toContain('commit;')
    expect(normalizedRollback).not.toContain('drop table if exists public."diarycontent"')
    expect(normalizedRollback).not.toContain('drop extension')
  })

  it('queues inserts and relevant diary updates without making external calls', () => {
    expect(normalizedMigration).toContain(
      'after insert or update of date, subtitle, content on public."diarycontent"',
    )
    expect(normalizedMigration).toContain(
      "on conflict (source_id) do update set status = 'pending'",
    )
    expect(normalizedMigration).toContain('started_at = null')
    expect(normalizedMigration).toContain('completed_at = null')
  })

  it('claims concurrent work with row locking, stale recovery, and bounded batches', () => {
    expect(normalizedMigration).toContain("job.status = 'pending'")
    expect(normalizedMigration).toContain(
      "job.status = 'processing' and job.started_at < now() - interval '10 minutes'",
    )
    expect(normalizedMigration).toContain('for update skip locked')
    expect(normalizedMigration).toContain(
      'limit least(greatest(coalesce(p_limit, 10), 1), 25)',
    )
    expect(normalizedMigration).toContain('attempts = job.attempts + 1')
    expect(normalizedMigration).toContain("set status = 'processing'")
    expect(normalizedMigration).toContain(
      'create index knowledge_index_jobs_pending_queue_idx',
    )
    expect(normalizedMigration).toContain(
      "where status = 'pending'",
    )
    expect(normalizedMigration).toContain(
      'create index knowledge_index_jobs_processing_started_idx',
    )
  })

  it('replaces chunks and completes the queue row in one database function call', () => {
    expect(normalizedMigration).toContain(
      'create or replace function public.replace_diary_knowledge_chunks(',
    )
    expect(normalizedMigration).toContain(
      'delete from public.knowledge_chunks where source_id = p_source_id',
    )
    expect(normalizedMigration).toContain('insert into public.knowledge_chunks')
    expect(normalizedMigration).toContain(
      'update public.knowledge_source_settings set indexed_content_hash = p_source_hash',
    )
    expect(normalizedMigration).toContain(
      "update public.knowledge_index_jobs set status = 'completed'",
    )
  })

  it('keeps tables and privileged functions service-role-only', () => {
    expect(normalizedMigration).toContain(
      'revoke all privileges on table public.knowledge_source_settings, public.knowledge_chunks, public.knowledge_index_jobs from public, anon, authenticated',
    )
    expect(normalizedMigration).toContain(
      'grant select, insert, update, delete on table public.knowledge_source_settings, public.knowledge_chunks, public.knowledge_index_jobs to service_role',
    )
    expect(normalizedMigration.match(/security invoker/g)?.length).toBe(4)
    expect(normalizedMigration).toContain(
      'revoke all on function public.claim_knowledge_index_jobs(integer) from public, anon, authenticated',
    )
    expect(normalizedMigration).toContain(
      'revoke all on function public.replace_diary_knowledge_chunks(bigint, date, text, text, text, jsonb) from public, anon, authenticated',
    )
    expect(normalizedMigration).toContain(
      'revoke all on function public.search_private_knowledge(extensions.vector, text, integer, date, date) from public, anon, authenticated',
    )
  })
})
