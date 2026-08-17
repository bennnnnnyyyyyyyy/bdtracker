/**
 * BD Call Dashboard — connects Ultatel call exports to BD_MEETINGS tracker
 * Paste this whole file into Extensions > Apps Script (single file: Code.gs)
 */

const CONFIG = {
  // If BD_MEETINGS (New Meetings/Follow Ups/etc.) lives in a DIFFERENT spreadsheet,
  // paste its Spreadsheet ID here. Leave blank only if those tabs live in this same file.
  BD_TRACKER_ID: '',
  BD_TRACKER_ID: '1uicpBruuFeno2ES4hNw-TIAwNkGEI37gw8Z-A4yMpC8',

  BD_TABS: ['New Meetings','Follow Ups','Contract Sent','Invoice Sent',
            'Onboarded','No-Show','Dead Leads','Temporary Inactive'],
  OPENER_COL: 2, // column B in each BD_TABS sheet

  CALL_LOG_SHEET: 'Call Logs',
  STAGING_SHEET: 'Import Staging',
  MAPPING_SHEET: 'Agent Mapping',
  DASHBOARD_SHEET: 'BD Dashboard',

  RAW_HEADERS: ['Call Date','Call ID','From','To','Extension','Department',
                'DID','Description','Type','Outcome','Duration','Notes','Call Path'],
  CALL_LOG_EXTRA: ['Agent','Duration (sec)']
};

// ---------- MENU ----------
function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu('BD Call Dashboard')
    .addItem('1. Setup Tabs', 'setupTabs')
    .addItem('2. Process Staged Import', 'processStagingImport')
    .addItem('3. Refresh Dashboard', 'refreshDashboard')
    .addSeparator()
    .addItem('Backfill Call Log Fields (one-time repair)', 'backfillCallLogFields')
    .addToUi();
}

// ---------- SETUP ----------
function setupTabs() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();

  const callLog = getOrCreateSheet_(ss, CONFIG.CALL_LOG_SHEET);
  writeHeaderIfEmpty_(callLog, CONFIG.RAW_HEADERS.concat(CONFIG.CALL_LOG_EXTRA));

  const staging = getOrCreateSheet_(ss, CONFIG.STAGING_SHEET);
  writeHeaderIfEmpty_(staging, CONFIG.RAW_HEADERS);

  const mapping = getOrCreateSheet_(ss, CONFIG.MAPPING_SHEET);
  writeHeaderIfEmpty_(mapping, ['Call Log Agent Name', 'Opener Name (must match BD tabs col B)']);

  const dash = getOrCreateSheet_(ss, CONFIG.DASHBOARD_SHEET);
  dash.clear();
  dash.getRange(1,1,1,1).setValue('BD Dashboard — click "Refresh Dashboard" after each import');

  SpreadsheetApp.getUi().alert('Tabs created. Paste your next weekly Ultatel export into "' +
    CONFIG.STAGING_SHEET + '" (starting row 2, same columns as the export), then run step 2.');
}

function getOrCreateSheet_(ss, name) {
  return ss.getSheetByName(name) || ss.insertSheet(name);
}

function writeHeaderIfEmpty_(sheet, headers) {
  if (sheet.getLastRow() === 0) {
    sheet.getRange(1,1,1,headers.length).setValues([headers]).setFontWeight('bold');
    sheet.setFrozenRows(1);
  }
}

// ---------- IMPORT ----------
function processStagingImport() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const staging = ss.getSheetByName(CONFIG.STAGING_SHEET);
  const callLog = ss.getSheetByName(CONFIG.CALL_LOG_SHEET);
  const mapping = ss.getSheetByName(CONFIG.MAPPING_SHEET);
  if (!staging || !callLog || !mapping) { SpreadsheetApp.getUi().alert('Run "Setup Tabs" first.'); return; }

  const lastRow = staging.getLastRow();
  if (lastRow < 2) { SpreadsheetApp.getUi().alert('Staging is empty.'); return; }

  const rawRows = staging.getRange(2,1,lastRow-1, CONFIG.RAW_HEADERS.length).getValues();

  // existing call IDs for dedup
  const existingLastRow = callLog.getLastRow();
  const existingIds = new Set();
  if (existingLastRow > 1) {
    callLog.getRange(2,2, existingLastRow-1, 1).getValues().forEach(r => existingIds.add(String(r[0])));
  }

  // known agents already mapped
  const mapLastRow = mapping.getLastRow();
  const knownAgents = new Set();
  if (mapLastRow > 1) {
    mapping.getRange(2,1, mapLastRow-1, 1).getValues().forEach(r => knownAgents.add(String(r[0]).trim()));
  }

  const toAppend = [];
  const newAgents = new Set();

  rawRows.forEach(r => {
    const callId = String(r[1]);
    if (!callId || existingIds.has(callId)) return; // skip blank/dup rows
    const extension = String(r[4] || '');
    const agent = parseAgentName_(extension);
    const durationSec = durationToSeconds_(r[10]);
    if (agent && !knownAgents.has(agent)) newAgents.add(agent);
    toAppend.push(r.concat([agent, durationSec]));
    existingIds.add(callId);
  });

  if (toAppend.length > 0) {
    callLog.getRange(callLog.getLastRow()+1, 1, toAppend.length, toAppend[0].length).setValues(toAppend);
  }

  if (newAgents.size > 0) {
    const rows = Array.from(newAgents).map(a => [a, '']); // Opener left blank for user to fill
    mapping.getRange(mapping.getLastRow()+1, 1, rows.length, 2).setValues(rows);
  }

  staging.getRange(2,1,lastRow-1, CONFIG.RAW_HEADERS.length).clearContent();

  let msg = toAppend.length + ' new call(s) added to Call Logs.';
  if (newAgents.size > 0) msg += '\n' + newAgents.size + ' new agent(s) added to Agent Mapping — go fill in their Opener name before refreshing the dashboard.';
  SpreadsheetApp.getUi().alert(msg);

  refreshDashboard();
}

function parseAgentName_(extensionCell) {
  // "112 (MMS-Ben Arthur)" -> "Ben Arthur"
  const m = extensionCell.match(/\(MMS-([^)]+)\)/);
  return m ? m[1].trim() : extensionCell.trim();
}

function durationToSeconds_(val) {
  if (val === null || val === undefined || val === '') return 0;
  if (val instanceof Date) {
    return val.getHours()*3600 + val.getMinutes()*60 + val.getSeconds();
  }
  const s = String(val).trim();
  const parts = s.split(':').map(Number);
  if (parts.some(isNaN)) return 0;
  if (parts.length === 2) return parts[0]*60 + parts[1];
  if (parts.length === 3) return parts[0]*3600 + parts[1]*60 + parts[2];
  return 0;
}

// ---------- ONE-TIME REPAIR ----------
function backfillCallLogFields() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const callLog = ss.getSheetByName(CONFIG.CALL_LOG_SHEET);
  const lastRow = callLog.getLastRow();
  if (lastRow < 2) return;
  const numCols = CONFIG.RAW_HEADERS.length + CONFIG.CALL_LOG_EXTRA.length;
  const data = callLog.getRange(2,1,lastRow-1, numCols).getValues();
  data.forEach(r => {
    r[13] = parseAgentName_(String(r[4] || ''));
    r[14] = durationToSeconds_(r[10]);
  });
  callLog.getRange(2,1,data.length, numCols).setValues(data);
  SpreadsheetApp.getUi().alert('Backfilled ' + data.length + ' rows.');
}

// ---------- BD TRACKER COUNTS ----------
function getBDCounts_() {
  const ss = CONFIG.BD_TRACKER_ID
    ? SpreadsheetApp.openById(CONFIG.BD_TRACKER_ID)
    : SpreadsheetApp.getActiveSpreadsheet();

  const counts = {}; // opener -> {tabName: count}
  CONFIG.BD_TABS.forEach(tabName => {
    const sh = ss.getSheetByName(tabName);
    if (!sh || sh.getLastRow() < 2) return;
    const openers = sh.getRange(2, CONFIG.OPENER_COL, sh.getLastRow()-1, 1).getValues();
    openers.forEach(r => {
      const op = String(r[0] || '').trim();
      if (!op) return;
      if (!counts[op]) counts[op] = {};
      counts[op][tabName] = (counts[op][tabName] || 0) + 1;
    });
  });
  return counts;
}

// ---------- DASHBOARD ----------
function refreshDashboard() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const callLog = ss.getSheetByName(CONFIG.CALL_LOG_SHEET);
  const mapping = ss.getSheetByName(CONFIG.MAPPING_SHEET);
  const dash = ss.getSheetByName(CONFIG.DASHBOARD_SHEET);
  if (!callLog || !mapping || !dash) { SpreadsheetApp.getUi().alert('Run "Setup Tabs" first.'); return; }

  // agent -> opener map
  const mapLastRow = mapping.getLastRow();
  const agentToOpener = {};
  if (mapLastRow > 1) {
    mapping.getRange(2,1, mapLastRow-1, 2).getValues().forEach(r => {
      if (r[0]) agentToOpener[String(r[0]).trim()] = String(r[1] || '').trim();
    });
  }

  // pull call log rows
  const clLastRow = callLog.getLastRow();
  const stats = {}; // opener -> metrics
  if (clLastRow > 1) {
    const data = callLog.getRange(2,1, clLastRow-1, CONFIG.RAW_HEADERS.length + CONFIG.CALL_LOG_EXTRA.length).getValues();
    data.forEach(r => {
      const type = r[8], outcome = r[9], durSec = Number(r[14]) || 0, agent = r[13];
      const opener = agentToOpener[agent] || agent || 'Unmapped';
      if (!stats[opener]) stats[opener] = {calls:0, out:0, in:0, answered:0, noAnswer:0, totalSec:0};
      const s = stats[opener];
      s.calls++;
      if (type === 'OUT-Bound') s.out++; else if (type === 'IN-Bound') s.in++;
      if (outcome === 'ANSWERED') s.answered++; else if (outcome === 'NO ANSWER') s.noAnswer++;
      s.totalSec += durSec;
    });
  }

  // pull BD tracker counts per opener
  const trackerCounts = getBDCounts_();

  // union of openers seen in either source
  const openers = new Set([...Object.keys(stats), ...Object.keys(trackerCounts)]);

  const header = ['Opener','Calls Made','Outbound','Inbound','Answered','No Answer','Answer Rate',
                   'Total Talk (min)','Avg Call (sec)',
                   'Meetings Booked','No-Show','Attended','Show Rate',
                   'Onboarded','Close Rate','Calls per Meeting'].concat(CONFIG.BD_TABS);

  const rows = [];
  Array.from(openers).sort().forEach(op => {
    const s = stats[op] || {calls:0,out:0,in:0,answered:0,noAnswer:0,totalSec:0};
    const answerRate = s.calls ? (s.answered / s.calls) : 0;
    const avgSec = s.calls ? Math.round(s.totalSec / s.calls) : 0;

    const tc = trackerCounts[op] || {};
    const bdCols = CONFIG.BD_TABS.map(t => tc[t] || 0);
    const booked = CONFIG.BD_TABS.reduce((sum, t) => sum + (tc[t] || 0), 0);
    const noShow = tc['No-Show'] || 0;
    const attended = booked - noShow;
    const showRate = booked ? (attended / booked) : 0;
    const onboarded = tc['Onboarded'] || 0;
    const closeRate = booked ? (onboarded / booked) : 0;
    const callsPerMeeting = booked ? (s.calls / booked) : 0;

    rows.push([op, s.calls, s.out, s.in, s.answered, s.noAnswer, answerRate,
                Math.round(s.totalSec/60), avgSec,
                booked, noShow, attended, showRate,
                onboarded, closeRate, callsPerMeeting].concat(bdCols));
  });

  dash.clear();
  dash.getRange(1,1,1,header.length).setValues([header]).setFontWeight('bold');
  if (rows.length > 0) {
    dash.getRange(2,1,rows.length, header.length).setValues(rows);
    dash.getRange(2,7,rows.length,1).setNumberFormat('0.0%');   // Answer Rate
    dash.getRange(2,13,rows.length,1).setNumberFormat('0.0%');  // Show Rate
    dash.getRange(2,15,rows.length,1).setNumberFormat('0.0%');  // Close Rate
    dash.getRange(2,16,rows.length,1).setNumberFormat('0.0');   // Calls per Meeting
  }
  dash.setFrozenRows(1);
  dash.autoResizeColumns(1, header.length);
  buildDashboardCharts();
}

function buildDashboardCharts() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const dash = ss.getSheetByName(CONFIG.DASHBOARD_SHEET);
  dash.getCharts().forEach(c => dash.removeChart(c));

  const lastRow = dash.getLastRow();
  if (lastRow < 2) return;

  dash.insertChart(dash.newChart()
    .setChartType(Charts.ChartType.COLUMN)
    .addRange(dash.getRange(1,1,lastRow,1))   // Opener
    .addRange(dash.getRange(1,2,lastRow,1))   // Calls Made
    .addRange(dash.getRange(1,10,lastRow,1))  // Meetings Booked
    .setPosition(lastRow + 3, 1, 0, 0)
    .setOption('title', 'Calls Made vs Meetings Booked')
    .setOption('width', 500).setOption('height', 300)
    .build());

  dash.insertChart(dash.newChart()
    .setChartType(Charts.ChartType.COLUMN)
    .addRange(dash.getRange(1,1,lastRow,1))   // Opener
    .addRange(dash.getRange(1,13,lastRow,1))  // Show Rate
    .addRange(dash.getRange(1,15,lastRow,1))  // Close Rate
    .setPosition(lastRow + 3, 8, 0, 0)
    .setOption('title', 'Show Rate vs Close Rate')
    .setOption('width', 500).setOption('height', 300)
    .build());

  dash.insertChart(dash.newChart()
    .setChartType(Charts.ChartType.COLUMN)
    .addRange(dash.getRange(1,1,lastRow,1))    // Opener
    .addRange(dash.getRange(1,17,lastRow,8))   // pipeline stage cols
    .setPosition(lastRow + 22, 1, 0, 0)
    .setOption('title', 'Pipeline Stage Counts by Opener')
    .setOption('isStacked', true)
    .setOption('width', 700).setOption('height', 320)
    .build());
}
function debugBDConnection() {
  Logger.log('BD_TRACKER_ID = "%s"', CONFIG.BD_TRACKER_ID);

  let ss;
  try {
    ss = CONFIG.BD_TRACKER_ID
      ? SpreadsheetApp.openById(CONFIG.BD_TRACKER_ID)
      : SpreadsheetApp.getActiveSpreadsheet();
  } catch (e) {
    Logger.log('FAILED to open tracker spreadsheet: %s', e.message);
    return;
  }

  Logger.log('Opened spreadsheet: "%s"', ss.getName());
  Logger.log('All sheet tabs found: %s', ss.getSheets().map(s => s.getName()).join(', '));

  CONFIG.BD_TABS.forEach(tabName => {
    const sh = ss.getSheetByName(tabName);
    if (!sh) {
      Logger.log('[MISSING] Tab "%s" not found in this spreadsheet.', tabName);
      return;
    }
    const lastRow = sh.getLastRow();
    Logger.log('[OK] Tab "%s" — lastRow=%s', tabName, lastRow);
    if (lastRow > 1) {
      const sample = sh.getRange(2, CONFIG.OPENER_COL, Math.min(3, lastRow-1), 1).getValues();
      Logger.log('    sample Opener col values: %s', JSON.stringify(sample));
    }
  });
}