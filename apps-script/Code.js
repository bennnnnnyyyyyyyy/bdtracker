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
    .addItem('Archive closed months now', 'archiveClosedMonths')
    .addItem('Turn ON automatic archiving (weekly)', 'enableAutoArchive')
    .addItem('Turn OFF automatic archiving', 'disableAutoArchive')
    .addItem('Automatic archiving status', 'autoArchiveStatus')
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
 * Rows are only removed from the active tab after every archived row is confirmed to be in its archive tab.
 * @param {{interactive: boolean}} opts interactive = ask for confirmation and save a hidden backup first
 * @returns {{moved: number, kept: number, months: string[], skipped?: string}}
 */
function runArchive_(opts) {
  const ui = opts.interactive ? SpreadsheetApp.getUi() : null;
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const callLog = ss.getSheetByName(CONFIG.CALL_LOG_SHEET);
  if (!callLog || callLog.getLastRow() < 2) {
    if (ui) ui.alert('Call Logs is empty.');
    return { moved: 0, kept: 0, months: [], skipped: 'Call Logs is empty' };
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
    if (ui) ui.alert(`Nothing to archive: every call is newer than ${CONFIG.ARCHIVE_KEEP_DAYS} days.`);
    return { moved: 0, kept: keep.length, months: [], skipped: 'nothing older than the keep window' };
  }

  const months = Array.from(byMonth.keys()).sort();
  if (ui) {
    const summary = months.map(k => `  ${archiveTabName_(k)}: ${byMonth.get(k).length} rows`).join('\n');
    const answer = ui.alert(
      'Archive closed months?',
      `${moving} call rows older than ${CONFIG.ARCHIVE_KEEP_DAYS} days will move out of "${CONFIG.CALL_LOG_SHEET}":\n${summary}\n\n${keep.length} rows stay in the active tab. A hidden backup is saved first.`,
      ui.ButtonSet.OK_CANCEL
    );
    if (answer !== ui.Button.OK) return { moved: 0, kept: keep.length, months: [], skipped: 'cancelled' };

    const stamp = Utilities.formatDate(new Date(), CONFIG.CAIRO_TIME_ZONE, 'yyyy-MM-dd HHmm');
    callLog.copyTo(ss).setName(`Call Logs backup ${stamp}`).hideSheet();
  }

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
    const msg = `Archive stopped before changing "${CONFIG.CALL_LOG_SHEET}": could not confirm rows in ${problems.join(', ')}. Nothing was removed.`;
    if (ui) ui.alert(msg + ' Check the archive tabs and try again.');
    throw new Error(msg);
  }

  callLog.getRange(2, 1, callLog.getLastRow() - 1, numCols).clearContent();
  if (keep.length > 0) callLog.getRange(2, 1, keep.length, numCols).setValues(keep);

  if (ui) {
    ui.alert(`Archived ${moving} rows into ${months.length} monthly tab(s). "${CONFIG.CALL_LOG_SHEET}" now has ${keep.length} rows.\n\nThe dashboard reads archive tabs automatically when you choose a date range that reaches those months.`);
  }
  return { moved: moving, kept: keep.length, months };
}

/** Menu item: archive now, with a confirmation and a hidden backup. */
function archiveClosedMonths() {
  withLock_(() => runArchive_({ interactive: true }));
}

/**
 * Runs from the weekly trigger (no UI, no backup copy: rows are removed only after the archive tabs are
 * verified). Skips quietly when an import or repair is running; the next run catches up. The result is
 * stored so "Automatic archiving status" can show it.
 */
function archiveClosedMonthsAuto() {
  const props = PropertiesService.getScriptProperties();
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(30000)) {
    props.setProperty('ARCHIVE_LAST_RUN', JSON.stringify({ at: new Date().toISOString(), ok: true, note: 'skipped: sheet busy, will retry next run' }));
    return;
  }
  try {
    const r = runArchive_({ interactive: false });
    props.setProperty('ARCHIVE_LAST_RUN', JSON.stringify({ at: new Date().toISOString(), ok: true, moved: r.moved, kept: r.kept, months: r.months, note: r.skipped || '' }));
  } catch (err) {
    props.setProperty('ARCHIVE_LAST_RUN', JSON.stringify({ at: new Date().toISOString(), ok: false, error: String(err && err.message ? err.message : err) }));
    throw err; // shows up in the Apps Script "Executions" list and failure notification emails
  } finally {
    lock.releaseLock();
  }
}

/** Menu item: schedule automatic archiving every Sunday at 03:00 (sheet time zone). Safe to run repeatedly. */
function enableAutoArchive() {
  disableAutoArchive_();
  ScriptApp.newTrigger('archiveClosedMonthsAuto').timeBased().onWeekDay(ScriptApp.WeekDay.SUNDAY).atHour(3).create();
  SpreadsheetApp.getUi().alert(`Automatic archiving is ON: every Sunday around 03:00, calls older than ${CONFIG.ARCHIVE_KEEP_DAYS} days move into monthly "Call Logs YYYY-MM" tabs.\n\nUse "Automatic archiving status" to see the last result.`);
}

function disableAutoArchive_() {
  let removed = 0;
  ScriptApp.getProjectTriggers().forEach(t => {
    if (t.getHandlerFunction() === 'archiveClosedMonthsAuto') {
      ScriptApp.deleteTrigger(t);
      removed++;
    }
  });
  return removed;
}

/** Menu item: stop automatic archiving. */
function disableAutoArchive() {
  const removed = disableAutoArchive_();
  SpreadsheetApp.getUi().alert(removed > 0 ? 'Automatic archiving is OFF.' : 'Automatic archiving was not on.');
}

/** Menu item: whether automatic archiving is on and what the last run did. */
function autoArchiveStatus() {
  const on = ScriptApp.getProjectTriggers().some(t => t.getHandlerFunction() === 'archiveClosedMonthsAuto');
  const raw = PropertiesService.getScriptProperties().getProperty('ARCHIVE_LAST_RUN');
  let last = 'No automatic run yet.';
  if (raw) {
    const r = JSON.parse(raw);
    last = r.ok
      ? `Last run ${r.at}: ${r.moved ? `${r.moved} rows moved into ${r.months.join(', ')}; ${r.kept} stay active.` : (r.note || 'nothing to move.')}`
      : `Last run ${r.at} FAILED: ${r.error}`;
  }
  SpreadsheetApp.getUi().alert(`Automatic archiving is ${on ? 'ON (every Sunday ~03:00)' : 'OFF'}.\n\n${last}`);
}

/**
 * After an import: compares, per agent, how many rows the export had with how many rows Call Logs now holds
 * for the same period (by Call ID timestamp), so any mismatch is visible straight away.
 * @param {unknown[][]} stagedRows the export rows that were imported
 * @returns {{ok: boolean, problems: string[]}}
 */
function reconcileImportData_(stagedRows, stagedDisp) {
  const expected = new Map();
  const exportKeyCount = new Map();
  let minEpoch = Infinity;
  let maxEpoch = -Infinity;
  stagedRows.forEach((r, i) => {
    const epoch = callEpoch_(r[1]);
    if (epoch === null) return;
    minEpoch = Math.min(minEpoch, epoch);
    maxEpoch = Math.max(maxEpoch, epoch);
    const agent = parseAgentName_(String(r[4] ?? '')) || '(no agent)';
    expected.set(agent, (expected.get(agent) ?? 0) + 1);
    const key = callRowKey_(stagedDisp[i], stagedDisp[i][0]);
    exportKeyCount.set(key, (exportKeyCount.get(key) ?? 0) + 1);
  });
  if (expected.size === 0) return { ok: true, problems: [] };

  SpreadsheetApp.flush();
  const actual = new Map();
  const sheetKeyCount = new Map();
  const extras = new Map(); // agent -> sheet rows beyond what the export holds
  collectLogRowsDisplay_(minEpoch, maxEpoch).forEach(r => {
    const epoch = callEpoch_(r[1]);
    if (epoch === null || epoch < minEpoch || epoch > maxEpoch) return;
    const agent = parseAgentName_(String(r[4] ?? '')) || '(no agent)';
    actual.set(agent, (actual.get(agent) ?? 0) + 1);
    const key = callRowKey_(r, r[0]);
    const n = (sheetKeyCount.get(key) ?? 0) + 1;
    sheetKeyCount.set(key, n);
    if (n > (exportKeyCount.get(key) ?? 0)) {
      if (!extras.has(agent)) extras.set(agent, []);
      extras.get(agent).push(`${exportKeyCount.has(key) ? 'extra copy' : 'not in the export'}: ${r[0]} id ${r[1]} to ${r[3]} ${r[8]} ${r[9]} ${r[10]}`);
    }
  });

  const problems = [];
  expected.forEach((n, agent) => {
    const got = actual.get(agent) ?? 0;
    if (got === n) return;
    const examples = (extras.get(agent) ?? []).slice(0, 4).join(' | ');
    problems.push(`${agent}: export ${n}, Call Logs ${got} (${got - n > 0 ? '+' : ''}${got - n})${examples ? ' - ' + examples : ''}`);
  });
  return { ok: problems.length === 0, problems };
}

/** Message lines for the result of reconcileImportData_. */
function formatReconcile_(check) {
  return check.ok
    ? '\n• Check: every agent matches the export exactly.'
    : '\n• CHECK FAILED - Call Logs differs from the export for this period:\n   ' + check.problems.join('\n   ') +
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

  if (!ss.getSheetByName(CONFIG.CALL_LOG_SHEET) || !ss.getSheetByName(CONFIG.MAPPING_SHEET)) {
    SpreadsheetApp.getUi().alert('Required tabs missing. Please run "1. Setup / Reset Tabs" first.');
    return;
  }

  if (!staging) {
    SpreadsheetApp.getUi().alert(
      `"${CONFIG.STAGING_SHEET}" tab not found.\n\nClick "BD Call Dashboard > 1. Create / Open Staging Tab" to prepare an import tab.\n\n(Normally exports are uploaded from the web dashboard instead.)`
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

  const result = withLock_(() => importCallRows_(rawRows, stagingDisp));

  // Delete the staging tab completely after finishing
  try {
    ss.deleteSheet(staging);
  } catch (err) {
    console.warn('Could not delete staging sheet, clearing content instead:', err);
    staging.clear();
  }

  let message = `✅ Import Complete:\n• ${result.imported} new call(s) imported into Call Logs.`;
  if (result.duplicates > 0) {
    message += `\n• ${result.duplicates} duplicate call(s) detected and skipped.`;
  }
  if (result.newAgents.length > 0) {
    message += `\n• ${result.newAgents.length} new agent(s) added to Agent Mapping. Please assign their Opener names.`;
  }
  message += `\n• Staging tab removed.`;
  message += formatReconcile_(result.check);

  SpreadsheetApp.getUi().alert(message);

  refreshDashboard();
}

// ==========================================
// WEB APP: call-export upload from the dashboard
// ==========================================

// ==========================================
// WEB APP: maintenance actions offered as buttons in the dashboard
// ==========================================

/** Rows in a tab (without the header). */
function rowCount_(sheet) {
  return Math.max(0, sheet.getLastRow() - 1);
}

/** Agents in Agent Mapping that still have no Opener name. Excluded people are never listed. */
function unmappedAgents_() {
  const mapping = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(CONFIG.MAPPING_SHEET);
  if (!mapping || mapping.getLastRow() < 2) return [];
  return mapping.getRange(2, 1, mapping.getLastRow() - 1, 2).getValues()
    .filter(r => String(r[0] ?? '').trim() && !String(r[1] ?? '').trim() && !isExcludedAgent_(r[0]))
    .map(r => String(r[0]).trim());
}

/**
 * State of the call log for the dashboard's maintenance panel.
 * @param {boolean} withCheck also count duplicates / wrong times (reads the whole active log)
 */
function sheetStatus_(withCheck) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const callLog = ss.getSheetByName(CONFIG.CALL_LOG_SHEET);
  const archives = ss.getSheets()
    .map(sh => sh.getName())
    .filter(name => /^Call Logs \d{4}-\d{2}$/.test(name))
    .sort()
    .map(name => ({ tab: name, rows: rowCount_(ss.getSheetByName(name)) }));
  const on = ScriptApp.getProjectTriggers().some(t => t.getHandlerFunction() === 'archiveClosedMonthsAuto');
  const raw = PropertiesService.getScriptProperties().getProperty('ARCHIVE_LAST_RUN');
  const status = {
    activeRows: callLog ? rowCount_(callLog) : 0,
    archives,
    keepDays: CONFIG.ARCHIVE_KEEP_DAYS,
    autoArchive: { on, last: raw ? JSON.parse(raw) : null },
    unmappedAgents: unmappedAgents_()
  };
  if (withCheck) {
    const plan = buildRepairedCallLog_();
    status.check = plan ? { duplicates: plan.duplicates, redated: plan.redated, rowsAfter: plan.rows.length } : { duplicates: 0, redated: 0, rowsAfter: 0 };
  }
  return status;
}

/** Sets the Opener name for agents in Agent Mapping. */
function setMapping_(entries) {
  const mapping = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(CONFIG.MAPPING_SHEET);
  if (!mapping || mapping.getLastRow() < 2) throw new Error('Agent Mapping is empty.');
  const range = mapping.getRange(2, 1, mapping.getLastRow() - 1, 2);
  const values = range.getValues();
  let updated = 0;
  entries.forEach(e => {
    const agent = String((e && e.agent) || '').trim();
    const opener = String((e && e.opener) || '').trim().slice(0, 60);
    if (!agent || !opener) return;
    values.forEach(row => {
      if (String(row[0]).trim() === agent) { row[1] = opener; updated++; }
    });
  });
  range.setValues(values);
  return { updated };
}

/** Runs a maintenance action asked for by the dashboard. Everything that edits the log holds the script lock. */
function runSheetAction_(body) {
  switch (body.action) {
    case 'status':
      return sheetStatus_(false);
    case 'check':
      return withLock_(() => sheetStatus_(true), 50000);
    case 'repair':
      return withLock_(() => ({ repair: runRepair_({ interactive: false }), status: sheetStatus_(false) }), 50000);
    case 'archive':
      return withLock_(() => ({ archive: runArchive_({ interactive: false }), status: sheetStatus_(false) }), 50000);
    case 'fixTimes':
      return withLock_(() => {
        const callLog = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(CONFIG.CALL_LOG_SHEET);
        if (!callLog || callLog.getLastRow() < 2) return { changed: 0 };
        const range = callLog.getRange(2, 1, callLog.getLastRow() - 1, 2);
        const values = range.getValues();
        const shown = range.getDisplayValues();
        let changed = 0;
        const out = values.map((row, i) => {
          if (callEpoch_(shown[i][1]) === null) return [row[0]];
          const exact = exactCairoTime_(shown[i][0], shown[i][1]);
          if (sameCairoTime_(shown[i][0], exact)) return [row[0]];
          changed++;
          return [exact];
        });
        range.offset(0, 0, out.length, 1).setValues(out);
        return { changed };
      }, 50000);
    case 'autoArchiveOn':
      disableAutoArchive_();
      ScriptApp.newTrigger('archiveClosedMonthsAuto').timeBased().onWeekDay(ScriptApp.WeekDay.SUNDAY).atHour(3).create();
      return { status: sheetStatus_(false) };
    case 'autoArchiveOff':
      disableAutoArchive_();
      return { status: sheetStatus_(false) };
    case 'setMapping':
      return withLock_(() => ({ ...setMapping_(Array.isArray(body.entries) ? body.entries.slice(0, 200) : []), status: sheetStatus_(false) }), 50000);
    default:
      throw new Error('Unknown action');
  }
}

function jsonOut_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

function safeEqual_(a, b) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

/**
 * Receives call-export rows from the web dashboard and adds them to Call Logs with exactly the same rules as
 * the Import Staging menu (duplicates skipped, repeated legs kept, archive-aware, per-agent check).
 *
 * Setup (once): Project Settings > Script properties > add IMPORT_SECRET (a long random string), then
 * Deploy > New deployment > Web app (Execute as: Me, Who has access: Anyone). Put the web app URL and the same
 * secret in the dashboard's IMPORT_WEBHOOK_URL / IMPORT_WEBHOOK_SECRET settings. The secret is what protects it.
 *
 * Request body (JSON): { secret, action: 'ping' | 'status' | 'check' | 'repair' | 'archive' | 'fixTimes' |
 * 'autoArchiveOn' | 'autoArchiveOff' | 'setMapping' (entries: [{agent, opener}]) } or
 * { secret, action: 'import', rows: string[13][] }
 */
function doPost(e) {
  try {
    const body = JSON.parse((e && e.postData && e.postData.contents) || '{}');
    const expected = PropertiesService.getScriptProperties().getProperty('IMPORT_SECRET') || '';
    if (!expected || !safeEqual_(String(body.secret || ''), expected)) {
      return jsonOut_({ ok: false, error: 'Unauthorized' });
    }
    if (body.action === 'ping') return jsonOut_({ ok: true, pong: true });
    if (body.action !== 'import') return jsonOut_({ ok: true, ...runSheetAction_(body) });
    if (!Array.isArray(body.rows)) return jsonOut_({ ok: false, error: 'Bad request' });
    if (body.rows.length > 12000) return jsonOut_({ ok: false, error: 'Too many rows in one request (max 12000)' });

    const width = CONFIG.RAW_HEADERS.length;
    const rows = body.rows.map(r => {
      const row = [];
      for (let i = 0; i < width; i++) row.push(r && r[i] !== undefined && r[i] !== null ? String(r[i]) : '');
      return row;
    });
    const display = rows.map(r => r.slice());
    const clock = body.clock === 'ultatel' ? 'ultatel' : 'local';
    const result = withLock_(() => importCallRows_(rows, display, { clock }), 50000);
    return jsonOut_({ ok: true, ...result });
  } catch (err) {
    return jsonOut_({ ok: false, error: String(err && err.message ? err.message : err) });
  }
}

/**
 * Runs fn while holding the script lock, so an import, an archive run and a repair can never edit Call Logs at
 * the same time (which could lose rows).
 * @template T
 * @param {() => T} fn
 * @param {number} [waitMs]
 * @returns {T}
 */
function withLock_(fn, waitMs) {
  const lock = LockService.getScriptLock();
  lock.waitLock(waitMs ?? 120000);
  try {
    return fn();
  } finally {
    lock.releaseLock();
  }
}

/**
 * Adds call rows (13 export columns) to Call Logs, skipping rows the sheet already holds. Used by both the
 * Import Staging menu and the web dashboard upload (doPost). Does no UI work.
 * @param {unknown[][]} rawRows rows as values (mutated: the Call Date becomes Cairo time)
 * @param {string[][]} dispRows the same rows as text, used for comparing (e.g. "0:37")
 * @param {{clock?: 'local'|'ultatel'}} [opts] clock the export's Call Date is written on. 'local' (default, the
 *   export is already in our local/Cairo time) keeps the time as written; 'ultatel' is the old fixed UTC-6 clock
 *   and is converted. Rows whose Call ID holds a real timestamp are recognised on either clock automatically.
 * @returns {{imported: number, duplicates: number, newAgents: string[], check: {ok: boolean, problems: string[]}}}
 */
function importCallRows_(rawRows, dispRows, opts) {
  const exportClock = opts && opts.clock === 'ultatel' ? 'ultatel' : 'local';
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const callLog = ss.getSheetByName(CONFIG.CALL_LOG_SHEET);
  const mapping = ss.getSheetByName(CONFIG.MAPPING_SHEET);
  if (!callLog || !mapping) throw new Error('Call Logs / Agent Mapping tab is missing.');

  // How many rows of each call (see callRowKey_) are already stored: the active Call Logs plus the archive tabs of
  // the months this export touches (so re-importing old data never duplicates archived calls).
  const existingCount = new Map();
  let stagedMin = Infinity;
  let stagedMax = -Infinity;
  dispRows.forEach(d => {
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
    const disp = dispRows[rowIdx];
    const rawText = disp[0] || dateText_(r[0]);
    const callId = String(r[1] ?? '').trim();
    const fromNum = String(r[2] ?? '').trim();
    const toNum = String(r[3] ?? '').trim();
    const extension = String(r[4] ?? '').trim();

    // Skip empty rows
    if (!rawText && !callId && !fromNum && !toNum) return;

    // Local (Cairo) time: the Call ID's timestamp is exact; without one, keep the written time (local export)
    // or convert the old UTC-6 export clock.
    const epoch = callEpoch_(callId);
    if (epoch !== null) r[0] = exactCairoTime_(rawText, callId);
    else if (exportClock === 'ultatel') r[0] = toCairoDate_(r[0]);
    else { const nv = naiveMs_(rawText); r[0] = nv !== null ? formatNaive_(nv) : rawText; }

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

  return {
    imported: toAppend.length,
    duplicates: duplicateCount,
    newAgents: Array.from(newAgents),
    check: reconcileImportData_(rawRows, dispRows)
  };
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

/** True when a written time already says exactly what exactCairoTime_ would write (only the format may differ). */
function sameCairoTime_(text, exact) {
  const naive = naiveMs_(text);
  return naive !== null ? formatNaive_(naive) === exact : text === exact;
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
    if (sameCairoTime_(text, exact)) return [row[0]];
    changed++;
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
      // Rewrite only times that are really wrong; a time that is already right keeps its cell as it is.
      if (!sameCairoTime_(text, exact)) {
        redated++;
        out[0] = exact;
      }
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
  withLock_(repairCallLogsLocked_);
}

function repairCallLogsLocked_() {
  const ui = SpreadsheetApp.getUi();
  const result = runRepair_({ interactive: true });
  if (result.skipped) return;
  ui.alert(`Done. ${result.duplicates} duplicate row(s) removed, ${result.redated} call time(s) corrected.\n\nBackup saved as a hidden sheet named "${result.backup}" (right-click any tab > Show hidden sheets).`);
  refreshDashboard();
}

/**
 * Removes duplicate copies from Call Logs and puts times on exact Cairo time.
 * @param {{interactive: boolean}} opts interactive = confirm first and keep a dated backup; otherwise a single
 *   rolling backup sheet ("Call Logs backup (web repair)") is replaced each time so backups never pile up.
 * @returns {{skipped?: string, duplicates: number, redated: number, rows: number, backup?: string}}
 */
function runRepair_(opts) {
  const ui = opts.interactive ? SpreadsheetApp.getUi() : null;
  const plan = buildRepairedCallLog_();
  if (!plan) {
    if (ui) ui.alert('Call Logs is empty.');
    return { skipped: 'Call Logs is empty', duplicates: 0, redated: 0, rows: 0 };
  }
  if (plan.duplicates === 0 && plan.redated === 0) {
    if (ui) ui.alert('Nothing to repair: no duplicate calls and every call time is already exact.');
    return { skipped: 'nothing to repair', duplicates: 0, redated: 0, rows: plan.rows.length };
  }
  if (ui) {
    const answer = ui.alert(
      'Repair Call Logs?',
      `This will remove ${plan.duplicates} duplicate row(s) and correct ${plan.redated} call time(s), leaving ${plan.rows.length} rows.\n\nA backup copy of the sheet is saved first.`,
      ui.ButtonSet.OK_CANCEL
    );
    if (answer !== ui.Button.OK) return { skipped: 'cancelled', duplicates: 0, redated: 0, rows: plan.original };
  }

  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const callLog = ss.getSheetByName(CONFIG.CALL_LOG_SHEET);
  let backupName;
  if (opts.interactive) {
    backupName = `Call Logs backup ${Utilities.formatDate(new Date(), CONFIG.CAIRO_TIME_ZONE, 'yyyy-MM-dd HHmm')}`;
  } else {
    backupName = 'Call Logs backup (web repair)';
    const old = ss.getSheetByName(backupName);
    if (old) ss.deleteSheet(old);
  }
  callLog.copyTo(ss).setName(backupName).hideSheet();

  const numCols = CONFIG.RAW_HEADERS.length + CONFIG.CALL_LOG_EXTRA.length;
  const lastRow = callLog.getLastRow();
  callLog.getRange(2, 1, lastRow - 1, numCols).clearContent();
  callLog.getRange(2, 1, plan.rows.length, numCols).setValues(plan.rows);
  return { duplicates: plan.duplicates, redated: plan.redated, rows: plan.rows.length, backup: backupName };
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
