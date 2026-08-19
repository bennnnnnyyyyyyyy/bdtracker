import fs from 'fs';
import path from 'path';
import { google } from 'googleapis';
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
    console.error('[Google Sheets] Live pull failed:', err);
    throw err;
  }
}


