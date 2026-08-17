import { CONFIG } from './config';
import { CallRecord, OpenerStats, OrgTotals, AgentMapping } from '../types/dashboard';

/**
 * Extracts agent name from Ultatel extension cell.
 * e.g., "112 (MMS-Ben Arthur)" -> "Ben Arthur"
 */
export function parseAgentName(extensionCell: string): string {
  if (!extensionCell) return '';
  const m = extensionCell.match(/\(MMS-([^)]+)\)/);
  return m ? m[1].trim() : extensionCell.trim();
}

/**
 * Converts various duration formats (hh:mm:ss, mm:ss, Sheets date/serial, numbers) to total seconds.
 */
export function durationToSeconds(val: unknown): number {
  if (val === null || val === undefined || val === '') return 0;
  if (typeof val === 'number') {
    // If it's a small decimal (fraction of a day in Sheets, e.g. 0.001157), convert to seconds
    if (val < 1 && val > 0) {
      return Math.round(val * 86400);
    }
    return Math.round(val);
  }
  if (val instanceof Date) {
    return val.getHours() * 3600 + val.getMinutes() * 60 + val.getSeconds();
  }
  const s = String(val).trim();
  const parts = s.split(':').map(Number);
  if (parts.some(isNaN)) return 0;
  if (parts.length === 2) return parts[0] * 60 + parts[1];
  if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
  return 0;
}

export function formatSeconds(totalSec: number): string {
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  return `${m}m ${s}s`;
}

export function formatMinutes(totalSec: number): string {
  const m = Math.round(totalSec / 60);
  return `${m.toLocaleString()} min`;
}

export function formatPercent(rate: number): string {
  if (isNaN(rate) || !isFinite(rate)) return '0.0%';
  return `${(rate * 100).toFixed(1)}%`;
}

/**
 * Computes all opener stats and org totals based on calls and BD Tracker pipeline counts.
 */
export function computeDashboardMetrics(
  rawCalls: CallRecord[],
  trackerCounts: Record<string, Record<string, number>>,
  agentMappings: AgentMapping[],
  filter?: {
    startDate?: string;
    endDate?: string;
    selectedOpener?: string;
  }
): { openers: OpenerStats[]; totals: OrgTotals; filteredCalls: CallRecord[] } {
  // Build lookup mapping
  const agentToOpener: Record<string, string> = {};
  agentMappings.forEach(m => {
    if (m.agent) {
      agentToOpener[m.agent.trim()] = (m.opener || '').trim();
    }
  });

  // Filter calls by date range if provided
  let filteredCalls = rawCalls.map(c => {
    const opener = agentToOpener[c.agent] || c.agent || 'Unmapped';
    return { ...c, opener };
  });

  if (filter?.startDate) {
    const start = new Date(filter.startDate).getTime();
    filteredCalls = filteredCalls.filter(c => {
      if (!c.callDate) return true;
      const d = new Date(c.callDate).getTime();
      return isNaN(d) || d >= start;
    });
  }

  if (filter?.endDate) {
    const end = new Date(filter.endDate).getTime() + 86400000; // end of day
    filteredCalls = filteredCalls.filter(c => {
      if (!c.callDate) return true;
      const d = new Date(c.callDate).getTime();
      return isNaN(d) || d <= end;
    });
  }

  // Aggregate call metrics per opener
  const stats: Record<string, { calls: number; out: number; in: number; answered: number; noAnswer: number; totalSec: number }> = {};

  filteredCalls.forEach(r => {
    const opener = r.opener || 'Unmapped';
    if (!stats[opener]) {
      stats[opener] = { calls: 0, out: 0, in: 0, answered: 0, noAnswer: 0, totalSec: 0 };
    }
    const s = stats[opener];
    s.calls++;
    if (r.type === 'OUT-Bound') s.out++;
    else if (r.type === 'IN-Bound') s.in++;

    if (r.outcome === 'ANSWERED') s.answered++;
    else if (r.outcome === 'NO ANSWER') s.noAnswer++;

    s.totalSec += r.durationSec || 0;
  });

  // Union of openers seen in call logs or tracker pipeline
  const allOpeners = new Set([...Object.keys(stats), ...Object.keys(trackerCounts)]);

  const openers: OpenerStats[] = [];

  allOpeners.forEach(op => {
    if (!op || op === 'undefined') return;
    const s = stats[op] || { calls: 0, out: 0, in: 0, answered: 0, noAnswer: 0, totalSec: 0 };
    const tc = trackerCounts[op] || {};

    const stageCounts: Record<string, number> = {};
    let booked = 0;
    CONFIG.BD_TABS.forEach(tab => {
      const count = tc[tab] || 0;
      stageCounts[tab] = count;
      booked += count;
    });

    const noShow = tc['No-Show'] || 0;
    const attended = Math.max(0, booked - noShow);
    const onboarded = tc['Onboarded'] || 0;

    const answerRate = s.calls > 0 ? s.answered / s.calls : 0;
    const avgCallSec = s.calls > 0 ? Math.round(s.totalSec / s.calls) : 0;
    const showRate = booked > 0 ? attended / booked : 0;
    const closeRate = booked > 0 ? onboarded / booked : 0;
    const callsPerMeeting = booked > 0 ? Number((s.calls / booked).toFixed(1)) : 0;

    openers.push({
      opener: op,
      calls: s.calls,
      outbound: s.out,
      inbound: s.in,
      answered: s.answered,
      noAnswer: s.noAnswer,
      answerRate,
      totalTalkSec: s.totalSec,
      avgCallSec,
      booked,
      noShow,
      attended,
      showRate,
      onboarded,
      closeRate,
      callsPerMeeting,
      stageCounts
    });
  });

  // Sort alphabetically by Opener name
  openers.sort((a, b) => a.opener.localeCompare(b.opener));

  // Compute Org Totals
  const totals: OrgTotals = {
    calls: 0,
    outbound: 0,
    inbound: 0,
    answered: 0,
    noAnswer: 0,
    answerRate: 0,
    totalTalkSec: 0,
    avgCallSec: 0,
    booked: 0,
    noShow: 0,
    attended: 0,
    showRate: 0,
    onboarded: 0,
    closeRate: 0,
    callsPerMeeting: 0,
    stageCounts: {}
  };

  CONFIG.BD_TABS.forEach(tab => {
    totals.stageCounts[tab] = 0;
  });

  openers.forEach(o => {
    totals.calls += o.calls;
    totals.outbound += o.outbound;
    totals.inbound += o.inbound;
    totals.answered += o.answered;
    totals.noAnswer += o.noAnswer;
    totals.totalTalkSec += o.totalTalkSec;
    totals.booked += o.booked;
    totals.noShow += o.noShow;
    totals.attended += o.attended;
    totals.onboarded += o.onboarded;
    CONFIG.BD_TABS.forEach(tab => {
      totals.stageCounts[tab] = (totals.stageCounts[tab] || 0) + (o.stageCounts[tab] || 0);
    });
  });

  totals.answerRate = totals.calls > 0 ? totals.answered / totals.calls : 0;
  totals.avgCallSec = totals.calls > 0 ? Math.round(totals.totalTalkSec / totals.calls) : 0;
  totals.showRate = totals.booked > 0 ? totals.attended / totals.booked : 0;
  totals.closeRate = totals.booked > 0 ? totals.onboarded / totals.booked : 0;
  totals.callsPerMeeting = totals.booked > 0 ? Number((totals.calls / totals.booked).toFixed(1)) : 0;

  return { openers, totals, filteredCalls };
}
