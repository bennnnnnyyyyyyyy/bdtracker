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

let cachedLocalData: {
  calls: CallRecord[];
  meetings: MeetingRecord[];
  trackerCounts: Record<string, Record<string, number>>;
  agentMappings: AgentMapping[];
  isMockData: boolean;
} | null = null;

export async function fetchBDTrackerData(): Promise<{
  meetings: MeetingRecord[];
  trackerCounts: Record<string, Record<string, number>>;
}> {
  const sheets = getSheetsClient();
  if (!sheets) throw new Error('Google Sheets API credentials not configured');

  const counts: Record<string, Record<string, number>> = {};
  const meetings: MeetingRecord[] = [];
  
  // Pull A1:Z for each BD tab in one single batch request
  const ranges = CONFIG.BD_TABS.map(tab => `'${tab}'!A1:Z`);
  const batchRes = await sheets.spreadsheets.values.batchGet({
    spreadsheetId: CONFIG.BD_TRACKER_SHEET_ID,
    ranges
  });

  const valueRanges = batchRes.data.valueRanges || [];

  CONFIG.BD_TABS.forEach((tabName, idx) => {
    const rawRows = valueRanges[idx]?.values || [];
    if (rawRows.length < 2) return;

    // Detect column indices from header row
    const headers = (rawRows[0] || []).map((h: any) => String(h || '').trim().toLowerCase());
    
    let openerIdx = headers.findIndex(h => h.includes('opener') || h === 'agent' || h === 'rep');
    if (openerIdx === -1) openerIdx = 1; // Default Col B (0-indexed 1)

    let dateIdx = headers.findIndex(h => 
      h.includes('date added') || h.includes('meeting date') || h.includes('date booked') || h === 'date' || h.includes('created') || h.includes('timestamp')
    );
    if (dateIdx === -1) {
      dateIdx = headers.findIndex(h => h.includes('date'));
    }

    let companyIdx = headers.findIndex(h => h.includes('company') || h.includes('business') || h.includes('client'));
    let personIdx = headers.findIndex(h => h.includes('authorized') || h.includes('contact') || h.includes('person') || h.includes('lead') || h.includes('name'));

    for (let r = 1; r < rawRows.length; r++) {
      const row = rawRows[r];
      if (!row || row.length === 0) continue;

      const opener = String(row[openerIdx] || '').trim();
      if (!opener || isExcludedAgent(opener)) continue;

      if (!counts[opener]) counts[opener] = {};
      counts[opener][tabName] = (counts[opener][tabName] || 0) + 1;

      // Extract date with primary index or fallback row scan
      let dateAdded: string | null = null;
      if (dateIdx !== -1 && row[dateIdx] !== undefined) {
        dateAdded = parseDateToISO(row[dateIdx]);
      }
      if (!dateAdded) {
        for (let c = 0; c < row.length; c++) {
          if (c === openerIdx) continue;
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
        authorizedPerson: personIdx !== -1 ? String(row[personIdx] || '') : ''
      });
    }
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
  if (cachedLocalData) {
    return cachedLocalData;
  }

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

  // 1. Read BD Pipeline Tabs from local data files (Development only)
  if (process.env.NODE_ENV !== 'production' || !process.env.VERCEL) {
    try {
      const dataDir = path.join(process.cwd(), 'data');
      if (fs.existsSync(dataDir)) {
        const candidateFiles = ['BD MEETINGS 2026 (7).xlsx', 'BD TRACKER (1).xlsx'];
        for (const fileName of candidateFiles) {
          const filePath = path.join(dataDir, fileName);
          if (fs.existsSync(filePath)) {
            try {
              const fileBuffer = fs.readFileSync(/* turbopackIgnore: true */ filePath);
              const wb = xlsx.read(fileBuffer, { type: 'buffer' });
              CONFIG.BD_TABS.forEach(tabName => {
                if (wb.Sheets[tabName]) {
                  const rows: any[][] = xlsx.utils.sheet_to_json(wb.Sheets[tabName], { header: 1 });
                  if (rows.length < 2) return;

                  const headers = (rows[0] || []).map((h: any) => String(h || '').trim().toLowerCase());
                  let openerIdx = headers.findIndex(h => h.includes('opener') || h === 'agent' || h === 'rep');
                  if (openerIdx === -1) openerIdx = 1;

                  let dateIdx = headers.findIndex(h => 
                    h.includes('date added') || h.includes('meeting date') || h.includes('date booked') || h === 'date' || h.includes('created') || h.includes('timestamp')
                  );
                  if (dateIdx === -1) {
                    dateIdx = headers.findIndex(h => h.includes('date'));
                  }

                  let companyIdx = headers.findIndex(h => h.includes('company') || h.includes('business') || h.includes('client'));
                  let personIdx = headers.findIndex(h => h.includes('authorized') || h.includes('contact') || h.includes('person') || h.includes('lead') || h.includes('name'));

                  for (let i = 1; i < rows.length; i++) {
                    const row = rows[i];
                    if (!row || row.length === 0) continue;

                    const opener = String(row[openerIdx] || '').trim();
                    if (!opener || isExcludedAgent(opener)) continue;

                    if (!trackerCounts[opener]) trackerCounts[opener] = {};
                    trackerCounts[opener][tabName] = (trackerCounts[opener][tabName] || 0) + 1;

                    let dateAdded: string | null = null;
                    if (dateIdx !== -1 && row[dateIdx] !== undefined) {
                      dateAdded = parseDateToISO(row[dateIdx]);
                    }
                    if (!dateAdded) {
                      for (let c = 0; c < row.length; c++) {
                        if (c === openerIdx) continue;
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
                      authorizedPerson: personIdx !== -1 ? String(row[personIdx] || '') : ''
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
      }
    } catch (e) {
      console.warn('Local BD meetings fallback skipped:', e);
    }
  }

  // 2. Read Call Details (Development only)
  if (process.env.NODE_ENV !== 'production' || !process.env.VERCEL) {
    try {
      const dataDir = path.join(process.cwd(), 'data');
      if (fs.existsSync(dataDir)) {
        const callFiles = fs.readdirSync(dataDir).filter(f => f.startsWith('Call Details') && f.endsWith('.xlsx'));
        if (callFiles.length > 0) {
          const callFilePath = path.join(dataDir, callFiles[0]);
          const fileBuffer = fs.readFileSync(/* turbopackIgnore: true */ callFilePath);
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
        }
      }
    } catch (err) {
      console.warn('Error reading call logs:', err);
    }
  }

  cachedLocalData = { calls, meetings, trackerCounts, agentMappings, isMockData: false };
  return cachedLocalData;
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
    // 6-second timeout race on live Google Sheets API
    const liveFetchPromise = Promise.all([
      fetchCallDashboardData(),
      fetchBDTrackerData()
    ]);

    const timeoutPromise = new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error('Google Sheets API request timed out')), 6000)
    );

    const [callData, bdData] = await Promise.race([liveFetchPromise, timeoutPromise]);

    const result = {
      calls: callData.calls,
      meetings: bdData.meetings,
      trackerCounts: bdData.trackerCounts,
      agentMappings: callData.agentMappings
    };

    cachedData = { data: result, timestamp: now };
    console.log(`[Google Sheets] Live pull complete: ${result.calls.length} calls, ${result.meetings.length} meetings loaded.`);
    return { ...result, isMockData: false };
  } catch (err: unknown) {
    console.warn('[Google Sheets] Live pull fallback to local cache:', err instanceof Error ? err.message : err);
    const localData = loadLocalActualData();
    cachedData = { data: localData, timestamp: now };
    return localData;
  }
}


