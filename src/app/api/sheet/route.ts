import { NextRequest, NextResponse } from 'next/server';
import { requireUser } from '@/lib/api-auth';
import { invalidateDashboardCache } from '@/lib/sheets';
import { missingImportSettings, runSheetAction, SheetAction } from '@/lib/importWebhook';
import type { UserRole } from '@/types/dashboard';

export const runtime = 'nodejs';
export const maxDuration = 60;

// Maintenance of the call-log sheet, offered as buttons in the dashboard instead of sheet menus.
const ROLES: Record<SheetAction, UserRole[]> = {
  status: ['admin', 'manager'],
  check: ['admin', 'manager'],
  setMapping: ['admin', 'manager'],
  repair: ['admin'],
  archive: ['admin'],
  fixTimes: ['admin'],
  autoArchiveOn: ['admin'],
  autoArchiveOff: ['admin'],
  replaceStatus: ['admin', 'manager'],
  rebuildTotals: ['admin', 'manager'],
};
const MUTATING: SheetAction[] = ['repair', 'archive', 'fixTimes', 'setMapping'];

export async function POST(request: NextRequest) {
  return handle(request);
}

async function handle(request: NextRequest) {
  const payload = await request.json().catch(() => ({}));
  const action = payload?.action as SheetAction;
  if (!action || !(action in ROLES)) return NextResponse.json({ error: 'Unknown action.' }, { status: 400 });

  const guard = await requireUser(request, ROLES[action]);
  if (guard.response) return guard.response;

  const missing = missingImportSettings();
  if (missing.length > 0) {
    return NextResponse.json({ error: `The sheet connection is not set up yet: the server does not see ${missing.join(' and ')}.` }, { status: 501 });
  }

  try {
    const extra = action === 'setMapping' ? { entries: Array.isArray(payload.entries) ? payload.entries : [] } : {};
    const result = await runSheetAction(action, extra);
    if (MUTATING.includes(action)) invalidateDashboardCache();
    return NextResponse.json({ success: true, ...result });
  } catch (error) {
    console.error(`Sheet action ${action} failed:`, error);
    return NextResponse.json({ error: error instanceof Error ? error.message : 'The sheet action failed' }, { status: 502 });
  }
}
