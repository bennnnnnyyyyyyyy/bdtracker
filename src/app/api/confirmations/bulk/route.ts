import { NextRequest, NextResponse } from 'next/server';
import { requireUser } from '@/lib/api-auth';
import { loadDashboardInputs } from '@/lib/dashboard-data';
import { applyConfirmations, initialImportCandidates } from '@/lib/confirmations';

export const runtime = 'nodejs';

// One-time (repeatable) import for the historical tracker: confirms every meeting currently sitting in a
// likely-show stage that has not been confirmed yet. Recorded in the audit log as an "initial-import".
export async function POST(request: NextRequest) {
  const guard = await requireUser(request, ['admin']);
  if (guard.response) return guard.response;

  const body = await request.json().catch(() => ({}));
  const candidates = async () => initialImportCandidates((await loadDashboardInputs()).rawData.meetings);

  try {
    const meetings = await candidates();
    if (body?.dryRun === true) return NextResponse.json({ success: true, count: meetings.length });
    if (body?.confirm !== true) return NextResponse.json({ error: 'Confirmation required.' }, { status: 400 });
    const changed = await applyConfirmations('confirm', meetings, guard.user, 'initial-import');
    return NextResponse.json({ success: true, changed });
  } catch (error) {
    console.error('Bulk confirmation failed:', error);
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Bulk confirmation failed' }, { status: 500 });
  }
}
