import { NextResponse } from 'next/server'

import { assertAllowedOrigin } from '@/lib/server/origin'
import { HttpError, readSession, requireAdmin, requireViewer } from '@/lib/server/session'
import { getSupabaseAdmin } from '@/lib/server/supabaseAdmin'
import { dateRangeFields, FIELD_LIMITS, readJsonBody, REQUEST_LIMITS, stringField } from '@/lib/server/requestLimits'

function responseFor(error: unknown) { return error instanceof HttpError ? NextResponse.json({ error: error.message }, { status: error.status }) : NextResponse.json({ error: 'Health request failed' }, { status: 500 }) }
function output(row: any) { return { id: row.id, condition: row.condition, startDate: row.start_date, endDate: row.end_date, color: row.color, created_at: row.created_at } }
export async function GET(request: Request) { try { requireViewer(await readSession(request.headers.get('cookie'))); const { data, error } = await (await getSupabaseAdmin()).from('health_conditions').select('*').order('created_at', { ascending: false }); if (error) throw new Error('Health query failed'); return NextResponse.json((data ?? []).map(output)) } catch (error) { return responseFor(error) } }
export async function POST(request: Request) { try { await assertAllowedOrigin(request); requireAdmin(await readSession(request.headers.get('cookie'))); const body = await readJsonBody(request, REQUEST_LIMITS.healthJson) as Record<string, unknown> | null; const range = dateRangeFields(body?.startDate, body?.endDate); const values = { id: crypto.randomUUID(), condition: stringField(body?.condition, 'health condition', { min: 1, max: FIELD_LIMITS.healthCondition, trim: true }), start_date: range.start, end_date: range.end, color: stringField(body?.color, 'health color', { min: 1, max: 32 }) }; const { data, error } = await (await getSupabaseAdmin()).from('health_conditions').insert(values).select('*').single(); if (error) throw new Error('Health write failed'); return NextResponse.json(output(data), { status: 201 }) } catch (error) { return responseFor(error) } }
