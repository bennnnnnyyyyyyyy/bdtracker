import { NextResponse } from 'next/server';
import { getDashboardRawData } from '@/lib/sheets';
import { saveRawDataToSupabase } from '@/lib/supabase';
import { saveRawDataToFirestore } from '@/lib/firestore';
import { getErrorMessage, isQuotaExceededError } from '@/lib/errors';

export async function POST() {
  try {
    // 1. Fetch fresh raw data from Google Sheets
    const rawData = await getDashboardRawData(true);

    // Firestore is the canonical store; mirror to Supabase if Firestore quota is exhausted.
    let firestoreResult: Awaited<ReturnType<typeof saveRawDataToFirestore>> | null = null;
    let firestoreWarning: string | undefined;
    try {
      firestoreResult = await saveRawDataToFirestore({
        calls: rawData.calls,
        meetings: rawData.meetings,
        trackerCounts: rawData.trackerCounts,
        agentMappings: rawData.agentMappings,
      });
    } catch (err) {
      if (!isQuotaExceededError(err)) {
        throw err;
      }
      firestoreWarning = 'Firestore quota exceeded; data was mirrored to Supabase but Firestore was not updated.';
      console.warn(firestoreWarning, err);
    }

    const supabaseResult = await saveRawDataToSupabase({
      calls: rawData.calls,
      meetings: rawData.meetings,
      trackerCounts: rawData.trackerCounts,
      agentMappings: rawData.agentMappings,
    });

    return NextResponse.json({
      success: true,
      message: firestoreWarning || 'Successfully synced Google Sheets data to Firestore and mirrored Supabase',
      firestore: firestoreResult,
      supabase: supabaseResult,
      warning: firestoreWarning,
    });
  } catch (error: unknown) {
    console.error('Error in /api/sync:', error);
    const errorMessage = isQuotaExceededError(error)
      ? 'Data provider quota exceeded. Try again later, or use the cached dashboard until the quota resets.'
      : getErrorMessage(error) || 'Failed to sync Google Sheets to Firestore';
    return NextResponse.json(
      { success: false, error: errorMessage },
      { status: 500 }
    );
  }
}

export async function GET() {
  return POST();
}
