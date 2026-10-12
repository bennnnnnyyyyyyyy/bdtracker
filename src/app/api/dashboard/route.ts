import { NextRequest, NextResponse } from 'next/server';
import { getDashboardRawData, fetchAttendanceData, RawDashboardDataset } from '@/lib/sheets';
import { getRawDataFromSupabase } from '@/lib/supabase';
import { computeDashboardMetrics } from '@/lib/analytics';
import { CONFIG } from '@/lib/config';
import { DashboardResponse, DataSourceInfo } from '@/types/dashboard';
import { getErrorMessage, isQuotaExceededError } from '@/lib/errors';
import { AttendanceDataset } from '@/lib/attendance';

export async function GET(request: NextRequest) {
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

    // Pull the live Sheets/local sources first. Supabase is the emergency fallback, used when
    // the live pull throws or when a core source (call logs / BD tracker) failed to load.
    let liveData: RawDashboardDataset | null = null;
    let liveError: unknown = null;
    try {
      liveData = await getDashboardRawData();
    } catch (ingestErr) {
      liveError = ingestErr;
      console.warn('[Data Ingest] Live pull failed:', ingestErr);
    }

    if (liveData && liveData.failedSources.length === 0) {
      rawData = liveData;
      attendanceData = liveData.attendance;
      currentDataSourceInfo = liveData.dataSourceInfo;
    } else {
      const snapshot = await getRawDataFromSupabase();
      if (snapshot) {
        const attRes = liveData
          ? { attendance: liveData.attendance, source: liveData.dataSourceInfo.attendanceSource }
          : await fetchAttendanceData();
        rawData = {
          calls: snapshot.calls,
          meetings: snapshot.meetings,
          trackerCounts: snapshot.trackerCounts,
          agentMappings: snapshot.agentMappings,
          attendance: attRes.attendance,
          dataSourceInfo: {
            source: 'supabase',
            attendanceSource: attRes.source,
            callsSource: 'supabase',
            notes: `Live source failed${liveData ? ` (${liveData.failedSources.join(', ')})` : ''}; showing database snapshot from ${snapshot.lastUpdated}.`,
          },
          failedSources: liveData?.failedSources ?? [],
          isMockData: false,
        };
        attendanceData = attRes.attendance;
        currentDataSourceInfo = rawData.dataSourceInfo;
      } else if (liveData) {
        // No snapshot available: show the partial live data, flagged in dataSourceInfo.notes.
        rawData = liveData;
        attendanceData = liveData.attendance;
        currentDataSourceInfo = liveData.dataSourceInfo;
      } else {
        throw liveError;
      }
    }

    if (!rawData) {
      throw new Error('Failed to retrieve dashboard data');
    }

    // 3. Compute metrics with attendance-aware present days logic
    const { openers, totals, filteredCalls, filteredMeetings, dailyBreakdown, weeklyBreakdown, monthlyBreakdown } =
      computeDashboardMetrics(
        rawData.calls,
        rawData.meetings,
        rawData.trackerCounts,
        rawData.agentMappings,
        { startDate, endDate, selectedOpener },
        attendanceData || rawData.attendance
      );

    const responseOpeners = selectedOpener && selectedOpener !== 'ALL'
      ? openers.filter((o) => o.opener.toLowerCase() === selectedOpener.toLowerCase())
      : openers;

    const response: DashboardResponse = {
      openers: responseOpeners,
      totals,
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
