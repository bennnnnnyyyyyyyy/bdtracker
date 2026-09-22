import { NextRequest, NextResponse } from 'next/server';
import { getDashboardRawData, fetchAttendanceData, RawDashboardDataset } from '@/lib/sheets';
import { getRawDataFromSupabase, saveRawDataToSupabase } from '@/lib/supabase';
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
    const forceRefresh = searchParams.get('refresh') === 'true';
    const shouldRefreshSource = forceRefresh;

    let rawData: RawDashboardDataset | null = null;
    let attendanceData: AttendanceDataset | undefined;
    let currentDataSourceInfo: DataSourceInfo = {
      source: 'supabase',
      attendanceSource: 'local_excel',
      callsSource: 'call_logs',
    };

    // 1. Supabase is the primary store unless explicit refresh is requested
    if (!shouldRefreshSource) {
      const supaData = await getRawDataFromSupabase();
      if (supaData && supaData.calls.length > 0) {
        // Fetch current attendance dataset to accompany Supabase calls/meetings
        const attRes = await fetchAttendanceData();
        attendanceData = attRes.attendance;
        currentDataSourceInfo.attendanceSource = attRes.source;

        rawData = {
          calls: supaData.calls,
          meetings: supaData.meetings,
          trackerCounts: supaData.trackerCounts,
          agentMappings: supaData.agentMappings,
          attendance: attRes.attendance,
          dataSourceInfo: currentDataSourceInfo,
          isMockData: false,
        };
      }
    }

    // 2. Fetch fresh dataset from Google Sheets / Local Excel if refresh or no Supabase data
    if (!rawData || shouldRefreshSource) {
      try {
        const freshData = await getDashboardRawData(true);

        // Write fresh dataset to Supabase in background
        saveRawDataToSupabase({
          calls: freshData.calls,
          meetings: freshData.meetings,
          trackerCounts: freshData.trackerCounts,
          agentMappings: freshData.agentMappings,
        }).catch((err) => console.warn('[Supabase Sync] Async save warning:', err));

        rawData = { ...freshData };
        attendanceData = freshData.attendance;
        currentDataSourceInfo = freshData.dataSourceInfo;
      } catch (ingestErr) {
        console.warn('[Data Ingest] Primary ingest failed, attempting fallback:', ingestErr);
        // If live pull failed, try Supabase as emergency fallback
        const fallbackSupa = await getRawDataFromSupabase();
        if (fallbackSupa) {
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
              notes: 'Google Sheets sync failed; showing cached database records.',
            },
            isMockData: false,
          };
          attendanceData = attRes.attendance;
        } else {
          throw ingestErr;
        }
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

    return NextResponse.json(response);
  } catch (error: unknown) {
    console.error('API Error in /api/dashboard:', error);
    let errorMessage = getErrorMessage(error) || 'Internal server error';
    if (isQuotaExceededError(error)) {
      errorMessage = 'Data provider quota exceeded. Try again later, or use the cached dashboard until the quota resets.';
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
