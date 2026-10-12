# Manual Audit & Verification Guide

Formulas and edge cases are explained in [`HOW_NUMBERS_WORK.md`](HOW_NUMBERS_WORK.md); `npm test` checks the same formulas automatically.

A step-by-step checklist to manually audit every calculation, data extraction, exclusion filter, and UI component in the dashboard.

---

## 1. Agent Exclusion Audit (Russ, George, Caroline)

- [ ] **Dropdown Filter**: Open the **All Agents** dropdown in the header. Confirm that neither *Russ*, *George*, nor *Caroline* appears.
- [ ] **Summary Table**: Inspect the **Details** tab table. Verify no rows exist for *Russ*, *George*, or *Caroline*.
- [ ] **Daily / Weekly / Monthly Views**: Expand each period row. Confirm that excluded agents never appear in sub-rows.
- [ ] **Call Logs**: Switch to the **Call Logs** tab. Search for `"Russ"`, `"George"`, and `"Caroline"` — verify 0 matching rows.

---

## 2. Meeting Dates & Granularity Audit

All three granularities live in the **Trends** tab.

- [ ] **Daily**: Open **Trends → Daily**. Pick a date (e.g. `2026-08-15`), click to expand, and verify that the meetings booked on that day match the `Date Added` in the BD Meetings spreadsheet.
- [ ] **Weekly**: Verify that weekly ranges span Monday to Sunday (e.g. `Aug 10 – Aug 16, 2026`) and that their sums equal the sum of the days within that week.
- [ ] **Monthly**: Verify that monthly totals roll up accurately.

---

## 3. Mathematical Formula Audit

| Metric | Formula | Verification |
| :--- | :--- | :--- |
| **Total Calls** | all non-internal call rows for the opener in range | Outbound + Inbound = Calls (`INTERNAL` calls are excluded before counting). |
| **Connection Rate** | $\frac{\text{Answered Calls}}{\text{Total Calls}} \times 100\%$ | Divide Answered by Total Calls. |
| **Meetings Booked** | $\sum \text{All 8 BD Stage Counts}$ | Sum `New Meetings` through `Temporary Inactive`. |
| **Show Rate** (opener rows, Trends) | $\frac{\text{Attended}}{\text{Attended} + \text{No-Show}}$ | Attended = Follow Ups + Contract Sent + Invoice Sent + Onboarded + Temporary Inactive. New Meetings / Dead Leads / Temporary Inactive are ignored. |
| **Show Rate** (org KPI card / totals row) | $\frac{\text{Attended}}{\text{Booked}}$ | Intentional: counts clients who showed against all meetings booked. |
| **Med B / PPO rate** | $\frac{\text{ticked rows}}{\text{Booked}} \times 100\%$ | Count rows with the checkbox ticked in the tracker. |
| **Present Days** | $\sum$ weights (P, L1, L2 = 1; Q = 0.75; H = 0.5) in range | Compare to the Attendance tab. |
| **Calls / Present Day** | $\frac{\text{Calls}}{\text{Present Days}}$ | Falls back to calls per active calendar day if no attendance. |
| **Adherence** | $\frac{\text{Present Days}}{\text{Mon–Fri days in range}}$ (cap 100%) | Needs both start and end date. |
| **Closing Rate** | $\frac{\text{Onboarded}}{\text{Booked}} \times 100\%$ | Onboarded / Booked. |
| **Calls per Meeting** | $\frac{\text{Total Calls}}{\text{Booked}}$ | Calls / Booked. |

---

## 4. Data Source Audit

- [ ] The header source label should read Google Sheets when everything is live. "Local Excel" means attendance or calls came from files in the repo; "Supabase" means the live pull threw and the daily snapshot is shown.
- [ ] If the Call Logs sheet is empty and the Ultatel department report is used, expect every call to be dated *today* — date filters will not behave normally.

## 5. Performance & Tab Switching Audit

- [ ] Rapidly click between **Team**, **Trends**, **Details** and **Call Logs**.
- [ ] Verify that tabs switch instantaneously with zero frame lag.
