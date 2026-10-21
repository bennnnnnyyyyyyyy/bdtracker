import { NextRequest, NextResponse } from 'next/server';
import { requireUser } from '@/lib/api-auth';
import { saveSharedTargets } from '@/lib/sharedTargets';
import { getErrorMessage } from '@/lib/errors';

export const runtime = 'nodejs';

// Team targets shared by every manager. Admins and managers only; everyone reads them with the dashboard data.
export async function POST(request: NextRequest) {
  const guard = await requireUser(request, ['admin', 'manager']);
  if (guard.response) return guard.response;
  const body = await request.json().catch(() => null);
  if (!body || !('targets' in body)) return NextResponse.json({ error: 'Invalid request.' }, { status: 400 });
  try {
    const saved = await saveSharedTargets(body.targets, guard.user.name);
    return NextResponse.json({ ok: true, targets: saved });
  } catch (error) {
    return NextResponse.json({ error: getErrorMessage(error) || 'Failed to save targets' }, { status: 500 });
  }
}
