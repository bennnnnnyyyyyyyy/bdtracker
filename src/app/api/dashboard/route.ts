import { NextRequest, NextResponse } from 'next/server';
import { getDashboardRawData, fetchAttendanceData, RawDashboardDataset } from '@/lib/sheets';
import { getRawDataFromSupabase } from '@/lib/supabase';
import { computeDashboardMetrics } from '@/lib/analytics';
import { CONFIG } from '@/lib/config';
import { DashboardResponse, DataSourceInfo } from '@/types/dashboard';
import { getErrorMessage, isQuotaExceededError } from '@/lib/errors';
import { AttendanceDataset } from '@/lib/attendance';

function isAuthorized(request: NextRequest): boolean {
  if (process.env.NODE_ENV !== 'production') return true;
  const user = process.env.DASHBOARD_AUTH_USER;
  const password = process.env.DASHBOARD_AUTH_PASSWORD;
  if (!user || !password) return false;
  const header = request.headers.get('authorization');
  if (!header?.startsWith('Basic ')) return false;
  try {
    const decoded = Buffer.from(header.slice(6), 'base64').toString('utf8');
    return decoded === `${user}:${password}`;
  } catch {
    return false;
  }
}

export async function GET(request: NextRequest) {
  if (!isAuthorized(request)) {
    return NextResponse.json(
      { error: 'Dashboard authentication is required.' },
      { status: process.env.NODE_ENV === 'production' ? 401 : 500, headers: { 'WWW-Authenticate': 'Basic realm="BD Tracker"' } }
    );
  }
  try {
    const { searchParams } = new URL(request.url);
    const startDate = searchParams.get('startDate') || undefined;
    const endDate = searchParams.get('endDate') || undefined;
    const selectedOpener = searchParams.get('opener') || undefined;
    let rawData: RawDashboardDataset | null = null;
    let attendanceData: AttendanceDataset | undefined;
    let currentDataSourceInfo: DataSourceInfo = {
      source: 'supabase',
      attendanceSource: 'local_excel',
      callsSource: 'call_logs',
    };

    // Always pull the live Sheets/local sources first. Supabase is emergency fallback only.
    try {
      const liveData = await getDashboardRawData();
      rawData = liveData;
      attendanceData = liveData.attendance;
      currentDataSourceInfo = liveData.dataSourceInfo;
    } catch (ingestErr) {
      console.warn('[Data Ingest] Live pull failed, attempting Supabase fallback:', ingestErr);
      const fallbackSupa = await getRawDataFromSupabase();
      if (!fallbackSupa) throw ingestErr;

      const attRes = await fetchAttendanceData();
      rawData = {
        calls: fallbackSupa.calls,
        meetings: fallbackSupa.meetings,
        trackerCounts: fallbackSupa.trackerCounts,
        agentMappings: fallbackSupa.agentMappings,
        attendance: attRes.attendance,
        dataSourceInfo: {
          source: 'supabase',
          attendanceSource: attRes.source,
          callsSource: 'supabase',
          notes: 'Live source failed; showing emergency database fallback.',
        },
        isMockData: false,
      };
      attendanceData = attRes.attendance;
    }

    if (!rawData) {
      throw new Error('Failed to retrieve dashboard data');
    }

    // 3. Compute metrics with attendance-aware present days logic
    const { openers, totals, funnel, filteredCalls, filteredMeetings, dailyBreakdown, weeklyBreakdown, monthlyBreakdown } =
      computeDashboardMetrics(
        rawData.calls,
        rawData.meetings,
        rawData.trackerCounts,
        rawData.agentMappings,
        { startDate, endDate },
        attendanceData || rawData.attendance
      );

    const responseOpeners = selectedOpener && selectedOpener !== 'ALL'
      ? openers.filter((o) => o.opener.toLowerCase() === selectedOpener.toLowerCase())
      : openers;

    const response: DashboardResponse = {
      openers: responseOpeners,
      availableOpeners: openers,
      teamBenchmarks: {
        connectionRate: totals.connectionRate,
        bookingRate: totals.bookingRate,
        showRate: totals.showRate,
        closeRate: totals.closeRate,
        callsPerPresentDay: totals.callsPerPresentDay,
      },
      totals,
      funnel,
      calls: filteredCalls,
      meetings: filteredMeetings,
      agentMappings: rawData.agentMappings,
      stages: CONFIG.BD_TABS,
      lastUpdated: new Date().toISOString(),
      dailyBreakdown,
      weeklyBreakdown,
      monthlyBreakdown,
      isMockData: rawData.isMockData,
      dataSourceInfo: currentDataSourceInfo,
    };

    return NextResponse.json(response, {
      headers: {
        'Cache-Control': 'no-store, max-age=0',
      },
    });
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
    return NextResponse.json(
      { error: errorMessage },
      { status: 500 }
    );
  }
}
