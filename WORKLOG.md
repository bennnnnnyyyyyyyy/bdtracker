# Engineering Worklog

This document chronicles the major engineering iterations, architecture decisions, and bug fixes applied to the **BD Tracker & Dashboard** application.

---

## [2026-08-19] — Dashboard Overhaul & Core Metric Centering

### 1. Requirements & Problem Statement
- **User Directive**: Focus the entire dashboard on answering 4 core questions:
  - **Calls Made** (Outbound/Inbound, Answered/No Answer)
  - **Meetings Booked** (by Stage)
  - **Closing Rate** ($\text{Onboarded} / \text{Booked}$)
  - **Show (Connection) Rate** ($\text{Attended} / \text{Booked}$ and $\text{Answered} / \text{Total Calls}$)
  - Per agent, grouped by **Day**, **Week**, and **Month**.
- **Agent Exclusion**: Permanently filter out `Russ`, `George`, and `Caroline` (including `Caroline Richards`).

---

### 2. Work Completed

#### A. Configuration & Agent Exclusion
- Created `EXCLUDED_AGENTS` in [`src/lib/config.ts`](file:///c:/Users/ben.arthur/Desktop/bd%20tracker/src/lib/config.ts).
- Added `isExcludedAgent(name)` normalizer with case-insensitive and prefix/suffix matching.
- Filtered agents during data ingestion in `sheets.ts` and during calculations in `analytics.ts`.

#### B. Data Layer & Date Parsing Upgrades
- Upgraded [`parseDateToISO`](file:///c:/Users/ben.arthur/Desktop/bd%20tracker/src/lib/analytics.ts):
  - Added support for Excel serial date numbers (e.g. `46177` -> `2026-08-15`).
  - Added support for 2-digit years (`M/D/YY`), ISO strings (`YYYY-MM-DD`), and localized date strings.
- Refactored `fetchBDTrackerData` in [`src/lib/sheets.ts`](file:///c:/Users/ben.arthur/Desktop/bd%20tracker/src/lib/sheets.ts):
  - Migrated to single `batchGet` call across all 8 BD tabs (`'${tab}'!A1:Z`).
  - Implemented dynamic header detection for `Opener`, `Date Added`, `Company Name`, and `Authorized Person`.
  - Added a row-scan date extraction fallback so meetings are never dropped when column indices shift.

#### C. Performance & Latency Optimization
- Implemented in-memory caching (`cachedLocalData`) for parsed Excel records, preventing repetitive 5.5MB file parsing from disk on every API call.
- Added a 6-second timeout race on live Google Sheets API requests so the dashboard remains instant and never hangs.

#### D. UI & Granularity Breakdown
- Built [`PeriodicBreakdownTable.tsx`](file:///c:/Users/ben.arthur/Desktop/bd%20tracker/src/components/PeriodicBreakdownTable.tsx):
  - Grouped metrics by Date, ISO Week (`YYYY-Www`), and Month (`YYYY-MM`).
  - Implemented expandable accordion rows displaying per-agent breakdown for every period.
- Redesigned [`KpiGrid.tsx`](file:///c:/Users/ben.arthur/Desktop/bd%20tracker/src/components/KpiGrid.tsx):
  - Streamlined top cards into the 5 core pillars: Total Calls, Connection Rate, Meetings Booked, Show Rate, and Closing Rate.
- Redesigned [`Header.tsx`](file:///c:/Users/ben.arthur/Desktop/bd%20tracker/src/components/Header.tsx):
  - Added 1-click preset filter buttons: **Today**, **This Week**, **This Month**, **Last 30 Days**, **All Time**.

#### E. Quality & Accessibility Audit (`/audit`)
- Added keyboard navigation (`Enter` / `Space`), `role="button"`, `tabIndex={0}`, and `aria-expanded` to table accordions.
- Added explicit `aria-label` tags to the agent filter and date range inputs.
- Verified responsive layout and dark mode theming tokens.

---

## Summary of Modified & Created Files

| File | Type | Description |
| :--- | :--- | :--- |
| [`src/lib/config.ts`](file:///c:/Users/ben.arthur/Desktop/bd%20tracker/src/lib/config.ts) | Modified | Added excluded agent list and `isExcludedAgent` helper. |
| [`src/types/dashboard.ts`](file:///c:/Users/ben.arthur/Desktop/bd%20tracker/src/types/dashboard.ts) | Modified | Added periodic metrics and breakdown interfaces. |
| [`src/lib/sheets.ts`](file:///c:/Users/ben.arthur/Desktop/bd%20tracker/src/lib/sheets.ts) | Modified | Dynamic header parsing, live batch pulling, and in-memory caching. |
| [`src/lib/analytics.ts`](file:///c:/Users/ben.arthur/Desktop/bd%20tracker/src/lib/analytics.ts) | Modified | Comprehensive date parser and daily/weekly/monthly breakdown logic. |
| [`src/app/api/dashboard/route.ts`](file:///c:/Users/ben.arthur/Desktop/bd%20tracker/src/app/api/dashboard/route.ts) | Modified | API payload updated with periodic breakdowns. |
| [`src/components/PeriodicBreakdownTable.tsx`](file:///c:/Users/ben.arthur/Desktop/bd%20tracker/src/components/PeriodicBreakdownTable.tsx) | **New** | Expandable daily/weekly/monthly drill-down table. |
| [`src/components/KpiGrid.tsx`](file:///c:/Users/ben.arthur/Desktop/bd%20tracker/src/components/KpiGrid.tsx) | Modified | 5 core pillar cards spotlight. |
| [`src/components/Header.tsx`](file:///c:/Users/ben.arthur/Desktop/bd%20tracker/src/components/Header.tsx) | Modified | Quick time presets and accessible filter controls. |
| [`src/app/page.tsx`](file:///c:/Users/ben.arthur/Desktop/bd%20tracker/src/app/page.tsx) | Modified | Granularity tab navigation (Daily, Weekly, Monthly, Summary, Calls). |
| [`MANUAL_AUDIT.md`](file:///c:/Users/ben.arthur/Desktop/bd%20tracker/MANUAL_AUDIT.md) | **New** | Step-by-step verification and math audit guide. |
| [`PROJECT_OVERVIEW.md`](file:///c:/Users/ben.arthur/Desktop/bd%20tracker/PROJECT_OVERVIEW.md) | **New** | Project architecture, data flow, and technical spec. |
| [`WORKLOG.md`](file:///c:/Users/ben.arthur/Desktop/bd%20tracker/WORKLOG.md) | **New** | Detailed engineering change history and decisions. |
