import { NextResponse } from 'next/server';
import { getDashboardRawData } from '@/lib/sheets';
import { saveRawDataToSupabase } from '@/lib/supabase';
import { getErrorMessage, isQuotaExceededError } from '@/lib/errors';

export async function POST() {
  try {
    // Fetch fresh raw data from Google Sheets.
    const rawData = await getDashboardRawData(true);

    // Supabase is the only persistent store.
    const supabaseResult = await saveRawDataToSupabase({
      calls: rawData.calls,
      meetings: rawData.meetings,
      trackerCounts: rawData.trackerCounts,
      agentMappings: rawData.agentMappings,
    });

    return NextResponse.json({
      success: true,
      message: 'Successfully synced Google Sheets data directly to Supabase',
      supabase: supabaseResult,
    });
  } catch (error: unknown) {
    console.error('Error in /api/sync:', error);
    const errorMessage = isQuotaExceededError(error)
      ? 'Data provider quota exceeded. Try again later, or use the cached dashboard until the quota resets.'
      : getErrorMessage(error) || 'Failed to sync Google Sheets to Supabase';
    return NextResponse.json(
      { success: false, error: errorMessage },
      { status: 500 }
    );
  }
}

export async function GET() {
  return POST();
}
