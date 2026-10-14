import * as xlsx from 'xlsx';
import type { CallRecord } from '../types/dashboard';
import { durationToSeconds } from './analytics';
import { isExcludedAgent } from './config';
import { parseCsv } from './ultatelFile';

/**
 * Ultatel's "Total Calls Per Extension" report: one row per extension with the day's call counts. There are no
 * individual calls and no date inside the file, so the day comes from the file name or from the upload form.
 */
export interface DailyTotalRow {
  extension: string;
  agent: string;
  department: string;
  outAnswered: number;
  outUnanswered: number;
  inAnswered: number;
  inUnanswered: number;
  totalCalls: number;
  durationSec: number;
  acd: number;
}

const REQUIRED = ['extension', 'out answered calls', 'out unanswered calls', 'in answered calls', 'in unanswered calls'];

function normHeader(v: unknown): string {
  return String(v ?? '').trim().toLowerCase().replace(/\s+/g, ' ');
}

function num(v: unknown): number {
  const n = Number(String(v ?? '').replace(/,/g, '').trim());
  return Number.isFinite(n) ? n : 0;
}

/** "103 (MMS-Rick Nelson)" -> "Rick Nelson". */
export function agentOfExtension(extension: string): string {
  const m = String(extension ?? '').match(/\(MMS-([^)]+)\)/);
  return m ? m[1].trim() : String(extension ?? '').trim();
}

function findHeaderRow(table: unknown[][]): number {
  return table.findIndex((row) => {
    const cells = row.map(normHeader);
    return REQUIRED.every((h) => cells.includes(h));
  });
}

/** True when a table is a Total Calls Per Extension report. */
export function looksLikeDailyTotals(table: unknown[][]): boolean {
  return findHeaderRow(table) >= 0;
}

export function parseDailyTotalsRows(table: unknown[][]): { rows: DailyTotalRow[]; error?: string } {
  const headerAt = findHeaderRow(table);
  if (headerAt < 0) return { rows: [], error: 'This is not a "Total Calls Per Extension" report (the Extension and Out/In Answered/Unanswered columns were not found).' };
  const cells = table[headerAt].map(normHeader);
  const col = (name: string) => cells.indexOf(name);
  const idx = {
    ext: col('extension'), dept: col('department'),
    oa: col('out answered calls'), ou: col('out unanswered calls'), ia: col('in answered calls'), iu: col('in unanswered calls'),
    total: col('total calls'), dur: col('total duration'), acd: col('acd'),
  };
  const rows: DailyTotalRow[] = [];
  for (let r = headerAt + 1; r < table.length; r++) {
    const row = table[r] ?? [];
    const extension = String(row[idx.ext] ?? '').trim();
    if (!extension || /^total/i.test(extension)) continue;
    const outAnswered = num(row[idx.oa]);
    const outUnanswered = num(row[idx.ou]);
    const inAnswered = num(row[idx.ia]);
    const inUnanswered = num(row[idx.iu]);
    rows.push({
      extension,
      agent: agentOfExtension(extension),
      department: idx.dept >= 0 ? String(row[idx.dept] ?? '').trim() : '',
      outAnswered, outUnanswered, inAnswered, inUnanswered,
      totalCalls: idx.total >= 0 ? num(row[idx.total]) : outAnswered + outUnanswered + inAnswered + inUnanswered,
      durationSec: idx.dur >= 0 ? durationToSeconds(row[idx.dur]) : 0,
      acd: idx.acd >= 0 ? num(row[idx.acd]) : 0,
    });
  }
  return rows.length === 0 ? { rows, error: 'The report has no extension rows.' } : { rows };
}

/** Reads the first sheet of an .xlsx/.xls or a .csv file into a table. */
export function readTable(buffer: Buffer, filename: string): unknown[][] {
  if (/\.csv$/i.test(filename)) return parseCsv(buffer.toString('utf8'));
  const wb = xlsx.read(buffer, { type: 'buffer', cellDates: false, raw: true });
  const sheet = wb.Sheets[wb.SheetNames[0]];
  return sheet ? (xlsx.utils.sheet_to_json(sheet, { header: 1, raw: true, defval: '' }) as unknown[][]) : [];
}

export { dateFromFileName } from './fileDate';

const BD_DEPARTMENT = /business development/i;

/**
 * One weighted CallRecord per (extension, direction, outcome) with a non-zero count. `weight` is how many calls
 * the record stands for, so the dashboard's formulas work unchanged. Duration is attached to the answered records.
 * Agents of another department (OPS, Fulfillment, …) are skipped unless someone gave them an Opener name.
 */
export function dailyRowsToCalls(date: string, rows: DailyTotalRow[], mappedOpeners: Map<string, string> = new Map()): CallRecord[] {
  const out: CallRecord[] = [];
  rows.forEach((r) => {
    if (isExcludedAgent(r.agent)) return;
    const mapped = (mappedOpeners.get(r.agent.toLowerCase()) ?? '').trim();
    const explicit = mapped !== '' && !/^(ignore|ignored|-)$/i.test(mapped);
    if (r.department && !BD_DEPARTMENT.test(r.department) && !explicit) return;
    const answered = r.outAnswered + r.inAnswered;
    const kinds: [string, string, number, number][] = [
      ['OUT-Bound', 'ANSWERED', r.outAnswered, answered > 0 ? r.durationSec * (r.outAnswered / answered) : 0],
      ['OUT-Bound', 'NO ANSWER', r.outUnanswered, 0],
      ['IN-Bound', 'ANSWERED', r.inAnswered, answered > 0 ? r.durationSec * (r.inAnswered / answered) : 0],
      ['IN-Bound', 'NO ANSWER', r.inUnanswered, 0],
    ];
    kinds.forEach(([type, outcome, count, sec]) => {
      if (count <= 0) return;
      out.push({
        callDate: `${date} 12:00:00`,
        callId: `daily-${date}-${r.extension}-${type}-${outcome}`,
        from: '', to: '', extension: r.extension, department: r.department, did: '', description: 'Daily total',
        type, outcome, duration: '', durationSec: Math.round(sec), notes: '', callPath: '',
        agent: r.agent, opener: '', weight: count,
      });
    });
  });
  return out;
}

/** Monday-Friday days from `from` to `to` (inclusive, YYYY-MM-DD). */
export function workingDaysBetween(from: string, to: string): string[] {
  const out: string[] = [];
  const cursor = new Date(`${from}T00:00:00Z`);
  const end = new Date(`${to}T00:00:00Z`);
  while (cursor <= end && out.length < 400) {
    const dow = cursor.getUTCDay();
    if (dow !== 0 && dow !== 6) out.push(cursor.toISOString().slice(0, 10));
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return out;
}

/** Splits a whole number into `parts` whole numbers that add up to it (the remainder goes to `offset`, `offset+1`, …). */
function splitInt(value: number, parts: number, offset: number): number[] {
  const v = Math.max(0, Math.round(value));
  const base = Math.floor(v / parts);
  const extra = v - base * parts;
  const out = new Array<number>(parts).fill(base);
  for (let i = 0; i < extra; i++) out[(offset + i) % parts] += 1;
  return out;
}

/**
 * A report that covers several days has no per-day detail. Its totals are spread evenly over the working days
 * (whole numbers, summing exactly to the report), so weekly and monthly figures are exact and daily ones approximate.
 */
export function spreadOverDays(rows: DailyTotalRow[], days: string[]): { date: string; rows: DailyTotalRow[] }[] {
  const n = days.length;
  const perDay: DailyTotalRow[][] = days.map(() => []);
  rows.forEach((r, ri) => {
    const oa = splitInt(r.outAnswered, n, ri);
    const ou = splitInt(r.outUnanswered, n, ri);
    const ia = splitInt(r.inAnswered, n, ri);
    const iu = splitInt(r.inUnanswered, n, ri);
    const dur = splitInt(r.durationSec, n, ri);
    for (let d = 0; d < n; d++) {
      const total = oa[d] + ou[d] + ia[d] + iu[d];
      if (total === 0 && dur[d] === 0) continue;
      perDay[d].push({ ...r, outAnswered: oa[d], outUnanswered: ou[d], inAnswered: ia[d], inUnanswered: iu[d], totalCalls: total, durationSec: dur[d] });
    }
  });
  return days.map((date, i) => ({ date, rows: perDay[i] }));
}
