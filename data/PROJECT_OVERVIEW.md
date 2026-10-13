# BD Call & Pipeline Performance Dashboard — Technical Overview

> For the full trace of how each number is recorded, read and calculated, see [`HOW_NUMBERS_WORK.md`](HOW_NUMBERS_WORK.md).

A business development analytics dashboard (Next.js 16 / React 19 / Tailwind 4 / Recharts) that joins **Ultatel PBX call data**, the **Google Sheets BD Meetings Tracker**, and the **BD French attendance workbook** into per-opener performance metrics.

---

## 1. Core Purpose

For every active opener (BD agent), over a chosen date range, the dashboard reports:

| Metric | Definition (as implemented in `src/lib/analytics.ts`) |
| :--- | :--- |
| **Calls** | Outbound + Inbound call records (`type` = `OUT-Bound` / `IN-Bound`, exact match). |
| **Connection rate** | `answered / calls` (`outcome === 'ANSWERED'`). `answerRate` is identical. |
| **Meetings booked** | Sum of rows across all 8 tracker stage tabs in the range. |
| **Attended (show)** | Meetings confirmed by management (and not in No-Show / Dead Leads). Unconfirmed meetings in `LIKELY_SHOW_STAGES` are reported as *awaiting confirmation*. |
| **No-show** | Rows in the `No-Show` tab. |
| **Show rate (everywhere: openers, periods, Team card, totals)** | `attended / (attended + noShow)`. Unconfirmed meetings and Dead Leads are **not** counted as attended. |
| **Closing rate** | `onboarded / booked`. |
| **Calls per meeting** | `calls / booked`. |
| **Med B / PPO** | Count and `% of booked` of tracker rows whose `MEDB` / `PPO` checkbox column is ticked. |
| **Present days** | Weighted attendance from the Attendance tab (P/L1/L2 = 1, Q = 0.75, H = 0.5) within the range. |
| **Calls per present day** | `calls / presentDays`; falls back to calls per active calendar day when no attendance is found. |
| **Adherence** | `presentDays / Mon–Fri days in range`, capped at 100%. Requires both a start and end date. |

---

## 2. Architecture & Data Flow

```
Ultatel call log (Google Sheet "Call Logs")  ─┐
Agent Mapping tab                            ─┤
BD Tracker sheet (8 stage tabs, MEDB/PPO)    ─┼─► sheets.ts ─► getDashboardRawData()
Attendance tab (or local French Dashboard    ─┤                     │
  workbook)                                  ─┤                     ▼
Local Ultatel dept report (.xlsx, fallback)  ─┘      analytics.ts computeDashboardMetrics()
                                                                    │
            Supabase (emergency fallback, used if the live           ▼
            pull throws or a core source failed) ◄───── /api/sync (daily cron)   GET /api/dashboard ─► page.tsx
```

### Data sources (`src/lib/config.ts`)
- **Call Logs sheet** (`CALL_DASHBOARD_SHEET_ID`): `Call Logs` (A:O, the active log), `Call Logs YYYY-MM` archive tabs created by the sheet menu's *Archive closed months*, and `Agent Mapping` (A:B).
- **BD Tracker sheet** (`BD_TRACKER_SHEET_ID`): tabs `New Meetings`, `Follow Ups`, `Contract Sent`, `Invoice Sent`, `Onboarded`, `No-Show`, `Dead Leads`, `Temporary Inactive`, read as `A1:Z`. Header names are auto-detected (opener, date, company, contact, `MEDB`, `PPO`).
- **Attendance** (`ATTENDANCE_SHEET_ID`, tab `Attendance`, `A1:AT`): copied into the tracker by the French Dashboard Apps Script bridge. Falls back to the local `BD _ French Dashboard 2026 (3).xlsx`.
- **Local Ultatel department report** `OutBound Calls Per Department ( BusinessDevelopmentTeam ).xlsx`: only used when the `Call Logs` sheet returns **zero** calls. It contains per-agent totals, not individual calls, so `ultatel.ts` synthesizes one `CallRecord` per call, **all dated today** (server date). Date filters are therefore not meaningful in this mode (the dashboard shows a warning banner).
- **Supabase** (`agent_mappings`, `meetings`, `calls`, `metadata`; schema in `supabase_schema.sql`): a daily snapshot written by `/api/sync` and read only as a fallback (see above). `meetings` needs the `med_b` / `ppo` columns — run the migration in the schema file.

### Caching
`getDashboardRawData()` keeps the loaded dataset in memory per server instance for `DASHBOARD_CACHE_TTL_SECONDS` (default 30). Concurrent requests share one load; partial loads are never cached; if a reload fails, the last good copy is served with a note; `/api/sync` always loads fresh; `/api/upload` clears the cache.

### Access control, confirmations and live updates
Per-user accounts (`app_users` in Supabase; scrypt-hashed passwords; roles admin / manager / viewer) with a signed session cookie (`AUTH_SECRET`). `src/proxy.ts` blocks every page and API route except `/login`, `/api/auth/login` and `/api/sync` (which keeps `CRON_SECRET`). Admins manage users at `/admin/users`; every signed-in user can change their password at `/account`. Show confirmations live in `show_confirmations` with an append-only audit log. The open dashboard polls every 30 s. Setup steps: [`SETUP_USERS_AND_CONFIRMATIONS.md`](SETUP_USERS_AND_CONFIRMATIONS.md).

### Credentials
`getSheetsClient()` uses, in order: a `google2.json` service-account file in the project root (gitignored), then `GOOGLE_CLIENT_EMAIL` + `GOOGLE_PRIVATE_KEY`. Supabase uses `NEXT_PUBLIC_SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` (or the anon key). `CRON_SECRET` protects `/api/sync` in production.

### Source reporting
`DashboardResponse.dataSourceInfo` tells the UI where each part came from (`source`, `attendanceSource`, `callsSource`), shown in the header.

---

## 3. API Routes

| Route | Method | Purpose |
| :--- | :--- | :--- |
| `/api/dashboard` | GET | Query params `startDate`, `endDate` (YYYY-MM-DD), `opener`, `refresh=true` (force reload, max every 10 s), `includeCalls=true` (adds the raw call rows; only the Call Logs tab asks for them). Pulls live data, computes metrics, returns `DashboardResponse` (`Cache-Control: no-store`). If the live pull throws, or the call logs / BD tracker failed to load, serves the Supabase snapshot instead (noted in `dataSourceInfo.notes`); with no snapshot it shows the partial live data plus a warning. |
| `/api/sync` | GET, POST | Reads live data and writes it to Supabase. Requires `Authorization: Bearer $CRON_SECRET` in production. Returns 503 and leaves the snapshot untouched if any live source failed or calls/meetings are empty; Supabase writes are checked, and old rows are removed only after the new ones are saved. Scheduled daily at 05:00 UTC by `vercel.json`. |
| `/api/auth/login`, `/api/auth/logout`, `/api/auth/password` | POST | Sign in, sign out, change own password. |
| `/api/admin/users`, `/api/admin/users/[id]` | GET, POST, PATCH | Admin only: list, create, edit role / disable / reset password. |
| `/api/confirmations` | POST | Admin/manager: confirm or undo shows (validated against current tracker data). |
| `/api/confirmations/bulk` | POST | Admin: one-time confirmation of existing show-stage meetings. |
| `/api/upload` | POST | Admin/manager. An Ultatel Call Details file (CSV or Excel) is sent to the call-log sheet's Apps Script web app (`IMPORT_WEBHOOK_URL`). Attendance / department workbooks are local-only files. |
| (same route) other workbooks | POST | Local-only (returns 501 on Vercel). Accepts an `.xlsx` (≤ 15 MB), detects Ultatel report vs. attendance workbook and overwrites the corresponding local file. |

---

## 4. UI (`src/app/page.tsx`)

Four tabs, switched by CSS show/hide (no unmount):

| Tab | Component | Content |
| :--- | :--- | :--- |
| **Team** | `AgentDashboardView` | One card per opener with status pill, key metrics, XLSX export (and CSV for each table: Actions > Export CSV; Call Logs tab has its own CSV button). |
| **Trends** | `PeriodicBreakdownTable` (+ `DashboardCharts`) | Daily / Weekly (Mon–Sun) / Monthly drill-downs, paginated 20 per page. |
| **Details** | `OpenerTable` | Full sortable opener table, totals row, CSV export. |
| **Call Logs** | `CallLogsView` | Raw filtered call records with search. |

`Header` provides presets (Today, This week, This month, Last 30 days), custom dates, agent filter, refresh, and the data-source label. `FileImportModal` posts to `/api/upload` (CSV or Excel). `exportXlsx.ts` builds the per-person workbook (*Agent Overview*, *Meeting Pipeline*, *Daily Performance*). Filters and active tab are cached in `localStorage` (`bd-tracker-dashboard-ui-cache-v1`).

---

## 5. Directory Structure

```
├── apps-script/                 # Google Apps Script (clasp project): staging import, Call Logs backfill, in-sheet dashboard
├── data/                        # Docs + local data workbooks (treat spreadsheets as user data)
│   ├── PROJECT_OVERVIEW.md      # This file
│   ├── AGENT_METHODOLOGY.md     # Opener resolution rules
│   ├── MANUAL_AUDIT.md          # Verification checklist
│   ├── SETUP_USERS_AND_CONFIRMATIONS.md  # Accounts, confirmations, env vars
│   ├── HOW_NUMBERS_WORK.md      # How every number is recorded, read and calculated
│   ├── AUDIT_FINDINGS.md        # Audit results and what was fixed
│   └── WORKLOG.md               # Engineering changelog
├── src/
│   ├── proxy.ts                 # Session gate for pages and APIs
│   ├── app/                     # page.tsx, login/, account/, admin/users/, api/{dashboard,sync,upload,auth,admin,confirmations}
│   ├── scripts/ (repo root)     # create-user.ts: create the first admin
│   ├── components/              # Header, KpiGrid, AgentDashboardView, OpenerTable, PeriodicBreakdownTable,
│   │                            #   DashboardCharts, CallLogsView, FileImportModal
│   ├── lib/
│   │   ├── analytics.ts         # Date/duration parsing, resolveOpener, computeDashboardMetrics
│   │   ├── attendance.ts        # Attendance sheet parsing and present-day calculation
│   │   ├── config.ts            # Sheet IDs, tab list, attended stages, excluded agents
│   │   ├── sheets.ts            # Google Sheets / local Excel ingestion, getDashboardRawData()
│   │   ├── ultatel.ts           # Department-report parser and call synthesis
│   │   ├── supabase.ts          # Snapshot save/restore (emergency fallback)
│   │   ├── exportXlsx.ts        # Per-person XLSX export
│   │   ├── session.ts / password.ts / users.ts / api-auth.ts  # accounts and sessions
│   │   ├── meetings.ts / confirmations.ts / stages.ts  # meeting keys and show confirmations
│   │   ├── dashboard-data.ts    # live → snapshot → partial loading + confirmation attach
│   │   └── errors.ts            # Error message / quota detection helpers
│   └── types/dashboard.ts       # Data contracts
├── tests/                       # Vitest unit tests (parsing, opener resolution, attendance, metrics)
├── .github/workflows/ci.yml     # typecheck, lint, test, build
├── supabase_schema.sql          # Fallback database schema
└── vercel.json                  # Daily /api/sync cron
```

---

## 6. Running

`npm run dev` / `npm run build` / `npm run lint` / `npm run typecheck` / `npm test` (Vitest). CI runs all of them on every push. On the project PC use the pinned Node install described in `agents.md`.
