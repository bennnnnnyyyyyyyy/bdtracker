import { NextRequest, NextResponse } from 'next/server';
import { timingSafeEqual } from 'crypto';
import { computeDashboardMetrics } from '@/lib/analytics';
import { loadDashboardInputs } from '@/lib/dashboard-data';
import { getErrorMessage } from '@/lib/errors';

export const runtime = 'nodejs';

function authorized(request: NextRequest): boolean {
  const secret = (process.env.IMPORT_WEBHOOK_SECRET ?? '').trim();
  if (!secret) return false;
  const given = Buffer.from((request.headers.get('authorization') ?? '').replace(/^Bearer\s+/i, ''));
  const want = Buffer.from(secret);
  return given.length === want.length && timingSafeEqual(given, want);
}

/**
 * Official all-time meeting numbers per opener (confirmations, 9/28 rules, rate exclusions applied) for the
 * in-sheet "BD Dashboard" mirror in Apps Script. Protected by the same secret the app uses to call the script.
 */
export async function GET(request: NextRequest) {
  if (!authorized(request)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  try {
    const inputs = await loadDashboardInputs({});
    const { openers } = computeDashboardMetrics(inputs.rawData.calls, inputs.rawData.meetings, inputs.rawData.trackerCounts, inputs.rawData.agentMappings, {}, inputs.attendance);
    return NextResponse.json({
      confirmationsAvailable: inputs.confirmationsAvailable,
      openers: openers.map((o) => ({
        opener: o.opener, booked: o.booked, rated: o.ratedMeetings, noShow: o.noShow, attended: o.attended,
        awaiting: o.awaitingConfirmation, onboarded: o.onboarded, stageCounts: o.stageCounts,
      })),
    }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    return NextResponse.json({ error: getErrorMessage(error) || 'Failed' }, { status: 500 });
  }
}
