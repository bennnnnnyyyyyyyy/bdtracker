import { NextRequest, NextResponse } from 'next/server';
import { getRequestUser, requireUser } from '@/lib/api-auth';
import { createUser, listUsers, normalizeEmail } from '@/lib/users';
import { hashPassword, validateNewPassword } from '@/lib/password';
import type { UserRole } from '@/types/dashboard';

export const runtime = 'nodejs';
const ROLES: UserRole[] = ['admin', 'manager', 'uploader', 'viewer'];

export async function GET(request: NextRequest) {
  const user = await getRequestUser(request);
  if (!user) return NextResponse.json({ error: 'Please sign in.' }, { status: 401 });
  if (user.role !== 'admin') return NextResponse.json({ error: 'Only admins can manage users.' }, { status: 403 });
  try {
    return NextResponse.json({ users: await listUsers() }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Failed to load users' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const guard = await requireUser(request, ['admin']);
  if (guard.response) return guard.response;

  const body = await request.json().catch(() => ({}));
  const email = normalizeEmail(body?.email);
  const name = typeof body?.name === 'string' ? body.name.trim() : '';
  const role = body?.role as UserRole;
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return NextResponse.json({ error: 'Enter a valid email address.' }, { status: 400 });
  if (!name) return NextResponse.json({ error: 'Enter the user\'s name.' }, { status: 400 });
  if (!ROLES.includes(role)) return NextResponse.json({ error: 'Choose a role.' }, { status: 400 });
  const problem = validateNewPassword(body?.password);
  if (problem) return NextResponse.json({ error: problem }, { status: 400 });

  try {
    const created = await createUser({ email, name, role, passwordHash: await hashPassword(body.password), mustChangePassword: true });
    return NextResponse.json({ user: created });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Failed to create user' }, { status: 400 });
  }
}
