const xlsx = require('xlsx');
const fs = require('fs');
const path = require('path');
const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

const EXCLUDED_OPENERS = ['russ', 'george', 'caroline', 'caroline richards', 'ignore'];

function isExcluded(name) {
  if (!name) return true;
  const s = String(name).trim().toLowerCase();
  return EXCLUDED_OPENERS.includes(s);
}

function excelDateToISO(val) {
  if (!val) return null;
  if (typeof val === 'number') {
    if (val > 30000 && val < 60000) {
      const jsDate = new Date(Math.round((val - 25569) * 86400 * 1000));
      return jsDate.toISOString().slice(0, 10);
    }
  }
  const s = String(val).trim();
  let m1 = s.match(/^(\d{2})-(\d{2})-(\d{4})/);
  if (m1) return `${m1[3]}-${m1[1]}-${m1[2]}`;
  let m2 = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m2) return `${m2[1]}-${m2[2]}-${m2[3]}`;
  let m3 = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (m3) return `${m3[3]}-${String(m3[1]).padStart(2, '0')}-${String(m3[2]).padStart(2, '0')}`;
  return null;
}

function parseAgentName(extensionCell) {
  if (!extensionCell) return '';
  const m = String(extensionCell).match(/\(MMS-([^)]+)\)/);
  return m ? m[1].trim() : String(extensionCell).trim();
}

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

async function run() {
  console.log('Loading BD TRACKER (1).xlsx...');
  const wb = xlsx.readFile('BD TRACKER (1).xlsx');

  // Load Agent Mapping
  const agentMap = new Map();
  if (wb.Sheets['Agent Mapping']) {
    const rows = xlsx.utils.sheet_to_json(wb.Sheets['Agent Mapping'], { header: 1 });
    rows.forEach(r => {
      if (r[0] && r[1]) agentMap.set(String(r[0]).trim().toLowerCase(), String(r[1]).trim());
    });
  }

  function getOpener(agentName) {
    if (!agentName) return 'Unmapped';
    const clean = agentName.toLowerCase().trim();
    if (agentMap.has(clean)) return agentMap.get(clean);
    return agentName;
  }

  // 1. Collect all calls by date and by agent
  // We prefer Daily Totals where available, and Call Logs for days without Daily Totals.
  const dailyTotalsCalls = new Map(); // date -> opener -> count
  const dailyTotalsTotal = new Map(); // date -> totalCalls

  if (wb.Sheets['Daily Totals']) {
    const dtRows = xlsx.utils.sheet_to_json(wb.Sheets['Daily Totals'], { header: 1 });
    dtRows.forEach(r => {
      const d = String(r[0] || '').trim().slice(0, 10);
      if (!/^\d{4}-\d{2}-\d{2}$/.test(d)) return;
      const ext = String(r[1] || '').trim();
      if (!ext) return;
      const rawAgent = String(r[2] || '').trim() || parseAgentName(ext);
      const opener = getOpener(rawAgent);
      if (isExcluded(opener)) return;
      const total = parseInt(String(r[8] || '0').replace(/,/g, ''), 10) || 0;

      if (!dailyTotalsCalls.has(d)) dailyTotalsCalls.set(d, new Map());
      const map = dailyTotalsCalls.get(d);
      map.set(opener, (map.get(opener) || 0) + total);

      dailyTotalsTotal.set(d, (dailyTotalsTotal.get(d) || 0) + total);
    });
  }

  console.log(`Daily Totals dates present: ${dailyTotalsTotal.size}`);

  // Now process Call Logs tabs for earlier days or days not in Daily Totals
  const callTabs = [
    'Call Logs 2026-05',
    'Call Logs 2026-06',
    'Call Logs 2026-07',
    'Call Logs 2026-08',
    'Call Logs 2026-09',
    'Call Logs'
  ];

  const callLogCalls = new Map(); // date -> opener -> count
  const callLogTotal = new Map(); // date -> totalCalls

  callTabs.forEach(t => {
    if (!wb.Sheets[t]) return;
    const rows = xlsx.utils.sheet_to_json(wb.Sheets[t], { header: 1 });
    for (let i = 1; i < rows.length; i++) {
      const r = rows[i];
      if (!r || !r[0]) continue;
      const d = excelDateToISO(r[0]);
      if (!d) continue;

      const rawAgent = String(r[13] || '').trim() || parseAgentName(String(r[4] || ''));
      const opener = getOpener(rawAgent);
      if (isExcluded(opener)) return;

      if (!callLogCalls.has(d)) callLogCalls.set(d, new Map());
      const map = callLogCalls.get(d);
      map.set(opener, (map.get(opener) || 0) + 1);

      callLogTotal.set(d, (callLogTotal.get(d) || 0) + 1);
    }
  });

  // Combine calls: If a date is in Daily Totals, use Daily Totals. Otherwise use Call Logs.
  const allCallDates = new Set([...dailyTotalsTotal.keys(), ...callLogTotal.keys()]);
  const callsByDate = {}; // date -> total
  const callsByDateAgent = {}; // date -> opener -> count

  allCallDates.forEach(d => {
    if (dailyTotalsTotal.has(d)) {
      callsByDate[d] = dailyTotalsTotal.get(d);
      callsByDateAgent[d] = Object.fromEntries(dailyTotalsCalls.get(d));
    } else {
      callsByDate[d] = callLogTotal.get(d);
      callsByDateAgent[d] = Object.fromEntries(callLogCalls.get(d));
    }
  });

  // 2. Fetch all Meetings from Supabase
  let allMeetings = [];
  let page = 0;
  while (true) {
    const { data, error } = await supabase.from('meetings').select('*').range(page * 1000, (page + 1) * 1000 - 1);
    if (error || !data || data.length === 0) break;
    allMeetings.push(...data);
    page++;
    if (data.length < 1000) break;
  }
  console.log(`Loaded ${allMeetings.length} meetings from Supabase.`);

  const meetingsByDate = {};
  const meetingsByDateAgent = {};

  allMeetings.forEach(m => {
    if (!m.date_added) return;
    const d = m.date_added.slice(0, 10);
    const opener = m.opener || 'Unmapped';
    if (isExcluded(opener)) return;

    meetingsByDate[d] = (meetingsByDate[d] || 0) + 1;
    if (!meetingsByDateAgent[d]) meetingsByDateAgent[d] = {};
    meetingsByDateAgent[d][opener] = (meetingsByDateAgent[d][opener] || 0) + 1;
  });

  // Analyze months from 2026-05 to 2026-10
  const months = ['2026-05', '2026-06', '2026-07', '2026-08', '2026-09', '2026-10'];
  const monthResults = [];

  months.forEach(ym => {
    // Find all dates in this month
    const monthDates = [];
    // generate dates for month
    const [year, month] = ym.split('-').map(Number);
    const daysInMonth = new Date(year, month, 0).getDate();
    for (let day = 1; day <= daysInMonth; day++) {
      const dStr = `${ym}-${String(day).padStart(2, '0')}`;
      if (ym === '2026-10' && day > 16) continue; // up to Oct 16 for current data
      monthDates.push(dStr);
    }

    let totCalls = 0;
    let totMtgs = 0;
    const workingDaysData = [];

    monthDates.forEach(d => {
      const c = callsByDate[d] || 0;
      const m = meetingsByDate[d] || 0;
      totCalls += c;
      totMtgs += m;

      const dayOfWeek = new Date(d).toLocaleDateString('en-US', { weekday: 'short' });
      // consider as working day if not weekend and has calls or meetings
      if (!['Sat', 'Sun'].includes(dayOfWeek) && (c > 20 || m > 0)) {
        workingDaysData.push({ date: d, day: dayOfWeek, calls: c, mtgs: m });
      }
    });

    // Compute Correlations for working days
    const callsSame = workingDaysData.map(d => d.calls);
    const mtgSame = workingDaysData.map(d => d.mtgs);
    const rSame = pearsonCorr(callsSame, mtgSame);

    const callsLag1 = [], mtgLag1 = [];
    for (let i = 0; i < workingDaysData.length - 1; i++) {
      callsLag1.push(workingDaysData[i].calls);
      mtgLag1.push(workingDaysData[i + 1].mtgs);
    }
    const rLag1 = pearsonCorr(callsLag1, mtgLag1);

    const callsLag2 = [], mtgLag2 = [];
    for (let i = 0; i < workingDaysData.length - 2; i++) {
      callsLag2.push(workingDaysData[i].calls);
      mtgLag2.push(workingDaysData[i + 2].mtgs);
    }
    const rLag2 = pearsonCorr(callsLag2, mtgLag2);

    const mtgRev = [], callsRev = [];
    for (let i = 0; i < workingDaysData.length - 1; i++) {
      mtgRev.push(workingDaysData[i].mtgs);
      callsRev.push(workingDaysData[i + 1].calls);
    }
    const rRev = pearsonCorr(mtgRev, callsRev);

    // Agent rankings
    const agentCalls = {};
    const agentMtgs = {};
    monthDates.forEach(d => {
      Object.entries(callsByDateAgent[d] || {}).forEach(([op, cnt]) => {
        agentCalls[op] = (agentCalls[op] || 0) + cnt;
      });
      Object.entries(meetingsByDateAgent[d] || {}).forEach(([op, cnt]) => {
        agentMtgs[op] = (agentMtgs[op] || 0) + cnt;
      });
    });

    monthResults.push({
      month: ym,
      totalCalls: totCalls,
      totalMeetings: totMtgs,
      callsPerMeeting: totMtgs > 0 ? Math.round(totCalls / totMtgs) : null,
      workingDaysCount: workingDaysData.length,
      rSame,
      rLag1,
      rLag2,
      rRev,
      agentCalls,
      agentMtgs,
      workingDaysData
    });
  });

  // Print Summary Table
  console.log('\n========================================================================================');
  console.log('MONTH-BY-MONTH STATISTICAL CORRELATION & KPI SUMMARY (MAY - OCT 2026)');
  console.log('========================================================================================');
  const summaryTable = monthResults.map(r => ({
    Month: r.month,
    'Total Calls': r.totalCalls,
    'Total Mtgs': r.totalMeetings,
    'Calls/Mtg': r.callsPerMeeting,
    'Working Days': r.workingDaysCount,
    'Same-Day (r0)': r.rSame !== null ? r.rSame.toFixed(3) : 'N/A',
    'Lag-1 (r1)': r.rLag1 !== null ? r.rLag1.toFixed(3) : 'N/A',
    'Lag-2 (r2)': r.rLag2 !== null ? r.rLag2.toFixed(3) : 'N/A',
    'Reverse (Mtg->Calls)': r.rRev !== null ? r.rRev.toFixed(3) : 'N/A'
  }));
  console.table(summaryTable);

  // Print JSON for full report generation
  fs.writeFileSync(path.join(__dirname, 'monthly_analysis_results.json'), JSON.stringify(monthResults, null, 2));
  console.log('\nSaved full results to scripts/monthly_analysis_results.json');
}

run().catch(console.error);
