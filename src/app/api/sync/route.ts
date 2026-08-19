import { NextResponse } from 'next/server';
import { getDashboardRawData } from '@/lib/sheets';
import { saveRawDataToFirestore } from '@/lib/firestore';

export async function POST() {
  try {
    // 1. Fetch fresh raw data from Google Sheets
    const rawData = await getDashboardRawData(true);

    // 2. Write to Firestore collections
    const result = await saveRawDataToFirestore({
      calls: rawData.calls,
      meetings: rawData.meetings,
      trackerCounts: rawData.trackerCounts,
      agentMappings: rawData.agentMappings,
    });

    return NextResponse.json({
      success: true,
      message: 'Successfully synced Google Sheets data to Firestore',
      ...result,
    });
  } catch (error: unknown) {
    console.error('Error in /api/sync:', error);
    const errorMessage = error instanceof Error ? error.message : 'Failed to sync to Firestore';
    return NextResponse.json(
      { success: false, error: errorMessage },
      { status: 500 }
    );
  }
}

export async function GET() {
  return POST();
}
