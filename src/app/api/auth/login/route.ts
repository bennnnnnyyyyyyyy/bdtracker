import { NextRequest, NextResponse } from 'next/server';
import { SESSION_COOKIE, SESSION_MAX_AGE_SECONDS, createSessionValue, getAuthSecret } from '@/lib/session';
import { verifyPassword } from '@/lib/password';
import { findUserByEmail, normalizeEmail, updateUser } from '@/lib/users';
import { isSameOriginJson } from '@/lib/api-auth';

export const runtime = 'nodejs';

// Per-instance brute-force throttle: 8 failures per IP+email per 15 minutes.
const WINDOW_MS = 15 * 60 * 1000;
const MAX_FAILURES = 8;
const failures = new Map<string, { count: number; resetAt: number }>();

// Used to spend the same time on unknown emails as on real ones.
const DUMMY_HASH = 'scrypt$16384$8$1$AAAAAAAAAAAAAAAAAAAAAA==$' + 'A'.repeat(86) + '==';

export async function POST(request: NextRequest) {
  if (!getAuthSecret()) {
    return NextResponse.json({ error: 'AUTH_SECRET is not configured on the server.' }, { status: 503 });
  }
  if (!isSameOriginJson(request)) return NextResponse.json({ error: 'Invalid request.' }, { status: 400 });

  let email = '';
  let password = '';
  try {
    const body = await request.json();
    email = normalizeEmail(body?.email);
    password = typeof body?.password === 'string' ? body.password : '';
  } catch {
    // fall through with empty credentials
  }

  const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown';
  const key = `${ip}|${email}`;
  const now = Date.now();
  const entry = failures.get(key);
  if (entry && entry.resetAt > now && entry.count >= MAX_FAILURES) {
    return NextResponse.json({ error: 'Too many attempts. Try again in a few minutes.' }, { status: 429 });
  }

  try {
    const user = email ? await findUserByEmail(email) : null;
    const passwordOk = await verifyPassword(password, user?.passwordHash ?? DUMMY_HASH);
    if (!user || !user.active || !passwordOk) {
      failures.set(key, entry && entry.resetAt > now ? { ...entry, count: entry.count + 1 } : { count: 1, resetAt: now + WINDOW_MS });
      return NextResponse.json({ error: 'Incorrect email or password.' }, { status: 401 });
    }

    failures.delete(key);
    await updateUser(user.id, { lastLoginAt: new Date().toISOString() });
    const response = NextResponse.json({
      success: true,
      user: { id: user.id, name: user.name, email: user.email, role: user.role },
      mustChangePassword: user.mustChangePassword,
    });
    response.cookies.set(SESSION_COOKIE, await createSessionValue({ id: user.id, name: user.name, email: user.email, role: user.role }), {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/',
      maxAge: SESSION_MAX_AGE_SECONDS,
    });
    return response;
  } catch (error) {
    console.error('Login failed:', error);
    return NextResponse.json({ error: 'Sign-in is temporarily unavailable.' }, { status: 503 });
  }
}
