import { NextResponse } from 'next/server';
import { getDashboardRawData } from '@/lib/sheets';
import { saveRawDataToSupabase } from '@/lib/supabase';
import { saveRawDataToFirestore } from '@/lib/firestore';

export async function POST() {
  try {
    // 1. Fetch fresh raw data from Google Sheets
    const rawData = await getDashboardRawData(true);

    // Firestore is the canonical store; complete this write before mirroring to Supabase.
    const firestoreResult = await saveRawDataToFirestore({
      calls: rawData.calls,
      meetings: rawData.meetings,
      trackerCounts: rawData.trackerCounts,
      agentMappings: rawData.agentMappings,
    });

    const supabaseResult = await saveRawDataToSupabase({
      calls: rawData.calls,
      meetings: rawData.meetings,
      trackerCounts: rawData.trackerCounts,
      agentMappings: rawData.agentMappings,
    });

    return NextResponse.json({
      success: true,
      message: 'Successfully synced Google Sheets data to Firestore and mirrored Supabase',
      firestore: firestoreResult,
      supabase: supabaseResult,
    });
  } catch (error: unknown) {
    console.error('Error in /api/sync:', error);
    const errorMessage = error instanceof Error ? error.message : 'Failed to sync Google Sheets to Firestore';
    return NextResponse.json(
      { success: false, error: errorMessage },
      { status: 500 }
    );
  }
}

export async function GET() {
  return POST();
}
