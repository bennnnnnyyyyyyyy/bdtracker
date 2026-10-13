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

---

## Documentation Manifest in `data/`

- [`data/AGENT_METHODOLOGY.md`](AGENT_METHODOLOGY.md) — Comprehensive guide on agent mapping, normalization rules, and exclusion logic.
- [`data/PROJECT_OVERVIEW.md`](PROJECT_OVERVIEW.md) — System architecture, data flow diagram, formulas, and directory structure.
- [`data/MANUAL_AUDIT.md`](MANUAL_AUDIT.md) — Step-by-step verification checklist.
- [`data/SETUP_USERS_AND_CONFIRMATIONS.md`](SETUP_USERS_AND_CONFIRMATIONS.md) — Accounts, show confirmations, env vars, first admin.
- [`data/HOW_NUMBERS_WORK.md`](HOW_NUMBERS_WORK.md) — How every number is recorded, read and calculated.
- [`data/AUDIT_FINDINGS.md`](AUDIT_FINDINGS.md) — Audit results and resolution status.
- [`data/WORKLOG.md`](WORKLOG.md) — Full engineering changelog and decision log.
