import { createServerClient } from '@supabase/ssr';
import { NextRequest } from 'next/server';
import { getSupabaseAdmin } from './supabase';
import { isAdminEmail, UserProfile, Viewer } from './auth';

export type AccessContext = {
  user: { id: string; email?: string; user_metadata?: Record<string, unknown> };
  profile: UserProfile | null;
  viewer: Viewer;
};

export async function getAuthenticatedUser(request: NextRequest) {
  const { data: { user } } = await getCookieClient(request).auth.getUser();
  return user || null;
}

function getCookieClient(request: NextRequest) {
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => request.cookies.getAll(),
        setAll: () => {
          // Middleware refreshes the session cookies before API handlers run.
        },
      },
    },
  );
}

export async function getAccessContext(request: NextRequest): Promise<AccessContext | null> {
  const user = await getAuthenticatedUser(request);
  if (!user?.email) return null;

  const email = user.email.trim().toLowerCase();
  const admin = isAdminEmail(email);
  let profile: UserProfile | null = null;

  const adminClient = getSupabaseAdmin();
  if (adminClient) {
    const { data } = await adminClient
      .from('user_profiles')
      .select('id,email,opener_name,role,display_name')
      .eq('email', email)
      .maybeSingle();
    profile = data as UserProfile | null;
  }

  if (!admin && (!profile || profile.role !== 'agent' || !profile.opener_name)) return null;

  const metadata = user.user_metadata || {};
  const displayName = profile?.display_name || String(metadata.full_name || metadata.name || email);
  const avatarUrl = String(metadata.avatar_url || metadata.picture || '');

  return {
    user,
    profile,
    viewer: {
      email,
      displayName,
      avatarUrl,
      role: admin ? 'admin' : 'agent',
      openerName: profile?.opener_name || null,
      isAdmin: admin,
    },
  };
}
