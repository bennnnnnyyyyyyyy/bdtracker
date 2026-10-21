import { isConfirmedShow } from './meetings';
import * as xlsx from 'xlsx';
import { CallRecord, DashboardResponse, FilterState, PeriodicGroupSummary } from '../types/dashboard';
import { downloadCsv } from './csv';

type Cell = string | number;
export interface ExportTable {
  headers: string[];
  rows: Cell[][];
}

export type CsvKind = 'overview' | 'meetings' | 'daily' | 'weekly' | 'monthly';

export const CSV_KINDS: { kind: CsvKind; label: string }[] = [
  { kind: 'overview', label: 'Agent overview' },
  { kind: 'meetings', label: 'Meetings (with show confirmation)' },
  { kind: 'daily', label: 'Daily performance' },
  { kind: 'weekly', label: 'Weekly performance' },
  { kind: 'monthly', label: 'Monthly performance' },
];

/**
 * Formats duration in seconds to HH:MM:SS string.
 */
function formatSecondsToHms(totalSec: number): string {
  if (!totalSec || isNaN(totalSec) || totalSec <= 0) return '00:00:00';
  const hrs = Math.floor(totalSec / 3600);
  const mins = Math.floor((totalSec % 3600) / 60);
  const secs = Math.floor(totalSec % 60);
  return [
    String(hrs).padStart(2, '0'),
    String(mins).padStart(2, '0'),
    String(secs).padStart(2, '0')
  ].join(':');
}

/**
 * Calculates optimal column widths for an xlsx worksheet.
 */
function autoFitColumns(rows: (string | number | boolean | null | undefined)[][]): { wch: number }[] {
  const colWidths: number[] = [];
  rows.forEach(row => {
    row.forEach((val, colIdx) => {
      const len = val !== null && val !== undefined ? String(val).length : 0;
      colWidths[colIdx] = Math.max(colWidths[colIdx] || 10, Math.min(len + 3, 40));
    });
  });
  return colWidths.map(w => ({ wch: w }));
}

function pct(rate: number | undefined): string {
  return `${((rate || 0) * 100).toFixed(1)}%`;
}

/** Agent overview: one row per opener plus a team totals row. */
export function buildOverviewTable(data: DashboardResponse): ExportTable {
  const stages = data.stages || [];
  const headers = [
    'Agent / Opener',
    'Total Calls',
    'Outbound Calls',
    'Inbound Calls',
    'Answered Calls',
    'Connection Rate %',
    'Total Talk Time (HH:MM:SS)',
    'Avg Call Duration (MM:SS)',
    'Meetings Booked',
    'Med B Count',
    'Med B %',
    'PPO Count',
    'PPO %',
    'Confirmed Shows',
    'Qualified Shows',
    'Awaiting Confirmation',
    'Show Rate %',
    'Onboarded',
    'Close Rate %',
    'Calls / Meeting',
    'Present Days',
    'Adherence %',
    'Calls / Present Day',
    ...stages
  ];

  const summaryRows: Cell[][] = [];

  // Individual Opener Rows
  data.openers.forEach(op => {
    const stageValues = stages.map(s => op.stageCounts[s] || 0);
    summaryRows.push([
      op.opener,
      op.calls,
      op.outbound,
      op.inbound,
      op.answered,
      `${(op.connectionRate * 100).toFixed(1)}%`,
      formatSecondsToHms(op.totalTalkSec),
      formatSecondsToHms(op.avgCallSec).slice(3), // MM:SS
      op.booked,
      op.medBCount || 0,
      `${(op.medBRate || 0).toFixed(1)}%`,
      op.ppoCount || 0,
      `${(op.ppoRate || 0).toFixed(1)}%`,
      op.attended,
      op.qualifiedShows || 0,
      op.awaitingConfirmation || 0,
      `${(op.showRate * 100).toFixed(1)}%`,
      op.onboarded,
      `${(op.closeRate * 100).toFixed(1)}%`,
      op.callsPerMeeting,
      op.presentDays,
      `${(op.adherenceRate || 0).toFixed(1)}%`,
      op.callsPerPresentDay,
      ...stageValues
    ]);
  });

  // Totals Row
  if (data.totals) {
    const tot = data.totals;
    const totStages = stages.map(s => tot.stageCounts[s] || 0);
    summaryRows.push([
      'TOTALS / TEAM',
      tot.calls,
      tot.outbound,
      tot.inbound,
      tot.answered,
      `${(tot.connectionRate * 100).toFixed(1)}%`,
      formatSecondsToHms(tot.totalTalkSec),
      formatSecondsToHms(tot.avgCallSec).slice(3),
      tot.booked,
      tot.medBCount || 0,
      `${(tot.medBRate || 0).toFixed(1)}%`,
      tot.ppoCount || 0,
      `${(tot.ppoRate || 0).toFixed(1)}%`,
      tot.attended,
      tot.qualifiedShows || 0,
      tot.awaitingConfirmation || 0,
      `${(tot.showRate * 100).toFixed(1)}%`,
      tot.onboarded,
      `${(tot.closeRate * 100).toFixed(1)}%`,
      tot.callsPerMeeting,
      tot.totalPresentDays,
      `${(tot.adherenceRate || 0).toFixed(1)}%`,
      tot.callsPerPresentDay,
      ...totStages
    ]);
  }

  return { headers, rows: summaryRows };
}

/** Meetings in the selected range, with whether management confirmed the show. */
export function buildMeetingsTable(data: DashboardResponse): ExportTable {
  const headers = ['Date Added', 'Opener', 'Stage', 'Company Name', 'Authorized Person', 'Med B', 'PPO', 'Show Confirmed', 'Confirmed By', 'Confirmed At', 'Counts As Show', 'Manager Decision', 'Sheet Stage'];
  const rows = (data.meetings || []).map((m) => [
    m.dateAdded || '',
    m.opener || '',
    m.stage || '',
    m.companyName || '',
    m.authorizedPerson || '',
    m.medB ? 'Yes' : 'No',
    m.ppo ? 'Yes' : 'No',
    m.showConfirmed ? 'Yes' : 'No',
    m.confirmedBy || '',
    m.confirmedAt || '',
    isConfirmedShow(m) ? 'Yes' : 'No',
    m.decision === 'show' ? 'Show' : m.decision === 'no_show' ? 'No-show' : '',
    m.sheetStage || m.stage || '',
  ]);
  return { headers, rows };
}

/** Daily / weekly / monthly performance: one row per opener per period. */
export function buildPeriodTable(groups: PeriodicGroupSummary[] | undefined, periodName: string): ExportTable {
  const headers = [periodName, 'Opener', 'Calls', 'Outbound', 'Inbound', 'Answered', 'Connection Rate %', 'Meetings Booked', 'Attended', 'Show Rate %', 'Onboarded', 'Present Days', 'Calls / Present Day'];
  const rows: Cell[][] = [];
  (groups || []).forEach((group) => {
    group.agents.forEach((ag) => {
      rows.push([group.periodLabel, ag.opener, ag.calls, ag.outbound, ag.inbound, ag.answered, pct(ag.connectionRate), ag.meetings, ag.attended, pct(ag.showRate), ag.onboarded, ag.presentDays ?? 0, ag.callsPerPresentDay ?? 0]);
    });
  });
  return { headers, rows };
}

export function buildTable(data: DashboardResponse, kind: CsvKind): ExportTable {
  switch (kind) {
    case 'overview': return buildOverviewTable(data);
    case 'meetings': return buildMeetingsTable(data);
    case 'daily': return buildPeriodTable(data.dailyBreakdown, 'Date');
    case 'weekly': return buildPeriodTable(data.weeklyBreakdown, 'Week');
    case 'monthly': return buildPeriodTable(data.monthlyBreakdown, 'Month');
  }
}

function rangeSuffix(filters: FilterState): string {
  const startStr = filters.startDate ? filters.startDate.replace(/[^0-9]/g, '') : 'all';
  const endStr = filters.endDate ? filters.endDate.replace(/[^0-9]/g, '') : 'all';
  return `${startStr}_to_${endStr}`;
}

/** Downloads one table of the dashboard as a CSV file. */
export function exportDashboardCsv(data: DashboardResponse, filters: FilterState, kind: CsvKind): void {
  const table = buildTable(data, kind);
  downloadCsv(`BD_${kind}_${rangeSuffix(filters)}.csv`, [table.headers, ...table.rows]);
}

/** Downloads call records (e.g. the filtered Call Logs list) as a CSV file. */
export function exportCallLogsCsv(calls: CallRecord[], label = 'calls'): void {
  const headers = ['Call Date', 'Call ID', 'From', 'To', 'Extension', 'Agent', 'Opener', 'Type', 'Outcome', 'Duration', 'Duration (sec)', 'Department', 'Notes'];
  const rows = calls.map((c) => [c.callDate, c.callId, c.from, c.to, c.extension, c.agent, c.opener, c.type, c.outcome, c.duration, c.durationSec, c.department, c.notes]);
  downloadCsv(`BD_call_logs_${label}.csv`, [headers, ...rows]);
}

/**
 * Generates and downloads a complete multi-tab Excel analytics workbook.
 */
export function exportDashboardAnalyticsXlsx(
  data: DashboardResponse,
  filters: FilterState
): void {
  const wb = xlsx.utils.book_new();
  const add = (table: ExportTable, name: string) => {
    const ws = xlsx.utils.aoa_to_sheet([table.headers, ...table.rows]);
    ws['!cols'] = autoFitColumns([table.headers, ...table.rows]);
    xlsx.utils.book_append_sheet(wb, ws, name);
  };

  add(buildOverviewTable(data), 'Agent Overview');
  if (data.meetings && data.meetings.length > 0) add(buildMeetingsTable(data), 'Meeting Pipeline');
  if (data.dailyBreakdown && data.dailyBreakdown.length > 0) add(buildPeriodTable(data.dailyBreakdown, 'Date'), 'Daily Performance');
  if (data.weeklyBreakdown && data.weeklyBreakdown.length > 0) add(buildPeriodTable(data.weeklyBreakdown, 'Week'), 'Weekly Performance');
  if (data.monthlyBreakdown && data.monthlyBreakdown.length > 0) add(buildPeriodTable(data.monthlyBreakdown, 'Month'), 'Monthly Performance');

  xlsx.writeFile(wb, `BD_Analytics_${rangeSuffix(filters)}.xlsx`);
}
