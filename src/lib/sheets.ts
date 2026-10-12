import fs from 'fs';
import path from 'path';
import { google } from 'googleapis';
import * as xlsx from 'xlsx';
import { CONFIG, isExcludedAgent } from './config';
import { CallRecord, AgentMapping, MeetingRecord, DataSourceInfo } from '../types/dashboard';
import { parseAgentName, durationToSeconds, parseDateToISO } from './analytics';
import { dedupeAndRedateCalls } from './callKeys';
import { AttendanceDataset, parseAttendanceRows } from './attendance';
import { parseUltatelDeptRows, deptSummariesToCallRecords } from './ultatel';

export interface RawDashboardDataset {
  calls: CallRecord[];
  meetings: MeetingRecord[];
  trackerCounts: Record<string, Record<string, number>>;
  agentMappings: AgentMapping[];
  attendance: AttendanceDataset;
  dataSourceInfo: DataSourceInfo;
  isMockData: boolean;
  /** Live sources that failed to load (e.g. 'call logs', 'BD tracker'). Empty when everything loaded. */
  failedSources: string[];
  /** Epoch ms when the sources were actually read. */
  loadedAt: number;
}

function getSheetsClient() {
  const saPath = path.join(process.cwd(), 'google2.json');
  if (fs.existsSync(saPath)) {
    try {
      const saKey = JSON.parse(fs.readFileSync(saPath, 'utf8'));
      const auth = new google.auth.JWT({
        email: saKey.client_email,
        key: saKey.private_key,
        scopes: ['https://www.googleapis.com/auth/spreadsheets.readonly']
      });
      return google.sheets({ version: 'v4', auth });
    } catch (e) {
      console.warn('Error loading service account file:', e);
    }
  }

  const clientEmail = process.env.GOOGLE_CLIENT_EMAIL;
  const privateKey = process.env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g, '\n');

  if (clientEmail && privateKey) {
    const auth = new google.auth.JWT({
      email: clientEmail,
      key: privateKey,
      scopes: ['https://www.googleapis.com/auth/spreadsheets.readonly']
    });
    return google.sheets({ version: 'v4', auth });
  }

  return null;
}

/**
 * Fetches call logs and agent mappings from Google Sheets.
 */
export async function fetchCallDashboardData(): Promise<{
  calls: CallRecord[];
  agentMappings: AgentMapping[];
  duplicatesRemoved: number;
}> {
  const sheets = getSheetsClient();
  if (!sheets) throw new Error('Google Sheets API credentials not configured');

  const mappingRes = await sheets.spreadsheets.values.get({
    spreadsheetId: CONFIG.CALL_DASHBOARD_SHEET_ID,
    range: `${CONFIG.MAPPING_SHEET}!A2:B`
  });

  const agentMappings: AgentMapping[] = (mappingRes.data.values || [])
    .filter(row => row && row[0] && !isExcludedAgent(row[0]) && !isExcludedAgent(row[1]))
    .map(row => ({
      agent: String(row[0]).trim(),
      opener: String(row[1] || '').trim()
    }));

  // Read the log in row chunks so a very large sheet never hits a single-response size limit.
  const CALL_LOG_CHUNK_ROWS = 20000;
  const callLogRows: unknown[][] = [];
  for (let start = 2; ; start += CALL_LOG_CHUNK_ROWS) {
    const res = await sheets.spreadsheets.values.get({
      spreadsheetId: CONFIG.CALL_DASHBOARD_SHEET_ID,
      range: `${CONFIG.CALL_LOG_SHEET}!A${start}:O${start + CALL_LOG_CHUNK_ROWS - 1}`
    });
    const values = (res.data.values || []) as unknown[][];
    callLogRows.push(...values);
    if (values.length < CALL_LOG_CHUNK_ROWS) break;
  }

  const calls: CallRecord[] = callLogRows
    .filter(row => row && (row[1] || row[0]))
    .map(r => {
      const ext = String(r[4] || '');
      const parsedAgent = r[13] ? String(r[13]).trim() : parseAgentName(ext);
      const parsedDurationSec = r[14] !== undefined && r[14] !== '' 
        ? Number(r[14]) 
        : durationToSeconds(r[10]);

      return {
        callDate: String(r[0] || ''),
        callId: String(r[1] || ''),
        from: String(r[2] || ''),
        to: String(r[3] || ''),
        extension: ext,
        department: String(r[5] || ''),
        did: String(r[6] || ''),
        description: String(r[7] || ''),
        type: String(r[8] || 'OUT-Bound'),
        outcome: String(r[9] || 'ANSWERED'),
        duration: String(r[10] || '0:00'),
        durationSec: parsedDurationSec || 0,
        notes: String(r[11] || ''),
        callPath: String(r[12] || ''),
        agent: parsedAgent,
        opener: ''
      };
    })
    .filter(c => !isExcludedAgent(c.agent));

  // The sheet can contain the same call twice (e.g. one copy with a raw export clock). Count each call once
  // and date it from its Call ID timestamp in Cairo time.
  const cleaned = dedupeAndRedateCalls(calls);
  return { calls: cleaned.calls, agentMappings, duplicatesRemoved: cleaned.duplicatesRemoved };
}

/**
 * Fetches pipeline meetings and stage counts from BD Tracker Google Sheet.
 */
export async function fetchBDTrackerData(): Promise<{
  meetings: MeetingRecord[];
  trackerCounts: Record<string, Record<string, number>>;
}> {
  const sheets = getSheetsClient();
  if (!sheets) throw new Error('Google Sheets API credentials not configured');

  const counts: Record<string, Record<string, number>> = {};
  const meetings: MeetingRecord[] = [];
  
  const ranges = CONFIG.BD_TABS.map(tab => `'${tab}'!A1:Z`);
  const batchRes = await sheets.spreadsheets.values.batchGet({
    spreadsheetId: CONFIG.BD_TRACKER_SHEET_ID,
    ranges
  });

  const valueRanges = batchRes.data.valueRanges || [];

  CONFIG.BD_TABS.forEach((tabName, idx) => {
    const rawRows = valueRanges[idx]?.values || [];
    if (rawRows.length < 2) return;

    const headers = (rawRows[0] || []).map((h: unknown) => String(h || '').trim().toLowerCase());
    
    let openerIdx = headers.findIndex(h => h.includes('opener') || h === 'agent' || h === 'rep');
    if (openerIdx === -1) openerIdx = 1;

    let dateIdx = headers.findIndex(h => 
      h.includes('date added') || h.includes('meeting date') || h.includes('date booked') || h === 'date' || h.includes('created') || h.includes('timestamp')
    );
    if (dateIdx === -1) {
      dateIdx = headers.findIndex(h => h.includes('date'));
    }

    const companyIdx = headers.findIndex(h => h.includes('company') || h.includes('business') || h.includes('client'));
    // Prefer an explicit contact column; only fall back to a generic "name" column that is not the company.
    let personIdx = headers.findIndex(h => h.includes('authorized') || h.includes('contact') || h.includes('person') || h.includes('lead'));
    if (personIdx === -1) {
      personIdx = headers.findIndex((h, i) => h.includes('name') && i !== companyIdx && !h.includes('company') && !h.includes('business'));
    }
    const medbIdx = headers.findIndex(h => h.includes('medb') || h.includes('med b') || h.includes('med_b'));
    const ppoIdx = headers.findIndex(h => h === 'ppo' || h.includes('ppo'));

    const isChecked = (val: unknown) => {
      if (typeof val === 'boolean') return val;
      const s = String(val || '').trim().toLowerCase();
      return s === 'true' || s === '1' || s === 'yes' || s === 'y';
    };

    for (let r = 1; r < rawRows.length; r++) {
      const row = rawRows[r];
      if (!row || row.length === 0) continue;

      const opener = String(row[openerIdx] || '').trim();
      if (!opener || isExcludedAgent(opener)) continue;

      if (!counts[opener]) counts[opener] = {};
      counts[opener][tabName] = (counts[opener][tabName] || 0) + 1;

      let dateAdded: string | null = null;
      if (dateIdx !== -1 && row[dateIdx] !== undefined) {
        dateAdded = parseDateToISO(row[dateIdx]);
      }
      if (!dateAdded) {
        for (let c = 0; c < row.length; c++) {
          // Skip free-text columns so a company or contact name can never be read as a date.
          if (c === openerIdx || c === companyIdx || c === personIdx) continue;
          const parsed = parseDateToISO(row[c]);
          if (parsed) {
            dateAdded = parsed;
            break;
          }
        }
      }

      meetings.push({
        stage: tabName,
        opener,
        dateAdded: dateAdded || '',
        companyName: companyIdx !== -1 ? String(row[companyIdx] || '') : '',
        authorizedPerson: personIdx !== -1 ? String(row[personIdx] || '') : '',
        medB: medbIdx !== -1 ? isChecked(row[medbIdx]) : false,
        ppo: ppoIdx !== -1 ? isChecked(row[ppoIdx]) : false
      });
    }
  });

  return { meetings, trackerCounts: counts };
}

/**
 * Fetches attendance data:
 * 1. Tries Google Sheets API on CONFIG.ATTENDANCE_SHEET_ID.
 * 2. If permission denied or network failure, falls back to local Excel file BD _ French Dashboard 2026 (3).xlsx.
 */
type AttendanceFetchResult = {
  attendance: AttendanceDataset;
  source: 'google_sheets' | 'local_excel' | 'none';
};

export async function fetchAttendanceData(): Promise<AttendanceFetchResult> {
  const sheets = getSheetsClient();

  // Try Google Sheets API first
  if (sheets && CONFIG.ATTENDANCE_SHEET_ID) {
    try {
      const res = await sheets.spreadsheets.values.get({
        spreadsheetId: CONFIG.ATTENDANCE_SHEET_ID,
        range: `'${CONFIG.ATTENDANCE_SHEET_NAME}'!A1:AT`
      });

      if (res.data.values && res.data.values.length > 0) {
        const attendance = parseAttendanceRows(res.data.values);
        return { attendance, source: 'google_sheets' };
      }
    } catch (err: unknown) {
      console.warn('[Attendance] Google Sheets API fetch failed, trying local file fallback:', (err as Error).message);
    }
  }

  // Fallback to local Excel file
  const localPath = path.join(process.cwd(), CONFIG.LOCAL_ATTENDANCE_FILE);
  if (fs.existsSync(localPath)) {
    try {
      const wb = xlsx.readFile(localPath);
      const sheet = wb.Sheets[CONFIG.ATTENDANCE_SHEET_NAME] || wb.Sheets[wb.SheetNames[1]];
      if (sheet) {
        const rows = xlsx.utils.sheet_to_json(sheet, { header: 1 }) as unknown[][];
        const attendance = parseAttendanceRows(rows);
        return { attendance, source: 'local_excel' };
      }
    } catch (err) {
      console.warn('[Attendance] Local Excel parse failed:', err);
    }
  }

  return {
    attendance: { agentDaily: {}, agentMonthly: {} },
    source: 'none'
  };
}

/**
 * Fetches Ultatel departmental report from local Excel if present.
 */
export function fetchLocalUltatelDeptData(): CallRecord[] | null {
  const localPath = path.join(process.cwd(), CONFIG.LOCAL_ULTATEL_DEPT_FILE);
  if (!fs.existsSync(localPath)) return null;

  try {
    const wb = xlsx.readFile(localPath);
    const sheet = wb.Sheets['Sheet1'] || wb.Sheets[wb.SheetNames[0]];
    if (!sheet) return null;

    const rows = xlsx.utils.sheet_to_json(sheet, { header: 1 }) as unknown[][];
    const summaries = parseUltatelDeptRows(rows);
    if (summaries.length === 0) return null;

    return deptSummariesToCallRecords(summaries);
  } catch (err) {
    console.warn('[Ultatel] Local Dept report parse failed:', err);
    return null;
  }
}

/**
 * Reads every source (Google Sheets, local Ultatel departmental report, attendance).
 * Uncached: use getDashboardRawData().
 */
async function loadDashboardRawData(): Promise<RawDashboardDataset> {
  try {
    // 1. Fetch Call Logs and BD Tracker
    const failedSources: string[] = [];
    const [callData, bdData, attendanceResult] = await Promise.all([
      fetchCallDashboardData().catch((err) => {
        console.warn('[Google Sheets] Call logs fetch failed:', err.message);
        failedSources.push('call logs');
        return { calls: [], agentMappings: [], duplicatesRemoved: 0 };
      }),
      fetchBDTrackerData().catch((err) => {
        console.warn('[Google Sheets] BD Tracker fetch failed:', err.message);
        failedSources.push('BD tracker');
        return { meetings: [], trackerCounts: {} };
      }),
      fetchAttendanceData()
    ]);

    // 2. Check if local Ultatel departmental summary is present
    const ultatelDeptCalls = fetchLocalUltatelDeptData();

    // If call logs are empty or if local Ultatel departmental export exists, prioritize/merge
    let calls = callData.calls;
    let callsSource: DataSourceInfo['callsSource'] = 'google_sheets';

    if (calls.length === 0 && ultatelDeptCalls && ultatelDeptCalls.length > 0) {
      calls = ultatelDeptCalls;
      callsSource = 'ultatel_dept_report';
    } else if (calls.length > 0) {
      callsSource = 'call_logs';
    }

    const dataSourceInfo: DataSourceInfo = {
      source: attendanceResult.source === 'google_sheets' && callsSource === 'google_sheets'
        ? 'google_sheets'
        : 'local_excel',
      attendanceSource: attendanceResult.source,
      callsSource,
      notes: [
        callData.duplicatesRemoved > 0
          ? `Call Logs contains ${callData.duplicatesRemoved} duplicate call row(s); they are ignored here. Run "Repair duplicate calls" from the BD Call Dashboard menu in the sheet to remove them.`
          : '',
        callsSource === 'ultatel_dept_report'
          ? 'Calls come from the Ultatel department summary report, which has no per-call dates: every call is dated today and date filters do not apply.'
          : '',
        attendanceResult.source === 'none'
          ? 'No attendance data found: per-day figures fall back to active calendar days.'
          : '',
        attendanceResult.source === 'local_excel'
          ? 'Attendance loaded from local Excel file (BD _ French Dashboard 2026)'
          : '',
        failedSources.length > 0
          ? `Live load failed for: ${failedSources.join(', ')}. Figures may be incomplete.`
          : ''
      ].filter(Boolean).join(' ') || undefined
    };

    const result: RawDashboardDataset = {
      calls,
      meetings: bdData.meetings,
      trackerCounts: bdData.trackerCounts,
      agentMappings: callData.agentMappings,
      attendance: attendanceResult.attendance,
      dataSourceInfo,
      isMockData: false,
      failedSources,
      loadedAt: Date.now()
    };

    return result;
  } catch (err: unknown) {
    console.error('[Data Ingestion] Failed to load data:', err);
    throw err;
  }
}

// ---------------------------------------------------------------------------
// In-memory cache. Every dashboard request used to re-read all Sheets ranges,
// which is what exhausts the Sheets API quota. The cache is per server instance.
// ---------------------------------------------------------------------------

const CACHE_TTL_MS = Math.max(0, Number(process.env.DASHBOARD_CACHE_TTL_SECONDS ?? 30)) * 1000;
const MIN_USER_REFRESH_MS = 10_000; // a manual refresh cannot hammer the Sheets API

let cached: { data: RawDashboardDataset; loadedAt: number } | null = null;
let inFlight: Promise<RawDashboardDataset> | null = null;

/** Drops the cached dataset (call after local source files change). */
export function invalidateDashboardCache(): void {
  cached = null;
}

function loadAndCache(): Promise<RawDashboardDataset> {
  if (!inFlight) {
    inFlight = loadDashboardRawData()
      .then((data) => {
        // Never cache a partial load; the next request should try the sources again.
        if (data.failedSources.length === 0) cached = { data, loadedAt: Date.now() };
        return data;
      })
      .finally(() => {
        inFlight = null;
      });
  }
  return inFlight;
}

function asStale(entry: NonNullable<typeof cached>, reason: string): RawDashboardDataset {
  const note = `Live refresh failed (${reason}); showing data loaded at ${new Date(entry.loadedAt).toISOString()}.`;
  return {
    ...entry.data,
    dataSourceInfo: {
      ...entry.data.dataSourceInfo,
      notes: [entry.data.dataSourceInfo.notes, note].filter(Boolean).join(' '),
    },
  };
}

/**
 * Cached multi-source retrieval.
 * - default: serve data younger than DASHBOARD_CACHE_TTL_SECONDS (60 s).
 * - forceRefresh (manual refresh button): reload unless the cache is under 10 s old.
 * - fresh (used by /api/sync): always reload and never accept stale data.
 * If a reload fails or is partial and an older good copy exists, the older copy is served with a note.
 */
export async function getDashboardRawData(
  opts: { forceRefresh?: boolean; fresh?: boolean } = {}
): Promise<RawDashboardDataset> {
  const now = Date.now();
  if (!opts.fresh && cached) {
    const age = now - cached.loadedAt;
    const maxAge = opts.forceRefresh ? MIN_USER_REFRESH_MS : CACHE_TTL_MS;
    if (age < maxAge) return cached.data;
  }

  const previous = cached;
  try {
    const data = await loadAndCache();
    if (opts.fresh || data.failedSources.length === 0 || !previous) return data;
    return asStale(previous, data.failedSources.join(', '));
  } catch (err) {
    if (opts.fresh || !previous) throw err;
    return asStale(previous, err instanceof Error ? err.message : 'unknown error');
  }
}
