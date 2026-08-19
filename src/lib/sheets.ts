import fs from 'fs';
import path from 'path';
import { google } from 'googleapis';
import * as xlsx from 'xlsx';
import { CONFIG, isExcludedAgent } from './config';
import { CallRecord, AgentMapping, MeetingRecord } from '../types/dashboard';
import { parseAgentName, durationToSeconds, parseDateToISO } from './analytics';

interface CacheEntry<T> {
  data: T;
  timestamp: number;
}

let cachedData: CacheEntry<{
  calls: CallRecord[];
  meetings: MeetingRecord[];
  trackerCounts: Record<string, Record<string, number>>;
  agentMappings: AgentMapping[];
}> | null = null;

const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

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

export async function fetchCallDashboardData(): Promise<{
  calls: CallRecord[];
  agentMappings: AgentMapping[];
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
    })
    .filter(c => !isExcludedAgent(c.agent));

  return { calls, agentMappings };
}

export async function fetchBDTrackerData(): Promise<{
  meetings: MeetingRecord[];
  trackerCounts: Record<string, Record<string, number>>;
}> {
  const sheets = getSheetsClient();
  if (!sheets) throw new Error('Google Sheets API credentials not configured');

  const counts: Record<string, Record<string, number>> = {};
  const meetings: MeetingRecord[] = [];
  const ranges = CONFIG.BD_TABS.map(tab => `'${tab}'!B2:F`);
  const batchRes = await sheets.spreadsheets.values.batchGet({
    spreadsheetId: CONFIG.BD_TRACKER_SHEET_ID,
    ranges
  });

  const valueRanges = batchRes.data.valueRanges || [];

  CONFIG.BD_TABS.forEach((tabName, idx) => {
    const rows = valueRanges[idx]?.values || [];
    rows.forEach(r => {
      const opener = String(r[0] || '').trim();
      if (!opener || isExcludedAgent(opener)) return;
      if (!counts[opener]) counts[opener] = {};
      counts[opener][tabName] = (counts[opener][tabName] || 0) + 1;

      const dateAdded = parseDateToISO(r[2]);
      meetings.push({
        stage: tabName,
        opener,
        dateAdded: dateAdded || '',
        companyName: String(r[3] || ''),
        authorizedPerson: String(r[4] || '')
      });
    });
  });

  return { meetings, trackerCounts: counts };
}

function loadLocalActualData(): {
  calls: CallRecord[];
  meetings: MeetingRecord[];
  trackerCounts: Record<string, Record<string, number>>;
  agentMappings: AgentMapping[];
  isMockData: boolean;
} {
  const trackerCounts: Record<string, Record<string, number>> = {};
  const meetings: MeetingRecord[] = [];
  const calls: CallRecord[] = [];
  const agentMappings: AgentMapping[] = [
    { agent: 'Kaity James', opener: 'Jane' },
    { agent: 'Ben Arthur', opener: 'Ben' },
    { agent: 'Jasmine Green', opener: 'Jasmine' },
    { agent: 'Selene Myles', opener: 'Selene' },
    { agent: 'Jimmy Pearson', opener: 'Jimmy' },
    { agent: 'Nora Atkins', opener: 'Nora' }
  ].filter(m => !isExcludedAgent(m.agent) && !isExcludedAgent(m.opener));

  // 1. Read BD Pipeline Tabs from data/BD MEETINGS 2026 (7).xlsx
  const bdFiles = ['BD MEETINGS 2026 (7).xlsx', 'BD TRACKER (1).xlsx'].map(f => path.join(process.cwd(), 'data', f));
  for (const p of bdFiles) {
    if (fs.existsSync(p)) {
      try {
        const fileBuffer = fs.readFileSync(p);
        const wb = xlsx.read(fileBuffer, { type: 'buffer' });
        CONFIG.BD_TABS.forEach(tabName => {
          if (wb.Sheets[tabName]) {
            const rows: any[][] = xlsx.utils.sheet_to_json(wb.Sheets[tabName], { header: 1 });
            for (let i = 1; i < rows.length; i++) {
              const row = rows[i];
              if (!row || !row[1]) continue;
              const opener = String(row[1]).trim();
              if (!opener || isExcludedAgent(opener)) continue;
              if (!trackerCounts[opener]) trackerCounts[opener] = {};
              trackerCounts[opener][tabName] = (trackerCounts[opener][tabName] || 0) + 1;

              const dateAdded = parseDateToISO(row[3]);
              meetings.push({
                stage: tabName,
                opener,
                dateAdded: dateAdded || '',
                companyName: String(row[4] || ''),
                authorizedPerson: String(row[5] || '')
              });
            }
          }
        });
        break;
      } catch (err) {
        console.warn('Error reading local BD meetings Excel:', err);
      }
    }
  }

  // 2. Read Call Details
  const dataDir = path.join(process.cwd(), 'data');
  const callFiles = fs.existsSync(dataDir)
    ? fs.readdirSync(dataDir).filter(f => f.startsWith('Call Details') && f.endsWith('.xlsx'))
    : [];

  if (callFiles.length > 0) {
    const callFilePath = path.join(dataDir, callFiles[0]);
    try {
      const fileBuffer = fs.readFileSync(callFilePath);
      const wb = xlsx.read(fileBuffer, { type: 'buffer' });
      const firstSheet = wb.Sheets[wb.SheetNames[0]];
      const rows: any[][] = xlsx.utils.sheet_to_json(firstSheet, { header: 1 });
      for (let i = 1; i < rows.length; i++) {
        const r = rows[i];
        if (!r || (!r[0] && !r[1])) continue;

        const ext = String(r[4] || '');
        const parsedAgent = parseAgentName(ext);
        if (isExcludedAgent(parsedAgent)) continue;

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

  return { calls, meetings, trackerCounts, agentMappings, isMockData: false };
}

export async function getDashboardRawData(forceRefresh = false): Promise<{
  calls: CallRecord[];
  meetings: MeetingRecord[];
  trackerCounts: Record<string, Record<string, number>>;
  agentMappings: AgentMapping[];
  isMockData: boolean;
}> {
  const now = Date.now();
  if (!forceRefresh && cachedData && now - cachedData.timestamp < CACHE_TTL_MS) {
    return { ...cachedData.data, isMockData: false };
  }

  try {
    const [callData, bdData] = await Promise.all([
      fetchCallDashboardData(),
      fetchBDTrackerData()
    ]);

    const result = {
      calls: callData.calls,
      meetings: bdData.meetings,
      trackerCounts: bdData.trackerCounts,
      agentMappings: callData.agentMappings
    };

    cachedData = { data: result, timestamp: now };
    return { ...result, isMockData: false };
  } catch (err: unknown) {
    const localData = loadLocalActualData();
    cachedData = { data: localData, timestamp: now };
    return localData;
  }
}

