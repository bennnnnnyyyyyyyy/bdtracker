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

  // NOTE: this in-sheet mirror estimates shows from the pipeline stage only. The web dashboard counts
  // a show only after management confirms it there, so use the dashboard for official show numbers.
  ATTENDED_STAGES: ['Follow Ups', 'Contract Sent', 'Invoice Sent', 'Onboarded', 'Temporary Inactive'],

  CALL_LOG_SHEET: 'Call Logs',

  // Closed months move out of 'Call Logs' into tabs named 'Call Logs YYYY-MM' to keep the active log small and fast.
  // The newest ARCHIVE_KEEP_DAYS stay in the active tab so an export that overlaps the boundary can never re-add old calls.
  ARCHIVE_PREFIX: 'Call Logs ',
  ARCHIVE_KEEP_DAYS: 45,
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
  EXCLUDED_AGENTS: ['russ', 'george', 'caroline', 'caroline richards'],

  // Ultatel export clock and destination clock. Africa/Cairo applies Egypt DST rules.
  SOURCE_TIME_ZONE: 'Etc/GMT+6',
  CAIRO_TIME_ZONE: 'Africa/Cairo'
};

/**
 * Checks if a given agent name should be excluded.
 * @param {string} [name] - Agent or opener name.
 * @returns {boolean} True if excluded.
 */
function isExcludedAgent_(name) {
  if (!name) return false;
  const normalize = value => ` ${String(value).toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()} `;
  const normalized = normalize(name);
  if (normalized.trim() === '') return false;
  // Whole-word match (keep in sync with isExcludedAgent in src/lib/config.ts).
  return CONFIG.EXCLUDED_AGENTS.some(excluded => normalized.includes(normalize(excluded)));
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
    .addItem('Archive closed months', 'archiveClosedMonths')
    .addItem('Preview duplicate-call repair', 'previewCallLogRepair')
    .addItem('Repair duplicate calls', 'repairCallLogs')
    .addItem('Fix call times (from Call ID)', 'convertAllCallLogDatesToCairo')
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

// ==========================================
// MONTHLY ARCHIVE
// ==========================================

/** Name of the archive tab for a month key like "2026-09". */
function archiveTabName_(monthKey) {
  return CONFIG.ARCHIVE_PREFIX + monthKey;
}

/** Month keys (YYYY-MM) touched by [minEpoch, maxEpoch] widened by 2 days, so month-edge time zones are covered. */
function monthKeysForEpochRange_(minEpoch, maxEpoch) {
  const keys = [];
  const start = new Date((minEpoch - 2 * 86400) * 1000);
  const end = new Date((maxEpoch + 2 * 86400) * 1000);
  let y = start.getUTCFullYear();
  let m = start.getUTCMonth();
  while (y < end.getUTCFullYear() || (y === end.getUTCFullYear() && m <= end.getUTCMonth())) {
    keys.push(`${y}-${String(m + 1).padStart(2, '0')}`);
    m++;
    if (m > 11) { m = 0; y++; }
  }
  return keys;
}

/**
 * Rows (as shown in the cells, 15 columns) of the active Call Logs plus the archive tabs for the months an
 * epoch range touches. Used so imports compare against archived calls too.
 */
function collectLogRowsDisplay_(minEpoch, maxEpoch) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const numCols = CONFIG.RAW_HEADERS.length + CONFIG.CALL_LOG_EXTRA.length;
  const tabs = [CONFIG.CALL_LOG_SHEET];
  if (isFinite(minEpoch) && isFinite(maxEpoch)) {
    monthKeysForEpochRange_(minEpoch, maxEpoch).forEach(k => {
      if (ss.getSheetByName(archiveTabName_(k))) tabs.push(archiveTabName_(k));
    });
  }
  const rows = [];
  tabs.forEach(name => {
    const sheet = ss.getSheetByName(name);
    if (!sheet || sheet.getLastRow() < 2) return;
    sheet.getRange(2, 1, sheet.getLastRow() - 1, numCols).getDisplayValues().forEach(r => rows.push(r));
  });
  return rows;
}

/**
 * Moves calls older than ARCHIVE_KEEP_DAYS out of 'Call Logs' into one tab per month ('Call Logs 2026-09').
 * The active tab stays small, so imports, repairs and the dashboard stay fast. A hidden backup is saved first.
 */
function archiveClosedMonths() {
  const ui = SpreadsheetApp.getUi();
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const callLog = ss.getSheetByName(CONFIG.CALL_LOG_SHEET);
  if (!callLog || callLog.getLastRow() < 2) {
    ui.alert('Call Logs is empty.');
    return;
  }

  const numCols = CONFIG.RAW_HEADERS.length + CONFIG.CALL_LOG_EXTRA.length;
  const range = callLog.getRange(2, 1, callLog.getLastRow() - 1, numCols);
  const vals = range.getValues();
  const disp = range.getDisplayValues();
  const cutoff = Math.floor(Date.now() / 1000) - CONFIG.ARCHIVE_KEEP_DAYS * 86400;

  const keep = [];
  const byMonth = new Map();
  vals.forEach((row, i) => {
    if (row.every(c => c === '' || c === null)) return;
    let epoch = callEpoch_(disp[i][1]);
    let monthKey = null;
    if (epoch !== null) {
      monthKey = cairoFromEpoch_(epoch).slice(0, 7);
    } else {
      const naive = naiveMs_(disp[i][0]);
      if (naive !== null) {
        epoch = naive / 1000;
        monthKey = formatNaive_(naive).slice(0, 7);
      }
    }
    if (monthKey !== null && epoch < cutoff) {
      if (!byMonth.has(monthKey)) byMonth.set(monthKey, []);
      byMonth.get(monthKey).push(row);
    } else {
      keep.push(row);
    }
  });

  let moving = 0;
  byMonth.forEach(rows => { moving += rows.length; });
  if (moving === 0) {
    ui.alert(`Nothing to archive: every call is newer than ${CONFIG.ARCHIVE_KEEP_DAYS} days.`);
    return;
  }

  const months = Array.from(byMonth.keys()).sort();
  const summary = months.map(k => `  ${archiveTabName_(k)}: ${byMonth.get(k).length} rows`).join('\n');
  const answer = ui.alert(
    'Archive closed months?',
    `${moving} call rows older than ${CONFIG.ARCHIVE_KEEP_DAYS} days will move out of "${CONFIG.CALL_LOG_SHEET}":\n${summary}\n\n${keep.length} rows stay in the active tab. A hidden backup is saved first.`,
    ui.ButtonSet.OK_CANCEL
  );
  if (answer !== ui.Button.OK) return;

  const stamp = Utilities.formatDate(new Date(), CONFIG.CAIRO_TIME_ZONE, 'yyyy-MM-dd HHmm');
  callLog.copyTo(ss).setName(`Call Logs backup ${stamp}`).hideSheet();

  const header = callLog.getRange(1, 1, 1, numCols).getValues();
  const written = new Map();
  months.forEach(k => {
    const name = archiveTabName_(k);
    let tab = ss.getSheetByName(name);
    if (!tab) {
      tab = ss.insertSheet(name);
      tab.getRange(1, 1, 1, numCols).setValues(header).setFontWeight('bold');
      tab.setFrozenRows(1);
    }
    const rows = byMonth.get(k);
    const startRow = Math.max(tab.getLastRow(), 1) + 1;
    tab.getRange(startRow, 1, rows.length, numCols).setValues(rows);
    written.set(k, { name, startRow, count: rows.length });
  });
  SpreadsheetApp.flush();

  // Only clear the active tab once every archived row is confirmed to be in its archive tab.
  const problems = [];
  written.forEach((w, k) => {
    const tab = ss.getSheetByName(w.name);
    if (!tab || tab.getLastRow() < w.startRow + w.count - 1) problems.push(k);
  });
  if (problems.length > 0) {
    ui.alert(`Archive stopped before changing "${CONFIG.CALL_LOG_SHEET}": could not confirm rows in ${problems.join(', ')}. Nothing was removed. Check the archive tabs and try again.`);
    return;
  }

  callLog.getRange(2, 1, callLog.getLastRow() - 1, numCols).clearContent();
  if (keep.length > 0) callLog.getRange(2, 1, keep.length, numCols).setValues(keep);

  ui.alert(`Archived ${moving} rows into ${months.length} monthly tab(s). "${CONFIG.CALL_LOG_SHEET}" now has ${keep.length} rows.\n\nThe dashboard reads archive tabs automatically when you choose a date range that reaches back to those months.`);
}

/**
 * After an import: compares, per agent, how many rows the export had with how many rows Call Logs now holds
 * for the same period (by Call ID timestamp), so any mismatch is visible straight away.
 * @param {unknown[][]} stagedRows the export rows that were in Import Staging
 * @returns {string} lines for the completion message
 */
function reconcileImport_(stagedRows) {
  const callLog = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(CONFIG.CALL_LOG_SHEET);
  const expected = new Map();
  let minEpoch = Infinity;
  let maxEpoch = -Infinity;
  stagedRows.forEach(r => {
    const epoch = callEpoch_(r[1]);
    if (epoch === null) return;
    minEpoch = Math.min(minEpoch, epoch);
    maxEpoch = Math.max(maxEpoch, epoch);
    const agent = parseAgentName_(String(r[4] ?? '')) || '(no agent)';
    expected.set(agent, (expected.get(agent) ?? 0) + 1);
  });
  if (expected.size === 0 || !callLog) return '';

  SpreadsheetApp.flush();
  const actual = new Map();
  collectLogRowsDisplay_(minEpoch, maxEpoch).forEach(r => {
    const epoch = callEpoch_(r[1]);
    if (epoch === null || epoch < minEpoch || epoch > maxEpoch) return;
    const agent = parseAgentName_(String(r[4] ?? '')) || '(no agent)';
    actual.set(agent, (actual.get(agent) ?? 0) + 1);
  });

  const problems = [];
  expected.forEach((n, agent) => {
    const got = actual.get(agent) ?? 0;
    if (got !== n) problems.push(`${agent}: export ${n}, Call Logs ${got} (${got - n > 0 ? '+' : ''}${got - n})`);
  });
  return problems.length === 0
    ? '\n• Check: every agent matches the export exactly.'
    : '\n• CHECK FAILED - Call Logs differs from the export for this period:\n   ' + problems.join('\n   ') +
      '\n   (extra rows usually mean old duplicates: run "Repair duplicate calls")';
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

  const stagingRange = staging.getRange(2, 1, lastRow - 1, CONFIG.RAW_HEADERS.length);
  const rawRows = stagingRange.getValues();
  const stagingDisp = stagingRange.getDisplayValues(); // text as shown (e.g. "0:37"), used for comparing

  // How many rows of each call (see callRowKey_) are already stored: the active Call Logs plus the archive tabs of
  // the months this export touches (so re-importing old data never duplicates archived calls).
  const existingCount = new Map();
  let stagedMin = Infinity;
  let stagedMax = -Infinity;
  stagingDisp.forEach(d => {
    const e = callEpoch_(d[1]);
    if (e !== null) { stagedMin = Math.min(stagedMin, e); stagedMax = Math.max(stagedMax, e); }
  });
  const existingItems = collectLogRowsDisplay_(stagedMin, stagedMax).map(d => ({ key: callRowKey_(d, d[0]), text: rowSignature_(d) }));
  effectiveCounts_(existingItems).forEach((n, key) => existingCount.set(key, n));
  const seenInBatch = new Map();

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

  rawRows.forEach((r, rowIdx) => {
    const disp = stagingDisp[rowIdx];
    const rawText = disp[0] || dateText_(r[0]);
    const callId = String(r[1] ?? '').trim();
    const fromNum = String(r[2] ?? '').trim();
    const toNum = String(r[3] ?? '').trim();
    const extension = String(r[4] ?? '').trim();

    // Skip empty rows
    if (!rawText && !callId && !fromNum && !toNum) return;

    // Cairo time: the Call ID's timestamp is exact; otherwise convert the export's UTC-6 clock.
    const epoch = callEpoch_(callId);
    r[0] = epoch !== null ? exactCairoTime_(rawText, callId) : toCairoDate_(r[0]);

    // A call may legitimately have several rows. Add rows only beyond the number already stored,
    // so re-importing an overlapping export adds nothing, while repeated legs in one export all stay.
    const key = callRowKey_(disp, String(r[0]));
    const seen = (seenInBatch.get(key) ?? 0) + 1;
    seenInBatch.set(key, seen);
    if (seen <= (existingCount.get(key) ?? 0)) {
      duplicateCount++;
      return;
    }

    const agent = parseAgentName_(extension);
    const durationSec = durationToSeconds_(disp[10]);

    if (agent && !isExcludedAgent_(agent) && !knownAgents.has(agent)) {
      newAgents.add(agent);
      knownAgents.add(agent);
    }

    toAppend.push([...r, agent, durationSec]);


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
  message += reconcileImport_(rawRows);

  SpreadsheetApp.getUi().alert(message);

  refreshDashboard();
}

/**
 * Ultatel Call IDs look like "1791808392.14495": the number before the dot is the call's start time in
 * Unix seconds. Returns it, or null when the ID has no usable timestamp.
 *
 * NOTE: one Call ID can legitimately appear on SEVERAL rows (ring attempts / call legs, each with its own
 * time, duration and outcome). Ultatel counts every row, so every row is kept. Only extra COPIES of a row
 * (the same export pasted twice, on a different clock or with a shortened ID) are removed.
 * @param {unknown} callId
 * @returns {number|null}
 */
function callEpoch_(callId) {
  const m = String(callId ?? '').trim().match(/^(\d{9,10})(?:\.\d+)?$/);
  if (!m) return null;
  const epoch = Number(m[1]);
  return epoch >= 1400000000 && epoch <= 4100000000 ? epoch : null;
}

let SS_TZ_ = null;
/** Spreadsheet time zone, fetched once (asking the spreadsheet for it on every row is very slow). */
function ssTz_() {
  if (SS_TZ_ === null) SS_TZ_ = SpreadsheetApp.getActiveSpreadsheet().getSpreadsheetTimeZone();
  return SS_TZ_;
}

const CAIRO_OFFSET_CACHE_ = new Map();
/**
 * Cairo's offset from UTC in ms at a Unix time. Asked from Apps Script once per hour of data (it only changes
 * at DST switches, which fall on hour boundaries) instead of once per row.
 */
function cairoOffsetMs_(epochSeconds) {
  const bucket = Math.floor(epochSeconds / 3600);
  let off = CAIRO_OFFSET_CACHE_.get(bucket);
  if (off === undefined) {
    const ms = bucket * 3600 * 1000;
    const text = Utilities.formatDate(new Date(ms), CONFIG.CAIRO_TIME_ZONE, 'yyyy-MM-dd HH:mm:ss');
    const m = text.match(/^(\d{4})-(\d{2})-(\d{2}) (\d{2}):(\d{2}):(\d{2})$/);
    off = Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +m[6]) - ms;
    CAIRO_OFFSET_CACHE_.set(bucket, off);
  }
  return off;
}

/** Exact Cairo time (DST aware) of a Unix timestamp, in the same text format the Call Logs use. */
function cairoFromEpoch_(epochSeconds) {
  return formatNaive_(epochSeconds * 1000 + cairoOffsetMs_(epochSeconds));
}

/** Text of a Call Date cell, whether it holds a Date or text. */
function dateText_(value) {
  if (value instanceof Date && !isNaN(value.getTime())) {
    return Utilities.formatDate(value, ssTz_(), 'yyyy-MM-dd HH:mm:ss');
  }
  return String(value ?? '').trim();
}

/** Reads "YYYY-MM-DD HH:mm[:ss]" or "MM-DD-YYYY HH:mm[:ss]" as if the clock fields were UTC. */
function naiveMs_(text) {
  const s = String(text ?? '').trim();
  let m = s.match(/^(\d{4})[-\/](\d{1,2})[-\/](\d{1,2})(?:[ T]+(\d{1,2}):(\d{2})(?::(\d{2}))?)?/);
  let y;
  let mo;
  let d;
  if (m) {
    y = +m[1]; mo = +m[2]; d = +m[3];
  } else {
    m = s.match(/^(\d{1,2})[-\/](\d{1,2})[-\/](\d{4})(?:[ T]+(\d{1,2}):(\d{2})(?::(\d{2}))?)?/);
    if (!m) return null;
    mo = +m[1]; d = +m[2]; y = +m[3];
    if (mo > 12 && d <= 12) { const t = mo; mo = d; d = t; }
  }
  if (mo < 1 || mo > 12 || d < 1 || d > 31) return null;
  return Date.UTC(y, mo - 1, d, +(m[4] || 0), +(m[5] || 0), +(m[6] || 0));
}

function formatNaive_(ms) {
  const d = new Date(ms);
  const p = n => String(n).padStart(2, '0');
  return `${d.getUTCFullYear()}-${p(d.getUTCMonth() + 1)}-${p(d.getUTCDate())} ${p(d.getUTCHours())}:${p(d.getUTCMinutes())}:${p(d.getUTCSeconds())}`;
}

/** Which clock a written call time is on ('cairo' | 'source' | 'unknown'), judged against the time in the Call ID. */
function classifyClock_(text, epoch) {
  const BEFORE = 90000;
  const AFTER = 6 * 3600 * 1000;
  const naive = naiveMs_(text);
  if (naive === null) return 'unknown';
  const cairoOffset = cairoOffsetMs_(epoch);
  const asCairo = naive - cairoOffset - epoch * 1000;
  if (asCairo >= -BEFORE && asCairo <= AFTER) return 'cairo';
  const asSource = naive + 6 * 3600 * 1000 - epoch * 1000; // export clock is fixed UTC-6
  if (asSource >= -BEFORE && asSource <= AFTER) return 'source';
  return 'unknown';
}

/** Cairo time of a call: kept if already Cairo, converted if on the export clock, otherwise taken from the Call ID. */
function exactCairoTime_(text, callId) {
  const epoch = callEpoch_(callId);
  if (epoch === null) return text;
  const clock = classifyClock_(text, epoch);
  const naive = naiveMs_(text);
  const fromId = cairoFromEpoch_(epoch);
  let written = null;
  if (clock === 'cairo' && naive !== null) written = formatNaive_(naive);
  else if (clock === 'source' && naive !== null) written = cairoFromEpoch_((naive + 6 * 3600 * 1000) / 1000);
  if (written === null) return fromId;
  // A time whose seconds were rounded away (":00") within the same minute as the ID's time: use the exact one.
  if (/:00$/.test(written) && written.slice(0, 16) === fromId.slice(0, 16)) return fromId;
  return written;
}

/**
 * Identity of a call row WITHOUT its clock: two copies of the same export row share it. For Ultatel IDs the
 * ID part is the timestamp only (the sequence after the dot is sometimes lost or reformatted).
 * @param {unknown[]} r columns A-M of a Call Logs row
 * @param {string} dateText text of the Call Date
 */
function callRowKey_(r, dateText) {
  const norm = v => String(v ?? '').trim().toLowerCase();
  // Compared by last 10 digits so "+16156173189", "16156173189" and "6156173189" are the same number.
  const phone = v => { const d = String(v ?? '').replace(/\D/g, ''); return d.length > 10 ? d.slice(-10) : d; };
  const epoch = callEpoch_(r[1]);
  const id = epoch !== null ? String(epoch) : norm(r[1]);
  const base = [phone(r[2]), phone(r[3]), norm(r[4]), norm(r[8]), norm(r[9]), durationToSeconds_(r[10])].join('|');
  return id ? `${id}|${base}` : `nid|${norm(dateText)}|${base}`;
}

/** Text of any cell (dates in the spreadsheet's time zone). */
function cellText_(v) {
  return v instanceof Date ? dateText_(v) : String(v ?? '').trim();
}

/**
 * Everything written in a Call Logs row. Copies of a row differ somewhere in it (a "+", a clock, the seconds
 * column); rows written identically are separate legs of the call.
 * @param {unknown[]} r
 */
function rowSignature_(r) {
  return JSON.stringify([0, 1, 2, 3, 4, 8, 9, 10, 11, 12, 14].map(i => cellText_(r[i])));
}

/**
 * Number of real rows for each key in a list of rows. Rows with the same key but written differently
 * are copies of each other; rows written identically are separate legs and all count.
 * @param {{key: string, text: string}[]} items  text = rowSignature_ of the row
 * @returns {Map<string, number>}
 */
function effectiveCounts_(items) {
  const byKey = new Map();
  items.forEach(it => {
    if (!byKey.has(it.key)) byKey.set(it.key, new Map());
    const byText = byKey.get(it.key);
    byText.set(it.text, (byText.get(it.text) ?? 0) + 1);
  });
  const counts = new Map();
  byKey.forEach((byText, key) => counts.set(key, Math.max(...byText.values())));
  return counts;
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
    if (val < 1 && val > 0) {
      // A time fraction: "0:37" typed as mm:ss is stored as 37 minutes (see the Date case below).
      const total = Math.round(val * 86400);
      return total % 60 === 0 ? total / 60 : total;
    }
    return Math.round(val);
  }
  if (val instanceof Date) {
    // Sheets reads a typed "0:37" (37 seconds) as the time 0:37:00. A time with 0 seconds is therefore
    // minutes:seconds; only a time with non-zero seconds is a genuine hh:mm:ss.
    const text = Utilities.formatDate(val, ssTz_(), 'HH:mm:ss');
    const [h, m, sec] = text.split(':').map(Number);
    return sec === 0 ? h * 60 + m : h * 3600 + m * 60 + sec;
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

/**
 * Puts every Call Logs time on exact Cairo time (using the Call ID's timestamp as the reference).
 * Times already on Cairo time are left alone, so this is safe to run repeatedly. Rows whose ID has no
 * timestamp are never changed.
 */
function convertAllCallLogDatesToCairo() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const callLog = ss.getSheetByName(CONFIG.CALL_LOG_SHEET);
  if (!callLog || callLog.getLastRow() < 2) return;

  const range = callLog.getRange(2, 1, callLog.getLastRow() - 1, 2);
  const values = range.getValues();
  const shown = range.getDisplayValues();
  let changed = 0;
  const out = values.map((row, i) => {
    if (callEpoch_(shown[i][1]) === null) return [row[0]];
    const text = shown[i][0];
    const exact = exactCairoTime_(text, shown[i][1]);
    if (exact !== text) changed++;
    return [exact];
  });
  callLog.getRange(2, 1, out.length, 1).setValues(out);
  SpreadsheetApp.getUi().alert(`Call times are now on Cairo time. ${changed} row(s) were changed.`);
}

// ==========================================
// DUPLICATE CALL REPAIR
// ==========================================

/**
 * Builds the repaired Call Logs without writing anything.
 * - Extra COPIES of a row are removed (same call on another clock / with a shortened ID). Rows that share a
 *   Call ID but are separate legs (different time, duration or outcome, or identical text) all stay.
 * - Empty cells of the kept row are filled from its copies.
 * - Every time is put on exact Cairo time using the Call ID's timestamp.
 * @returns {{rows: unknown[][], original: number, duplicates: number, redated: number}|null}
 */
function buildRepairedCallLog_() {
  const callLog = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(CONFIG.CALL_LOG_SHEET);
  if (!callLog || callLog.getLastRow() < 2) return null;

  const numCols = CONFIG.RAW_HEADERS.length + CONFIG.CALL_LOG_EXTRA.length;
  const range = callLog.getRange(2, 1, callLog.getLastRow() - 1, numCols);
  // Two bulk reads: the real values (written back) and the text shown in each cell (used for comparing, which
  // avoids slow per-cell calls and sidesteps Sheets turning "0:37" into a time).
  const allVals = range.getValues();
  const allDisp = range.getDisplayValues();
  const data = [];
  const disp = [];
  allVals.forEach((row, i) => {
    if (row.every(c => c === '' || c === null)) return;
    data.push(row);
    disp.push(allDisp[i]);
  });

  // Group rows by call identity, then by what is written in the row.
  const groups = new Map();
  data.forEach((row, i) => {
    const key = callRowKey_(disp[i], disp[i][0]);
    if (!groups.has(key)) groups.set(key, new Map());
    const byText = groups.get(key);
    const sig = rowSignature_(disp[i]);
    if (!byText.has(sig)) byText.set(sig, []);
    byText.get(sig).push(i);
  });

  // Keep the written form with the most rows (a Cairo-clock copy wins ties) and fill gaps from the other copies.
  const keep = new Set();
  groups.forEach(byText => {
    let best = null;
    let bestIsCairo = false;
    byText.forEach(idxs => {
      const epoch = callEpoch_(disp[idxs[0]][1]);
      const isCairo = epoch !== null && classifyClock_(disp[idxs[0]][0], epoch) === 'cairo';
      if (!best || idxs.length > best.length || (idxs.length === best.length && isCairo && !bestIsCairo)) {
        best = idxs;
        bestIsCairo = isCairo;
      }
    });
    best.forEach(i => keep.add(i));
    const target = data[best[0]];
    byText.forEach(idxs => {
      if (idxs === best) return;
      idxs.forEach(j => {
        data[j].forEach((cell, c) => {
          if ((target[c] === '' || target[c] === null) && cell !== '' && cell !== null) target[c] = cell;
        });
      });
    });
  });

  let redated = 0;
  const rows = [];
  data.forEach((row, i) => {
    if (!keep.has(i)) return;
    const out = row.slice();
    if (callEpoch_(disp[i][1]) !== null) {
      const text = disp[i][0];
      const exact = exactCairoTime_(text, disp[i][1]);
      if (exact !== text) redated++;
      out[0] = exact;
    }
    if (out[13] === '' || out[13] === null) out[13] = parseAgentName_(String(disp[i][4] ?? ''));
    out[14] = durationToSeconds_(disp[i][10]); // always recomputed from the shown "0:37" text
    rows.push(out);
  });

  return { rows, original: data.length, duplicates: data.length - rows.length, redated };
}

/** Shows what "Repair duplicate calls" would do, without changing anything. */
function previewCallLogRepair() {
  const plan = buildRepairedCallLog_();
  if (!plan) {
    SpreadsheetApp.getUi().alert('Call Logs is empty.');
    return;
  }
  SpreadsheetApp.getUi().alert(
    `Preview (nothing was changed):\n\n• ${plan.original} rows in Call Logs now\n• ${plan.duplicates} duplicate row(s) would be removed\n• ${plan.redated} row(s) would get their exact Cairo time from the Call ID\n• ${plan.rows.length} rows would remain`
  );
}

/**
 * Removes duplicate calls from Call Logs and fixes call times. A full copy of the sheet is saved first
 * ("Call Logs backup ...") so everything can be restored.
 */
function repairCallLogs() {
  const ui = SpreadsheetApp.getUi();
  const plan = buildRepairedCallLog_();
  if (!plan) {
    ui.alert('Call Logs is empty.');
    return;
  }
  if (plan.duplicates === 0 && plan.redated === 0) {
    ui.alert('Nothing to repair: no duplicate calls and every call time is already exact.');
    return;
  }
  const answer = ui.alert(
    'Repair Call Logs?',
    `This will remove ${plan.duplicates} duplicate row(s) and correct ${plan.redated} call time(s), leaving ${plan.rows.length} rows.\n\nA backup copy of the sheet is saved first.`,
    ui.ButtonSet.OK_CANCEL
  );
  if (answer !== ui.Button.OK) return;

  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const callLog = ss.getSheetByName(CONFIG.CALL_LOG_SHEET);
  const stamp = Utilities.formatDate(new Date(), CONFIG.CAIRO_TIME_ZONE, 'yyyy-MM-dd HHmm');
  const backup = callLog.copyTo(ss).setName(`Call Logs backup ${stamp}`);
  backup.hideSheet();

  const numCols = CONFIG.RAW_HEADERS.length + CONFIG.CALL_LOG_EXTRA.length;
  const lastRow = callLog.getLastRow();
  callLog.getRange(2, 1, lastRow - 1, numCols).clearContent();
  callLog.getRange(2, 1, plan.rows.length, numCols).setValues(plan.rows);

  ui.alert(`Done. ${plan.duplicates} duplicate row(s) removed, ${plan.redated} call time(s) corrected.\n\nBackup saved as a hidden sheet named "${backup.getName()}" (right-click any tab > Show hidden sheets).`);
  refreshDashboard();
}

/**
 * Treats timestamps without an explicit offset as fixed UTC-6, then formats
 * the resulting instant in Africa/Cairo. Cairo DST is applied by Apps Script.
 */
function toCairoDate_(value) {
  if (value === null || value === undefined || value === '') return '';

  let text;
  if (value instanceof Date && !isNaN(value.getTime())) {
    // Read the displayed source clock in UTC-6 before converting it.
    text = Utilities.formatDate(value, CONFIG.SOURCE_TIME_ZONE, 'yyyy-MM-dd HH:mm:ss');
  } else {
    text = String(value).trim();
  }
  if (!text) return '';

  // Explicitly zoned values are already instants; only reformat them.
  if (/[zZ]|[+-]\d{2}:?\d{2}$/.test(text)) {
    const explicit = new Date(text);
    if (!isNaN(explicit.getTime())) {
      return Utilities.formatDate(explicit, CONFIG.CAIRO_TIME_ZONE, 'yyyy-MM-dd HH:mm:ss');
    }
  }

  let match = text.match(/^(\d{4})[-\/](\d{1,2})[-\/](\d{1,2})(?:[ T]+(\d{1,2}):?(\d{2})?(?::?(\d{2}))?)?/);
  let year;
  let month;
  let day;
  let hour;
  let minute;
  let second;

  if (match) {
    year = Number(match[1]);
    month = Number(match[2]);
    day = Number(match[3]);
    hour = Number(match[4] || 0);
    minute = Number(match[5] || 0);
    second = Number(match[6] || 0);
  } else {
    match = text.match(/^(\d{1,2})[-\/](\d{1,2})[-\/](\d{2,4})(?:[ T]+(\d{1,2}):?(\d{2})?(?::?(\d{2}))?)?/);
    if (!match) return text;
    month = Number(match[1]);
    day = Number(match[2]);
    year = Number(match[3]);
    if (year < 100) year += 2000;
    hour = Number(match[4] || 0);
    minute = Number(match[5] || 0);
    second = Number(match[6] || 0);
  }

  // UTC-6 local clock -> UTC instant; Africa/Cairo then applies DST rules.
  const instant = new Date(Date.UTC(year, month - 1, day, hour + 6, minute, second));
  return Utilities.formatDate(instant, CONFIG.CAIRO_TIME_ZONE, 'yyyy-MM-dd HH:mm:ss');
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
    'Show Rate (stage-based, unconfirmed)',
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
    const attended = CONFIG.ATTENDED_STAGES.reduce((sum, stage) => sum + (tc[stage] ?? 0), 0);
    const completedMeetings = attended + noShow;
    const showRate = completedMeetings > 0 ? attended / completedMeetings : 0;
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
