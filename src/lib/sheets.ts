import fs from 'fs';
import path from 'path';
import { google } from 'googleapis';
import * as xlsx from 'xlsx';
import { CONFIG } from './config';
import { CallRecord, AgentMapping } from '../types/dashboard';
import { parseAgentName, durationToSeconds } from './analytics';

interface CacheEntry<T> {
  data: T;
  timestamp: number;
}

let cachedData: CacheEntry<{
  calls: CallRecord[];
  trackerCounts: Record<string, Record<string, number>>;
  agentMappings: AgentMapping[];
}> | null = null;

const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

/**
 * Initializes Google Sheets API client using service account JSON or environment variables.
 */
function getSheetsClient() {
  const saPath = path.join(process.cwd(), 'tribal-quest-484611-j3-a4a4f21e24ed.json');
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
 * Fetches Call Logs and Agent Mappings from live Google Sheets.
 */
export async function fetchCallDashboardData(): Promise<{
  calls: CallRecord[];
  agentMappings: AgentMapping[];
}> {
  const sheets = getSheetsClient();
  if (!sheets) {
    throw new Error('Google Sheets API credentials not configured');
  }

  // 1. Fetch Agent Mapping
  const mappingRes = await sheets.spreadsheets.values.get({
    spreadsheetId: CONFIG.CALL_DASHBOARD_SHEET_ID,
    range: `${CONFIG.MAPPING_SHEET}!A2:B`
  });

  const agentMappings: AgentMapping[] = (mappingRes.data.values || [])
    .filter(row => row && row[0])
    .map(row => ({
      agent: String(row[0]).trim(),
      opener: String(row[1] || '').trim()
    }));

  // 2. Fetch Call Logs
  const callLogRes = await sheets.spreadsheets.values.get({
    spreadsheetId: CONFIG.CALL_DASHBOARD_SHEET_ID,
    range: `${CONFIG.CALL_LOG_SHEET}!A2:O`
  });

  const calls: CallRecord[] = (callLogRes.data.values || [])
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
    });

  return { calls, agentMappings };
}

/**
 * Fetches pipeline stage row counts by Opener from the BD_MEETINGS Tracker live Google Sheets.
 */
export async function fetchBDTrackerCounts(): Promise<Record<string, Record<string, number>>> {
  const sheets = getSheetsClient();
  if (!sheets) {
    throw new Error('Google Sheets API credentials not configured');
  }

  const counts: Record<string, Record<string, number>> = {};
  const ranges = CONFIG.BD_TABS.map(tab => `'${tab}'!B2:B`);
  const batchRes = await sheets.spreadsheets.values.batchGet({
    spreadsheetId: CONFIG.BD_TRACKER_SHEET_ID,
    ranges
  });

  const valueRanges = batchRes.data.valueRanges || [];

  CONFIG.BD_TABS.forEach((tabName, idx) => {
    const rows = valueRanges[idx]?.values || [];
    rows.forEach(r => {
      const opener = String(r[0] || '').trim();
      if (!opener) return;
      if (!counts[opener]) {
        counts[opener] = {};
      }
      counts[opener][tabName] = (counts[opener][tabName] || 0) + 1;
    });
  });

  return counts;
}

/**
 * Loads actual local Excel data from the workspace repository.
 */
function loadLocalActualData(): {
  calls: CallRecord[];
  trackerCounts: Record<string, Record<string, number>>;
  agentMappings: AgentMapping[];
  isMockData: boolean;
} {
  const trackerCounts: Record<string, Record<string, number>> = {};
  const calls: CallRecord[] = [];
  let agentMappings: AgentMapping[] = [
    { agent: 'Kaity James', opener: 'Jane' },
    { agent: 'Ben Arthur', opener: 'Ben' },
    { agent: 'Jasmine Green', opener: 'Jasmine' },
    { agent: 'Selene Myles', opener: 'Selene' },
    { agent: 'Jimmy Pearson', opener: 'Jimmy' },
    { agent: 'Nora Atkins', opener: 'Nora' }
  ];

  // 1. Read Agent Mapping from BD TRACKER (1).xlsx if present
  const trackerXlsx = path.join(process.cwd(), 'BD TRACKER (1).xlsx');
  if (fs.existsSync(trackerXlsx)) {
    try {
      const wb = xlsx.readFile(trackerXlsx);
      if (wb.Sheets['Agent Mapping']) {
        const rows: any[][] = xlsx.utils.sheet_to_json(wb.Sheets['Agent Mapping'], { header: 1 });
        const maps: AgentMapping[] = [];
        for (let i = 1; i < rows.length; i++) {
          const r = rows[i];
          if (r && r[0]) {
            maps.push({ agent: String(r[0]).trim(), opener: String(r[1] || '').trim() });
          }
        }
        if (maps.length > 0) agentMappings = maps;
      }
    } catch (e) {
      console.warn('Error reading Agent Mapping sheet:', e);
    }
  }

  // 2. Read BD Pipeline Tabs from BD MEETINGS 2026 (7).xlsx
  const bdFiles = ['BD MEETINGS 2026 (7).xlsx', 'BD TRACKER (1).xlsx'];
  for (const f of bdFiles) {
    const p = path.join(process.cwd(), f);
    if (fs.existsSync(p)) {
      try {
        const wb = xlsx.readFile(p);
        CONFIG.BD_TABS.forEach(tabName => {
          if (wb.Sheets[tabName]) {
            const rows: any[][] = xlsx.utils.sheet_to_json(wb.Sheets[tabName], { header: 1 });
            for (let i = 1; i < rows.length; i++) {
              const row = rows[i];
              if (!row || !row[1]) continue;
              const opener = String(row[1]).trim();
              if (!opener) continue;
              if (!trackerCounts[opener]) trackerCounts[opener] = {};
              trackerCounts[opener][tabName] = (trackerCounts[opener][tabName] || 0) + 1;
            }
          }
        });
        break;
      } catch (err) {
        console.warn('Error reading BD meetings Excel:', err);
      }
    }
  }

  // 3. Read Ultatel Call Logs from Call Details...xlsx or Call Logs sheet in BD TRACKER (1).xlsx
  const callFiles = fs.readdirSync(process.cwd()).filter(f => f.startsWith('Call Details') && f.endsWith('.xlsx'));
  let callWorkbook: xlsx.WorkBook | null = null;
  let callSheetName = '';

  if (callFiles.length > 0) {
    callWorkbook = xlsx.readFile(path.join(process.cwd(), callFiles[0]));
    callSheetName = callWorkbook.SheetNames[0];
  } else if (fs.existsSync(trackerXlsx)) {
    callWorkbook = xlsx.readFile(trackerXlsx);
    if (callWorkbook.Sheets['Call Logs']) {
      callSheetName = 'Call Logs';
    }
  }

  if (callWorkbook && callSheetName && callWorkbook.Sheets[callSheetName]) {
    try {
      const rows: any[][] = xlsx.utils.sheet_to_json(callWorkbook.Sheets[callSheetName], { header: 1 });
      for (let i = 1; i < rows.length; i++) {
        const r = rows[i];
        if (!r || (!r[0] && !r[1])) continue;

        const ext = String(r[4] || '');
        const parsedAgent = parseAgentName(ext);
        const durVal = r[10];
        const durSec = durationToSeconds(durVal);

        calls.push({
          callDate: String(r[0] || ''),
          callId: String(r[1] || `CALL-${i}`),
          from: String(r[2] || ''),
          to: String(r[3] || ''),
          extension: ext,
          department: String(r[5] || ''),
          did: String(r[6] || ''),
          description: String(r[7] || ''),
          type: String(r[8] || 'OUT-Bound'),
          outcome: String(r[9] || 'ANSWERED'),
          duration: String(durVal || '0:00'),
          durationSec: durSec,
          notes: String(r[11] || ''),
          callPath: String(r[12] || ''),
          agent: parsedAgent,
          opener: ''
        });
      }
    } catch (err) {
      console.warn('Error reading call logs:', err);
    }
  }

  return {
    calls,
    trackerCounts,
    agentMappings,
    isMockData: false
  };
}

/**
 * Master data fetcher with Live Sheets API -> Local Actual Team Data.
 */
export async function getDashboardRawData(forceRefresh = false): Promise<{
  calls: CallRecord[];
  trackerCounts: Record<string, Record<string, number>>;
  agentMappings: AgentMapping[];
  isMockData: boolean;
}> {
  const now = Date.now();
  if (!forceRefresh && cachedData && now - cachedData.timestamp < CACHE_TTL_MS) {
    return { ...cachedData.data, isMockData: false };
  }

  try {
    const [callData, trackerCounts] = await Promise.all([
      fetchCallDashboardData(),
      fetchBDTrackerCounts()
    ]);

    const result = {
      calls: callData.calls,
      trackerCounts,
      agentMappings: callData.agentMappings
    };

    cachedData = {
      data: result,
      timestamp: now
    };

    return { ...result, isMockData: false };
  } catch (err: unknown) {
    const errorMessage = err instanceof Error ? err.message : String(err);
    console.log(`Live Google Sheets API: ${errorMessage}. Serving actual team data from local repository.`);
    return loadLocalActualData();
  }
}
