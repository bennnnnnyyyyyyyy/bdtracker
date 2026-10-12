import { NextRequest, NextResponse } from 'next/server';
import { requireUser } from '@/lib/api-auth';
import { findUserById, updateUser } from '@/lib/users';
import { hashPassword, validateNewPassword, verifyPassword } from '@/lib/password';

export const runtime = 'nodejs';

// Lets a signed-in user change their own password.
export async function POST(request: NextRequest) {
  const guard = await requireUser(request);
  if (guard.response) return guard.response;
  if (guard.user.id === 'dev') return NextResponse.json({ error: 'Not available in local development mode.' }, { status: 400 });

  const body = await request.json().catch(() => ({}));
  const currentPassword = typeof body?.currentPassword === 'string' ? body.currentPassword : '';
  const newPassword = body?.newPassword;
  const problem = validateNewPassword(newPassword);
  if (problem) return NextResponse.json({ error: problem }, { status: 400 });

  const user = await findUserById(guard.user.id);
  if (!user || !(await verifyPassword(currentPassword, user.passwordHash))) {
    return NextResponse.json({ error: 'Current password is incorrect.' }, { status: 400 });
  }
  await updateUser(user.id, { passwordHash: await hashPassword(newPassword as string), mustChangePassword: false });
  return NextResponse.json({ success: true });
}
