import { NextRequest, NextResponse } from 'next/server';
import { SESSION_COOKIE, isAuthDisabled, isValidSessionToken } from '@/lib/auth';

// Protects the dashboard page and its API routes with the shared DASHBOARD_PASSWORD.
// /api/sync is excluded: it has its own CRON_SECRET check. Login routes must stay reachable.
export async function proxy(request: NextRequest) {
  if (isAuthDisabled()) return NextResponse.next();

  const { pathname } = request.nextUrl;
  const isApi = pathname.startsWith('/api/');

  if (!process.env.DASHBOARD_PASSWORD) {
    // Production without a password configured: fail closed.
    return isApi
      ? NextResponse.json({ error: 'DASHBOARD_PASSWORD is not configured on the server.' }, { status: 503 })
      : new NextResponse('DASHBOARD_PASSWORD is not configured on the server.', { status: 503 });
  }

  if (await isValidSessionToken(request.cookies.get(SESSION_COOKIE)?.value)) {
    return NextResponse.next();
  }

  if (isApi) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const login = new URL('/login', request.url);
  if (pathname !== '/') login.searchParams.set('next', pathname);
  return NextResponse.redirect(login);
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|login|api/login|api/logout|api/sync|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)'],
};
