import { NextRequest, NextResponse } from 'next/server';
import { getDashboardRawData } from '@/lib/sheets';
import { saveRawDataToSupabase } from '@/lib/supabase';
import { annotateMeetings, isRescheduledStatus } from '@/lib/meetings';
import { rememberRescheduled } from '@/lib/reschedules';
import { getErrorMessage, isQuotaExceededError } from '@/lib/errors';

export const runtime = 'nodejs';

function isAuthorized(request: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return process.env.NODE_ENV !== 'production';
  return request.headers.get('authorization') === `Bearer ${secret}`;
}

async function sync(request: NextRequest) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ success: false, error: 'Unauthorized sync request' }, { status: 401 });
  }

  try {
    const rawData = await getDashboardRawData({ fresh: true });

    // Remember every meeting currently marked Rescheduled, even if nobody opens the dashboard today.
    const waiting = annotateMeetings(rawData.meetings, new Map()).filter((m) => isRescheduledStatus(m.status));
    await rememberRescheduled(waiting).catch((e) => console.warn('[Sync] could not remember rescheduled meetings:', e));

    // Never replace a good snapshot with a partial pull.
    if (rawData.failedSources.length > 0) {
      return NextResponse.json(
        { success: false, error: `Sync skipped; live load failed for: ${rawData.failedSources.join(', ')}. The existing Supabase snapshot was left untouched.` },
        { status: 503 }
      );
    }
    // Daily totals (weighted records) cannot be stored one row per call; the fallback snapshot keeps per-call rows only.
    const perCall = rawData.calls.filter((c) => c.weight === undefined);
    if (perCall.length === 0) {
      return NextResponse.json({
        success: true,
        message: 'Nothing synced: calls now come from daily totals, which the Supabase fallback snapshot does not store. The previous snapshot was left untouched.',
      });
    }
    const supabaseResult = await saveRawDataToSupabase({
      calls: perCall,
      meetings: rawData.meetings,
      trackerCounts: rawData.trackerCounts,
      agentMappings: rawData.agentMappings,
    });
    if (!supabaseResult) {
      return NextResponse.json({ success: false, error: 'Supabase is not configured (missing key); nothing was synced.' }, { status: 500 });
    }
    return NextResponse.json({ success: true, message: 'Successfully synced source data to Supabase', supabase: supabaseResult });
  } catch (error: unknown) {
    console.error('Error in /api/sync:', error);
    const errorMessage = isQuotaExceededError(error)
      ? 'Data provider quota exceeded. Try again later; the live source is temporarily unavailable.'
      : getErrorMessage(error) || 'Failed to sync Google Sheets to Supabase';
    return NextResponse.json({ success: false, error: errorMessage }, { status: 500 });
  }
}

export async function POST(request: NextRequest) { return sync(request); }
export async function GET(request: NextRequest) { return sync(request); }
