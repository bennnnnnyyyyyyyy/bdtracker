import { NextRequest, NextResponse } from 'next/server';
import { getDashboardRawData } from '@/lib/sheets';
import { saveRawDataToSupabase } from '@/lib/supabase';
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
    const rawData = await getDashboardRawData(true);
    const supabaseResult = await saveRawDataToSupabase({
      calls: rawData.calls,
      meetings: rawData.meetings,
      trackerCounts: rawData.trackerCounts,
      agentMappings: rawData.agentMappings,
    });
    return NextResponse.json({ success: true, message: 'Successfully synced source data to Supabase', supabase: supabaseResult });
  } catch (error: unknown) {
    console.error('Error in /api/sync:', error);
    const errorMessage = isQuotaExceededError(error)
      ? 'Data provider quota exceeded. Try again later, or use cached data until the quota resets.'
      : getErrorMessage(error) || 'Failed to sync Google Sheets to Supabase';
    return NextResponse.json({ success: false, error: errorMessage }, { status: 500 });
  }
}

export async function POST(request: NextRequest) { return sync(request); }
export async function GET(request: NextRequest) { return sync(request); }
