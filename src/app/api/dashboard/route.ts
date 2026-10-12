import { NextRequest, NextResponse } from 'next/server';
import { computeDashboardMetrics } from '@/lib/analytics';
import { CONFIG } from '@/lib/config';
import { DashboardResponse } from '@/types/dashboard';
import { getErrorMessage, isQuotaExceededError } from '@/lib/errors';
import { loadDashboardInputs } from '@/lib/dashboard-data';
import { getRequestUser } from '@/lib/api-auth';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const startDate = searchParams.get('startDate') || undefined;
    const endDate = searchParams.get('endDate') || undefined;
    const selectedOpener = searchParams.get('opener') || undefined;
    const includeCalls = searchParams.get('includeCalls') === 'true';

    const inputs = await loadDashboardInputs({ forceRefresh: searchParams.get('refresh') === 'true' });
    const { rawData } = inputs;

    const { openers, totals, filteredCalls, filteredMeetings, dailyBreakdown, weeklyBreakdown, monthlyBreakdown } =
      computeDashboardMetrics(
        rawData.calls,
        rawData.meetings,
        rawData.trackerCounts,
        rawData.agentMappings,
        { startDate, endDate, selectedOpener },
        inputs.attendance
      );

    const responseOpeners = selectedOpener && selectedOpener !== 'ALL'
      ? openers.filter((o) => o.opener.toLowerCase() === selectedOpener.toLowerCase())
      : openers;

    const response: DashboardResponse = {
      openers: responseOpeners,
      totals,
      calls: includeCalls ? filteredCalls : [],
      callsIncluded: includeCalls,
      callsTotal: filteredCalls.length,
      meetings: filteredMeetings,
      agentMappings: rawData.agentMappings,
      stages: CONFIG.BD_TABS,
      lastUpdated: new Date().toISOString(),
      dataAsOf: inputs.dataAsOf,
      confirmationsAvailable: inputs.confirmationsAvailable,
      viewer: (await getRequestUser(request)) ?? undefined,
      dailyBreakdown,
      weeklyBreakdown,
      monthlyBreakdown,
      isMockData: rawData.isMockData,
      dataSourceInfo: inputs.dataSourceInfo,
    };

    return NextResponse.json(response, { headers: { 'Cache-Control': 'no-store, max-age=0' } });
  } catch (error: unknown) {
    console.error('API Error in /api/dashboard:', error);
    let errorMessage = getErrorMessage(error) || 'Internal server error';
    if (isQuotaExceededError(error)) {
      errorMessage = 'Data provider quota exceeded. Try again later; the live dashboard source is temporarily unavailable.';
    }
    if (
      errorMessage.toLowerCase().includes('caller does not have permission') ||
      errorMessage.toLowerCase().includes('permission denied')
    ) {
      errorMessage =
        'Google Sheets Permission Notice: Please share the spreadsheet with service account "dashboard@tribal-quest-484611-j3.iam.gserviceaccount.com" as Viewer. Local Excel files are used in the meantime.';
    }
    return NextResponse.json({ error: errorMessage }, { status: 500 });
  }
}
