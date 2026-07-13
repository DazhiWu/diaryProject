import { NextResponse } from 'next/server'

import { assertAllowedOrigin } from '@/lib/server/origin'
import { HttpError, readSession, requireAdmin } from '@/lib/server/session'
import { getSupabaseAdmin } from '@/lib/server/supabaseAdmin'

function responseFor(error: unknown) { return error instanceof HttpError ? NextResponse.json({ error: error.message }, { status: error.status }) : NextResponse.json({ error: 'Health request failed' }, { status: 500 }) }
function output(row: any) { return { id: row.id, condition: row.condition, startDate: row.start_date, endDate: row.end_date, color: row.color, created_at: row.created_at } }
export async function GET() { try { const { data, error } = await (await getSupabaseAdmin()).from('health_conditions').select('*').order('created_at', { ascending: false }); if (error) throw new Error('Health query failed'); return NextResponse.json((data ?? []).map(output)) } catch (error) { return responseFor(error) } }
export async function POST(request: Request) { try { await assertAllowedOrigin(request); requireAdmin(await readSession(request.headers.get('cookie'))); const body = await request.json(); if (!body || typeof body.condition !== 'string' || typeof body.startDate !== 'string' || typeof body.endDate !== 'string' || typeof body.color !== 'string') throw new HttpError(400, 'Invalid health condition'); const { data, error } = await (await getSupabaseAdmin()).from('health_conditions').insert({ id: crypto.randomUUID(), condition: body.condition, start_date: body.startDate, end_date: body.endDate, color: body.color }).select('*').single(); if (error) throw new Error('Health write failed'); return NextResponse.json(output(data), { status: 201 }) } catch (error) { return responseFor(error) } }
