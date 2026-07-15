import dotenv from 'dotenv'
import { createClient } from '@supabase/supabase-js'
import { randomUUID } from 'node:crypto'

dotenv.config({ path: '.env.local' })

const required = ['SUPABASE_URL', 'SUPABASE_ANON_KEY', 'SUPABASE_SERVICE_ROLE_KEY', 'APP_ORIGIN', 'AUTH_PASSWORD_ADMIN', 'AUTH_PASSWORD_VIEWER']
for (const name of required) if (!process.env[name]) throw new Error(`Missing ${name}`)

const runId = randomUUID()
const tag = `batch5-audit-${runId}`
const url = process.env.SUPABASE_URL
const anon = createClient(url, process.env.SUPABASE_ANON_KEY, { auth: { persistSession: false, autoRefreshToken: false } })
const admin = createClient(url, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false, autoRefreshToken: false } })
const result = { runId, storage: {}, dataApi: {}, proxies: {}, assertions: 'pending', cleanup: 'pending' }
const created = { diaryId: null, diaryImagePath: null, summaryId: null }
const summaryYear = String(9000 + (Number.parseInt(runId.slice(0, 8), 16) % 1000))
const yearlyImagePath = `yearly/${Number.parseInt(runId.slice(0, 12), 16)}.webp`
const audioPath = `batch5-audit-${runId}.mp3`
const code = (value) => value.error ? (value.status ?? value.error.status ?? 'error') : (value.status ?? 'ok')
const record = (group, name, value) => { group[name] = code(value); return value }
const must = (value, label) => { if (value.error) throw new Error(`${label}: ${value.error.message}`); return value.data }
const expect = (condition, label) => { if (!condition) throw new Error(`baseline assertion failed: ${label}`) }

async function cookie(password) {
  const response = await fetch(`${process.env.APP_ORIGIN}/api/auth`, { method: 'POST', headers: { origin: process.env.APP_ORIGIN, 'content-type': 'application/json' }, body: JSON.stringify({ password }) })
  if (!response.ok) throw new Error(`login failed: ${response.status}`)
  return response.headers.get('set-cookie')?.split(';')[0] ?? ''
}

async function proxy(urlPath, headers = {}) { const response = await fetch(`${process.env.APP_ORIGIN}${urlPath}`, { headers }); return response.status }

try {
  const diaryDate = `2099-12-${String((Number.parseInt(runId.slice(0, 2), 16) % 28) + 1).padStart(2, '0')}`
  const diarySequence = (Number.parseInt(runId.slice(2, 10), 16) % 1_000_000) + 1
  const diaryImagePath = `${diaryDate.slice(0, 4)}/${diaryDate.replaceAll('-', '')}_${diarySequence}.webp`
  must(await admin.storage.from('2024To2025_diary_images').upload(diaryImagePath, new Blob(['batch5']), { contentType: 'image/webp', upsert: false }), 'diary proxy image fixture')
  created.diaryImagePath = diaryImagePath
  const diary = record(result.dataApi, 'diaryContent.insert', await anon.from('diaryContent').insert({ date: diaryDate, subtitle: tag, content: tag, image_paths: [diaryImagePath] }).select('id').single())
  const diaryId = must(diary, 'anon diary insert').id
  created.diaryId = diaryId
  record(result.dataApi, 'diaryContent.select', await anon.from('diaryContent').select('id').eq('id', diaryId).limit(1))
  record(result.dataApi, 'diary_AI_analysis.insert', await anon.from('diary_AI_analysis').insert({ diary_id: diaryId, summary: tag, emotion: tag }).select('id').single())
  record(result.dataApi, 'diary_AI_analysis.select', await anon.from('diary_AI_analysis').select('id').eq('diary_id', diaryId).limit(1))

  const healthId = randomUUID()
  record(result.dataApi, 'health_conditions.insert', await anon.from('health_conditions').insert({ id: healthId, condition: tag, start_date: '2099-12-01', end_date: '2099-12-02', color: '#000000' }).select('id').single())
  record(result.dataApi, 'health_conditions.select', await anon.from('health_conditions').select('id').eq('id', healthId).limit(1))
  const summary = record(result.dataApi, 'yearly_summaries.insert', await anon.from('yearly_summaries').insert({ year: summaryYear }).select('id').single())
  const summaryId = must(summary, 'anon yearly summary insert').id
  created.summaryId = summaryId
  record(result.dataApi, 'yearly_summaries.select', await anon.from('yearly_summaries').select('id').eq('id', summaryId).limit(1))
  const event = record(result.dataApi, 'important_events.insert', await anon.from('important_events').insert({ yearly_summary_id: summaryId, start_date: '2099-12-01', end_date: '2099-12-02', description: tag }).select('id').single())
  record(result.dataApi, 'important_events.select', await anon.from('important_events').select('id').eq('id', must(event, 'anon event insert').id).limit(1))
  const section = record(result.dataApi, 'ai_analysis_sections.insert', await anon.from('ai_analysis_sections').insert({ yearly_summary_id: summaryId, title: tag, content: tag }).select('id').single())
  const sectionId = must(section, 'anon section insert').id
  record(result.dataApi, 'ai_analysis_sections.select', await anon.from('ai_analysis_sections').select('id').eq('id', sectionId).limit(1))
  const opinion = record(result.dataApi, 'ai_analysis_opinions.insert', await anon.from('ai_analysis_opinions').insert({ ai_analysis_section_id: sectionId, content: tag, analysis: tag }).select('id').single())
  record(result.dataApi, 'ai_analysis_opinions.select', await anon.from('ai_analysis_opinions').select('id').eq('id', must(opinion, 'anon opinion insert').id).limit(1))
  const image = record(result.dataApi, 'yearly_images.insert', await anon.from('yearly_images').insert({ yearly_summary_id: summaryId, storage_path: yearlyImagePath, alt: tag }).select('id').single())
  record(result.dataApi, 'yearly_images.select', await anon.from('yearly_images').select('id').eq('id', must(image, 'anon image insert').id).limit(1))

  const audio = record(result.dataApi, 'audio_messages.insert', await anon.from('audio_messages').insert({ title: tag, author: tag, date: '2099-12-01', duration: 1, audio_path: audioPath }).select('id').single())
  record(result.dataApi, 'audio_messages.select', await anon.from('audio_messages').select('id').eq('id', must(audio, 'anon audio insert').id).limit(1))
  const message = record(result.dataApi, 'anonymous_messages.insert', await anon.from('anonymous_messages').insert({ content: `ok ${tag}` }).select('id').single())
  const messageId = must(message, 'anon message insert').id
  record(result.dataApi, 'anonymous_messages.select', await anon.from('anonymous_messages').select('id').eq('id', messageId).limit(1))
  record(result.dataApi, 'anonymous_messages.update', await anon.from('anonymous_messages').update({ content: `changed ${tag}` }).eq('id', messageId))
  const afterUpdate = must(await admin.from('anonymous_messages').select('content').eq('id', messageId).single(), 'verify anonymous update')
  result.dataApi['anonymous_messages.updatePersisted'] = afterUpdate.content === `changed ${tag}`
  record(result.dataApi, 'anonymous_messages.delete', await anon.from('anonymous_messages').delete().eq('id', messageId))
  const afterDelete = must(await admin.from('anonymous_messages').select('id').eq('id', messageId).maybeSingle(), 'verify anonymous delete')
  result.dataApi['anonymous_messages.existsAfterDelete'] = afterDelete !== null

  for (const bucket of ['2024To2025_diary_images', '2025_Summary_Images', 'audio_messages']) {
    const path = `batch5-audit/${runId}/new.txt`
    const group = result.storage[bucket] = {}
    record(group, 'upload', await anon.storage.from(bucket).upload(path, new Blob(['batch5']), { contentType: 'text/plain', upsert: false }))
    group.directPublicObject = (await fetch(anon.storage.from(bucket).getPublicUrl(path).data.publicUrl)).status
    record(group, 'list', await anon.storage.from(bucket).list(`batch5-audit/${runId}`))
    record(group, 'overwrite', await anon.storage.from(bucket).upload(path, new Blob(['batch5-overwrite']), { contentType: 'text/plain', upsert: true }))
    const afterOverwrite = must(await admin.storage.from(bucket).download(path), `${bucket} overwrite verification`)
    group.overwritePersisted = await afterOverwrite.text() === 'batch5-overwrite'
    record(group, 'delete', await anon.storage.from(bucket).remove([path]))
    const afterDeleteList = must(await admin.storage.from(bucket).list(`batch5-audit/${runId}`), `${bucket} delete verification`)
    group.existsAfterDelete = afterDeleteList.some((item) => item.name === 'new.txt')
  }

  const adminCookie = await cookie(process.env.AUTH_PASSWORD_ADMIN)
  const viewerCookie = await cookie(process.env.AUTH_PASSWORD_VIEWER)
  const diaries = must(await admin.from('diaryContent').select('id,image_paths').order('date', { ascending: false }).limit(50), 'diary proxy fixtures')
  const current = diaries.slice(0, 5).find((row) => row.id === created.diaryId && row.image_paths?.[0])
  const old = diaries.slice(5).find((row) => row.image_paths?.[0])
  if (!current || !old) throw new Error('insufficient diary image fixtures')
  result.proxies.diaryGuestNewest = await proxy(`/api/media/diary?path=${encodeURIComponent(current.image_paths[0])}`)
  result.proxies.diaryGuestOld = await proxy(`/api/media/diary?path=${encodeURIComponent(old.image_paths[0])}`)
  result.proxies.diaryViewerOld = await proxy(`/api/media/diary?path=${encodeURIComponent(old.image_paths[0])}`, { cookie: viewerCookie })
  const yearly = must(await admin.from('yearly_images').select('storage_path').limit(1).single(), 'yearly proxy fixture')
  result.proxies.yearlyGuest = await proxy(`/api/media/yearly?path=${encodeURIComponent(yearly.storage_path)}`)
  const audioFixture = must(await admin.from('audio_messages').select('audio_path').limit(1).single(), 'audio proxy fixture')
  result.proxies.audioAdminRange = await proxy(`/api/media/audio?path=${encodeURIComponent(audioFixture.audio_path)}`, { cookie: adminCookie, range: 'bytes=0-0' })

  expect(result.dataApi['anonymous_messages.updatePersisted'] === false, 'anonymous message update must not persist')
  expect(result.dataApi['anonymous_messages.existsAfterDelete'] === true, 'anonymous message delete must not persist')
  for (const [bucket, group] of Object.entries(result.storage)) {
    expect(group.upload === 'ok', `${bucket} anon upload baseline`)
    expect(group.directPublicObject === 200, `${bucket} public object baseline`)
    expect(group.list === 'ok', `${bucket} anon list baseline`)
    expect(group.overwritePersisted === false, `${bucket} overwrite must not persist`)
    expect(group.existsAfterDelete === true, `${bucket} delete must not persist`)
  }
  expect(result.proxies.diaryGuestNewest === 200, 'guest current diary image proxy')
  expect(result.proxies.diaryGuestOld === 403, 'guest historical diary image proxy')
  expect(result.proxies.diaryViewerOld === 200, 'viewer historical diary image proxy')
  expect(result.proxies.yearlyGuest === 200, 'guest yearly image proxy')
  expect(result.proxies.audioAdminRange === 206, 'admin audio range proxy')
  result.assertions = 'passed'
} finally {
  const cleanup = []
  for (const bucket of ['2024To2025_diary_images', '2025_Summary_Images', 'audio_messages']) {
    cleanup.push(await admin.storage.from(bucket).remove([`batch5-audit/${runId}/new.txt`]))
  }
  cleanup.push(await admin.from('diary_AI_analysis').delete().like('summary', `%${tag}%`))
  cleanup.push(created.diaryId
    ? await admin.from('diaryContent').delete().eq('id', created.diaryId)
    : await admin.from('diaryContent').delete().like('subtitle', `%${tag}%`))
  if (created.diaryImagePath) cleanup.push(await admin.storage.from('2024To2025_diary_images').remove([created.diaryImagePath]))
  cleanup.push(await admin.from('health_conditions').delete().like('condition', `%${tag}%`))
  cleanup.push(await admin.from('ai_analysis_opinions').delete().like('content', `%${tag}%`))
  cleanup.push(await admin.from('ai_analysis_sections').delete().like('title', `%${tag}%`))
  cleanup.push(await admin.from('important_events').delete().like('description', `%${tag}%`))
  cleanup.push(await admin.from('yearly_images').delete().like('alt', `%${tag}%`))
  if (created.summaryId) cleanup.push(await admin.from('yearly_summaries').delete().eq('id', created.summaryId))
  cleanup.push(await admin.from('audio_messages').delete().like('title', `%${tag}%`))
  cleanup.push(await admin.from('anonymous_messages').delete().like('content', `%${tag}%`))
  result.cleanup = cleanup.every((item) => !item.error) ? 'complete' : 'failed'
  console.log(JSON.stringify(result))
  if (result.cleanup !== 'complete') process.exitCode = 1
}

process.exit(process.exitCode ?? 0)
