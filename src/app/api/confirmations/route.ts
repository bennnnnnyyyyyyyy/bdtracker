import { NextRequest, NextResponse } from 'next/server';
import { requireUser } from '@/lib/api-auth';
import { loadDashboardInputs } from '@/lib/dashboard-data';
import { applyConfirmations } from '@/lib/confirmations';
import { canBeConfirmed } from '@/lib/meetings';

export const runtime = 'nodejs';

// Confirm (or undo) shows. Admins and managers only. Keys are validated against the current tracker
// data, so only real meetings can be confirmed.
export async function POST(request: NextRequest) {
  const guard = await requireUser(request, ['admin', 'manager']);
  if (guard.response) return guard.response;

  const body = await request.json().catch(() => ({}));
  const action = body?.action;
  const keys: unknown = body?.keys;
  if (action !== 'confirm' && action !== 'revoke') return NextResponse.json({ error: 'Invalid action.' }, { status: 400 });
  if (!Array.isArray(keys) || keys.length === 0 || keys.length > 500 || keys.some((k) => typeof k !== 'string')) {
    return NextResponse.json({ error: 'Select between 1 and 500 meetings.' }, { status: 400 });
  }

  try {
    const { rawData } = await loadDashboardInputs();
    const byKey = new Map(rawData.meetings.map((m) => [m.meetingKey as string, m]));
    const wanted = Array.from(new Set(keys as string[]));
    const found = wanted.map((k) => byKey.get(k)).filter((m): m is NonNullable<typeof m> => Boolean(m));

    const blocked = action === 'confirm' ? found.filter((m) => !canBeConfirmed(m)) : [];
    const targets = found.filter((m) => !blocked.includes(m) && (action === 'confirm' ? !m.showConfirmed : m.showConfirmed));

    const changed = await applyConfirmations(action, targets, guard.user);
    return NextResponse.json({
      success: true,
      changed,
      skipped: wanted.length - changed,
      message: blocked.length > 0 ? `${blocked.length} meeting(s) cannot be confirmed: only meetings added since 10/12 that sit in Follow Ups (or a later show tab) can be.` : undefined,
    });
  } catch (error) {
    console.error('Confirmation failed:', error);
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Failed to save confirmations' }, { status: 500 });
  }
}
