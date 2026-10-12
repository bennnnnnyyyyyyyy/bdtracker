# BD Call & Pipeline Performance Dashboard — Technical Overview

A business development analytics dashboard (Next.js 16 / React 19 / Tailwind 4 / Recharts) that joins **Ultatel PBX call data**, the **Google Sheets BD Meetings Tracker**, and the **BD French attendance workbook** into per-opener performance metrics.

---

## 1. Core Purpose

For every active opener (BD agent), over a chosen date range, the dashboard reports:

| Metric | Definition (as implemented in `src/lib/analytics.ts`) |
| :--- | :--- |
| **Calls** | Outbound + Inbound call records (`type` = `OUT-Bound` / `IN-Bound`, exact match). |
| **Connection rate** | `answered / calls` (`outcome === 'ANSWERED'`). `answerRate` is identical. |
| **Meetings booked** | Sum of rows across all 8 tracker stage tabs in the range. |
| **Attended** | Rows currently in `ATTENDED_STAGES` = Follow Ups, Contract Sent, Invoice Sent, Onboarded. |
| **No-show** | Rows in the `No-Show` tab. |
| **Show rate (per opener, per period)** | `attended / (attended + noShow)`. Meetings still in *New Meetings*, *Dead Leads* or *Temporary Inactive* are **not** counted as attended. |
| **Show rate (org total, KPI card)** | `attended / booked`. Intentional: show rate means clients who showed up to meetings. |
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
- **Call Logs sheet** (`CALL_DASHBOARD_SHEET_ID`): `Call Logs` (A:O) and `Agent Mapping` (A:B).
- **BD Tracker sheet** (`BD_TRACKER_SHEET_ID`): tabs `New Meetings`, `Follow Ups`, `Contract Sent`, `Invoice Sent`, `Onboarded`, `No-Show`, `Dead Leads`, `Temporary Inactive`, read as `A1:Z`. Header names are auto-detected (opener, date, company, contact, `MEDB`, `PPO`).
- **Attendance** (`ATTENDANCE_SHEET_ID`, tab `Attendance`, `A1:AT`): copied into the tracker by the French Dashboard Apps Script bridge. Falls back to the local `BD _ French Dashboard 2026 (3).xlsx`.
- **Local Ultatel department report** `OutBound Calls Per Department ( BusinessDevelopmentTeam ).xlsx`: only used when the `Call Logs` sheet returns **zero** calls. It contains per-agent totals, not individual calls, so `ultatel.ts` synthesizes one `CallRecord` per call, **all dated today** (server date). Date filters are therefore not meaningful in this mode.
- **Supabase** (`agent_mappings`, `meetings`, `calls`, `metadata`; schema in `supabase_schema.sql`): a daily snapshot written by `/api/sync` and read only as a fallback (see above). `meetings` needs the `med_b` / `ppo` columns — run the migration in the schema file.

### Access control
Set `DASHBOARD_PASSWORD`. `src/proxy.ts` redirects unauthenticated page requests to `/login` and returns 401 for API calls; a successful login sets an httpOnly 30-day cookie (HMAC of the password, so changing the password signs everyone out) and failed logins are throttled per IP. `/api/sync` is exempt and uses `CRON_SECRET`. With no password set, auth is off in development and **fails closed (503) in production**. `GET /api/logout` clears the session.

### Caching
`getDashboardRawData()` keeps the loaded dataset in memory per server instance for `DASHBOARD_CACHE_TTL_SECONDS` (default 60). Concurrent requests share one load; partial loads are never cached; if a reload fails, the last good copy is served with a note; `/api/sync` always loads fresh; `/api/upload` clears the cache.

### Credentials
`getSheetsClient()` uses, in order: a `google2.json` service-account file in the project root (gitignored), then `GOOGLE_CLIENT_EMAIL` + `GOOGLE_PRIVATE_KEY`. Supabase uses `NEXT_PUBLIC_SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` (or the anon key). `CRON_SECRET` protects `/api/sync` in production.

### Source reporting
`DashboardResponse.dataSourceInfo` tells the UI where each part came from (`source`, `attendanceSource`, `callsSource`), shown in the header.

---

## 3. API Routes

| Route | Method | Purpose |
| :--- | :--- | :--- |
| `/api/dashboard` | GET | Query params `startDate`, `endDate` (YYYY-MM-DD), `opener`. Pulls live data, computes metrics, returns `DashboardResponse` (`Cache-Control: no-store`). If the live pull throws, or the call logs / BD tracker failed to load, serves the Supabase snapshot instead (noted in `dataSourceInfo.notes`); with no snapshot it shows the partial live data plus a warning. |
| `/api/sync` | GET, POST | Reads live data and writes it to Supabase. Requires `Authorization: Bearer $CRON_SECRET` in production. Returns 503 and leaves the snapshot untouched if any live source failed or calls/meetings are empty; Supabase writes are checked, and old rows are removed only after the new ones are saved. Scheduled daily at 05:00 UTC by `vercel.json`. |
| `/api/login`, `/api/logout` | POST, GET | Sign in / out (see Access control). |
| `/api/upload` | POST | Local-only (returns 501 on Vercel). Accepts an `.xlsx` (≤ 15 MB), detects Ultatel report vs. attendance workbook and overwrites the corresponding local file. |

---

## 4. UI (`src/app/page.tsx`)

Four tabs, switched by CSS show/hide (no unmount):

| Tab | Component | Content |
| :--- | :--- | :--- |
| **Team** | `AgentDashboardView` | One card per opener with status pill, key metrics, per-person XLSX export. |
| **Trends** | `PeriodicBreakdownTable` (+ `DashboardCharts`) | Daily / Weekly (Mon–Sun) / Monthly drill-downs, paginated 20 per page. |
| **Details** | `OpenerTable` | Full sortable opener table, totals row, CSV export. |
| **Call Logs** | `CallLogsView` | Raw filtered call records with search. |

`Header` provides presets (Today, This week, This month, Last 30 days), custom dates, agent filter, refresh, and the data-source label. `FileImportModal` posts to `/api/upload`. `exportXlsx.ts` builds the per-person workbook (*Agent Overview*, *Meeting Pipeline*, *Daily Performance*). Filters and active tab are cached in `localStorage` (`bd-tracker-dashboard-ui-cache-v1`).

---

## 5. Directory Structure

```
├── apps-script/                 # Google Apps Script (clasp project): staging import, Call Logs backfill, in-sheet dashboard
├── data/                        # Docs + local data workbooks (treat spreadsheets as user data)
│   ├── PROJECT_OVERVIEW.md      # This file
│   ├── AGENT_METHODOLOGY.md     # Opener resolution rules
│   ├── MANUAL_AUDIT.md          # Verification checklist
│   ├── AUDIT_FINDINGS.md        # Known issues and recommended fixes
│   └── WORKLOG.md               # Engineering changelog
├── src/
│   ├── app/                     # page.tsx, layout.tsx, api/{dashboard,sync,upload}/route.ts
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
│   │   ├── errors.ts            # Error message / quota detection helpers
│   │   ├── firestore.ts         # Legacy, unused by the routes
│   │   └── firebase.ts          # Deprecated stub
│   └── types/dashboard.ts       # Data contracts
├── supabase_schema.sql          # Fallback database schema
└── vercel.json                  # Daily /api/sync cron
```

`my-dashboard/src/types/dashboard.ts` is a stale partial copy of the types and is not used.

---

## 6. Running

`npm run dev` / `npm run build` / `npm run lint`. There is no test suite. On the project PC use the pinned Node install described in `agents.md`.
