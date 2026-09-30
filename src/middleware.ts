import { NextRequest, NextResponse } from 'next/server';

export function middleware(request: NextRequest) {
  if (process.env.NODE_ENV !== 'production') return NextResponse.next();

  const user = process.env.DASHBOARD_AUTH_USER;
  const password = process.env.DASHBOARD_AUTH_PASSWORD;
  const header = request.headers.get('authorization');
  const isAuthorized = Boolean(user && password && header?.startsWith('Basic ') && (() => {
    try {
      return Buffer.from(header.slice(6), 'base64').toString('utf8') === `${user}:${password}`;
    } catch {
      return false;
    }
  })());

  if (isAuthorized) return NextResponse.next();
  return new NextResponse('Dashboard authentication is required.', {
    status: 401,
    headers: { 'WWW-Authenticate': 'Basic realm="BD Tracker"' },
  });
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};
