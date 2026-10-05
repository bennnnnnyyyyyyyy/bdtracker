import { NextRequest, NextResponse } from 'next/server';
import { getAccessContext, getAuthenticatedUser } from '@/lib/auth-server';
import { getSupabaseAdmin } from '@/lib/supabase';

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MAX_EMAIL_LENGTH = 254;
const MAX_DISPLAY_NAME_LENGTH = 120;
const MAX_OPENER_NAME_LENGTH = 120;

function cleanText(value: unknown, maximumLength: number) {
  if (typeof value !== 'string') return null;
  const cleaned = value.trim();
  return cleaned && cleaned.length <= maximumLength ? cleaned : null;
}

function isSameOriginRequest(request: NextRequest) {
  return request.headers.get('origin') === request.nextUrl.origin;
}

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
  if (!isSameOriginRequest(request)) {
    return NextResponse.json({ error: 'Cross-origin requests are not allowed.' }, { status: 403 });
  }
  const auth = await requireAdmin(request);
  if ('response' in auth) return auth.response;
  const body = await request.json().catch(() => null) as { email?: string; opener_name?: string; display_name?: string; role?: string } | null;
  const email = cleanText(body?.email, MAX_EMAIL_LENGTH)?.toLowerCase();
  const openerName = cleanText(body?.opener_name, MAX_OPENER_NAME_LENGTH);
  const displayName = typeof body?.display_name === 'string' ? body.display_name.trim() : '';
  const role = body?.role ?? 'agent';
  if (!email || !EMAIL_PATTERN.test(email)) return NextResponse.json({ error: 'Enter a valid email address.' }, { status: 400 });
  if (displayName.length > MAX_DISPLAY_NAME_LENGTH) return NextResponse.json({ error: `Display name must be ${MAX_DISPLAY_NAME_LENGTH} characters or fewer.` }, { status: 400 });
  if (body?.opener_name && !openerName) return NextResponse.json({ error: `Opener name must be ${MAX_OPENER_NAME_LENGTH} characters or fewer.` }, { status: 400 });
  if (role !== 'admin' && role !== 'agent') return NextResponse.json({ error: 'Role must be admin or agent.' }, { status: 400 });
  if (role === 'agent' && !openerName) return NextResponse.json({ error: 'An opener name is required for agents.' }, { status: 400 });
  const { data, error } = await auth.supabase.from('user_profiles').upsert({
    email,
    opener_name: openerName || null,
    display_name: displayName || null,
    role,
    updated_at: new Date().toISOString(),
  }, { onConflict: 'email' }).select('id,email,opener_name,role,display_name,created_at,updated_at').single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ user: data });
}

export async function DELETE(request: NextRequest) {
  if (!isSameOriginRequest(request)) {
    return NextResponse.json({ error: 'Cross-origin requests are not allowed.' }, { status: 403 });
  }
  const auth = await requireAdmin(request);
  if ('response' in auth) return auth.response;
  const body = await request.json().catch(() => null) as { email?: string } | null;
  const email = cleanText(body?.email, MAX_EMAIL_LENGTH)?.toLowerCase();
  if (!email || !EMAIL_PATTERN.test(email)) return NextResponse.json({ error: 'A valid email address is required.' }, { status: 400 });

  const { error } = await auth.supabase.from('user_profiles').delete().eq('email', email);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ success: true });
}
