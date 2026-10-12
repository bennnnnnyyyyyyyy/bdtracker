import { NextRequest, NextResponse } from 'next/server';
import { requireUser } from '@/lib/api-auth';
import { countActiveAdmins, findUserById, updateUser } from '@/lib/users';
import { hashPassword, validateNewPassword } from '@/lib/password';
import type { UserRole } from '@/types/dashboard';

export const runtime = 'nodejs';
const ROLES: UserRole[] = ['admin', 'manager', 'viewer'];

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const guard = await requireUser(request, ['admin']);
  if (guard.response) return guard.response;
  const { id } = await params;

  const target = await findUserById(id);
  if (!target) return NextResponse.json({ error: 'User not found.' }, { status: 404 });

  const body = await request.json().catch(() => ({}));
  const patch: Parameters<typeof updateUser>[1] = {};

  if (typeof body?.name === 'string' && body.name.trim()) patch.name = body.name;
  if (body?.role !== undefined) {
    if (!ROLES.includes(body.role)) return NextResponse.json({ error: 'Invalid role.' }, { status: 400 });
    patch.role = body.role;
  }
  if (typeof body?.active === 'boolean') patch.active = body.active;
  if (body?.password !== undefined) {
    const problem = validateNewPassword(body.password);
    if (problem) return NextResponse.json({ error: problem }, { status: 400 });
    patch.passwordHash = await hashPassword(body.password);
    patch.mustChangePassword = true;
  }

  // Never lock everyone out: an admin cannot disable or demote themselves, and one active admin must remain.
  const losesAdmin = target.role === 'admin' && target.active && (patch.active === false || (patch.role && patch.role !== 'admin'));
  if (losesAdmin) {
    if (target.id === guard.user.id) return NextResponse.json({ error: 'You cannot disable or demote your own account.' }, { status: 400 });
    if ((await countActiveAdmins()) <= 1) return NextResponse.json({ error: 'At least one active admin is required.' }, { status: 400 });
  }

  await updateUser(id, patch);
  return NextResponse.json({ success: true });
}
