import { NextRequest, NextResponse } from 'next/server';
import { SESSION_COOKIE, getAuthSecret, isDevAuthBypass, readSessionValue } from '@/lib/session';

// Everyone must be signed in with their own account. /api/sync (CRON_SECRET) and /api/mirror (the shared sheet secret) are excluded
// and so are the sign-in page and endpoint. Role checks happen inside the route handlers.
export async function proxy(request: NextRequest) {
  if (isDevAuthBypass()) return NextResponse.next();

  const { pathname } = request.nextUrl;
  const isApi = pathname.startsWith('/api/');

  if (!getAuthSecret()) {
    // Production without AUTH_SECRET: fail closed.
    const message = 'AUTH_SECRET is not configured on the server.';
    return isApi ? NextResponse.json({ error: message }, { status: 503 }) : new NextResponse(message, { status: 503 });
  }

  if (await readSessionValue(request.cookies.get(SESSION_COOKIE)?.value)) return NextResponse.next();

  if (isApi) return NextResponse.json({ error: 'Please sign in.' }, { status: 401 });

  const login = new URL('/login', request.url);
  if (pathname !== '/') login.searchParams.set('next', pathname);
  return NextResponse.redirect(login);
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|login|api/auth/login|api/sync|api/mirror|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)'],
};
