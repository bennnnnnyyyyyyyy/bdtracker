/**
 * @fileoverview BD Call & Pipeline Tracker — In-Sheet Data Intake & Report Mirror
 * 
 * Role:
 * - Log Intake: Allows team members to paste raw Ultatel call exports via a temporary staging tab.
 * - Deduplication: Skips existing calls and deletes the staging tab once saved to 'Call Logs'.
 * - In-Sheet Mirror: Renders a summary table in 'BD Dashboard' for spreadsheet viewers.
 * 
 * Note: The actual web application and backend are hosted on Vercel backed by Supabase PostgreSQL.
 */

/**
 * Global Configuration
 */
const CONFIG = {
  // BD Tracker Spreadsheet ID (leave empty if tabs live in the current spreadsheet)
  BD_TRACKER_ID: '1uicpBruuFeno2ES4hNw-TIAwNkGEI37gw8Z-A4yMpC8',

  // BD Pipeline Stages (Tabs)
  BD_TABS: [
    'New Meetings',
    'Follow Ups',
    'Contract Sent',
    'Invoice Sent',
    'Onboarded',
    'No-Show',
    'Dead Leads',
    'Temporary Inactive'
  ],

  CALL_LOG_SHEET: 'Call Logs',
  STAGING_SHEET: 'Import Staging',
  MAPPING_SHEET: 'Agent Mapping',
  DASHBOARD_SHEET: 'BD Dashboard',

  RAW_HEADERS: [
    'Call Date',
    'Call ID',
    'From',
    'To',
    'Extension',
    'Department',
    'DID',
    'Description',
    'Type',
    'Outcome',
    'Duration',
    'Notes',
    'Call Path'
  ],
  CALL_LOG_EXTRA: ['Agent', 'Duration (sec)'],

  // Agents to permanently exclude from dashboard calculations & mappings
  EXCLUDED_AGENTS: ['russ', 'george', 'caroline', 'caroline richards']
};

/**
 * Checks if a given agent name should be excluded.
 * @param {string} [name] - Agent or opener name.
 * @returns {boolean} True if excluded.
 */
function isExcludedAgent_(name) {
  if (!name) return false;
  const clean = String(name).trim().toLowerCase();
  if (!clean) return false;
  return CONFIG.EXCLUDED_AGENTS.some(
    excluded => clean === excluded || clean.startsWith(excluded) || clean.endsWith(excluded)
  );
}

// ==========================================
// MENU & INITIALIZATION
// ==========================================

/**
 * Builds the custom menu on spreadsheet open.
 */
function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu('BD Call Dashboard')
    .addItem('1. Prepare / Open Staging Tab', 'createStagingTab')
    .addItem('2. Process Staged Call Import', 'processStagingImport')
    .addItem('3. Refresh BD Dashboard', 'refreshDashboard')
    .addSeparator()
    .addItem('Setup / Reset Core Tabs', 'setupTabs')
    .addItem('Backfill Call Log Fields (Repair)', 'backfillCallLogFields')
    .addItem('Debug BD Connection & Tabs', 'debugBDConnection')
    .addToUi();
}

/**
 * Creates missing sheets and sets up initial table headers.
 */
function setupTabs() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();

  const callLog = getOrCreateSheet_(ss, CONFIG.CALL_LOG_SHEET);
  writeHeaderIfEmpty_(callLog, [...CONFIG.RAW_HEADERS, ...CONFIG.CALL_LOG_EXTRA]);

  const staging = getOrCreateSheet_(ss, CONFIG.STAGING_SHEET);
  writeHeaderIfEmpty_(staging, CONFIG.RAW_HEADERS);

  const mapping = getOrCreateSheet_(ss, CONFIG.MAPPING_SHEET);
  writeHeaderIfEmpty_(mapping, ['Call Log Agent Name', 'Opener Name (must match BD tabs)']);

  const dash = getOrCreateSheet_(ss, CONFIG.DASHBOARD_SHEET);
  if (dash.getLastRow() === 0) {
    dash.getRange(1, 1).setValue('BD Dashboard — Click "Refresh BD Dashboard" in the menu to generate.');
  }

  SpreadsheetApp.getUi().alert(
    'Tabs initialized successfully.\n\n' +
    '1. Paste raw Ultatel call export into "' + CONFIG.STAGING_SHEET + '" (row 2 onwards).\n' +
    '2. Click "BD Call Dashboard > 2. Process Staged Call Import".'
  );
}

/**
 * Helper to get or insert a sheet by name.
 * @param {GoogleAppsScript.Spreadsheet.Spreadsheet} ss
 * @param {string} name
 * @returns {GoogleAppsScript.Spreadsheet.Sheet}
 */
function getOrCreateSheet_(ss, name) {
  return ss.getSheetByName(name) ?? ss.insertSheet(name);
}

/**
 * Writes bold header row if sheet is currently empty.
 * @param {GoogleAppsScript.Spreadsheet.Sheet} sheet
 * @param {string[]} headers
 */
function writeHeaderIfEmpty_(sheet, headers) {
  if (sheet.getLastRow() === 0) {
    sheet.getRange(1, 1, 1, headers.length).setValues([headers]).setFontWeight('bold');
    sheet.setFrozenRows(1);
  }
}

// ==========================================
// STAGED IMPORT & CALL LOG PROCESSING
// ==========================================

/**
 * Creates or resets the Import Staging tab with headers ready for pasting.
 */
function createStagingTab() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let staging = ss.getSheetByName(CONFIG.STAGING_SHEET);
  if (!staging) {
    staging = ss.insertSheet(CONFIG.STAGING_SHEET);
  } else {
    staging.clear();
  }
  staging.getRange(1, 1, 1, CONFIG.RAW_HEADERS.length).setValues([CONFIG.RAW_HEADERS]).setFontWeight('bold');
  staging.setFrozenRows(1);
  ss.setActiveSheet(staging);
  SpreadsheetApp.getUi().alert(
    `"${CONFIG.STAGING_SHEET}" is ready.\n\nPaste your raw Ultatel call export starting at row 2, then click "Process Staged Call Import".`
  );
}

/**
 * Processes rows from Import Staging into Call Logs:
 * 1. Checks for duplicates by Call ID (and compound key fallback) against existing logs.
 * 2. Deduplicates intra-batch rows.
 * 3. Appends only new records to Call Logs.
 * 4. Deletes the Import Staging tab completely after completion.
 */
function processStagingImport() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const staging = ss.getSheetByName(CONFIG.STAGING_SHEET);
  const callLog = ss.getSheetByName(CONFIG.CALL_LOG_SHEET);
  const mapping = ss.getSheetByName(CONFIG.MAPPING_SHEET);

  if (!callLog || !mapping) {
    SpreadsheetApp.getUi().alert('Required tabs missing. Please run "1. Setup / Reset Tabs" first.');
    return;
  }

  if (!staging) {
    SpreadsheetApp.getUi().alert(
      `"${CONFIG.STAGING_SHEET}" tab not found.\n\nClick "BD Call Dashboard > 1. Create / Open Staging Tab" to prepare an import tab.`
    );
    return;
  }

  const lastRow = staging.getLastRow();
  if (lastRow < 2) {
    SpreadsheetApp.getUi().alert('Import Staging is empty. Paste raw call data starting at row 2.');
    return;
  }

  const rawRows = staging.getRange(2, 1, lastRow - 1, CONFIG.RAW_HEADERS.length).getValues();

  // Cache existing call IDs and compound keys for deduplication
  const existingLastRow = callLog.getLastRow();
  const existingIds = new Set();
  const existingCompoundKeys = new Set();

  if (existingLastRow > 1) {
    const existingData = callLog.getRange(2, 1, existingLastRow - 1, CONFIG.RAW_HEADERS.length).getValues();
    existingData.forEach(r => {
      const id = String(r[1] ?? '').trim().toLowerCase();
      if (id) {
        existingIds.add(id);
      }
      // Compound key fallback: Date|From|To|Duration|Extension
      const compoundKey = `${String(r[0] ?? '').trim()}|${String(r[2] ?? '').trim()}|${String(r[3] ?? '').trim()}|${String(r[10] ?? '').trim()}|${String(r[4] ?? '').trim()}`.toLowerCase();
      existingCompoundKeys.add(compoundKey);
    });
  }

  // Cache known mapped agents
  const mapLastRow = mapping.getLastRow();
  const knownAgents = new Set();
  if (mapLastRow > 1) {
    const agentValues = mapping.getRange(2, 1, mapLastRow - 1, 1).getValues();
    agentValues.forEach(r => {
      if (r[0]) knownAgents.add(String(r[0]).trim());
    });
  }

  const toAppend = [];
  const newAgents = new Set();
  let duplicateCount = 0;

  rawRows.forEach(r => {
    const callDate = String(r[0] ?? '').trim();
    const callId = String(r[1] ?? '').trim();
    const fromNum = String(r[2] ?? '').trim();
    const toNum = String(r[3] ?? '').trim();
    const extension = String(r[4] ?? '').trim();
    const duration = String(r[10] ?? '').trim();

    // Skip empty rows
    if (!callDate && !callId && !fromNum && !toNum) return;

    const normalizedId = callId.toLowerCase();
    const compoundKey = `${callDate}|${fromNum}|${toNum}|${duration}|${extension}`.toLowerCase();

    // Check duplicate by Call ID or compound key
    const isDuplicate = (normalizedId && existingIds.has(normalizedId)) ||
                        (!normalizedId && existingCompoundKeys.has(compoundKey));

    if (isDuplicate) {
      duplicateCount++;
      return;
    }

    const agent = parseAgentName_(extension);
    const durationSec = durationToSeconds_(r[10]);

    if (agent && !isExcludedAgent_(agent) && !knownAgents.has(agent)) {
      newAgents.add(agent);
      knownAgents.add(agent);
    }

    toAppend.push([...r, agent, durationSec]);

    // Prevent intra-batch duplicates
    if (normalizedId) existingIds.add(normalizedId);
    existingCompoundKeys.add(compoundKey);
  });

  // Batch insert new call rows
  if (toAppend.length > 0) {
    callLog.getRange(callLog.getLastRow() + 1, 1, toAppend.length, toAppend[0].length).setValues(toAppend);
  }

  // Batch insert newly discovered agents into mapping table
  if (newAgents.size > 0) {
    const newMappingRows = Array.from(newAgents).map(a => [a, '']);
    mapping.getRange(mapping.getLastRow() + 1, 1, newMappingRows.length, 2).setValues(newMappingRows);
  }

  // Delete the staging tab completely after finishing
  try {
    ss.deleteSheet(staging);
  } catch (err) {
    console.warn('Could not delete staging sheet, clearing content instead:', err);
    staging.clear();
  }

  let message = `✅ Import Complete:\n• ${toAppend.length} new call(s) imported into Call Logs.`;
  if (duplicateCount > 0) {
    message += `\n• ${duplicateCount} duplicate call(s) detected and skipped.`;
  }
  if (newAgents.size > 0) {
    message += `\n• ${newAgents.size} new agent(s) added to Agent Mapping. Please assign their Opener names.`;
  }
  message += `\n• Staging tab removed.`;

  SpreadsheetApp.getUi().alert(message);

  refreshDashboard();
}

/**
 * Extracts agent name from Ultatel extension field: "112 (MMS-Ben Arthur)" -> "Ben Arthur"
 * @param {string} extensionCell
 * @returns {string}
 */
function parseAgentName_(extensionCell) {
  if (!extensionCell) return '';
  const match = String(extensionCell).match(/\(MMS-([^)]+)\)/);
  return match ? match[1].trim() : String(extensionCell).trim();
}

/**
 * Converts various time formats (hh:mm:ss, mm:ss, Date object, numbers) to total seconds.
 * @param {unknown} val
 * @returns {number} Total seconds
 */
function durationToSeconds_(val) {
  if (val === null || val === undefined || val === '') return 0;
  if (typeof val === 'number') {
    if (val < 1 && val > 0) return Math.round(val * 86400);
    return Math.round(val);
  }
  if (val instanceof Date) {
    return val.getHours() * 3600 + val.getMinutes() * 60 + val.getSeconds();
  }
  const s = String(val).trim();
  const parts = s.split(':').map(Number);
  if (parts.some(isNaN)) return 0;
  if (parts.length === 2) return parts[0] * 60 + parts[1];
  if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
  return 0;
}

/**
 * Backfills missing Agent and Duration (sec) columns in Call Logs.
 */
function backfillCallLogFields() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const callLog = ss.getSheetByName(CONFIG.CALL_LOG_SHEET);
  if (!callLog) return;

  const lastRow = callLog.getLastRow();
  if (lastRow < 2) return;

  const numCols = CONFIG.RAW_HEADERS.length + CONFIG.CALL_LOG_EXTRA.length;
  const data = callLog.getRange(2, 1, lastRow - 1, numCols).getValues();

  data.forEach(r => {
    r[13] = parseAgentName_(String(r[4] ?? ''));
    r[14] = durationToSeconds_(r[10]);
  });

  callLog.getRange(2, 1, data.length, numCols).setValues(data);
  SpreadsheetApp.getUi().alert(`Successfully backfilled ${data.length} call rows.`);
}

// ==========================================
// BD TRACKER DATA EXTRACTION
// ==========================================

/**
 * Reads all BD Tracker tabs, dynamically detecting the Opener column.
 * Filters out excluded agents (Russ, George, Caroline).
 * @returns {Record<string, Record<string, number>>}
 */
function getBDCounts_() {
  let trackerSs;
  try {
    trackerSs = CONFIG.BD_TRACKER_ID
      ? SpreadsheetApp.openById(CONFIG.BD_TRACKER_ID)
      : SpreadsheetApp.getActiveSpreadsheet();
  } catch (err) {
    console.error('Failed to open BD tracker spreadsheet:', err);
    return {};
  }

  const counts = {};

  CONFIG.BD_TABS.forEach(tabName => {
    const sheet = trackerSs.getSheetByName(tabName);
    if (!sheet || sheet.getLastRow() < 2) return;

    const values = sheet.getRange(1, 1, sheet.getLastRow(), Math.min(10, sheet.getLastColumn())).getValues();
    if (values.length < 2) return;

    // Detect Opener column dynamically from header row
    const headers = values[0].map(h => String(h ?? '').trim().toLowerCase());
    let openerColIdx = headers.findIndex(h => h.includes('opener') || h === 'agent' || h === 'rep');
    if (openerColIdx === -1) openerColIdx = 1; // Default Col B (0-indexed 1)

    for (let r = 1; r < values.length; r++) {
      const row = values[r];
      const opener = String(row[openerColIdx] ?? '').trim();
      if (!opener || isExcludedAgent_(opener)) continue;

      if (!counts[opener]) counts[opener] = {};
      counts[opener][tabName] = (counts[opener][tabName] ?? 0) + 1;
    }
  });

  return counts;
}

// ==========================================
// DASHBOARD REFRESH & CHARTS
// ==========================================

/**
 * Computes all call and meeting KPIs, outputs the formatted summary table,
 * and renders high-density executive charts.
 */
function refreshDashboard() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const callLog = ss.getSheetByName(CONFIG.CALL_LOG_SHEET);
  const mapping = ss.getSheetByName(CONFIG.MAPPING_SHEET);
  const dash = ss.getSheetByName(CONFIG.DASHBOARD_SHEET);

  if (!callLog || !mapping || !dash) {
    SpreadsheetApp.getUi().alert('Run "1. Setup / Reset Tabs" first.');
    return;
  }

  // 1. Build Agent -> Opener mapping
  const mapLastRow = mapping.getLastRow();
  const agentToOpener = {};
  if (mapLastRow > 1) {
    const mapValues = mapping.getRange(2, 1, mapLastRow - 1, 2).getValues();
    mapValues.forEach(r => {
      const agent = String(r[0] ?? '').trim();
      const opener = String(r[1] ?? '').trim();
      if (agent && !isExcludedAgent_(agent) && !isExcludedAgent_(opener)) {
        agentToOpener[agent] = opener;
      }
    });
  }

  // 2. Aggregate Call Log Statistics
  const clLastRow = callLog.getLastRow();
  const stats = {};
  if (clLastRow > 1) {
    const data = callLog.getRange(2, 1, clLastRow - 1, CONFIG.RAW_HEADERS.length + CONFIG.CALL_LOG_EXTRA.length).getValues();
    data.forEach(r => {
      const type = String(r[8] ?? '');
      const outcome = String(r[9] ?? '');
      const durSec = Number(r[14]) || 0;
      const rawAgent = String(r[13] ?? '').trim();
      
      if (isExcludedAgent_(rawAgent)) return;

      const opener = agentToOpener[rawAgent] || rawAgent || 'Unmapped';
      if (isExcludedAgent_(opener)) return;

      if (!stats[opener]) {
        stats[opener] = { calls: 0, out: 0, in: 0, answered: 0, noAnswer: 0, totalSec: 0 };
      }
      const s = stats[opener];
      s.calls++;
      if (type === 'OUT-Bound') s.out++;
      else if (type === 'IN-Bound') s.in++;

      if (outcome === 'ANSWERED') s.answered++;
      else if (outcome === 'NO ANSWER') s.noAnswer++;

      s.totalSec += durSec;
    });
  }

  // 3. Pull BD Tracker Pipeline Counts
  const trackerCounts = getBDCounts_();

  // Union of non-excluded active openers
  const allOpeners = new Set([...Object.keys(stats), ...Object.keys(trackerCounts)]);
  CONFIG.EXCLUDED_AGENTS.forEach(ex => {
    allOpeners.delete(ex);
  });

  const header = [
    'Opener',
    'Calls Made',
    'Outbound',
    'Inbound',
    'Answered',
    'No Answer',
    'Connection Rate',
    'Total Talk (min)',
    'Avg Call (sec)',
    'Meetings Booked',
    'No-Show',
    'Attended',
    'Show Rate',
    'Onboarded',
    'Close Rate',
    'Calls / Meeting',
    ...CONFIG.BD_TABS
  ];

  const rows = [];
  const sortedOpeners = Array.from(allOpeners).filter(op => !isExcludedAgent_(op)).sort();

  sortedOpeners.forEach(op => {
    const s = stats[op] ?? { calls: 0, out: 0, in: 0, answered: 0, noAnswer: 0, totalSec: 0 };
    const connectionRate = s.calls > 0 ? s.answered / s.calls : 0;
    const avgSec = s.calls > 0 ? Math.round(s.totalSec / s.calls) : 0;

    const tc = trackerCounts[op] ?? {};
    const bdCols = CONFIG.BD_TABS.map(t => tc[t] ?? 0);
    const booked = CONFIG.BD_TABS.reduce((sum, t) => sum + (tc[t] ?? 0), 0);
    const noShow = tc['No-Show'] ?? 0;
    const attended = Math.max(0, booked - noShow);
    const showRate = booked > 0 ? attended / booked : 0;
    const onboarded = tc['Onboarded'] ?? 0;
    const closeRate = booked > 0 ? onboarded / booked : 0;
    const callsPerMeeting = booked > 0 ? Number((s.calls / booked).toFixed(1)) : 0;

    rows.push([
      op,
      s.calls,
      s.out,
      s.in,
      s.answered,
      s.noAnswer,
      connectionRate,
      Math.round(s.totalSec / 60),
      avgSec,
      booked,
      noShow,
      attended,
      showRate,
      onboarded,
      closeRate,
      callsPerMeeting,
      ...bdCols
    ]);
  });

  // 4. Render to Sheet
  dash.clear();
  dash.getRange(1, 1, 1, header.length)
    .setValues([header])
    .setBackground('#1e293b')
    .setFontColor('#ffffff')
    .setFontWeight('bold');

  if (rows.length > 0) {
    const bodyRange = dash.getRange(2, 1, rows.length, header.length);
    bodyRange.setValues(rows);

    // Number format columns
    dash.getRange(2, 7, rows.length, 1).setNumberFormat('0.0%');   // Connection Rate
    dash.getRange(2, 13, rows.length, 1).setNumberFormat('0.0%');  // Show Rate
    dash.getRange(2, 15, rows.length, 1).setNumberFormat('0.0%');  // Close Rate
    dash.getRange(2, 16, rows.length, 1).setNumberFormat('0.0');   // Calls / Meeting

    // Alternating row styling
    for (let i = 2; i <= rows.length + 1; i++) {
      if (i % 2 === 0) {
        dash.getRange(i, 1, 1, header.length).setBackground('#f8fafc');
      }
    }
  }

  dash.setFrozenRows(1);
  dash.autoResizeColumns(1, header.length);

  buildDashboardCharts();
}

/**
 * Builds high-level visual charts directly on the dashboard tab.
 */
function buildDashboardCharts() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const dash = ss.getSheetByName(CONFIG.DASHBOARD_SHEET);
  if (!dash) return;

  dash.getCharts().forEach(c => dash.removeChart(c));

  const lastRow = dash.getLastRow();
  if (lastRow < 2) return;

  // Chart 1: Calls Made vs Meetings Booked
  dash.insertChart(dash.newChart()
    .setChartType(Charts.ChartType.COLUMN)
    .addRange(dash.getRange(1, 1, lastRow, 1))   // Opener
    .addRange(dash.getRange(1, 2, lastRow, 1))   // Calls Made
    .addRange(dash.getRange(1, 10, lastRow, 1))  // Meetings Booked
    .setPosition(lastRow + 3, 1, 0, 0)
    .setOption('title', 'Calls Made vs. Meetings Booked')
    .setOption('colors', ['#3b82f6', '#6366f1'])
    .setOption('width', 520).setOption('height', 300)
    .build());

  // Chart 2: Show Rate vs Close Rate
  dash.insertChart(dash.newChart()
    .setChartType(Charts.ChartType.COLUMN)
    .addRange(dash.getRange(1, 1, lastRow, 1))   // Opener
    .addRange(dash.getRange(1, 13, lastRow, 1))  // Show Rate
    .addRange(dash.getRange(1, 15, lastRow, 1))  // Close Rate
    .setPosition(lastRow + 3, 9, 0, 0)
    .setOption('title', 'Show Rate vs. Close Rate (%)')
    .setOption('colors', ['#10b981', '#a855f7'])
    .setOption('width', 520).setOption('height', 300)
    .build());

  // Chart 3: Pipeline Stage Stacked Distribution
  dash.insertChart(dash.newChart()
    .setChartType(Charts.ChartType.COLUMN)
    .addRange(dash.getRange(1, 1, lastRow, 1))    // Opener
    .addRange(dash.getRange(1, 17, lastRow, CONFIG.BD_TABS.length)) // Stage columns
    .setPosition(lastRow + 20, 1, 0, 0)
    .setOption('title', 'Pipeline Stage Counts by Opener')
    .setOption('isStacked', true)
    .setOption('width', 800).setOption('height', 340)
    .build());
}

/**
 * Diagnostic tool to verify connection to the BD Tracker sheet and list all stages.
 */
function debugBDConnection() {
  Logger.log('CONFIG.BD_TRACKER_ID = "%s"', CONFIG.BD_TRACKER_ID);

  let ss;
  try {
    ss = CONFIG.BD_TRACKER_ID
      ? SpreadsheetApp.openById(CONFIG.BD_TRACKER_ID)
      : SpreadsheetApp.getActiveSpreadsheet();
  } catch (e) {
    Logger.log('FAILED to open tracker spreadsheet: %s', e.message);
    return;
  }

  Logger.log('Successfully opened spreadsheet: "%s"', ss.getName());
  Logger.log('Available sheet tabs: %s', ss.getSheets().map(s => s.getName()).join(', '));

  CONFIG.BD_TABS.forEach(tabName => {
    const sheet = ss.getSheetByName(tabName);
    if (!sheet) {
      Logger.log('[MISSING] Tab "%s" not found in spreadsheet.', tabName);
      return;
    }
    const lastRow = sheet.getLastRow();
    Logger.log('[OK] Tab "%s" (lastRow=%s)', tabName, lastRow);
  });
}