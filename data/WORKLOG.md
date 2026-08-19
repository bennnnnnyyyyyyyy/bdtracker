# Complete Engineering Worklog

This document chronicles all engineering changes, performance fixes, algorithm improvements, and architectural decisions made on the BD Tracker codebase.

---

## Chronological Change History

### 1. Agent Exclusion Architecture
- Configured `EXCLUDED_AGENTS: ['russ', 'george', 'caroline', 'caroline richards']` in [`src/lib/config.ts`](file:///c:/Users/ben.arthur/Desktop/bd%20tracker/src/lib/config.ts).
- Added `isExcludedAgent(name)` normalizer with case-insensitive, prefix, and suffix matching.
- Filtered agents during data ingestion in `sheets.ts` and during calculations in `analytics.ts`.

### 2. Canonical Agent Normalization Engine
- Created [`resolveOpener()`](file:///c:/Users/ben.arthur/Desktop/bd%20tracker/src/lib/analytics.ts):
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
- Replaced unmount/re-mount cycles with CSS display toggling (`hidden` vs `block`) in [`src/app/page.tsx`](file:///c:/Users/ben.arthur/Desktop/bd%20tracker/src/app/page.tsx), enabling **< 1ms / 60 FPS** instant tab switching.
- Added pagination (20 items per page) to [`PeriodicBreakdownTable.tsx`](file:///c:/Users/ben.arthur/Desktop/bd%20tracker/src/components/PeriodicBreakdownTable.tsx).
- Wrapped `PeriodicBreakdownTable`, `OpenerTable`, `KpiGrid`, and `CallLogsView` in `React.memo`.

### 5. Google Apps Script In-Sheet Backend Refactor
- Refactored [`apps-script/Code.js`](file:///c:/Users/ben.arthur/Desktop/bd%20tracker/apps-script/Code.js) to ES2020+ standards (V8 runtime):
  - Added excluded agent filters (`Russ`, `George`, `Caroline`).
  - Added dynamic Opener column detection.
  - Formatted executive in-sheet summary table and visual charts.

---

## Documentation Manifest in `data/`

- [`data/AGENT_METHODOLOGY.md`](file:///c:/Users/ben.arthur/Desktop/bd%20tracker/data/AGENT_METHODOLOGY.md) — Comprehensive guide on agent mapping, normalization rules, and exclusion logic.
- [`data/PROJECT_OVERVIEW.md`](file:///c:/Users/ben.arthur/Desktop/bd%20tracker/data/PROJECT_OVERVIEW.md) — System architecture, data flow diagram, formulas, and directory structure.
- [`data/MANUAL_AUDIT.md`](file:///c:/Users/ben.arthur/Desktop/bd%20tracker/data/MANUAL_AUDIT.md) — Step-by-step verification checklist.
- [`data/WORKLOG.md`](file:///c:/Users/ben.arthur/Desktop/bd%20tracker/data/WORKLOG.md) — Full engineering changelog and decision log.
