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
/**
 * Dates in the Attendance header rows are normally real date cells. When they come as plain text such as "12/28"
 * (no year), the year is inferred: it starts at `year` (or the year before if the block begins in December and runs
 * into the new year) and moves forward whenever the month wraps around.
 */
function headerDates(row: unknown[], year: number): { colIndex: number; date: string }[] {
  const out: { colIndex: number; date: string }[] = [];
  const textual = (v: unknown) => /^\s*(\d{1,2})\/(\d{1,2})\s*$/.exec(String(v ?? ''));
  const months = row.slice(1, 33).map((v) => textual(v)).filter(Boolean).map((m) => Number((m as RegExpExecArray)[1]));
  let currentYear = months.length > 0 && months[0] === 12 && months.some((m) => m <= 2) ? year - 1 : year;
  let prevMonth = 0;
  for (let c = 1; c < Math.min(row.length, 33); c++) {
    const m = textual(row[c]);
    if (m) {
      const month = Number(m[1]);
      const day = Number(m[2]);
      if (month < prevMonth) currentYear++;
      prevMonth = month;
      if (month >= 1 && month <= 12 && day >= 1 && day <= 31) {
        out.push({ colIndex: c, date: `${currentYear}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}` });
      }
      continue;
    }
    const iso = parseDateToISO(row[c]);
    if (iso) out.push({ colIndex: c, date: iso });
  }
  return out;
}

export function parseAttendanceRows(rows: unknown[][], opts: { year?: number } = {}): AttendanceDataset {
  const defaultYear = opts.year ?? (Number(process.env.ATTENDANCE_YEAR) || new Date().getFullYear());
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
      // Columns B through AG (indices 1 to 32) represent days of the pay period
      currentDates = headerDates(row, defaultYear);
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
        // If a date appears in several blocks, a later empty cell must not erase an earlier attendance mark.
        if (weight > 0 || agentDaily[agentClean][date] === undefined) {
          agentDaily[agentClean][date] = weight;
        }
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

const attendanceKeyCache = new WeakMap<AttendanceDataset, WeakMap<AgentMapping[], Map<string, string | null>>>();

/** Finds the attendance row for an opener (exact canonical match, else a unique whole-first-name match). Cached per dataset. */
function findAttendanceKey(
  agentName: string,
  attendance: AttendanceDataset,
  agentMappings: AgentMapping[]
): string | null {
  let byMappings = attendanceKeyCache.get(attendance);
  if (!byMappings) {
    byMappings = new WeakMap();
    attendanceKeyCache.set(attendance, byMappings);
  }
  let byName = byMappings.get(agentMappings);
  if (!byName) {
    byName = new Map();
    byMappings.set(agentMappings, byName);
  }
  if (byName.has(agentName)) return byName.get(agentName) ?? null;

  const keys = Object.keys(attendance.agentDaily);
  const targetLower = (resolveOpener(agentName, agentMappings) || agentName).toLowerCase().trim();

  let matched: string | null = null;
  for (const key of keys) {
    const canonicalKey = resolveOpener(key, agentMappings) || key;
    if (canonicalKey.toLowerCase().trim() === targetLower) {
      matched = key;
      break;
    }
  }

  // Fallback: match by whole first name, only when exactly one attendance row has it
  // (a prefix match would let "Ben" pick up "Benjamin").
  if (!matched) {
    const firstName = targetLower.split(/\s+/)[0];
    const candidates = keys.filter(key => key.toLowerCase().trim().split(/\s+/)[0] === firstName);
    if (candidates.length === 1) matched = candidates[0];
  }

  byName.set(agentName, matched);
  return matched;
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

  const matchedAgentKey = findAttendanceKey(agentName, attendance, agentMappings);
  if (!matchedAgentKey) return 0;

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
