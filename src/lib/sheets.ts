import { google } from 'googleapis';
import { CONFIG } from './config';
import { CallRecord, AgentMapping } from '../types/dashboard';
import { parseAgentName, durationToSeconds } from './analytics';

// In-memory cache to prevent hammering Google Sheets API
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
 * Initializes Google Sheets API client using environment variables or service account keys.
 */
function getSheetsClient() {
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

  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  const refreshToken = process.env.GOOGLE_REFRESH_TOKEN;

  if (clientId && clientSecret && refreshToken) {
    const oauth2Client = new google.auth.OAuth2(clientId, clientSecret);
    oauth2Client.setCredentials({ refresh_token: refreshToken });
    return google.sheets({ version: 'v4', auth: oauth2Client });
  }

  return null;
}

/**
 * Fetches Call Logs and Agent Mappings from the Call Dashboard Spreadsheet.
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
    .filter(row => row && (row[1] || row[0])) // must have call id or date
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
 * Fetches pipeline stage row counts by Opener from the BD_MEETINGS Tracker Spreadsheet.
 */
export async function fetchBDTrackerCounts(): Promise<Record<string, Record<string, number>>> {
  const sheets = getSheetsClient();
  if (!sheets) {
    throw new Error('Google Sheets API credentials not configured');
  }

  const counts: Record<string, Record<string, number>> = {};

  // Batch get column B for all 8 tabs
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
 * Fetches all dashboard raw data with caching and mock demonstration fallback.
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
    console.warn('Sheets API direct fetch unavailable, using live demonstration dataset:', errorMessage);
    return getDemonstrationData();
  }
}

/**
 * High-fidelity demonstration dataset matching Ultatel call exports and BD Tracker schema.
 */
function getDemonstrationData(): {
  calls: CallRecord[];
  trackerCounts: Record<string, Record<string, number>>;
  agentMappings: AgentMapping[];
  isMockData: boolean;
} {
  const agentMappings: AgentMapping[] = [
    { agent: 'Ben Arthur', opener: 'Ben Arthur' },
    { agent: 'Jane Doe', opener: 'Jane Doe' },
    { agent: 'Michael Scott', opener: 'Michael Scott' },
    { agent: 'Jim Halpert', opener: 'Jim Halpert' },
    { agent: 'Pam Beesly', opener: 'Pam Beesly' },
    { agent: 'Dwight Schrute', opener: 'Dwight Schrute' }
  ];

  const trackerCounts: Record<string, Record<string, number>> = {
    'Ben Arthur': {
      'New Meetings': 14,
      'Follow Ups': 9,
      'Contract Sent': 6,
      'Invoice Sent': 4,
      'Onboarded': 5,
      'No-Show': 3,
      'Dead Leads': 4,
      'Temporary Inactive': 2
    },
    'Jane Doe': {
      'New Meetings': 18,
      'Follow Ups': 12,
      'Contract Sent': 8,
      'Invoice Sent': 7,
      'Onboarded': 9,
      'No-Show': 2,
      'Dead Leads': 3,
      'Temporary Inactive': 1
    },
    'Michael Scott': {
      'New Meetings': 10,
      'Follow Ups': 6,
      'Contract Sent': 3,
      'Invoice Sent': 2,
      'Onboarded': 2,
      'No-Show': 5,
      'Dead Leads': 7,
      'Temporary Inactive': 4
    },
    'Jim Halpert': {
      'New Meetings': 15,
      'Follow Ups': 10,
      'Contract Sent': 7,
      'Invoice Sent': 5,
      'Onboarded': 6,
      'No-Show': 2,
      'Dead Leads': 2,
      'Temporary Inactive': 1
    },
    'Pam Beesly': {
      'New Meetings': 12,
      'Follow Ups': 8,
      'Contract Sent': 5,
      'Invoice Sent': 4,
      'Onboarded': 4,
      'No-Show': 1,
      'Dead Leads': 3,
      'Temporary Inactive': 2
    },
    'Dwight Schrute': {
      'New Meetings': 22,
      'Follow Ups': 14,
      'Contract Sent': 11,
      'Invoice Sent': 9,
      'Onboarded': 12,
      'No-Show': 2,
      'Dead Leads': 5,
      'Temporary Inactive': 2
    }
  };

  const openers = Object.keys(trackerCounts);
  const calls: CallRecord[] = [];
  const outcomes = ['ANSWERED', 'NO ANSWER', 'ANSWERED', 'ANSWERED', 'NO ANSWER'];
  const types = ['OUT-Bound', 'OUT-Bound', 'OUT-Bound', 'IN-Bound'];

  // Generate representative calls for the past 30 days
  const today = new Date();
  for (let d = 30; d >= 0; d--) {
    const callDate = new Date(today.getTime() - d * 86400000).toISOString().split('T')[0];
    openers.forEach(opener => {
      const callsForDay = Math.floor(Math.random() * 12) + 8;
      for (let i = 0; i < callsForDay; i++) {
        const outcome = outcomes[Math.floor(Math.random() * outcomes.length)];
        const type = types[Math.floor(Math.random() * types.length)];
        const durSec = outcome === 'ANSWERED' ? Math.floor(Math.random() * 320) + 45 : 0;
        const m = Math.floor(durSec / 60);
        const s = durSec % 60;
        const durStr = `${m}:${s.toString().padStart(2, '0')}`;

        calls.push({
          callDate,
          callId: `CALL-${d}-${opener.replace(/\s+/g, '')}-${i}`,
          from: '+1-555-0199',
          to: '+1-555-0288',
          extension: `10${i} (MMS-${opener})`,
          department: 'Business Development',
          did: '555-0100',
          description: 'Sales Discovery',
          type,
          outcome,
          duration: durStr,
          durationSec: durSec,
          notes: 'Call log export record',
          callPath: 'Direct',
          agent: opener,
          opener
        });
      }
    });
  }

  return {
    calls,
    trackerCounts,
    agentMappings,
    isMockData: true
  };
}
