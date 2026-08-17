import { NextRequest, NextResponse } from 'next/server';
import { getDashboardRawData } from '@/lib/sheets';
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

    // 1. Fetch raw data from Google Sheets (or cache)
    const rawData = await getDashboardRawData(forceRefresh);

    // 2. Compute metrics
    const { openers, totals, filteredCalls } = computeDashboardMetrics(
      rawData.calls,
      rawData.trackerCounts,
      rawData.agentMappings,
      { startDate, endDate, selectedOpener }
    );

    // Filter openers if single opener selected
    const responseOpeners = selectedOpener && selectedOpener !== 'ALL'
      ? openers.filter(o => o.opener.toLowerCase() === selectedOpener.toLowerCase())
      : openers;

    const response: DashboardResponse = {
      openers: responseOpeners,
      totals,
      calls: filteredCalls.slice(0, 500), // Return sample/recent calls for drill-down table
      agentMappings: rawData.agentMappings,
      stages: CONFIG.BD_TABS,
      lastUpdated: new Date().toISOString(),
      isMockData: rawData.isMockData
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
