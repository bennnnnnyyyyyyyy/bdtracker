const fs = require('fs');
const path = require('path');
const { google } = require('googleapis');
const { createClient } = require('@supabase/supabase-js');

const saKey = JSON.parse(fs.readFileSync('google2.json', 'utf8'));
const auth = new google.auth.JWT({
  email: saKey.client_email,
  key: saKey.private_key,
  scopes: ['https://www.googleapis.com/auth/spreadsheets.readonly']
});
const sheets = google.sheets({ version: 'v4', auth });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

const CALL_SHEET_ID = process.env.CALL_DASHBOARD_SHEET_ID;
const BD_TRACKER_SHEET_ID = process.env.BD_TRACKER_SHEET_ID;

// Excluded agents
const EXCLUDED_OPENERS = ['russ', 'george', 'caroline', 'caroline richards', 'ignore'];

function isExcluded(name) {
  if (!name) return true;
  const s = String(name).trim().toLowerCase();
  return EXCLUDED_OPENERS.includes(s);
}

function parseAgentName(extensionCell) {
  if (!extensionCell) return '';
  const m = String(extensionCell).match(/\(MMS-([^)]+)\)/);
  return m ? m[1].trim() : String(extensionCell).trim();
}

async function run() {
  console.log('--- 1. Fetching Agent Mapping ---');
  const mappingRes = await sheets.spreadsheets.values.get({
    spreadsheetId: CALL_SHEET_ID,
    range: `'Agent Mapping'!A2:B`
  });
  const agentMap = new Map();
  (mappingRes.data.values || []).forEach(r => {
    if (r[0] && r[1]) {
      agentMap.set(String(r[0]).trim().toLowerCase(), String(r[1]).trim());
    }
  });

  function getOpener(agentName) {
    if (!agentName) return 'Unmapped';
    const clean = agentName.toLowerCase().trim();
    if (agentMap.has(clean)) return agentMap.get(clean);
    return agentName;
  }

  console.log('--- 2. Fetching Daily Totals from Google Sheet ---');
  const dailyRes = await sheets.spreadsheets.values.get({
    spreadsheetId: CALL_SHEET_ID,
    range: `'Daily Totals'!A2:L`
  });
  const dailyRows = dailyRes.data.values || [];
  console.log(`Read ${dailyRows.length} rows from Daily Totals.`);

  // Parse daily totals: date, extension, agent, outAnswered, outUnanswered, inAnswered, inUnanswered, totalCalls, durationSec
  // A row can have Date in col A, Ext in col B, Agent in col C, OutAnswered in E, OutUnanswered in F, InAnswered in G, InUnanswered in H, Total in I, Duration in J
  const dailyCallsByDate = {}; // date -> totalCalls
  const dailyCallsByDateAgent = {}; // date -> opener -> totalCalls

  dailyRows.forEach(r => {
    const dateStr = String(r[0] || '').trim().slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) return;
    const ext = String(r[1] || '').trim();
    if (!ext) return;
    const rawAgent = String(r[2] || '').trim() || parseAgentName(ext);
    const opener = getOpener(rawAgent);
    if (isExcluded(opener)) return;

    const total = parseInt(String(r[8] || '0').replace(/,/g, ''), 10) || 0;
    const outAns = parseInt(String(r[4] || '0').replace(/,/g, ''), 10) || 0;
    const outUnans = parseInt(String(r[5] || '0').replace(/,/g, ''), 10) || 0;
    const durSec = parseInt(String(r[9] || '0').replace(/,/g, ''), 10) || 0;

    dailyCallsByDate[dateStr] = (dailyCallsByDate[dateStr] || 0) + total;
    if (!dailyCallsByDateAgent[dateStr]) dailyCallsByDateAgent[dateStr] = {};
    dailyCallsByDateAgent[dateStr][opener] = (dailyCallsByDateAgent[dateStr][opener] || 0) + total;
  });

  console.log('--- 3. Fetching Meetings from Supabase and BD Tracker Sheet ---');
  // In Supabase, fetch all meetings
  let allMeetings = [];
  let page = 0;
  while (true) {
    const { data, error } = await supabase.from('meetings').select('*').range(page * 1000, (page + 1) * 1000 - 1);
    if (error || !data || data.length === 0) break;
    allMeetings.push(...data);
    page++;
    if (data.length < 1000) break;
  }
  console.log(`Read ${allMeetings.length} meetings from Supabase.`);

  const dailyMeetingsByDate = {}; // date -> count
  const dailyMeetingsByDateAgent = {}; // date -> opener -> count

  allMeetings.forEach(m => {
    if (!m.date_added) return;
    const d = m.date_added.slice(0, 10);
    const opener = m.opener || 'Unmapped';
    if (isExcluded(opener)) return;

    dailyMeetingsByDate[d] = (dailyMeetingsByDate[d] || 0) + 1;
    if (!dailyMeetingsByDateAgent[d]) dailyMeetingsByDateAgent[d] = {};
    dailyMeetingsByDateAgent[d][opener] = (dailyMeetingsByDateAgent[d][opener] || 0) + 1;
  });

  // Combine October 2026 dates (Oct 01 to Oct 16)
  const octDates = [
    '2026-10-01', '2026-10-02', '2026-10-03', '2026-10-04',
    '2026-10-05', '2026-10-06', '2026-10-07', '2026-10-08', '2026-10-09',
    '2026-10-10', '2026-10-11', '2026-10-12', '2026-10-13', '2026-10-14',
    '2026-10-15', '2026-10-16'
  ];

  console.log('\n=============================================');
  console.log('DAILY TREND DATA (Oct 1 - Oct 16, 2026)');
  console.log('=============================================');
  const tableData = octDates.map(d => {
    const c = dailyCallsByDate[d] || 0;
    const m = dailyMeetingsByDate[d] || 0;
    const dayOfWeek = new Date(d).toLocaleDateString('en-US', { weekday: 'short' });
    return { Date: d, Day: dayOfWeek, Calls: c, Meetings: m };
  });
  console.table(tableData);

  // Filter out weekend days (where calls and meetings are 0 or near 0) for working-day correlation
  const workingDays = tableData.filter(d => !['Sat', 'Sun'].includes(d.Day) && (d.Calls > 50 || d.Meetings > 0));
  console.log(`\nWorking days in period: ${workingDays.length}`);

  // Pearson correlation formula
  function pearsonCorr(x, y) {
    const n = x.length;
    if (n < 3) return null;
    const mx = x.reduce((a, b) => a + b, 0) / n;
    const my = y.reduce((a, b) => a + b, 0) / n;
    let num = 0, den1 = 0, den2 = 0;
    for (let i = 0; i < n; i++) {
      const dx = x[i] - mx;
      const dy = y[i] - my;
      num += dx * dy;
      den1 += dx * dx;
      den2 += dy * dy;
    }
    if (den1 === 0 || den2 === 0) return 0;
    return num / Math.sqrt(den1 * den2);
  }

  // 1. Same-Day Correlation: Calls(t) vs Meetings(t)
  const callsSame = workingDays.map(d => d.Calls);
  const mtgSame = workingDays.map(d => d.Meetings);
  const rSame = pearsonCorr(callsSame, mtgSame);

  // 2. Lag-1 Correlation: Calls(t) vs Meetings(t+1)
  const callsLag1 = [];
  const mtgLag1 = [];
  for (let i = 0; i < workingDays.length - 1; i++) {
    callsLag1.push(workingDays[i].Calls);
    mtgLag1.push(workingDays[i + 1].Meetings);
  }
  const rLag1 = pearsonCorr(callsLag1, mtgLag1);

  // 3. Lag-2 Correlation: Calls(t) vs Meetings(t+2)
  const callsLag2 = [];
  const mtgLag2 = [];
  for (let i = 0; i < workingDays.length - 2; i++) {
    callsLag2.push(workingDays[i].Calls);
    mtgLag2.push(workingDays[i + 2].Meetings);
  }
  const rLag2 = pearsonCorr(callsLag2, mtgLag2);

  // 4. Capacity Shift Check: Meetings(t) vs Calls(t+1)
  const mtgReverse = [];
  const callsReverse = [];
  for (let i = 0; i < workingDays.length - 1; i++) {
    mtgReverse.push(workingDays[i].Meetings);
    callsReverse.push(workingDays[i + 1].Calls);
  }
  const rReverse = pearsonCorr(mtgReverse, callsReverse);

  console.log('\n=============================================');
  console.log('CORRELATION ANALYSIS (Working Days)');
  console.log('=============================================');
  console.log(`Same-Day Correlation [Calls(t) vs Meetings(t)]:       ${rSame !== null ? rSame.toFixed(3) : 'N/A'}`);
  console.log(`1-Day Lag Correlation [Calls(t) vs Meetings(t+1)]:    ${rLag1 !== null ? rLag1.toFixed(3) : 'N/A'}`);
  console.log(`2-Day Lag Correlation [Calls(t) vs Meetings(t+2)]:    ${rLag2 !== null ? rLag2.toFixed(3) : 'N/A'}`);
  console.log(`Reverse Correlation   [Meetings(t) vs Calls(t+1)]:   ${rReverse !== null ? rReverse.toFixed(3) : 'N/A'}`);

  console.log('\n=============================================');
  console.log('AGENT-BY-AGENT BREAKDOWN (Oct 12 - Oct 15)');
  console.log('=============================================');
  const targetDays = ['2026-10-12', '2026-10-13', '2026-10-14', '2026-10-15'];
  const allOpenersSet = new Set();
  targetDays.forEach(d => {
    Object.keys(dailyCallsByDateAgent[d] || {}).forEach(op => allOpenersSet.add(op));
    Object.keys(dailyMeetingsByDateAgent[d] || {}).forEach(op => allOpenersSet.add(op));
  });

  const agentBreakdown = Array.from(allOpenersSet).sort().map(op => {
    const row = { Opener: op };
    targetDays.forEach(d => {
      const calls = dailyCallsByDateAgent[d]?.[op] || 0;
      const mtgs = dailyMeetingsByDateAgent[d]?.[op] || 0;
      row[`${d.slice(5)} Calls`] = calls;
      row[`${d.slice(5)} Mtg`] = mtgs;
    });
    return row;
  });
  console.table(agentBreakdown);
}

run().catch(console.error);
