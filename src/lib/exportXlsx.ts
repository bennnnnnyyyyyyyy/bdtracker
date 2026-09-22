import * as xlsx from 'xlsx';
import { DashboardResponse, FilterState } from '../types/dashboard';

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

/**
 * Generates and downloads a complete multi-tab Excel analytics workbook.
 */
export function exportDashboardAnalyticsXlsx(
  data: DashboardResponse,
  filters: FilterState
): void {
  const wb = xlsx.utils.book_new();

  // ==========================================
  // SHEET 1: Agent Analytics Summary
  // ==========================================
  const stages = data.stages || [];
  const summaryHeaders = [
    'Agent / Opener',
    'Total Calls',
    'Outbound Calls',
    'Inbound Calls',
    'Answered Calls',
    'Connection Rate %',
    'Booking Rate %',
    'Total Talk Time (HH:MM:SS)',
    'Avg Call Duration (MM:SS)',
    'Meetings Booked',
    'Med B Count',
    'Med B %',
    'PPO Count',
    'PPO %',
    'Attended Meetings',
    'Show Rate %',
    'Onboarded',
    'Close Rate %',
    'Calls / Meeting',
    'Present Days',
    'Adherence %',
    'Calls / Present Day',
    ...stages
  ];

  const summaryRows: (string | number)[][] = [];

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
      op.answered > 0 ? `${(op.bookingRate * 100).toFixed(1)}%` : '—',
      formatSecondsToHms(op.totalTalkSec),
      formatSecondsToHms(op.avgCallSec).slice(3), // MM:SS
      op.booked,
      op.medBCount || 0,
      `${(op.medBRate || 0).toFixed(1)}%`,
      op.ppoCount || 0,
      `${(op.ppoRate || 0).toFixed(1)}%`,
      op.attended,
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
      tot.answered > 0 ? `${(tot.bookingRate * 100).toFixed(1)}%` : '—',
      formatSecondsToHms(tot.totalTalkSec),
      formatSecondsToHms(tot.avgCallSec).slice(3),
      tot.booked,
      tot.medBCount || 0,
      `${(tot.medBRate || 0).toFixed(1)}%`,
      tot.ppoCount || 0,
      `${(tot.ppoRate || 0).toFixed(1)}%`,
      tot.attended,
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

  const wsSummary = xlsx.utils.aoa_to_sheet([summaryHeaders, ...summaryRows]);
  wsSummary['!cols'] = autoFitColumns([summaryHeaders, ...summaryRows]);
  xlsx.utils.book_append_sheet(wb, wsSummary, 'Agent Overview');

  const funnelRows: (string | number)[][] = [
    ['Stage', 'Count', 'Conversion from prior', 'Conversion from calls'],
    ['Calls', data.funnel.calls, '—', '—'],
    ['Answered', data.funnel.answered, `${(data.funnel.connectionRate * 100).toFixed(1)}%`, `${(data.funnel.connectionRate * 100).toFixed(1)}%`],
    ['Meetings Booked', data.funnel.booked, data.funnel.answered > 0 ? `${(data.funnel.bookingRate * 100).toFixed(1)}%` : '—', data.funnel.calls > 0 ? `${((data.funnel.booked / data.funnel.calls) * 100).toFixed(1)}%` : '—'],
    ['Attended', data.funnel.attended, data.funnel.booked > 0 ? `${(data.funnel.showRate * 100).toFixed(1)}%` : '—', data.funnel.calls > 0 ? `${((data.funnel.attended / data.funnel.calls) * 100).toFixed(1)}%` : '—'],
    ['Onboarded', data.funnel.onboarded, data.funnel.booked > 0 ? `${(data.funnel.closeRate * 100).toFixed(1)}%` : '—', data.funnel.calls > 0 ? `${((data.funnel.onboarded / data.funnel.calls) * 100).toFixed(1)}%` : '—'],
  ];
  const wsFunnel = xlsx.utils.aoa_to_sheet(funnelRows);
  wsFunnel['!cols'] = autoFitColumns(funnelRows);
  xlsx.utils.book_append_sheet(wb, wsFunnel, 'Executive Funnel');

  // ==========================================
  // SHEET 2: Meeting Pipeline Details
  // ==========================================
  if (data.meetings && data.meetings.length > 0) {
    const meetingHeaders = [
      'Date Added',
      'Opener',
      'Stage',
      'Company Name',
      'Authorized Person',
      'Med B',
      'PPO'
    ];

    const meetingRows = data.meetings.map(m => [
      m.dateAdded || '',
      m.opener || '',
      m.stage || '',
      m.companyName || '',
      m.authorizedPerson || '',
      m.medB ? 'Yes' : 'No',
      m.ppo ? 'Yes' : 'No'
    ]);

    const wsMeetings = xlsx.utils.aoa_to_sheet([meetingHeaders, ...meetingRows]);
    wsMeetings['!cols'] = autoFitColumns([meetingHeaders, ...meetingRows]);
    xlsx.utils.book_append_sheet(wb, wsMeetings, 'Meeting Pipeline');
  }

  // ==========================================
  // SHEET 3: Daily Performance Breakdown
  // ==========================================
  if (data.dailyBreakdown && data.dailyBreakdown.length > 0) {
    const dailyHeaders = [
      'Date',
      'Opener',
      'Calls',
      'Outbound',
      'Inbound',
      'Answered',
      'Connection Rate %',
      'Meetings Booked',
      'Attended',
      'Onboarded',
      'Present Days',
      'Calls / Present Day'
    ];

    const dailyRows: (string | number)[][] = [];
    data.dailyBreakdown.forEach(group => {
      group.agents.forEach(ag => {
        dailyRows.push([
          group.periodLabel,
          ag.opener,
          ag.calls,
          ag.outbound,
          ag.inbound,
          ag.answered,
          `${(ag.connectionRate * 100).toFixed(1)}%`,
          ag.meetings,
          ag.attended,
          ag.onboarded,
          ag.presentDays,
          ag.callsPerPresentDay
        ]);
      });
    });

    const wsDaily = xlsx.utils.aoa_to_sheet([dailyHeaders, ...dailyRows]);
    wsDaily['!cols'] = autoFitColumns([dailyHeaders, ...dailyRows]);
    xlsx.utils.book_append_sheet(wb, wsDaily, 'Daily Performance');
  }

  // Generate file name with filter date info
  const startStr = filters.startDate ? filters.startDate.replace(/[^0-9]/g, '') : 'all';
  const endStr = filters.endDate ? filters.endDate.replace(/[^0-9]/g, '') : 'all';
  const fileName = `BD_Analytics_${startStr}_to_${endStr}.xlsx`;

  // Write and trigger download in browser
  xlsx.writeFile(wb, fileName);
}
