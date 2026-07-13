import { NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/server/supabaseAdmin'
export async function GET() { const { data, error } = await (await getSupabaseAdmin()).from('yearly_summaries').select('year').order('year', { ascending: false }); if (error) return NextResponse.json({ error: 'Yearly summary request failed' }, { status: 500 }); return NextResponse.json(data ?? []) }
