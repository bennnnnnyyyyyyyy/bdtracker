# BD Call & Pipeline Performance Dashboard — Technical Overview

A real-time business development analytics engine and dashboard connecting **Ultatel PBX Call Logs** with **Google Sheets BD Tracker** pipelines.

---

## 1. Core Purpose

The dashboard answers four key questions for every active sales/BD agent across **Daily**, **Weekly**, and **Monthly** intervals:

1. **Calls Volume**: Total Calls Made (Outbound vs. Inbound, Answered vs. No Answer).
2. **Connection Rate**: $\% \text{ of calls answered}$.
3. **Meetings Booked**: Total meetings scheduled across all 8 pipeline stages.
4. **Show Rate & Closing Rate**:
   - **Show Rate**: $\frac{\text{Attended Meetings}}{\text{Meetings Booked}} \times 100\%$ (where $\text{Attended} = \text{Booked} - \text{No-Show}$).
   - **Closing Rate**: $\frac{\text{Onboarded}}{\text{Meetings Booked}} \times 100\%$.

---

## 2. Architecture & Data Flow

```
[Ultatel Call Exports] ───┐
                          ├─► [Google Sheets API v4] ─► [sheets.ts] ─► [analytics.ts Engine] ─► [Next.js REST API] ─► [React UI]
[BD Meetings Tracker]  ───┘            │                                        ▲
                                       │ (Timeout / Fallback)                   │
                                       └────────────────► [Local Excel Data] ───┘
```

### Data Sources:
- **Call Logs Sheet** (`1aI0879YxZdu17GHm-QLhOoE8CuFlkpyROvCtRjjuRbw`): Raw call logs and agent mapping table.
- **BD Tracker Sheet** (`1uicpBruuFeno2ES4hNw-TIAwNkGEI37gw8Z-A4yMpC8`): 8 stage tabs (`New Meetings`, `Follow Ups`, `Contract Sent`, `Invoice Sent`, `Onboarded`, `No-Show`, `Dead Leads`, `Temporary Inactive`).
- **Local Fallback**: `data/BD MEETINGS 2026 (7).xlsx` and `data/Call Details...xlsx`.

---

## 3. Directory Structure

```
├── apps-script/                 # Google Apps Script code for in-sheet automation
├── data/                        # Local datasets & technical documentation
│   ├── AGENT_METHODOLOGY.md     # Agent mapping & resolution engine rules
│   ├── PROJECT_OVERVIEW.md      # System architecture & mathematical definitions
│   ├── MANUAL_AUDIT.md          # Step-by-step verification checklist
│   └── WORKLOG.md               # Engineering changelog
├── src/
│   ├── app/
│   │   ├── api/dashboard/       # API endpoint computing and serving dashboard data
│   │   └── page.tsx             # Main dashboard UI with zero-lag tab switching
│   ├── components/
│   │   ├── Header.tsx           # Logo, live status, presets (Today, Week, Month)
│   │   ├── KpiGrid.tsx          # 5 core pillar cards
│   │   ├── PeriodicBreakdownTable.tsx # Daily / Weekly / Monthly drill-downs
│   │   ├── OpenerTable.tsx      # Full agent summary table & CSV export
│   │   └── CallLogsView.tsx     # Raw call log drill-down table
│   ├── lib/
│   │   ├── analytics.ts         # Math engine, date parser & canonical agent resolver
│   │   ├── config.ts            # Spreadsheet IDs, tabs list, excluded agents
│   │   └── sheets.ts            # Google Sheets API client, batch fetch & local cache
│   └── types/
│       └── dashboard.ts         # TypeScript data contracts & interfaces
```
