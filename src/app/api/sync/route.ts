import { NextRequest, NextResponse } from 'next/server';
import { getDashboardRawData } from '@/lib/sheets';
import { saveRawDataToSupabase } from '@/lib/supabase';
import { getErrorMessage, isQuotaExceededError } from '@/lib/errors';
import { getAccessContext } from '@/lib/auth-server';

export const runtime = 'nodejs';

function isAuthorized(request: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  return request.headers.get('authorization') === `Bearer ${secret}`;
}

async function sync(request: NextRequest) {
  const cronAuthorized = isAuthorized(request);
  const access = cronAuthorized ? null : await getAccessContext(request);
  if (!cronAuthorized && !access?.viewer.isAdmin) {
    return NextResponse.json({ success: false, error: 'Unauthorized sync request' }, { status: 401 });
  }

  try {
    const rawData = await getDashboardRawData();
    if (rawData.calls.length === 0 && rawData.meetings.length === 0) {
      return NextResponse.json({ success: false, error: 'Sync refused: the source returned no calls and no meetings.' }, { status: 422 });
    }
    const supabaseResult = await saveRawDataToSupabase({
      calls: rawData.calls,
      meetings: rawData.meetings,
      trackerCounts: rawData.trackerCounts,
      agentMappings: rawData.agentMappings,
    });
    if (!supabaseResult) {
      return NextResponse.json({ success: false, error: 'Supabase is not configured with a service-role key.' }, { status: 503 });
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
