import { parseAgentName } from './analytics';
import { CallRecord } from '../types/dashboard';

export interface UltatelDeptSummary {
  rawAgent: string;
  parsedAgent: string;
  extension: string;
  outAnswered: number;
  outUnanswered: number;
  inAnswered: number;
  inUnanswered: number;
  totalCalls: number;
  totalDurationSec: number;
  acdMinutes: number;
}

/**
 * Parses Ultatel duration strings like "1 H , 2.53 M", "0 H , 8.93 M", or "45 M".
 */
export function parseUltatelDuration(val: unknown): number {
  if (val === null || val === undefined || val === '') return 0;
  if (typeof val === 'number') return Math.round(val);

  const s = String(val).trim();
  if (!s) return 0;

  // Check for "X H , Y M" or "X H" or "Y M"
  const hoursMatch = s.match(/(\d+(?:\.\d+)?)\s*H/i);
  const minsMatch = s.match(/(\d+(?:\.\d+)?)\s*M/i);
  const secsMatch = s.match(/(\d+(?:\.\d+)?)\s*S/i);

  if (hoursMatch || minsMatch || secsMatch) {
    const hours = hoursMatch ? parseFloat(hoursMatch[1]) : 0;
    const mins = minsMatch ? parseFloat(minsMatch[1]) : 0;
    const secs = secsMatch ? parseFloat(secsMatch[1]) : 0;
    return Math.round(hours * 3600 + mins * 60 + secs);
  }

  // Fallback to colon notation hh:mm:ss
  const parts = s.split(':').map(Number);
  if (parts.length === 2 && !parts.some(isNaN)) {
    return parts[0] * 60 + parts[1];
  }
  if (parts.length === 3 && !parts.some(isNaN)) {
    return parts[0] * 3600 + parts[1] * 60 + parts[2];
  }

  const num = parseFloat(s);
  return !isNaN(num) ? Math.round(num) : 0;
}

/**
 * Parses 2D array rows from OutBound Calls Per Department ( BusinessDevelopmentTeam ).xlsx
 */
export function parseUltatelDeptRows(rows: unknown[][]): UltatelDeptSummary[] {
  const results: UltatelDeptSummary[] = [];
  if (!rows || rows.length < 2) return results;

  // Find header row containing 'agent'
  let headerRowIdx = -1;
  for (let i = 0; i < Math.min(5, rows.length); i++) {
    const row = rows[i];
    if (row && row.some(cell => String(cell || '').toLowerCase().includes('agent'))) {
      headerRowIdx = i;
      break;
    }
  }

  if (headerRowIdx === -1) return results;

  const headers = (rows[headerRowIdx] || []).map(h => String(h || '').trim().toLowerCase());

  const agentIdx = headers.findIndex(h => h.includes('agent'));
  const outAnsIdx = headers.findIndex(h => h.includes('out answered') || h.includes('out-answered'));
  const outUnansIdx = headers.findIndex(h => h.includes('out unanswered') || h.includes('out-unanswered'));
  const inAnsIdx = headers.findIndex(h => h.includes('in answered') || h.includes('in-answered'));
  const inUnansIdx = headers.findIndex(h => h.includes('in unanswered') || h.includes('in-unanswered'));
  const totalCallsIdx = headers.findIndex(h => h.includes('total calls') || h === 'calls');
  const durationIdx = headers.findIndex(h => h.includes('duration') || h.includes('talk'));
  const acdIdx = headers.findIndex(h => h.includes('acd'));

  for (let r = headerRowIdx + 1; r < rows.length; r++) {
    const row = rows[r];
    if (!row || row.length === 0) continue;

    const rawAgent = String(row[agentIdx] || '').trim();
    if (!rawAgent || rawAgent.toLowerCase().includes('total') || rawAgent.toLowerCase().includes('department')) {
      continue;
    }

    const extMatch = rawAgent.match(/^(\d+)/);
    const extension = extMatch ? extMatch[1] : '';
    const parsedAgent = parseAgentName(rawAgent);

    const outAnswered = Number(row[outAnsIdx] || 0);
    const outUnanswered = Number(row[outUnansIdx] || 0);
    const inAnswered = Number(row[inAnsIdx] || 0);
    const inUnanswered = Number(row[inUnansIdx] || 0);
    const totalCalls = Number(row[totalCallsIdx] || (outAnswered + outUnanswered + inAnswered + inUnanswered));
    const totalDurationSec = parseUltatelDuration(row[durationIdx]);
    const acdMinutes = Number(row[acdIdx] || 0);

    results.push({
      rawAgent,
      parsedAgent,
      extension,
      outAnswered,
      outUnanswered,
      inAnswered,
      inUnanswered,
      totalCalls,
      totalDurationSec,
      acdMinutes,
    });
  }

  return results;
}

/**
 * Converts departmental summary records into synthesized call records for the dashboard.
 * Used when raw individual call logs are not provided or when departmental export is loaded.
 */
export function deptSummariesToCallRecords(
  summaries: UltatelDeptSummary[],
  callDate = new Date().toISOString().split('T')[0]
): CallRecord[] {
  const calls: CallRecord[] = [];

  summaries.forEach((s, sIdx) => {
    // Distribute total duration proportionally across answered calls
    const totalAnswered = s.outAnswered + s.inAnswered;
    const avgSec = totalAnswered > 0 ? Math.round(s.totalDurationSec / totalAnswered) : 0;

    // Outbound Answered
    for (let i = 0; i < s.outAnswered; i++) {
      calls.push({
        callDate,
        callId: `ultatel_out_ans_${sIdx}_${i}`,
        from: s.extension,
        to: '',
        extension: s.extension,
        department: 'BusinessDevelopmentTeam',
        did: '',
        description: 'Outbound Answered',
        type: 'OUT-Bound',
        outcome: 'ANSWERED',
        duration: `${Math.floor(avgSec / 60)}:${String(avgSec % 60).padStart(2, '0')}`,
        durationSec: avgSec,
        notes: '',
        callPath: '',
        agent: s.parsedAgent,
        opener: s.parsedAgent,
      });
    }

    // Outbound Unanswered
    for (let i = 0; i < s.outUnanswered; i++) {
      calls.push({
        callDate,
        callId: `ultatel_out_unans_${sIdx}_${i}`,
        from: s.extension,
        to: '',
        extension: s.extension,
        department: 'BusinessDevelopmentTeam',
        did: '',
        description: 'Outbound Unanswered',
        type: 'OUT-Bound',
        outcome: 'NO ANSWER',
        duration: '0:00',
        durationSec: 0,
        notes: '',
        callPath: '',
        agent: s.parsedAgent,
        opener: s.parsedAgent,
      });
    }

    // Inbound Answered
    for (let i = 0; i < s.inAnswered; i++) {
      calls.push({
        callDate,
        callId: `ultatel_in_ans_${sIdx}_${i}`,
        from: '',
        to: s.extension,
        extension: s.extension,
        department: 'BusinessDevelopmentTeam',
        did: '',
        description: 'Inbound Answered',
        type: 'IN-Bound',
        outcome: 'ANSWERED',
        duration: `${Math.floor(avgSec / 60)}:${String(avgSec % 60).padStart(2, '0')}`,
        durationSec: avgSec,
        notes: '',
        callPath: '',
        agent: s.parsedAgent,
        opener: s.parsedAgent,
      });
    }

    // Inbound Unanswered
    for (let i = 0; i < s.inUnanswered; i++) {
      calls.push({
        callDate,
        callId: `ultatel_in_unans_${sIdx}_${i}`,
        from: '',
        to: s.extension,
        extension: s.extension,
        department: 'BusinessDevelopmentTeam',
        did: '',
        description: 'Inbound Unanswered',
        type: 'IN-Bound',
        outcome: 'NO ANSWER',
        duration: '0:00',
        durationSec: 0,
        notes: '',
        callPath: '',
        agent: s.parsedAgent,
        opener: s.parsedAgent,
      });
    }
  });

  return calls;
}
