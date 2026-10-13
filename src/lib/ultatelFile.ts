import * as xlsx from 'xlsx';
import { callEpoch } from './callKeys';

/** The 13 export columns, in the order the Call Logs sheet stores them. */
export const CALL_EXPORT_COLUMNS = [
  'Call Date', 'Call ID', 'From', 'To', 'Extension', 'Department', 'DID', 'Description', 'Type', 'Outcome', 'Duration', 'Notes', 'Call Path',
] as const;

const REQUIRED = ['Call Date', 'Call ID', 'From', 'To', 'Extension', 'Type', 'Outcome', 'Duration'];
export const MAX_EXPORT_ROWS = 60000;

export interface ParsedCallExport {
  rows: string[][];
  error?: string;
}

/** Minimal RFC-4180 CSV reader: quoted fields, doubled quotes, commas and line breaks inside quotes. */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let inQuotes = false;
  const src = text.replace(/^﻿/, '');
  for (let i = 0; i < src.length; i++) {
    const ch = src[i];
    if (inQuotes) {
      if (ch === '"') {
        if (src[i + 1] === '"') { field += '"'; i++; } else inQuotes = false;
      } else field += ch;
    } else if (ch === '"') inQuotes = true;
    else if (ch === ',') { row.push(field); field = ''; }
    else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && src[i + 1] === '\n') i++;
      row.push(field); field = '';
      rows.push(row); row = [];
    } else field += ch;
  }
  if (field !== '' || row.length > 0) { row.push(field); rows.push(row); }
  return rows;
}

function excelSerialToText(serial: number): string {
  const ms = Math.round((serial - 25569) * 86400 * 1000);
  const d = new Date(ms);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${p(d.getUTCMonth() + 1)}-${p(d.getUTCDate())}-${d.getUTCFullYear()} ${p(d.getUTCHours())}:${p(d.getUTCMinutes())}:${p(d.getUTCSeconds())}`;
}

function cellText(value: unknown, column: string): string {
  if (value === null || value === undefined) return '';
  if (typeof value === 'number') {
    if (column === 'Call Date' && value > 30000 && value < 80000) return excelSerialToText(value);
    return String(value);
  }
  return String(value).trim();
}

/** Maps a header row + data rows onto the 13 export columns (any order; extra columns such as "Team Call" are ignored). */
export function mapCallExportRows(table: unknown[][]): ParsedCallExport {
  const headerIdx = table.findIndex((r) => r.some((c) => String(c ?? '').trim().toLowerCase() === 'call id'));
  if (headerIdx === -1) return { rows: [], error: 'This does not look like an Ultatel Call Details export (no "Call ID" column).' };

  const header = table[headerIdx].map((c) => String(c ?? '').trim().toLowerCase());
  const index = new Map<string, number>();
  CALL_EXPORT_COLUMNS.forEach((name) => {
    const i = header.indexOf(name.toLowerCase());
    if (i >= 0) index.set(name, i);
  });
  const missing = REQUIRED.filter((name) => !index.has(name));
  if (missing.length > 0) return { rows: [], error: `The export is missing these columns: ${missing.join(', ')}.` };

  const rows: string[][] = [];
  for (const raw of table.slice(headerIdx + 1)) {
    const row = CALL_EXPORT_COLUMNS.map((name) => (index.has(name) ? cellText(raw[index.get(name) as number], name) : ''));
    if (row.every((c) => c === '')) continue;
    rows.push(row);
    if (rows.length > MAX_EXPORT_ROWS) return { rows: [], error: `The export has more than ${MAX_EXPORT_ROWS} rows; split it by date.` };
  }
  if (rows.length === 0) return { rows: [], error: 'The export has no call rows.' };
  const withoutId = rows.filter((r) => callEpoch(r[1]) === null).length;
  if (withoutId > rows.length / 2) return { rows: [], error: 'Most rows have no valid Call ID; this is not a Call Details export.' };
  return { rows };
}

/** Reads an Ultatel Call Details export from a CSV or Excel file. */
export function parseCallExportFile(buffer: Buffer, filename: string): ParsedCallExport {
  try {
    if (/\.csv$/i.test(filename)) {
      return mapCallExportRows(parseCsv(buffer.toString('utf8')));
    }
    const wb = xlsx.read(buffer, { type: 'buffer', cellDates: false, raw: true });
    const sheet = wb.Sheets[wb.SheetNames[0]];
    if (!sheet) return { rows: [], error: 'The workbook has no sheets.' };
    return mapCallExportRows(xlsx.utils.sheet_to_json(sheet, { header: 1, raw: true, defval: '' }) as unknown[][]);
  } catch {
    return { rows: [], error: 'The file could not be read.' };
  }
}

/** Quick check used to route an uploaded workbook: is it a Call Details export rather than attendance / a department report? */
export function looksLikeCallExport(buffer: Buffer, filename: string): boolean {
  const parsed = parseCallExportFile(buffer, filename);
  return parsed.rows.length > 0;
}
