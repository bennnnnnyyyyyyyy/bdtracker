import { fetchAttendanceData, getDashboardRawData, RawDashboardDataset } from './sheets';
import { getRawDataFromSupabase } from './supabase';
import { annotateMeetings, isRescheduledStatus } from './meetings';
import { loadRescheduledKeys, rememberRescheduled } from './reschedules';
import { loadConfirmations } from './confirmations';
import { AttendanceDataset } from './attendance';
import { DataSourceInfo } from '../types/dashboard';

export interface DashboardInputs {
  rawData: RawDashboardDataset;
  attendance: AttendanceDataset;
  dataSourceInfo: DataSourceInfo;
  /** When the underlying data was actually read. */
  dataAsOf: string;
  /** False when the confirmation store could not be read (no meeting is then counted as a show). */
  confirmationsAvailable: boolean;
}

/**
 * Live Sheets/local sources first; the Supabase snapshot only if the live pull throws or a core
 * source failed; partial live data as the last resort. Meetings come back annotated with their
 * key and management confirmation state.
 */
export async function loadDashboardInputs(
  opts: { forceRefresh?: boolean; startDate?: string; endDate?: string } = {}
): Promise<DashboardInputs> {
  let liveData: RawDashboardDataset | null = null;
  let liveError: unknown = null;
  try {
    liveData = await getDashboardRawData({ forceRefresh: opts.forceRefresh, startDate: opts.startDate, endDate: opts.endDate });
  } catch (err) {
    liveError = err;
    console.warn('[Data Ingest] Live pull failed:', err);
  }

  let rawData: RawDashboardDataset;
  let dataSourceInfo: DataSourceInfo;
  let dataAsOf: string;

  if (liveData && liveData.failedSources.length === 0) {
    rawData = liveData;
    dataSourceInfo = liveData.dataSourceInfo;
    dataAsOf = new Date(liveData.loadedAt).toISOString();
  } else {
    const snapshot = await getRawDataFromSupabase();
    if (snapshot) {
      const att = liveData
        ? { attendance: liveData.attendance, source: liveData.dataSourceInfo.attendanceSource }
        : await fetchAttendanceData();
      dataSourceInfo = {
        source: 'supabase',
        attendanceSource: att.source,
        callsSource: 'supabase',
        notes: `Live source failed${liveData ? ` (${liveData.failedSources.join(', ')})` : ''}; showing database snapshot from ${snapshot.lastUpdated}.`,
      };
      rawData = {
        calls: snapshot.calls,
        meetings: snapshot.meetings,
        trackerCounts: snapshot.trackerCounts,
        agentMappings: snapshot.agentMappings,
        attendance: att.attendance,
        dataSourceInfo,
        failedSources: liveData?.failedSources ?? [],
        loadedAt: new Date(snapshot.lastUpdated).getTime() || Date.now(),
        isMockData: false,
      };
      dataAsOf = snapshot.lastUpdated;
    } else if (liveData) {
      rawData = liveData; // partial live data; the notes already say what is missing
      dataSourceInfo = liveData.dataSourceInfo;
      dataAsOf = new Date(liveData.loadedAt).toISOString();
    } else {
      throw liveError;
    }
  }

  const confirmations = await loadConfirmations();
  const confirmationsAvailable = confirmations !== null;
  if (!confirmationsAvailable) {
    dataSourceInfo = {
      ...dataSourceInfo,
      notes: [dataSourceInfo.notes, 'Show confirmations could not be loaded: no meeting is counted as a show until they are available.']
        .filter(Boolean).join(' '),
    };
  }
  let meetings = annotateMeetings(rawData.meetings, confirmations ?? new Map());

  // Remember meetings seen as Rescheduled; they follow the confirmation rules once held (see reschedules.ts).
  const remembered = await loadRescheduledKeys();
  const waiting = meetings.filter((m) => isRescheduledStatus(m.status));
  if (waiting.length > 0) void rememberRescheduled(waiting).catch((e) => console.warn('[Reschedules]', e));
  meetings = meetings.map((m) => (m.rescheduled || isRescheduledStatus(m.status) || remembered?.has(m.meetingKey as string) ? { ...m, rescheduled: true } : m));

  return {
    rawData: { ...rawData, meetings },
    attendance: rawData.attendance,
    dataSourceInfo,
    dataAsOf,
    confirmationsAvailable,
  };
}
