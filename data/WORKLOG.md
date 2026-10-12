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
- **Show-rate definition**: attended = Follow Ups + Contract Sent + Invoice Sent + Onboarded; rate = attended / (attended + No-Show). Pending and dead/inactive rows are excluded.
- **Ultatel department report**: `ultatel.ts` parses the per-agent summary export and synthesizes call records (used only when the Call Logs sheet is empty).
- **Local import**: `/api/upload` + `FileImportModal` replace the local attendance / Ultatel workbooks (local only).
- **Per-person XLSX export**: `exportXlsx.ts`.
- **UI restructure**: tabs are now Team / Trends / Details / Call Logs, with date presets and `localStorage` state caching.

### 7. Sync & Fallback Safety
- `getDashboardRawData()` reports `failedSources`; `/api/dashboard` falls back to the Supabase snapshot when a core source fails.
- `/api/sync` refuses partial pulls (503) and unconfigured Supabase; `saveRawDataToSupabase` checks every response, never deletes before the new rows are in, and persists/restores `med_b` / `ppo` (migration in `supabase_schema.sql`).

### 8. Caching, Auth, Date & Name Matching
- In-memory dataset cache (60 s TTL, refresh throttle, stale-on-error, invalidated by uploads).
- Shared-password auth via `src/proxy.ts`, `/login`, `/api/login`, `/api/logout` (`DASHBOARD_PASSWORD`); fails closed in production.
- `parseDateToISO` validates ranges and no longer accepts arbitrary text as a date; tracker row-scan skips text columns; contact column no longer resolves to the company column.
- Exclusions and first-name matching are whole-word (`Georgette` ≠ `George`, `Ben` ≠ `Benjamin`); Apps Script exclusion logic updated to match.
- `supabase_schema.sql`: fixed invalid `CREATE POLICY IF NOT EXISTS`; policies now apply to `service_role` only.

---

## Documentation Manifest in `data/`

- [`data/AGENT_METHODOLOGY.md`](AGENT_METHODOLOGY.md) — Comprehensive guide on agent mapping, normalization rules, and exclusion logic.
- [`data/PROJECT_OVERVIEW.md`](PROJECT_OVERVIEW.md) — System architecture, data flow diagram, formulas, and directory structure.
- [`data/MANUAL_AUDIT.md`](MANUAL_AUDIT.md) — Step-by-step verification checklist.
- [`data/AUDIT_FINDINGS.md`](AUDIT_FINDINGS.md) — Known issues, gaps and recommended fixes.
- [`data/WORKLOG.md`](WORKLOG.md) — Full engineering changelog and decision log.
