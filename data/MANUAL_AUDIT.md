# Manual Audit & Verification Guide

A step-by-step checklist to manually audit every calculation, data extraction, exclusion filter, and UI component in the dashboard.

---

## 1. Agent Exclusion Audit (Russ, George, Caroline)

- [ ] **Dropdown Filter**: Open the **All Agents** dropdown in the header. Confirm that neither *Russ*, *George*, nor *Caroline* appears.
- [ ] **Summary Table**: Inspect the **Summary** tab table. Verify no rows exist for *Russ*, *George*, or *Caroline*.
- [ ] **Daily / Weekly / Monthly Views**: Expand each period row. Confirm that excluded agents never appear in sub-rows.
- [ ] **Call Logs**: Switch to the **Call Logs** tab. Search for `"Russ"`, `"George"`, and `"Caroline"` — verify 0 matching rows.

---

## 2. Meeting Dates & Granularity Audit

- [ ] **Daily Tab**: Open the **Daily** tab. Pick a date (e.g. `2026-08-15`), click to expand, and verify that the meetings booked on that day match the `Date Added` in the BD Meetings spreadsheet.
- [ ] **Weekly Tab**: Verify that weekly ranges span Monday to Sunday (e.g. `Aug 10 – Aug 16, 2026`) and that their sums equal the sum of the days within that week.
- [ ] **Monthly Tab**: Verify that monthly totals roll up accurately.

---

## 3. Mathematical Formula Audit

| Metric | Formula | Verification |
| :--- | :--- | :--- |
| **Total Calls** | $\text{Outbound} + \text{Inbound}$ | Verify Outbound + Inbound = Calls. |
| **Connection Rate** | $\frac{\text{Answered Calls}}{\text{Total Calls}} \times 100\%$ | Divide Answered by Total Calls. |
| **Meetings Booked** | $\sum \text{All 8 BD Stage Counts}$ | Sum `New Meetings` through `Temporary Inactive`. |
| **Show Rate** | $\frac{\text{Booked} - \text{No-Show}}{\text{Booked}} \times 100\%$ | Attended / Booked. |
| **Closing Rate** | $\frac{\text{Onboarded}}{\text{Booked}} \times 100\%$ | Onboarded / Booked. |
| **Calls per Meeting** | $\frac{\text{Total Calls}}{\text{Booked}}$ | Calls / Booked. |

---

## 4. Performance & Tab Switching Audit

- [ ] Rapidly click between **Summary**, **Daily**, **Weekly**, **Monthly**, **Full Table**, and **Call Logs**.
- [ ] Verify that tabs switch instantaneously with zero frame lag.
