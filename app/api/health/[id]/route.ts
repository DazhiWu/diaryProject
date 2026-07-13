import { NextResponse } from 'next/server'
import { assertAllowedOrigin } from '@/lib/server/origin'
import { HttpError, readSession, requireAdmin } from '@/lib/server/session'
import { getSupabaseAdmin } from '@/lib/server/supabaseAdmin'
function responseFor(error: unknown) { return error instanceof HttpError ? NextResponse.json({ error: error.message }, { status: error.status }) : NextResponse.json({ error: 'Health request failed' }, { status: 500 }) }
export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) { try { await assertAllowedOrigin(request); requireAdmin(await readSession(request.headers.get('cookie'))); const { error } = await (await getSupabaseAdmin()).from('health_conditions').delete().eq('id', (await params).id); if (error) throw new Error('Health delete failed'); return new Response(null, { status: 204 }) } catch (error) { return responseFor(error) } }
