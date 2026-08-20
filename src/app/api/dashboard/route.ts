import { NextRequest, NextResponse } from 'next/server';
import { getDashboardRawData } from '@/lib/sheets';
import { getRawDataFromSupabase, saveRawDataToSupabase } from '@/lib/supabase';
import { getRawDataFromFirestore, saveRawDataToFirestore } from '@/lib/firestore';
import { computeDashboardMetrics } from '@/lib/analytics';
import { CONFIG } from '@/lib/config';
import { AgentMapping, CallRecord, DashboardResponse, MeetingRecord } from '@/types/dashboard';
import { getErrorMessage, isQuotaExceededError } from '@/lib/errors';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const startDate = searchParams.get('startDate') || undefined;
    const endDate = searchParams.get('endDate') || undefined;
    const selectedOpener = searchParams.get('opener') || undefined;
    const forceRefresh = searchParams.get('refresh') === 'true';
    const shouldRefreshSource = forceRefresh;

    let rawData: {
      calls: CallRecord[];
      meetings: MeetingRecord[];
      trackerCounts: Record<string, Record<string, number>>;
      agentMappings: AgentMapping[];
      lastUpdated?: string;
      isMockData?: boolean;
    } | null = null;

    // Firestore is the canonical dashboard store. Sheets is only used for an
    // explicit refresh or when Firestore has not been initialized yet.
    if (!shouldRefreshSource) {
      rawData = await getRawDataFromFirestore();
      if (!rawData) {
        rawData = await getRawDataFromSupabase();
      }
    }

    if (!rawData || shouldRefreshSource) {
      const sheetsData = await getDashboardRawData(true);
      const syncedAt = new Date().toISOString();

      // Complete the Firestore sync before serving the new dataset.
      try {
        await saveRawDataToFirestore({
          calls: sheetsData.calls,
          meetings: sheetsData.meetings,
          trackerCounts: sheetsData.trackerCounts,
          agentMappings: sheetsData.agentMappings,
        });
      } catch (err) {
        if (!isQuotaExceededError(err)) {
          throw err;
        }
        console.warn('Firestore quota exhausted; serving fresh Sheets data and using Supabase as fallback:', err);
      }

      // Keep the existing Supabase mirror aligned with Firestore.
      saveRawDataToSupabase({
        calls: sheetsData.calls,
        meetings: sheetsData.meetings,
        trackerCounts: sheetsData.trackerCounts,
        agentMappings: sheetsData.agentMappings,
      }).catch((err) => console.warn('Background Supabase mirror warning:', err));

      rawData = { ...sheetsData, lastUpdated: syncedAt };
    }

    if (!rawData) {
      throw new Error('Failed to retrieve dashboard data');
    }

    // 3. Compute metrics
    const { openers, totals, filteredCalls, dailyBreakdown, weeklyBreakdown, monthlyBreakdown } =
      computeDashboardMetrics(
        rawData.calls,
        rawData.meetings,
        rawData.trackerCounts,
        rawData.agentMappings,
        { startDate, endDate, selectedOpener }
      );

    const responseOpeners = selectedOpener && selectedOpener !== 'ALL'
      ? openers.filter((o) => o.opener.toLowerCase() === selectedOpener.toLowerCase())
      : openers;

    const response: DashboardResponse = {
      openers: responseOpeners,
      totals,
      calls: filteredCalls,
      agentMappings: rawData.agentMappings,
      stages: CONFIG.BD_TABS,
      lastUpdated: rawData.lastUpdated || new Date().toISOString(),
      dailyBreakdown,
      weeklyBreakdown,
      monthlyBreakdown,
      isMockData: rawData.isMockData,
    };

    return NextResponse.json(response);
  } catch (error: unknown) {
    console.error('API Error in /api/dashboard:', error);
    let errorMessage = getErrorMessage(error) || 'Internal server error';
    if (isQuotaExceededError(error)) {
      errorMessage = 'Data provider quota exceeded. Try again later, or use the cached dashboard until the quota resets.';
    }
    if (errorMessage.toLowerCase().includes('caller does not have permission') || errorMessage.toLowerCase().includes('permission denied')) {
      errorMessage = 'Google Sheets Permission Denied: Please share the Google Sheets with service account "dashboard@tribal-quest-484611-j3.iam.gserviceaccount.com" as Viewer.';
    }
    return NextResponse.json(
      { error: errorMessage },
      { status: 500 }
    );
  }
}
