/**
 * @fileoverview BD Call & Pipeline Tracker — In-Sheet Data Intake & Report Mirror
 * 
 * Role:
 * - Daily totals: stores Ultatel "Total Calls Per Extension" reports uploaded from the web dashboard ('Daily Totals')
 *   and keeps the readable 'Totals' tab up to date.
 * - Call Logs: the older per-call log is kept as a fallback; this file still repairs and archives it.
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

  DAILY_TOTALS_SHEET: 'Daily Totals',
  TOTALS_SHEET: 'Totals',
  CALL_LOG_SHEET: 'Call Logs',

  // Closed months move out of 'Call Logs' into tabs named 'Call Logs YYYY-MM' to keep the active log small and fast.
  // The newest ARCHIVE_KEEP_DAYS stay in the active tab so an export that overlaps the boundary can never re-add old calls.
  ARCHIVE_PREFIX: 'Call Logs ',
  ARCHIVE_KEEP_DAYS: 45,
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

  // Time zone of the call times stored in Call Logs (applies Egypt DST rules).
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
    .addItem('Refresh BD Dashboard', 'refreshDashboard')
    .addItem('Rebuild Totals + format tabs', 'rebuildTotalsMenu')
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

  const mapping = getOrCreateSheet_(ss, CONFIG.MAPPING_SHEET);
  writeHeaderIfEmpty_(mapping, ['Call Log Agent Name', 'Opener Name (must match BD tabs)']);

  const dash = getOrCreateSheet_(ss, CONFIG.DASHBOARD_SHEET);
  if (dash.getLastRow() === 0) {
    dash.getRange(1, 1).setValue('BD Dashboard — Click "Refresh BD Dashboard" in the menu to generate.');
  }

  SpreadsheetApp.getUi().alert(
    'Tabs initialized successfully.\n\nUpload Ultatel "Total Calls Per Extension" reports from the web dashboard (Import).'
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

// ==========================================
// MONTHLY ARCHIVE
// ==========================================

/** Name of the archive tab for a month key like "2026-09". */
function archiveTabName_(monthKey) {
  return CONFIG.ARCHIVE_PREFIX + monthKey;
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
  const disp = getDisplayExact_(range);
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

// ---- Daily totals: Ultatel's "Total Calls Per Extension" report (one day, or a period spread over its working days) ----
const DAILY_HEADERS_ = ['Date', 'Extension', 'Agent', 'Department', 'Out Answered', 'Out Unanswered', 'In Answered', 'In Unanswered', 'Total Calls', 'Duration (sec)', 'ACD', 'Uploaded At', 'Source'];

/**
 * Stores per-extension totals for one or more days in the "Daily Totals" tab. Uploading a day again replaces that
 * day's rows (never doubles them). Agents of the Business Development team (or without a department) that are not in
 * Agent Mapping yet are added there so they can be given an Opener name.
 * @param {{date: string, rows: {extension: string, agent: string, department: string, outAnswered: number, outUnanswered: number, inAnswered: number, inUnanswered: number, totalCalls: number, durationSec: number, acd: number}[]}[]} days
 * @param {string} source text saved in the Source column ("daily" or a description of the spread period)
 * @returns {{days: number, rows: number, replaced: number, protectedRows: number, resolved: string, newAgents: string[]}}
 */
function importDays_(days, source) {
  days.forEach(d => { if (!/^\d{4}-\d{2}-\d{2}$/.test(String(d.date))) throw new Error('A report date is missing or invalid.'); });
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = ss.getSheetByName(CONFIG.DAILY_TOTALS_SHEET);
  if (!sheet) {
    sheet = ss.insertSheet(CONFIG.DAILY_TOTALS_SHEET);
    sheet.getRange(1, 1, 1, DAILY_HEADERS_.length).setValues([DAILY_HEADERS_]).setFontWeight('bold');
    sheet.setFrozenRows(1);
  }
  const width = DAILY_HEADERS_.length;
  const dayOf = v => (v instanceof Date ? Utilities.formatDate(v, ssTz_(), 'yyyy-MM-dd') : String(v == null ? '' : v).slice(0, 10));
  const extNo = v => { const m = String(v == null ? '' : v).match(/^\s*(\d+)/); return m ? m[1] : String(v == null ? '' : v).trim(); };
  const existing = sheet.getLastRow() > 1 ? sheet.getRange(2, 1, sheet.getLastRow() - 1, width).getValues() : [];

  // A report of one extension only names the number ("103"): find the full "103 (MMS-Name)" and department.
  const known = new Map();
  existing.forEach(r => { if (/\(MMS-/.test(String(r[1]))) known.set(extNo(r[1]), { extension: String(r[1]), agent: String(r[2]), department: String(r[3]) }); });
  let callLogExtensions = null;
  const lookup = no => {
    if (known.has(no)) return known.get(no);
    if (callLogExtensions === null) {
      callLogExtensions = new Map();
      const log = ss.getSheetByName(CONFIG.CALL_LOG_SHEET);
      if (log && log.getLastRow() > 1) {
        log.getRange(2, 5, log.getLastRow() - 1, 1).getValues().forEach(r => {
          const t = String(r[0] || '');
          if (/\(MMS-/.test(t) && !callLogExtensions.has(extNo(t))) callLogExtensions.set(extNo(t), t);
        });
      }
    }
    const full = callLogExtensions.get(no);
    return full ? { extension: full, agent: parseAgentName_(full), department: '' } : null;
  };
  let resolved = '';
  days.forEach(d => d.rows.forEach(r => {
    if (/\(MMS-/.test(String(r.extension || ''))) return;
    const hit = lookup(extNo(r.extension));
    if (!hit) throw new Error('Extension ' + extNo(r.extension) + ' is not known yet. Upload an all-extensions "Total Calls Per Extension" report once so the sheet learns who it belongs to, then upload this one again.');
    r.extension = hit.extension;
    r.agent = hit.agent;
    r.department = r.department || hit.department;
    resolved = hit.agent || hit.extension;
  }));

  const now = Utilities.formatDate(new Date(), ssTz_(), 'yyyy-MM-dd HH:mm:ss');
  const num = v => { const n = Number(v); return isFinite(n) ? n : 0; };
  const isPeriod = /^period/.test(source);
  // Rows are replaced per day AND extension. A period spread never overwrites a real daily row.
  const existingKeys = new Map();
  existing.forEach(r => existingKeys.set(dayOf(r[0]) + '|' + extNo(r[1]), String(r[12] || '')));
  let protectedRows = 0;
  const added = [];
  days.forEach(d => d.rows.forEach(r => {
    const key = d.date + '|' + extNo(r.extension);
    if (isPeriod && existingKeys.has(key) && !/^period/.test(existingKeys.get(key))) { protectedRows++; return; }
    added.push([
      d.date, String(r.extension || ''), String(r.agent || ''), String(r.department || ''),
      num(r.outAnswered), num(r.outUnanswered), num(r.inAnswered), num(r.inUnanswered),
      num(r.totalCalls), Math.round(num(r.durationSec)), num(r.acd), now, source
    ]);
  }));
  const addedKeys = new Set(added.map(a => a[0] + '|' + extNo(a[1])));
  const kept = existing.filter(r => !addedKeys.has(dayOf(r[0]) + '|' + extNo(r[1]))).map(r => [dayOf(r[0])].concat(r.slice(1)));
  const all = kept.concat(added).sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : String(a[1]).localeCompare(String(b[1]))));
  if (existing.length > 0) sheet.getRange(2, 1, existing.length, width).clearContent();
  if (all.length > 0) {
    sheet.getRange(2, 1, all.length, 2).setNumberFormat('@');
    sheet.getRange(2, 1, all.length, width).setValues(all.map(r => { const row = r.slice(0, width); while (row.length < width) row.push(''); return row; }));
  }

  const mapping = ss.getSheetByName(CONFIG.MAPPING_SHEET);
  const newAgents = [];
  if (mapping) {
    const knownAgents = new Set(mapping.getLastRow() > 1 ? mapping.getRange(2, 1, mapping.getLastRow() - 1, 1).getValues().map(r => String(r[0]).trim()) : []);
    added.forEach(r => {
      const agent = String(r[2] || '').trim();
      const dept = String(r[3] || '').trim();
      if (!agent || knownAgents.has(agent) || isExcludedAgent_(agent)) return;
      if (dept && !/business development/i.test(dept)) return;
      knownAgents.add(agent);
      newAgents.push(agent);
    });
    if (newAgents.length > 0) mapping.getRange(mapping.getLastRow() + 1, 1, newAgents.length, 2).setValues(newAgents.map(a => [a, '']));
  }
  try {
    formatDailyTotalsSheet_(sheet);
    rebuildTotalsSummary_();
  } catch (err) {
    console.error('Formatting/Totals summary failed:', err); // the upload itself succeeded
  }
  return { days: days.length, rows: added.length, replaced: existing.length - kept.length, protectedRows, resolved, newAgents };
}

/** Menu item: rebuild the Totals tab now. */
function rebuildTotalsMenu() {
  withLock_(() => {
    const daily = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(CONFIG.DAILY_TOTALS_SHEET);
    if (daily) formatDailyTotalsSheet_(daily);
    rebuildTotalsSummary_();
  }, 50000);
  SpreadsheetApp.getUi().alert('The Daily Totals and Totals tabs were re-formatted and rebuilt.');
}

/**
 * Rebuilds the easy-to-read "Totals" tab from "Daily Totals": one line per Opener (the names the dashboard uses, so
 * "Kaity James" shows as "Jane") with calls per month, this week and overall figures, and an ALL AGENTS line right
 * under the headings. Agents whose Opener is "ignore" are left out. Plain values (not formulas), rewritten after every
 * upload. Month headings are written as text so Sheets does not turn them into dates.
 */
function rebuildTotalsSummary_() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const src = ss.getSheetByName(CONFIG.DAILY_TOTALS_SHEET);
  if (!src || src.getLastRow() < 2) return;
  const rows = src.getRange(2, 1, src.getLastRow() - 1, 13).getValues();
  const dayOf = v => (v instanceof Date ? Utilities.formatDate(v, ssTz_(), 'yyyy-MM-dd') : String(v == null ? '' : v).slice(0, 10));
  const num = v => { const n = Number(v); return isFinite(n) ? n : 0; };
  const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

  // Opener names from Agent Mapping (agent name or "103 (MMS-Name)" -> opener).
  const openers = new Map();
  const mapping = ss.getSheetByName(CONFIG.MAPPING_SHEET);
  if (mapping && mapping.getLastRow() > 1) {
    mapping.getRange(2, 1, mapping.getLastRow() - 1, 2).getValues().forEach(r => {
      const agent = String(r[0] || '').trim();
      const opener = String(r[1] || '').trim();
      if (agent && opener) { openers.set(agent.toLowerCase(), opener); openers.set(parseAgentName_(agent).toLowerCase(), opener); }
    });
  }

  // The newest day with data decides "this week" (Monday to that day).
  let newest = '0000';
  rows.forEach(r => { const d = dayOf(r[0]); if (/^\d{4}-\d{2}-\d{2}$/.test(d) && d > newest) newest = d; });
  const newestDate = new Date(newest + 'T00:00:00Z');
  const weekStartDate = new Date(newestDate.getTime() - ((newestDate.getUTCDay() + 6) % 7) * 86400000);
  const weekStart = weekStartDate.toISOString().slice(0, 10);

  const monthSet = new Set();
  const groups = new Map();
  const blank = () => ({ months: {}, week: 0, oa: 0, ou: 0, ia: 0, iu: 0, total: 0, sec: 0, days: new Set(), names: new Set() });
  const all = blank();
  let first = '9999';
  const add = (t, month, day, r) => {
    t.months[month] = (t.months[month] || 0) + num(r[8]);
    if (day >= weekStart) t.week += num(r[8]);
    t.oa += num(r[4]); t.ou += num(r[5]); t.ia += num(r[6]); t.iu += num(r[7]);
    t.total += num(r[8]); t.sec += num(r[9]);
    t.days.add(day);
  };
  rows.forEach(r => {
    const day = dayOf(r[0]);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) return;
    const name = String(r[2] || parseAgentName_(String(r[1] || ''))).trim();
    if (!name || isExcludedAgent_(name)) return;
    const opener = openers.get(name.toLowerCase()) || name;
    if (/^(ignore|ignored|-)$/i.test(opener)) return;
    const month = day.slice(0, 7);
    monthSet.add(month);
    if (day < first) first = day;
    if (!groups.has(opener)) groups.set(opener, blank());
    const g = groups.get(opener);
    g.names.add(name);
    add(g, month, day, r);
    add(all, month, day, r);
  });
  const months = Array.from(monthSet).sort();
  const monthLabel = m => MONTHS[Number(m.slice(5, 7)) - 1] + ' ' + m.slice(0, 4);
  const header = ['Agent (Opener)', 'Ultatel name'].concat(months.map(monthLabel), ['This week (' + weekStart + ' to ' + newest + ')', 'Total calls', 'Out answered', 'Out unanswered', 'In answered', 'In unanswered', 'Connection %', 'Talk time (hours)', 'Days with data']);
  const line = (label, names, t) => [label, names].concat(
    months.map(m => t.months[m] || 0),
    [t.week, t.total, t.oa, t.ou, t.ia, t.iu, t.total > 0 ? (t.oa + t.ia) / t.total : 0, Math.round(t.sec / 36) / 100, t.days.size]
  );
  const list = Array.from(groups.entries()).sort((a, b) => b[1].total - a[1].total);
  const body = [line('ALL AGENTS', '', all)].concat(list.map(([opener, g]) => {
    const names = Array.from(g.names).join(', ');
    return line(opener, names.toLowerCase() === opener.toLowerCase() ? '' : names, g);
  }));

  let sheet = ss.getSheetByName(CONFIG.TOTALS_SHEET);
  if (!sheet) sheet = ss.insertSheet(CONFIG.TOTALS_SHEET);
  sheet.clear();
  const width = header.length;
  sheet.getRange(1, 1).setValue('Call totals by agent').setFontWeight('bold').setFontSize(14);
  sheet.getRange(2, 1).setValue('From the "Daily Totals" tab (Ultatel Total Calls Per Extension reports), ' + first + ' to ' + newest + '. Rebuilt after every upload; do not type here. Calls = Total Calls (outgoing + incoming). Agents are shown under their Opener name.');
  sheet.getRange(4, 1, 1, width).setNumberFormat('@').setValues([header]).setFontWeight('bold').setBackground('#e8e8e8').setWrap(true);
  sheet.getRange(5, 1, body.length, width).setValues(body);
  formatTotalsSheet_(sheet, body.length, width, months.length);
}

/**
 * Colours and dividers of the Totals tab: coloured heading per block (names / months / this week / totals / rates),
 * medium vertical lines between the blocks, alternating row shading, a highlighted ALL AGENTS line and red
 * connection rates under 60%.
 */
function formatTotalsSheet_(sheet, bodyRows, width, monthCols) {
  const NAVY = '#1a365d';
  const weekCol = 3 + monthCols;
  const totalCol = weekCol + 1;
  const rateCol = totalCol + 5;
  const last = 4 + bodyRows;

  sheet.setHiddenGridlines(true);
  sheet.setFrozenRows(5);
  sheet.setFrozenColumns(1);
  sheet.setRowHeight(1, 34);
  sheet.setRowHeight(4, 46);

  sheet.getRange(1, 1, 1, width).setBackground(NAVY).setFontColor('#ffffff');
  sheet.getRange(1, 1).setFontWeight('bold').setFontSize(15);
  sheet.getRange(1, 1, 1, width).setVerticalAlignment('middle');
  sheet.getRange(2, 1, 1, width).setBackground('#edf2f7').setFontColor('#4a5568').setFontStyle('italic').setFontSize(9);

  // Heading row, one colour per block.
  const head = sheet.getRange(4, 1, 1, width);
  head.setFontColor('#ffffff').setFontWeight('bold').setHorizontalAlignment('center').setVerticalAlignment('middle').setWrap(true);
  sheet.getRange(4, 1, 1, 2).setBackground(NAVY);
  if (monthCols > 0) sheet.getRange(4, 3, 1, monthCols).setBackground('#2c5282');
  sheet.getRange(4, weekCol, 1, 1).setBackground('#2f855a');
  sheet.getRange(4, totalCol, 1, 5).setBackground(NAVY);
  sheet.getRange(4, rateCol, 1, 3).setBackground('#553c9a');

  // Body: banded rows, numbers right-aligned, formats.
  const body = sheet.getRange(5, 1, bodyRows, width);
  body.setVerticalAlignment('middle').setFontColor('#1a202c');
  const bands = [];
  for (let i = 0; i < bodyRows; i++) bands.push(new Array(width).fill(i === 0 ? '#fff2cc' : (i % 2 === 0 ? '#f4f6f9' : '#ffffff')));
  body.setBackgrounds(bands);
  sheet.getRange(5, 3, bodyRows, width - 2).setHorizontalAlignment('right');
  sheet.getRange(5, 3, bodyRows, monthCols + 6).setNumberFormat('#,##0');
  sheet.getRange(5, rateCol, bodyRows, 1).setNumberFormat('0.0%');
  sheet.getRange(5, rateCol + 1, bodyRows, 1).setNumberFormat('0.0');
  sheet.getRange(5, rateCol + 2, bodyRows, 1).setNumberFormat('0');
  if (bodyRows > 1) sheet.getRange(6, weekCol, bodyRows - 1, 1).setBackground('#e6f4ea');
  sheet.getRange(5, weekCol, 1, 1).setBackground('#d4edda');
  sheet.getRange(5, 1, bodyRows, 1).setFontWeight('bold');
  sheet.getRange(5, 2, bodyRows, 1).setFontColor('#718096').setFontSize(9);
  sheet.getRange(5, totalCol, bodyRows, 1).setFontWeight('bold');
  sheet.getRange(5, 1, 1, width).setFontWeight('bold').setFontSize(11);

  // Dividers: thin grey between rows, medium navy between the blocks, a heavier line under the headings and ALL AGENTS.
  sheet.getRange(4, 1, bodyRows + 1, width).setBorder(null, null, null, null, false, true, '#d9dee5', SpreadsheetApp.BorderStyle.SOLID);
  [3, weekCol, totalCol, rateCol].forEach(c => {
    sheet.getRange(4, c, bodyRows + 1, 1).setBorder(null, true, null, null, null, null, NAVY, SpreadsheetApp.BorderStyle.SOLID_MEDIUM);
  });
  sheet.getRange(4, 1, 1, width).setBorder(true, null, true, null, null, null, NAVY, SpreadsheetApp.BorderStyle.SOLID_MEDIUM);
  sheet.getRange(5, 1, 1, width).setBorder(null, null, true, null, null, null, NAVY, SpreadsheetApp.BorderStyle.SOLID_MEDIUM);
  sheet.getRange(4, 1, bodyRows + 1, width).setBorder(null, null, true, null, null, null, NAVY, SpreadsheetApp.BorderStyle.SOLID_MEDIUM);
  sheet.getRange(4, 1, bodyRows + 1, 1).setBorder(null, true, null, null, null, null, NAVY, SpreadsheetApp.BorderStyle.SOLID_MEDIUM);
  sheet.getRange(4, width, bodyRows + 1, 1).setBorder(null, null, null, true, null, null, NAVY, SpreadsheetApp.BorderStyle.SOLID_MEDIUM);

  // Connection rate: red under 60%, green from 80%.
  const rates = sheet.getRange(6, rateCol, Math.max(1, bodyRows - 1), 1);
  sheet.setConditionalFormatRules([
    SpreadsheetApp.newConditionalFormatRule().whenNumberLessThan(0.6).setFontColor('#c53030').setBold(true).setRanges([rates]).build(),
    SpreadsheetApp.newConditionalFormatRule().whenNumberGreaterThanOrEqualTo(0.8).setFontColor('#2f855a').setBold(true).setRanges([rates]).build()
  ]);

  sheet.setColumnWidth(1, 150);
  sheet.setColumnWidth(2, 160);
  for (let c = 3; c <= width; c++) sheet.setColumnWidth(c, c === weekCol ? 130 : 92);
  sheet.setColumnWidth(rateCol + 2, 80);
}

/**
 * Colours and dividers of the Daily Totals tab: dark heading, each day shaded in alternating tints so day boundaries
 * stand out, thin lines between rows, medium lines between the blocks (day / who / answered / totals / source), the
 * Total Calls column in bold, period-spread rows in orange, and a filter on the heading row.
 */
function formatDailyTotalsSheet_(sheet) {
  const n = sheet.getLastRow() - 1;
  if (n < 1) return;
  const width = DAILY_HEADERS_.length;
  const NAVY = '#1a365d';
  sheet.setFrozenRows(1);
  sheet.setFrozenColumns(2);
  sheet.setRowHeight(1, 34);

  const head = sheet.getRange(1, 1, 1, width);
  head.setFontColor('#ffffff').setFontWeight('bold').setHorizontalAlignment('center').setVerticalAlignment('middle').setWrap(true);
  sheet.getRange(1, 1, 1, 4).setBackground(NAVY);
  sheet.getRange(1, 5, 1, 2).setBackground('#2c5282');
  sheet.getRange(1, 7, 1, 2).setBackground('#2b6cb0');
  sheet.getRange(1, 9, 1, 3).setBackground(NAVY);
  sheet.getRange(1, 10, 1, 2).setBackground('#553c9a');
  sheet.getRange(1, 12, 1, 2).setBackground('#4a5568');

  const body = sheet.getRange(2, 1, n, width);
  const days = sheet.getRange(2, 1, n, 1).getValues();
  const bg = [];
  const fc = [];
  let shade = 0;
  for (let i = 0; i < n; i++) {
    if (i > 0 && String(days[i][0]) !== String(days[i - 1][0])) shade = 1 - shade;
    const row = new Array(width).fill(shade ? '#eaf1fb' : '#ffffff');
    bg.push(row);
    fc.push(new Array(width).fill('#1a202c'));
  }
  body.setBackgrounds(bg).setFontColors(fc).setVerticalAlignment('middle');
  const sources = sheet.getRange(2, 13, n, 1).getValues();
  const srcColors = sources.map(r => [/^period/.test(String(r[0])) ? '#c05621' : '#718096']);
  sheet.getRange(2, 13, n, 1).setFontColors(srcColors).setFontSize(9);
  sheet.getRange(2, 12, n, 1).setFontColor('#718096').setFontSize(9);

  sheet.getRange(2, 1, n, 4).setHorizontalAlignment('left');
  sheet.getRange(2, 5, n, 7).setHorizontalAlignment('right').setNumberFormat('#,##0');
  sheet.getRange(2, 11, n, 1).setNumberFormat('0.00');
  sheet.getRange(2, 9, n, 1).setFontWeight('bold');
  sheet.getRange(2, 1, n, 1).setFontWeight('bold');

  sheet.getRange(1, 1, n + 1, width).setBorder(null, null, null, null, false, true, '#d9dee5', SpreadsheetApp.BorderStyle.SOLID);
  [1, 5, 9, 10, 12].forEach(c => {
    sheet.getRange(1, c, n + 1, 1).setBorder(null, true, null, null, null, null, NAVY, SpreadsheetApp.BorderStyle.SOLID_MEDIUM);
  });
  sheet.getRange(1, 1, n + 1, width).setBorder(true, null, true, true, null, null, NAVY, SpreadsheetApp.BorderStyle.SOLID_MEDIUM);

  const widths = [100, 190, 140, 170, 90, 100, 90, 100, 90, 100, 70, 150, 230];
  widths.forEach((w, i) => sheet.setColumnWidth(i + 1, w));

  try {
    const old = sheet.getFilter();
    if (old) old.remove();
    sheet.getRange(1, 1, n + 1, width).createFilter();
  } catch (err) {
    console.error('Filter failed:', err);
  }
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
        const shown = getDisplayExact_(range);
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
    case 'rebuildTotals':
      return withLock_(() => {
        const daily = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(CONFIG.DAILY_TOTALS_SHEET);
        if (daily) formatDailyTotalsSheet_(daily);
        rebuildTotalsSummary_();
        return {};
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
 * Web app entry point for the dashboard: stores uploaded daily call totals and runs sheet maintenance.
 *
 * Setup (once): Project Settings > Script properties > add IMPORT_SECRET (a long random string), then
 * Deploy > New deployment > Web app (Execute as: Me, Who has access: Anyone). Put the web app URL and the same
 * secret in the dashboard's IMPORT_WEBHOOK_URL / IMPORT_WEBHOOK_SECRET settings. The secret is what protects it.
 *
 * Request body (JSON): { secret, action: 'ping' | 'status' | 'check' | 'repair' | 'archive' | 'fixTimes' |
 * 'autoArchiveOn' | 'autoArchiveOff' | 'rebuildTotals' | 'setMapping' (entries: [{agent, opener}]) } or
 * { secret, action: 'importDaily', days: [{date, rows}], source }
 */
function doPost(e) {
  try {
    const body = JSON.parse((e && e.postData && e.postData.contents) || '{}');
    const expected = PropertiesService.getScriptProperties().getProperty('IMPORT_SECRET') || '';
    if (!expected || !safeEqual_(String(body.secret || ''), expected)) {
      return jsonOut_({ ok: false, error: 'Unauthorized' });
    }
    if (body.action === 'ping') return jsonOut_({ ok: true, pong: true });
    if (body.action === 'importDaily') {
      if (!Array.isArray(body.days) || body.days.length === 0 || body.days.length > 70) return jsonOut_({ ok: false, error: 'Bad request' });
      const source = String(body.source || 'daily').slice(0, 80);
      return jsonOut_({ ok: true, ...withLock_(() => importDays_(body.days, source), 50000) });
    }
    return jsonOut_({ ok: true, ...runSheetAction_(body) });
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

/**
 * Text shown in a range's cells, except that the Call ID column (B) keeps its exact value. Sheets can display a Call ID
 * such as 1784653605.786 as "1784653606" (number format with no decimals), which would change the timestamp inside the ID
 * by a second and make the same call look different from the export.
 * @param {GoogleAppsScript.Spreadsheet.Range} range
 * @returns {string[][]}
 */
function getDisplayExact_(range) {
  const disp = range.getDisplayValues();
  const idIdx = 2 - range.getColumn();
  if (idIdx < 0 || idIdx >= range.getWidth()) return disp;
  const ids = range.offset(0, idIdx, range.getNumRows(), 1).getValues();
  for (let i = 0; i < ids.length; i++) {
    if (typeof ids[i][0] === 'number') disp[i][idIdx] = String(ids[i][0]);
  }
  return disp;
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
  const shown = getDisplayExact_(range);
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
  const allDisp = getDisplayExact_(range);
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
