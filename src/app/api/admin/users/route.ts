import { NextRequest, NextResponse } from 'next/server';
import { getAccessContext, getAuthenticatedUser } from '@/lib/auth-server';
import { getSupabaseAdmin } from '@/lib/supabase';

async function requireAdmin(request: NextRequest) {
  const user = await getAuthenticatedUser(request);
  if (!user) return { response: NextResponse.json({ error: 'Authentication required.' }, { status: 401 }) };
  const access = await getAccessContext(request);
  if (!access?.viewer.isAdmin) return { response: NextResponse.json({ error: 'Administrator access required.' }, { status: 403 }) };
  const supabase = getSupabaseAdmin();
  if (!supabase) return { response: NextResponse.json({ error: 'Supabase service configuration is missing.' }, { status: 503 }) };
  return { supabase };
}

export async function GET(request: NextRequest) {
  const auth = await requireAdmin(request);
  if ('response' in auth) return auth.response;
  const { data, error } = await auth.supabase.from('user_profiles').select('id,email,opener_name,role,display_name,created_at,updated_at').order('email');
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ users: data || [] });
}

export async function POST(request: NextRequest) {
  const auth = await requireAdmin(request);
  if ('response' in auth) return auth.response;
  const body = await request.json().catch(() => null) as { email?: string; opener_name?: string; display_name?: string; role?: string } | null;
  const email = body?.email?.trim().toLowerCase();
  const openerName = body?.opener_name?.trim();
  const role = body?.role === 'admin' ? 'admin' : 'agent';
  if (!email || !openerName && role === 'agent') return NextResponse.json({ error: 'Email and opener name are required for agents.' }, { status: 400 });
  const { data, error } = await auth.supabase.from('user_profiles').upsert({
    email,
    opener_name: openerName || null,
    display_name: body?.display_name?.trim() || null,
    role,
    updated_at: new Date().toISOString(),
  }, { onConflict: 'email' }).select('id,email,opener_name,role,display_name,created_at,updated_at').single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ user: data });
}
