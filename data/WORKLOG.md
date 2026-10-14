# Complete Engineering Worklog

This document chronicles all engineering changes, performance fixes, algorithm improvements, and architectural decisions made on the BD Tracker codebase.

---

## Chronological Change History

### 1. Agent Exclusion Architecture
- Configured `EXCLUDED_AGENTS: ['russ', 'george', 'caroline', 'caroline richards']` in [`src/lib/config.ts`](../src/lib/config.ts).
- Added `isExcludedAgent(name)` normalizer with case-insensitive, prefix, and suffix matching.
- Filtered agents during data ingestion in `sheets.ts` and during calculations in `analytics.ts`.

### 2. Canonical Agent Normalization Engine
- Created [`resolveOpener()`](../src/lib/analytics.ts):
  - Resolves PBX extension names (e.g. `"Ben Arthur"`, `"Kaity James"`) to canonical Opener names (`"Ben"`, `"Jane"`).
  - Handles first-name fallbacks and casing differences.
  - Automatically filters out numeric PBX extension channels, front desks, IVRs, and excluded agents.
  - Consolidates all metrics under uniform, clean agent profiles.

### 3. Date Parsing & Live Extraction Upgrades
- Upgraded `parseDateToISO`:
  - Parses Excel numeric date serials (`40000–60000`), 2-digit years (`M/D/YY`), ISO timestamps, and localized date strings.
- Upgraded `fetchBDTrackerData` & `loadLocalActualData`:
  - Dynamically detects column headers (`Date Added`, `Opener`, `Company Name`, `Authorized Person`) across all 8 BD tabs.
  - Added row-scan fallback to ensure no meeting date is ever dropped.

### 4. Zero-Lag Tab Switching & DOM Performance
- Replaced unmount/re-mount cycles with CSS display toggling (`hidden` vs `block`) in [`src/app/page.tsx`](../src/app/page.tsx), enabling **< 1ms / 60 FPS** instant tab switching.
- Added pagination (20 items per page) to [`PeriodicBreakdownTable.tsx`](../src/components/PeriodicBreakdownTable.tsx).
- Wrapped `PeriodicBreakdownTable`, `OpenerTable`, `KpiGrid`, and `CallLogsView` in `React.memo`.

### 5. Google Apps Script In-Sheet Backend Refactor
- Refactored [`apps-script/Code.js`](../apps-script/Code.js) to ES2020+ standards (V8 runtime):
  - Added excluded agent filters (`Russ`, `George`, `Caroline`).
  - Added dynamic Opener column detection.
  - Formatted executive in-sheet summary table and visual charts.

### 6. Later Additions (reconstructed from the current code)
- **Persistence & failover**: `/api/sync` (daily Vercel cron, `CRON_SECRET`) snapshots calls, meetings, tracker counts and agent mappings to Supabase (`supabase_schema.sql`). `/api/dashboard` reads live sources first and only uses Supabase if the live pull throws. Firestore was the earlier store and is now unused.
- **Quota handling**: `errors.ts` detects Google/Supabase rate-limit and quota errors; API routes return a friendly message.
- **Attendance integration**: `attendance.ts` parses the `Attendance` tab (or local French Dashboard workbook), weights P/L1/L2/Q/H codes, and drives present days, adherence and calls-per-present-day.
- **Med B / PPO**: `sheets.ts` detects the `MEDB`/`PPO` checkbox columns; `analytics.ts` computes counts and % of booked.
- **Show-rate definition**: attended = Follow Ups + Contract Sent + Invoice Sent + Onboarded (Temporary Inactive added later, see #10); rate = attended / (attended + No-Show). Pending and dead/inactive rows are excluded.
- **Ultatel department report**: `ultatel.ts` parses the per-agent summary export and synthesizes call records (used only when the Call Logs sheet is empty).
- **Local import**: `/api/upload` + `FileImportModal` replace the local attendance / Ultatel workbooks (local only).
- **Per-person XLSX export**: `exportXlsx.ts`.
- **UI restructure**: tabs are now Team / Trends / Details / Call Logs, with date presets and `localStorage` state caching.

### 7. Sync & Fallback Safety
- `getDashboardRawData()` reports `failedSources`; `/api/dashboard` falls back to the Supabase snapshot when a core source fails.
- `/api/sync` refuses partial pulls (503) and unconfigured Supabase; `saveRawDataToSupabase` checks every response, never deletes before the new rows are in, and persists/restores `med_b` / `ppo` (migration in `supabase_schema.sql`).

### 8. Caching, Auth, Date & Name Matching
- In-memory dataset cache (60 s TTL, refresh throttle, stale-on-error, invalidated by uploads).
- Shared-password auth was added here and later removed (see #10).
- `parseDateToISO` validates ranges and no longer accepts arbitrary text as a date; tracker row-scan skips text columns; contact column no longer resolves to the company column.
- Exclusions and first-name matching are whole-word (`Georgette` ≠ `George`, `Ben` ≠ `Benjamin`); Apps Script exclusion logic updated to match.
- `supabase_schema.sql`: fixed invalid `CREATE POLICY IF NOT EXISTS`; policies now apply to `service_role` only.

### 9. Audit Clean-up
- Call type/outcome normalization, ISO-8601 weeks, timezone-safe working-day count, attendance duplicate handling, memoized name/date/attendance lookups.
- Call Logs rows are loaded on demand (`includeCalls=true`); call log read in 20 000-row chunks; Supabase queries abort on timeout.
- Source warnings (fallback, partial load, missing attendance, undated department report) shown in a dashboard banner.
- Vitest suite (29 tests) and GitHub Actions CI added. Removed Firestore/Firebase code, unused config keys, stray files (installer, scratch text files, `my-dashboard/`, Supabase CLI state).
- New `data/HOW_NUMBERS_WORK.md`.

### 10. Internal Calls, Temporary Inactive, Auth Removal
- `INTERNAL` calls are excluded from every call figure.
- `Temporary Inactive` now counts as a show (`ATTENDED_STAGES`, in the web app and Apps Script).
- The shared-password login (proxy, `/login`, `/api/login`, `/api/logout`, `DASHBOARD_PASSWORD`) was removed at the owner's request; `/api/sync` is still protected by `CRON_SECRET`.

### 11. Per-user Accounts, Show Confirmation, Live Updates
- Per-user sign-in (scrypt passwords, signed session cookie, admin / manager / viewer roles, admin Users page, change-password page, `npm run create-user`).
- Shows now require management confirmation in a new **Confirm shows** tab; confirmations and an audit log live in Supabase; "awaiting confirmation" counts on the Show rate card, team cards and tab badge; one-time import for existing show-stage meetings.
- Every show rate uses confirmed shows (`attended ÷ (attended + no-show)`); Dead Leads / No-Show can never be confirmed.
- Live updates: 30 s polling while the tab is visible, 30 s server cache, header shows when the data was actually read.
- New `data/SETUP_USERS_AND_CONFIRMATIONS.md`.

### 12. Duplicate Calls
- Duplicates came from the same calls being in `Call Logs` twice: one copy on the raw export clock (seconds lost, not converted) and one converted to Cairo time. The old import compared only the exact Call ID text, which can differ in precision.
- Calls are now identified and dated from the Call ID timestamp in the sheet import, in the sheet repair menu (`Preview duplicate-call repair`, `Repair duplicate calls`, `Fix call times`) and in the web app (which ignores duplicate rows and shows a banner).
- Correction after checking a real export (`Call Details - 10-12-2026`): one Call ID can appear on several rows (legs), and Ultatel counts each row. The first version collapsed them (Selene 477 instead of 482). Identity now includes Type, Outcome and Duration, only differing-clock copies are removed, and the import adds rows only beyond what the sheet already holds. Re-importing the export fills in any legs the old import skipped.

### 13. Day boundary
- Five agents matched the export exactly while two (Norman, Rick) were higher. Likely cause: the sheet stores Cairo time, so evening-before calls after 3:00 pm Ultatel time count as the next Cairo day. The web app now assigns days on Ultatel's clock by default (`CALL_DAY_TIMEZONE`, default `Etc/GMT+6`; set `Africa/Cairo` to restore the previous behaviour).

### 14. "+" copies and Duration (sec)
- A Call Logs dump showed copies of the same calls with To written `+16156173189` vs `16156173189` (and a Duration (sec) column that read `0:37` as 37 minutes). That inflated Norman (130 vs 78) and Rick (128 vs 125). Phone numbers are now compared by last 10 digits, copies are recognised by any difference in how the row is written, durations come from the Duration text, and the repair recomputes Duration (sec).

### 15. Apps Script speed
- `Preview duplicate-call repair` timed out on the full Call Logs: the code asked Apps Script for a time-zone conversion several times per row (tens of thousands of slow service calls). Time zone and Cairo offset are now looked up once per run / once per hour of data, and rows are compared using the text shown in the cells (two bulk reads). A 50,000-row simulation makes about 210 conversion calls and computes in about 2 s locally.

### 16. Monthly archive
- `Call Logs` had ~49,500 rows and kept growing. New menu item **Archive closed months** moves calls older than 45 days into `Call Logs YYYY-MM` tabs (backup first, rows removed only after the archive tabs are confirmed). Imports and reconciliation also look at the archive tabs of the months an export touches. The web app reads archive tabs only when the requested date range reaches them, caches them for an hour, and reports unreadable archives in the banner.

### 17. Dashboard upload + automatic archiving
- Call exports are uploaded from the dashboard (CSV or Excel): the server parses them, splits them so rows of one call stay together, and posts them to an Apps Script web app that imports under a script lock using the same rules as the Import Staging menu (duplicates skipped, repeated legs kept, archive-aware, per-agent check). Only admins and managers can upload.
- Archiving runs weekly from a time-driven trigger (`Turn ON automatic archiving`), without prompts; imports, repairs and archiving now share a script lock so they cannot overwrite each other.

### 18. CSV in and out
- Import: Ultatel Call Details files can be CSV or Excel (already supported for call exports); the Ultatel per-department summary can now also be a CSV (local use). Export: Actions menu > Export CSV (agent overview, meetings with show confirmation, daily / weekly / monthly performance) and an Export CSV button on the Call Logs tab (respects its search and filters). CSV cells that could run as spreadsheet formulas are neutralised; XLSX export gained Weekly / Monthly sheets and confirmation columns.

### 19. Maintenance buttons
- The Apps Script web app now also runs status, check, repair, archive, fix times, automatic archiving on/off and Opener-name saving; the dashboard exposes them in **Actions > Call log maintenance** and in the upload dialog (repair and re-check; name new agents). Rolling single backup for web repairs.

### 20. Attendance dates without a year
- Checked the real `BD _ French Dashboard 2026.xlsx`: 13 people, 2025-12-28 to 2026-11-28. Reading the file directly worked, but the Google Sheets API (formatted text) returns headers like `12/28` with no year, which parsed to nothing. The attendance read now asks for raw values and, as a safety net, infers the year from text headers.

---

## Documentation Manifest in `data/`

- [`data/AGENT_METHODOLOGY.md`](AGENT_METHODOLOGY.md) — Comprehensive guide on agent mapping, normalization rules, and exclusion logic.
- [`data/PROJECT_OVERVIEW.md`](PROJECT_OVERVIEW.md) — System architecture, data flow diagram, formulas, and directory structure.
- [`data/MANUAL_AUDIT.md`](MANUAL_AUDIT.md) — Step-by-step verification checklist.
- [`data/SETUP_USERS_AND_CONFIRMATIONS.md`](SETUP_USERS_AND_CONFIRMATIONS.md) — Accounts, show confirmations, env vars, first admin.
- [`data/HOW_NUMBERS_WORK.md`](HOW_NUMBERS_WORK.md) — How every number is recorded, read and calculated.
- [`data/AUDIT_FINDINGS.md`](AUDIT_FINDINGS.md) — Audit results and resolution status.
- [`data/WORKLOG.md`](WORKLOG.md) — Full engineering changelog and decision log.

## 21. Local-time exports
- Ultatel exports now come in local time. `CALL_DAY_TIMEZONE` defaults to `Africa/Cairo` (the sheet's own clock), so the app reads written call times as they are.
- Call exports have a "Times in the file are in" choice (local time / old UTC-6 clock) that the web app sends to the Apps Script (`clock`). Rows whose Call ID holds a real timestamp are recognised on either clock automatically; the choice only decides rows without one.
- Pre-July history cannot be re-exported. It is already stored in Cairo time; **Call log maintenance > Repair duplicates / fix times** corrects any straggler still on the old clock.
- Re-uploading July to today is safe: rows already in the sheet are skipped (identity ignores the clock), missing ones are added with their local time.

## 22. Big call exports upload in parts
- A large export hit Vercel's 60 s limit and the browser showed "Unexpected token 'A'… is not valid JSON" (Vercel's plain-text timeout page). `/api/upload` now stops after about 35 s and returns `nextChunk`; the dashboard sends the file again from that part and adds the totals up. Safe to repeat: rows already in the sheet are skipped. Non-JSON replies now show a readable message.

## 23. Replace mode for re-uploaded history
- Upload window option "Replace what the sheet has for the dates in this file". For the file's period, rows in `Call Logs` and the month archive tabs that the file does not hold (per call-row key, rows beyond the file's count) are removed. Needs a confirmation click. Each affected tab is first copied to a hidden tab `Backup <MMDDHHMM> <tab>`; if the copy fails nothing is removed. Delete backups manually once satisfied. Rows outside the file's first and last call time are never touched. Import window also scrolls inside the screen and shortens long check results.

## 24. Replace mode split into steps
- Doing the removal inside every import part made the first request exceed the 55 s limit ("operation was aborted due to timeout"). Replace mode now runs as: (1) import with the per-part check skipped, (2) `replacePlan` lists the tabs holding calls in the file's period, then one `replaceTab` request per tab (backup copy first, then removal; only the call-identifying columns are sent), (3) a final verifying import, which also produces the check. Each step can be repeated safely.

## 25. Replace mode cleans in the background
- Even one tab per request could exceed a web request's time. The upload now sends the file's call-identifying columns once (`replaceStart`); the sheet stores them in a hidden `Replace Job` tab and a time-driven trigger (`replaceJobRun_`, up to 6 minutes) backs up and cleans every affected tab. The dashboard polls `replaceStatus` (via `/api/sheet`) every 5 s, then runs the verifying import. A stalled job is reported as an error after 12 minutes; tabs already cleaned stay cleaned and backed up.

## 26. Ignore agents
- Typing `ignore` (or `-`) as the Opener of an agent in Agent Mapping (or in the "Agents without an Opener name" boxes) hides that agent from every number. Non-destructive and reversible: change the Opener back to restore. Used for people in an export who are not on the BD team.

## 27. Clearer import check
- A failed check now shows, next to each "not in the export" row, what the file holds for that same call, and lists calls the file has that the sheet is missing ("missing from the sheet"). Redeploy the Apps Script web app to get it.

## 28. Call ID rounding in the sheet (root cause of the leftover import differences)
- Sheets can show a numeric Call ID such as `1784653605.786` as `1784653606` (number format without decimals). Reading the displayed text moved the timestamp inside the ID by a second, so about half of the rows never matched the export: re-uploading a file added them again (+N duplicates), and the check listed the pairs as "not in the export" / "missing from the sheet". The Apps Script now reads the Call ID column from the cell's real value (`getDisplayExact_`) everywhere it compares rows (import, check, repair, archive, replace). The web app already read unformatted values. After deploying, upload the file once with **Replace** ticked to remove the duplicates from the earlier re-uploads.

## 29. Daily upload reminder
- `/api/dashboard` returns `latestCallDate` and `missingUploadDay`. When the newest call in the sheet is older than the last working day (Mon-Fri; Friday's file is due on Monday, in the call-day time zone), admins and managers see a banner with an "Upload now" button. Logic in `src/lib/uploadReminder.ts` (tested). Holidays are not known, so a weekday holiday still shows the reminder.

## 30. Replace counts across tabs
- A call can sit both in `Call Logs` and in a month archive tab (an import adds to the active log while the original was already archived). The clean-up now shares its per-call counts across the tabs it processes, so only as many rows as the file holds are kept in total.

## 31. Daily totals (Total Calls Per Extension) replace per-call uploads
- New upload type: Ultatel's "Total Calls Per Extension" report (CSV/Excel; one row per extension: Out/In Answered/Unanswered, total, duration, ACD, department). The file has no date: it is taken from the file name (`..._JULY_1`), or from the two date boxes in the upload window. One date = one day; two dates = a period whose totals are spread evenly over its Monday-Friday days (weekly/monthly totals exact, daily approximate). Several single-day files can be selected at once. Uploading a day again replaces that day.
- Stored in the sheet tab `Daily Totals` (Apps Script action `importDaily`, `importDays_`). The web app reads it (`fetchDailyTotals`) and turns each row into weighted call records (`CallRecord.weight`), so all formulas are unchanged. For days covered by daily totals, per-call rows are ignored (no double counting). Per-call exports and the Call Logs sheet still work for days without daily totals.
- Agents whose department is not Business Development (OPS, Fulfillment, BOO, …) are left out unless given an Opener name in Agent Mapping; blank department stays in. New BD/blank-department agents are added to Agent Mapping.
- Supabase fallback snapshot stores per-call rows only; daily totals are not in it.

## 32. Dates inside the report
- The Total Calls Per Extension report now carries "Date from / Date to" cells above the table. The upload reads them (a month file is spread over its working days); dates typed in the upload window override them; the file name is the last resort. The window no longer pre-fills a date from the file name.

## 33. One-extension Date Distribution reports
- "Total Calls Per Extension ( 103 ) - Date Distribution" (one extension, a row per real day, extension number in the title) is read too. The sheet resolves "103" to the full "103 (MMS-Name)" from Daily Totals or the Call Logs extension column; an unknown number asks for an all-extensions report first. Rows are now replaced per day AND extension (previously per day), and a period spread never overwrites a real daily row (reported as "kept").

## 34. Totals tab
- New sheet tab `Totals` (rebuilt after every daily-totals upload, also via the `rebuildTotals` action): one line per agent with calls per month, total calls, out/in answered/unanswered, connection %, talk time and days with data, and an ALL AGENTS line right under the headings. Plain values, not formulas. `Daily Totals` holds the data (one row per day and extension); `Call Logs` and its month archives stay untouched as the fallback for days that have no daily totals.

## 35. Clean-up after the move to daily totals
- Removed the call-by-call upload path: Apps Script `importCallRows_`, `processStagingImport`, the Import Staging tab/menu, the import check (`reconcileImportData_`), replace mode and its background job/backups, `collectLogRowsDisplay_`, `effectiveCounts_`, `toCairoDate_`; web `sendRowsToSheet`, `startReplace`, `chunkRowsByCall`, the call-export file reader and its API branch. The upload window now only takes Total Calls Per Extension reports (with optional dates) and keeps the Opener-name entry for new agents.
- Kept: reading `Call Logs` (and archives) as a fallback, its repair/archive/fix-times tools, local attendance/department workbook uploads, the upload reminder, the `ignore` Opener.
- Tabs to delete by hand in the spreadsheet: `Import Staging`, hidden `Backup …` tabs, `Replace Job`.

## 36. Calls outside the four columns
- A report's Total Calls can exceed Out/In Answered + Unanswered (other outcomes such as busy/failed). The dashboard now counts the difference as calls (type/outcome `OTHER`: in Calls and Calls per day, not in answered, unanswered, out or in), so its Calls figure equals Ultatel's Total Calls. The Totals tab already used the Total Calls column. Period spreads keep the difference too.

## 37. Totals tab readability
- The Totals tab now groups by Opener name (as the dashboard does; "Kaity James" shows under "Jane", with the Ultatel name next to it), leaves out agents whose Opener is `ignore`, writes month headings as text (Sheets was turning them into dates), drops the empty Department column and adds a "This week" column (Monday to the newest day with data) for comparing with the dashboard.
- Checked a real copy of the sheet: every Daily Totals row has Total Calls = the four columns added up, so the "Calls outside the four columns" change (36) did not apply there; it stays as a harmless safeguard.

## 38. Sheet formatting
- `Totals`: navy title bar, one heading colour per block (names / months / this week / totals / rates), medium dividers between blocks, banded rows, green "this week" column, highlighted ALL AGENTS line, connection rate red under 60% and green from 80%, gridlines hidden, frozen headings.
- `Daily Totals`: coloured headings per block, each day shaded in alternating tints (clear day boundaries), thin row lines and medium block dividers, Total Calls in bold, period-spread rows in orange in the Source column, filter on the heading row, sensible column widths.
- Applied after every upload and by the sheet menu item **Rebuild Totals + format tabs** (also the `rebuildTotals` action).
