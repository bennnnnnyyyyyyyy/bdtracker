import { parseDateToISO, resolveOpener } from './analytics';
import { AgentMapping } from '../types/dashboard';

export type AgentDailyAttendance = Record<string, Record<string, number>>; // agent -> { [isoDate]: weight }
export type AgentMonthlyAttendance = Record<string, number[]>; // agent -> array of Column AH totals

export interface AttendanceDataset {
  agentDaily: AgentDailyAttendance;
  agentMonthly: AgentMonthlyAttendance;
}

/**
 * Returns numeric weight for an attendance code in the Attendance sheet.
 * Matches Column AH formula: countif(P) + L1 + L2 + (H * 0.5) + (Q * 0.75)
 */
export function getAttendanceWeight(code: unknown): number {
  if (code === null || code === undefined || code === '') return 0;
  const s = String(code).trim().toUpperCase();
  if (s === 'P') return 1.0;
  if (s === 'L1') return 1.0;
  if (s === 'L2') return 1.0;
  if (s === 'Q') return 0.75;
  if (s === 'H') return 0.5;
  return 0;
}

/**
 * Normalizes an agent name from the Attendance tab.
 * Strips notes like "(Part-time)", "(New comer)", and excess whitespace.
 */
export function normalizeAttendanceAgent(name: string): string {
  if (!name) return '';
  return name
    .split('\n')[0]
    .replace(/\(.*?\)/g, '')
    .trim();
}

/**
 * Parses attendance rows from either a Google Sheets 2D array or an xlsx sheet_to_json 2D array.
 */
export function parseAttendanceRows(rows: unknown[][]): AttendanceDataset {
  const agentDaily: AgentDailyAttendance = {};
  const agentMonthly: AgentMonthlyAttendance = {};

  if (!rows || rows.length === 0) {
    return { agentDaily, agentMonthly };
  }

  let currentDates: { colIndex: number; date: string }[] = [];

  for (let r = 0; r < rows.length; r++) {
    const row = rows[r];
    if (!row || row.length === 0) continue;

    const col0 = String(row[0] || '').trim().toLowerCase();

    // Header row containing dates
    if (col0 === 'date') {
      currentDates = [];
      // Columns B through AG (indices 1 to 32) represent days of the pay period
      for (let c = 1; c < Math.min(row.length, 33); c++) {
        const cellVal = row[c];
        const iso = parseDateToISO(cellVal);
        if (iso) {
          currentDates.push({ colIndex: c, date: iso });
        }
      }
      continue;
    }

    // Skip month labels or day-name subheaders
    if (col0 === 'month' || col0 === 'day' || col0 === '') {
      continue;
    }

    // Agent attendance row
    if (currentDates.length > 0) {
      const rawName = String(row[0] || '').trim();
      const agentClean = normalizeAttendanceAgent(rawName);
      if (!agentClean || agentClean.toLowerCase() === 'agent name') continue;

      if (!agentDaily[agentClean]) {
        agentDaily[agentClean] = {};
      }

      currentDates.forEach(({ colIndex, date }) => {
        const cellCode = row[colIndex];
        const weight = getAttendanceWeight(cellCode);
        // If multiple entries occur for the same date across blocks, take the non-zero or latest weight
        agentDaily[agentClean][date] = weight;
      });

      // Column AH (index 33) is the precomputed "Present" total for this block
      const colAH = row[33];
      if (colAH !== undefined && colAH !== null && colAH !== '') {
        const numAH = Number(colAH);
        if (!isNaN(numAH)) {
          if (!agentMonthly[agentClean]) agentMonthly[agentClean] = [];
          agentMonthly[agentClean].push(numAH);
        }
      }
    }
  }

  return { agentDaily, agentMonthly };
}

/**
 * Calculates present days for an agent over a specified date range.
 * Uses day-by-day cell codes (P, L1, L2, Q, H) to calculate the exact weighted days.
 */
export function calculateAgentPresentDays(
  agentName: string,
  attendance: AttendanceDataset,
  agentMappings: AgentMapping[],
  startDate?: string,
  endDate?: string
): number {
  if (!agentName || !attendance.agentDaily) return 0;

  const targetOpener = resolveOpener(agentName, agentMappings) || agentName;
  const targetLower = targetOpener.toLowerCase().trim();

  // Find matching agent record in attendance data
  let matchedAgentKey: string | null = null;
  for (const key of Object.keys(attendance.agentDaily)) {
    const canonicalKey = resolveOpener(key, agentMappings) || key;
    if (canonicalKey.toLowerCase().trim() === targetLower) {
      matchedAgentKey = key;
      break;
    }
  }

  // Fallback: match by first name if full name not found
  if (!matchedAgentKey) {
    const firstName = targetLower.split(/\s+/)[0];
    for (const key of Object.keys(attendance.agentDaily)) {
      if (key.toLowerCase().trim().startsWith(firstName)) {
        matchedAgentKey = key;
        break;
      }
    }
  }

  if (!matchedAgentKey) {
    return 0;
  }

  const dailyRecords = attendance.agentDaily[matchedAgentKey] || {};
  const dates = Object.keys(dailyRecords);
  if (dates.length === 0) return 0;

  const startISO = startDate ? parseDateToISO(startDate) : null;
  const endISO = endDate ? parseDateToISO(endDate) : null;

  let totalPresent = 0;
  for (const d of dates) {
    if (startISO && d < startISO) continue;
    if (endISO && d > endISO) continue;
    totalPresent += dailyRecords[d] || 0;
  }

  return Number(totalPresent.toFixed(2));
}
