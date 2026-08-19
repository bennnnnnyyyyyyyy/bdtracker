import { NextRequest, NextResponse } from 'next/server';
import { getDashboardRawData } from '@/lib/sheets';
import { getRawDataFromSupabase, saveRawDataToSupabase } from '@/lib/supabase';
import { computeDashboardMetrics } from '@/lib/analytics';
import { CONFIG } from '@/lib/config';
import { DashboardResponse } from '@/types/dashboard';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const startDate = searchParams.get('startDate') || undefined;
    const endDate = searchParams.get('endDate') || undefined;
    const selectedOpener = searchParams.get('opener') || undefined;
    const forceRefresh = searchParams.get('refresh') === 'true';
    const dateFilterActive = Boolean(startDate || endDate);
    const shouldRefreshSource = forceRefresh || dateFilterActive;

    let rawData: {
      calls: any[];
      meetings: any[];
      trackerCounts: Record<string, Record<string, number>>;
      agentMappings: any[];
      lastUpdated?: string;
      isMockData?: boolean;
    } | null = null;

    // 1. Try reading from Supabase if not forcing refresh
    if (!shouldRefreshSource) {
      rawData = await getRawDataFromSupabase();
    }

    // 2. If no data in Supabase or forceRefresh requested, pull from Sheets & update Supabase
    if (!rawData || forceRefresh) {
      const sheetsData = await getDashboardRawData(shouldRefreshSource);
      rawData = sheetsData;

      // Asynchronously update Supabase in the background
      saveRawDataToSupabase({
        calls: sheetsData.calls,
        meetings: sheetsData.meetings,
        trackerCounts: sheetsData.trackerCounts,
        agentMappings: sheetsData.agentMappings,
      }).catch((err) => console.warn('Background Supabase save warning:', err));
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
    const errorMessage = error instanceof Error ? error.message : 'Internal server error';
    return NextResponse.json(
      { error: errorMessage },
      { status: 500 }
    );
  }
}
