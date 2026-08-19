import { CONFIG, isExcludedAgent } from './config';
import {
  CallRecord,
  MeetingRecord,
  OpenerStats,
  OrgTotals,
  AgentMapping,
  PeriodicGroupSummary,
  PeriodicAgentMetrics
} from '../types/dashboard';

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

/**
 * Parses date from Excel serial number, Date object, or date string into YYYY-MM-DD format.
 */
export function parseDateToISO(val: unknown): string | null {
  if (val === null || val === undefined || val === '') return null;

  if (typeof val === 'number') {
    // Excel serial dates: e.g. 40000 - 60000 corresponds to 2009 - 2064
    if (val > 30000 && val < 60000) {
      const jsDate = new Date(Math.round((val - 25569) * 86400 * 1000));
      if (!isNaN(jsDate.getTime())) {
        return jsDate.toISOString().split('T')[0];
      }
    }
    return null;
  }

  if (val instanceof Date) {
    if (isNaN(val.getTime())) return null;
    return val.toISOString().split('T')[0];
  }

  const s = String(val).trim();
  if (!s) return null;

  // 1. Try ISO YYYY-MM-DD
  const isoMatch = s.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})/);
  if (isoMatch) {
    const yyyy = isoMatch[1];
    const mm = isoMatch[2].padStart(2, '0');
    const dd = isoMatch[3].padStart(2, '0');
    return `${yyyy}-${mm}-${dd}`;
  }

  // 2. Try MM/DD/YYYY or MM/DD/YY or DD/MM/YYYY
  const mdyMatch = s.match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{2,4})/);
  if (mdyMatch) {
    const p1 = parseInt(mdyMatch[1], 10);
    const p2 = parseInt(mdyMatch[2], 10);
    let yr = parseInt(mdyMatch[3], 10);
    if (yr < 100) yr += 2000;

    let mm = p1;
    let dd = p2;
    if (p1 > 12 && p2 <= 12) {
      // European format DD/MM/YYYY
      dd = p1;
      mm = p2;
    }
    return `${yr}-${String(mm).padStart(2, '0')}-${String(dd).padStart(2, '0')}`;
  }

  // 3. Try standard Date.parse
  const d = new Date(s);
  if (!isNaN(d.getTime())) {
    return d.toISOString().split('T')[0];
  }

  return null;
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
 * Returns ISO week key (e.g., "2026-W33") and readable range label.
 */
export function getIsoWeekKey(dateStr: string): { key: string; label: string } {
  const d = new Date(dateStr + 'T00:00:00');
  if (isNaN(d.getTime())) return { key: 'Unknown', label: 'Unknown' };

  // Calculate Monday of this week
  const day = d.getDay();
  const diffToMonday = (day === 0 ? -6 : 1) - day;
  const monday = new Date(d);
  monday.setDate(d.getDate() + diffToMonday);

  const sunday = new Date(monday);
  sunday.setDate(monday.getDate() + 6);

  const year = monday.getFullYear();
  // Approximate week number
  const oneJan = new Date(year, 0, 1);
  const numberOfDays = Math.floor((monday.getTime() - oneJan.getTime()) / (24 * 60 * 60 * 1000));
  const weekNum = Math.ceil((numberOfDays + oneJan.getDay() + 1) / 7);

  const monLabel = monday.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  const sunLabel = sunday.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });

  return {
    key: `${year}-W${String(weekNum).padStart(2, '0')}`,
    label: `${monLabel} – ${sunLabel}`
  };
}

/**
 * Returns ISO month key (e.g. "2026-08") and formatted label.
 */
export function getIsoMonthKey(dateStr: string): { key: string; label: string } {
  const d = new Date(dateStr + 'T00:00:00');
  if (isNaN(d.getTime())) return { key: 'Unknown', label: 'Unknown' };
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const label = d.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
  return {
    key: `${year}-${month}`,
    label
  };
}

/**
 * Canonical agent / opener normalizer.
 * Matches full names, first names, and custom mappings to a consistent Opener name.
 * Drops system extensions (numbers, IVR, etc.) and excluded agents.
 */
export function resolveOpener(
  rawName: string | undefined | null,
  agentMappings: AgentMapping[]
): string | null {
  if (!rawName) return null;
  const clean = String(rawName).trim();
  if (!clean || isExcludedAgent(clean)) return null;

  // Ignore numeric extensions, system names, and unassigned channels
  if (/^\d+$/.test(clean) || /^(front desk|conference|support|ivr|unmapped|main line|fax|unknown)/i.test(clean)) {
    return null;
  }

  const cleanLower = clean.toLowerCase();

  // 1. Direct case-insensitive match against Agent Mapping
  for (const m of agentMappings) {
    if (m.agent && m.agent.toLowerCase() === cleanLower) {
      const target = (m.opener || m.agent).trim();
      return isExcludedAgent(target) ? null : target;
    }
    if (m.opener && m.opener.toLowerCase() === cleanLower) {
      return isExcludedAgent(m.opener) ? null : m.opener.trim();
    }
  }

  // 2. First-name or Prefix matching against known Openers
  const firstName = clean.split(/\s+/)[0].toLowerCase();
  for (const m of agentMappings) {
    if (m.opener && m.opener.toLowerCase() === firstName) {
      return isExcludedAgent(m.opener) ? null : m.opener.trim();
    }
    if (m.agent && m.agent.toLowerCase().startsWith(firstName)) {
      const target = (m.opener || m.agent).trim();
      return isExcludedAgent(target) ? null : target;
    }
  }

  // 3. Fallback: Capitalized clean name if valid person name
  if (/^[a-zA-Z\s.-]+$/.test(clean)) {
    return clean;
  }

  return null;
}

/**
 * Computes all opener stats, org totals, and daily/weekly/monthly breakdowns.
 */
export function computeDashboardMetrics(
  rawCalls: CallRecord[],
  rawMeetings: MeetingRecord[],
  trackerCounts: Record<string, Record<string, number>>,
  agentMappings: AgentMapping[],
  filter?: {
    startDate?: string;
    endDate?: string;
    selectedOpener?: string;
  }
): {
  openers: OpenerStats[];
  totals: OrgTotals;
  filteredCalls: CallRecord[];
  dailyBreakdown: PeriodicGroupSummary[];
  weeklyBreakdown: PeriodicGroupSummary[];
  monthlyBreakdown: PeriodicGroupSummary[];
} {
  // Normalize and map calls to canonical openers
  let filteredCalls: CallRecord[] = [];
  rawCalls.forEach(c => {
    const rawAgent = c.agent || parseAgentName(c.extension);
    const opener = resolveOpener(rawAgent, agentMappings);
    if (!opener || isExcludedAgent(opener)) return;
    filteredCalls.push({ ...c, agent: rawAgent, opener });
  });

  // Date filtering for calls
  let startTimestamp: number | null = null;
  let endTimestamp: number | null = null;

  if (filter?.startDate) {
    const s = new Date(filter.startDate + 'T00:00:00').getTime();
    if (!isNaN(s)) startTimestamp = s;
  }
  if (filter?.endDate) {
    const e = new Date(filter.endDate + 'T23:59:59').getTime();
    if (!isNaN(e)) endTimestamp = e;
  }

  if (startTimestamp !== null) {
    filteredCalls = filteredCalls.filter(c => {
      const iso = parseDateToISO(c.callDate);
      if (!iso) return true;
      const t = new Date(iso + 'T00:00:00').getTime();
      return isNaN(t) || t >= startTimestamp!;
    });
  }

  if (endTimestamp !== null) {
    filteredCalls = filteredCalls.filter(c => {
      const iso = parseDateToISO(c.callDate);
      if (!iso) return true;
      const t = new Date(iso + 'T23:59:59').getTime();
      return isNaN(t) || t <= endTimestamp!;
    });
  }

  // Normalize and filter meetings
  let filteredMeetings: MeetingRecord[] = [];
  rawMeetings.forEach(m => {
    const opener = resolveOpener(m.opener, agentMappings);
    if (!opener || isExcludedAgent(opener)) return;
    filteredMeetings.push({ ...m, opener });
  });

  if (startTimestamp !== null) {
    filteredMeetings = filteredMeetings.filter(m => {
      if (!m.dateAdded) return true;
      const t = new Date(m.dateAdded + 'T00:00:00').getTime();
      return isNaN(t) || t >= startTimestamp!;
    });
  }

  if (endTimestamp !== null) {
    filteredMeetings = filteredMeetings.filter(m => {
      if (!m.dateAdded) return true;
      const t = new Date(m.dateAdded + 'T23:59:59').getTime();
      return isNaN(t) || t <= endTimestamp!;
    });
  }

  // Calculate normalized tracker counts per canonical opener
  const dynamicTrackerCounts: Record<string, Record<string, number>> = {};
  if (startTimestamp !== null || endTimestamp !== null) {
    filteredMeetings.forEach(m => {
      if (!m.opener) return;
      if (!dynamicTrackerCounts[m.opener]) dynamicTrackerCounts[m.opener] = {};
      dynamicTrackerCounts[m.opener][m.stage] = (dynamicTrackerCounts[m.opener][m.stage] || 0) + 1;
    });
  } else {
    // Re-map raw tracker counts to canonical openers
    Object.keys(trackerCounts).forEach(rawOpener => {
      const canonical = resolveOpener(rawOpener, agentMappings);
      if (!canonical || isExcludedAgent(canonical)) return;
      if (!dynamicTrackerCounts[canonical]) dynamicTrackerCounts[canonical] = {};
      
      CONFIG.BD_TABS.forEach(tab => {
        const count = trackerCounts[rawOpener]?.[tab] || 0;
        dynamicTrackerCounts[canonical][tab] = (dynamicTrackerCounts[canonical][tab] || 0) + count;
      });
    });
  }

  // Aggregate call metrics per canonical opener
  const stats: Record<string, { calls: number; out: number; in: number; answered: number; noAnswer: number; totalSec: number }> = {};

  filteredCalls.forEach(r => {
    const opener = r.opener;
    if (!opener || isExcludedAgent(opener)) return;
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

  // Collect all verified active canonical openers
  const allOpeners = new Set<string>();
  Object.keys(stats).forEach(op => { if (!isExcludedAgent(op)) allOpeners.add(op); });
  Object.keys(dynamicTrackerCounts).forEach(op => { if (!isExcludedAgent(op)) allOpeners.add(op); });
  agentMappings.forEach(m => {
    const canonical = resolveOpener(m.opener || m.agent, agentMappings);
    if (canonical && !isExcludedAgent(canonical)) allOpeners.add(canonical);
  });


  // Calculate unique days, weeks, months for averages
  const distinctDays = new Set<string>();
  filteredCalls.forEach(c => {
    const iso = parseDateToISO(c.callDate);
    if (iso) distinctDays.add(iso);
  });
  filteredMeetings.forEach(m => {
    if (m.dateAdded) distinctDays.add(m.dateAdded);
  });
  const daysCount = Math.max(1, distinctDays.size);
  const weeksCount = Math.max(1, Math.ceil(daysCount / 7));
  const monthsCount = Math.max(1, Math.ceil(daysCount / 30));

  const openers: OpenerStats[] = [];

  allOpeners.forEach(op => {
    if (!op || op === 'undefined' || isExcludedAgent(op)) return;
    const s = stats[op] || { calls: 0, out: 0, in: 0, answered: 0, noAnswer: 0, totalSec: 0 };
    const tc = dynamicTrackerCounts[op] || {};

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
    const connectionRate = answerRate; // Connection rate is call answer rate
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
      connectionRate,
      totalTalkSec: s.totalSec,
      avgCallSec,
      booked,
      noShow,
      attended,
      showRate,
      onboarded,
      closeRate,
      callsPerMeeting,
      stageCounts,
      dailyAverages: {
        calls: Number((s.calls / daysCount).toFixed(1)),
        meetings: Number((booked / daysCount).toFixed(1))
      },
      weeklyAverages: {
        calls: Number((s.calls / weeksCount).toFixed(1)),
        meetings: Number((booked / weeksCount).toFixed(1))
      },
      monthlyAverages: {
        calls: Number((s.calls / monthsCount).toFixed(1)),
        meetings: Number((booked / monthsCount).toFixed(1))
      }
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
    connectionRate: 0,
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
  totals.connectionRate = totals.answerRate;
  totals.avgCallSec = totals.calls > 0 ? Math.round(totals.totalTalkSec / totals.calls) : 0;
  totals.showRate = totals.booked > 0 ? totals.attended / totals.booked : 0;
  totals.closeRate = totals.booked > 0 ? totals.onboarded / totals.booked : 0;
  totals.callsPerMeeting = totals.booked > 0 ? Number((totals.calls / totals.booked).toFixed(1)) : 0;

  // Compute Periodic Breakdowns (Daily, Weekly, Monthly)
  const dailyBreakdown = buildPeriodicBreakdown(
    filteredCalls,
    filteredMeetings,
    Array.from(allOpeners),
    (dateStr) => {
      const iso = parseDateToISO(dateStr);
      return iso ? { key: iso, label: iso } : null;
    }
  );

  const weeklyBreakdown = buildPeriodicBreakdown(
    filteredCalls,
    filteredMeetings,
    Array.from(allOpeners),
    (dateStr) => {
      const iso = parseDateToISO(dateStr);
      return iso ? getIsoWeekKey(iso) : null;
    }
  );

  const monthlyBreakdown = buildPeriodicBreakdown(
    filteredCalls,
    filteredMeetings,
    Array.from(allOpeners),
    (dateStr) => {
      const iso = parseDateToISO(dateStr);
      return iso ? getIsoMonthKey(iso) : null;
    }
  );

  return {
    openers,
    totals,
    filteredCalls,
    dailyBreakdown,
    weeklyBreakdown,
    monthlyBreakdown
  };
}

/**
 * Helper to build periodic grouped metrics for agents.
 */
function buildPeriodicBreakdown(
  calls: CallRecord[],
  meetings: MeetingRecord[],
  allOpeners: string[],
  getKeyAndLabel: (dateStr: string) => { key: string; label: string } | null
): PeriodicGroupSummary[] {
  const periodMap = new Map<string, {
    key: string;
    label: string;
    agentStats: Record<string, {
      calls: number;
      out: number;
      in: number;
      answered: number;
      meetings: number;
      noShow: number;
      onboarded: number;
    }>;
  }>();

  // 1. Process Calls
  calls.forEach(c => {
    if (!c.callDate) return;
    const period = getKeyAndLabel(c.callDate);
    if (!period) return;

    if (!periodMap.has(period.key)) {
      periodMap.set(period.key, { key: period.key, label: period.label, agentStats: {} });
    }
    const p = periodMap.get(period.key)!;
    const opener = c.opener || 'Unmapped';
    if (!p.agentStats[opener]) {
      p.agentStats[opener] = { calls: 0, out: 0, in: 0, answered: 0, meetings: 0, noShow: 0, onboarded: 0 };
    }
    const a = p.agentStats[opener];
    a.calls++;
    if (c.type === 'OUT-Bound') a.out++;
    else if (c.type === 'IN-Bound') a.in++;
    if (c.outcome === 'ANSWERED') a.answered++;
  });

  // 2. Process Meetings
  meetings.forEach(m => {
    if (!m.dateAdded) return;
    const period = getKeyAndLabel(m.dateAdded);
    if (!period) return;

    if (!periodMap.has(period.key)) {
      periodMap.set(period.key, { key: period.key, label: period.label, agentStats: {} });
    }
    const p = periodMap.get(period.key)!;
    const opener = m.opener || 'Unmapped';
    if (!p.agentStats[opener]) {
      p.agentStats[opener] = { calls: 0, out: 0, in: 0, answered: 0, meetings: 0, noShow: 0, onboarded: 0 };
    }
    const a = p.agentStats[opener];
    a.meetings++;
    if (m.stage === 'No-Show') a.noShow++;
    if (m.stage === 'Onboarded') a.onboarded++;
  });

  // Convert to sorted array of PeriodicGroupSummary
  const result: PeriodicGroupSummary[] = [];

  const sortedKeys = Array.from(periodMap.keys()).sort().reverse(); // Most recent first

  sortedKeys.forEach(k => {
    const entry = periodMap.get(k)!;
    let totCalls = 0;
    let totAnswered = 0;
    let totMeetings = 0;
    let totNoShow = 0;
    let totOnboarded = 0;

    const agentList: PeriodicAgentMetrics[] = [];

    allOpeners.forEach(opener => {
      const raw = entry.agentStats[opener] || { calls: 0, out: 0, in: 0, answered: 0, meetings: 0, noShow: 0, onboarded: 0 };
      if (raw.calls === 0 && raw.meetings === 0) return; // Skip zero-activity agents for this period

      totCalls += raw.calls;
      totAnswered += raw.answered;
      totMeetings += raw.meetings;
      totNoShow += raw.noShow;
      totOnboarded += raw.onboarded;

      const attended = Math.max(0, raw.meetings - raw.noShow);
      const connectionRate = raw.calls > 0 ? raw.answered / raw.calls : 0;
      const showRate = raw.meetings > 0 ? attended / raw.meetings : 0;
      const closeRate = raw.meetings > 0 ? raw.onboarded / raw.meetings : 0;
      const callsPerMeeting = raw.meetings > 0 ? Number((raw.calls / raw.meetings).toFixed(1)) : 0;

      agentList.push({
        periodKey: entry.key,
        periodLabel: entry.label,
        opener,
        calls: raw.calls,
        outbound: raw.out,
        inbound: raw.in,
        answered: raw.answered,
        connectionRate,
        meetings: raw.meetings,
        noShow: raw.noShow,
        attended,
        showRate,
        onboarded: raw.onboarded,
        closeRate,
        callsPerMeeting
      });
    });

    // Sort agents by meetings booked desc, then calls desc
    agentList.sort((a, b) => b.meetings - a.meetings || b.calls - a.calls);

    const totAttended = Math.max(0, totMeetings - totNoShow);
    const totConnectionRate = totCalls > 0 ? totAnswered / totCalls : 0;
    const totShowRate = totMeetings > 0 ? totAttended / totMeetings : 0;
    const totCloseRate = totMeetings > 0 ? totOnboarded / totMeetings : 0;

    result.push({
      periodKey: entry.key,
      periodLabel: entry.label,
      totals: {
        calls: totCalls,
        answered: totAnswered,
        connectionRate: totConnectionRate,
        meetings: totMeetings,
        attended: totAttended,
        showRate: totShowRate,
        onboarded: totOnboarded,
        closeRate: totCloseRate
      },
      agents: agentList
    });
  });

  return result;
}

