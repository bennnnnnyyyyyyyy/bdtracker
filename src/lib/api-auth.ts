import { NextRequest, NextResponse } from 'next/server';
import { DEV_VIEWER, SESSION_COOKIE, canConfirm, isDevAuthBypass, readSessionValue } from './session';
import { findUserById, normalizeEmail } from './users';
import type { UserRole, ViewerInfo } from '../types/dashboard';

/** The signed-in user from the session cookie (no database lookup). */
export async function getRequestUser(request: NextRequest): Promise<ViewerInfo | null> {
  if (isDevAuthBypass()) return DEV_VIEWER;
  const session = await readSessionValue(request.cookies.get(SESSION_COOKIE)?.value);
  return session ? { id: session.id, name: session.name, email: session.email, role: session.role } : null;
}

/** Rejects cross-site form posts: state-changing requests must be JSON from this site. */
export function isSameOriginJson(request: NextRequest): boolean {
  if (!(request.headers.get('content-type') || '').includes('application/json')) return false;
  const origin = request.headers.get('origin');
  if (!origin) return true; // same-origin fetches from some clients omit Origin
  return origin === request.nextUrl.origin || new URL(origin).host === request.headers.get('host');
}

/** A multipart upload from this site: right content type AND an Origin header that matches. */
export function isSameOriginForm(request: NextRequest): boolean {
  if (!(request.headers.get('content-type') || '').includes('multipart/form-data')) return false;
  const origin = request.headers.get('origin');
  if (!origin) return false;
  return origin === request.nextUrl.origin || new URL(origin).host === request.headers.get('host');
}

type Guard = { user: ViewerInfo; response?: undefined } | { user?: undefined; response: NextResponse };

/**
 * For state-changing routes: requires a valid session AND re-checks the database so a user who
 * was disabled or demoted loses access immediately, not when their cookie expires.
 */
export async function requireUser(request: NextRequest, roles?: UserRole[], opts: { form?: boolean } = {}): Promise<Guard> {
  // File uploads are multipart forms; they must carry an Origin header that matches this site.
  const sameOrigin = opts.form ? isSameOriginForm(request) : isSameOriginJson(request);
  if (!sameOrigin) {
    return { response: NextResponse.json({ error: 'Invalid request.' }, { status: 400 }) };
  }
  const sessionUser = await getRequestUser(request);
  if (!sessionUser) return { response: NextResponse.json({ error: 'Please sign in.' }, { status: 401 }) };
  if (sessionUser.id === 'dev') return { user: sessionUser };

  let fresh;
  try {
    fresh = await findUserById(sessionUser.id);
  } catch (error) {
    console.error('Account lookup failed:', error);
    return { response: NextResponse.json({ error: 'The account service is unavailable. Check the Supabase connection.' }, { status: 503 }) };
  }
  if (!fresh || !fresh.active) return { response: NextResponse.json({ error: 'This account is disabled.' }, { status: 401 }) };
  const user: ViewerInfo = { id: fresh.id, name: fresh.name, email: normalizeEmail(fresh.email), role: fresh.role };
  if (roles && !roles.includes(user.role)) return { response: NextResponse.json({ error: 'You do not have permission to do this.' }, { status: 403 }) };
  return { user };
}

export { canConfirm };
