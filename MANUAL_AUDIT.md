# Manual Audit & Verification Guide

This guide details how to manually audit and verify all calculations, data ingestion, exclusions, and UI features in the **BD Call & Pipeline Dashboard**.

---

## 1. Agent Exclusion Audit (Russ, George, Caroline)

**Objective**: Verify that `Russ`, `George`, and `Caroline` (including `Caroline Richards`) are 100% excluded across all screens.

### Checklist:
- [ ] **Header Filter**: Open the **All Agents** dropdown in the top header. Confirm that neither *Russ*, *George*, nor *Caroline* appears in the dropdown.
- [ ] **KPI Summary**: Confirm that the total calls and meetings do not include records mapped to excluded agents.
- [ ] **Summary Table**: Inspect the **Summary** tab table. Verify no rows exist for *Russ*, *George*, or *Caroline*.
- [ ] **Daily / Weekly / Monthly Views**: Expand each period row. Confirm that excluded agents never appear in the agent breakdown sub-rows.
- [ ] **Call Logs**: Switch to the **Call Logs** tab. Search for `"Russ"`, `"George"`, and `"Caroline"` in the search bar. Verify 0 results.

---

## 2. Meeting Dates & Granularity Audit

**Objective**: Verify that meetings appear under their exact booking dates rather than generic or misaligned dates.

### Checklist:
- [ ] **Daily Tab Audit**:
  1. Open the **Daily** tab.
  2. Pick a specific date (e.g., `2026-08-15`).
  3. Expand the date row to inspect each agent's meeting count.
  4. Cross-reference with the `BD MEETINGS` spreadsheet tab (`New Meetings`, `Follow Ups`, etc.) to confirm the `Date Added` matches.
- [ ] **Weekly Tab Audit**:
  1. Open the **Weekly** tab.
  2. Check that the date ranges span Monday to Sunday (e.g., `Aug 10 – Aug 16, 2026`).
  3. Sum the daily meetings for that week and verify they equal the weekly total.
- [ ] **Monthly Tab Audit**:
  1. Open the **Monthly** tab.
  2. Verify that monthly totals equal the sum of that month's daily records.

---

## 3. Mathematical Verification of Core 4 Metrics

Verify the formulas using sample numbers from the table:

| Metric | Mathematical Formula | How to Verify |
| :--- | :--- | :--- |
| **Total Calls** | $\text{Outbound} + \text{Inbound}$ | Check that Outbound + Inbound equals Total Calls in the KPI card and table. |
| **Connection (Answer) Rate** | $\frac{\text{Answered Calls}}{\text{Total Calls}} \times 100\%$ | Divide `Answered` by `Calls` — verify the percentage matches. |
| **Meetings Booked** | $\sum \text{All Stage Counts}$ | Sum `New Meetings` + `Follow Ups` + `Contract Sent` + `Invoice Sent` + `Onboarded` + `No-Show` + `Dead Leads` + `Temporary Inactive`. |
| **Show Rate** | $\frac{\text{Attended Meetings}}{\text{Meetings Booked}} \times 100\%$ | Compute $\frac{\text{Booked} - \text{No-Show}}{\text{Booked}} \times 100\%$ — verify it matches the green percentage. |
| **Closing Rate** | $\frac{\text{Onboarded}}{\text{Meetings Booked}} \times 100\%$ | Compute $\frac{\text{Onboarded}}{\text{Booked}} \times 100\%$ — verify it matches the purple percentage. |
| **Calls per Meeting** | $\frac{\text{Total Calls}}{\text{Meetings Booked}}$ | Divide total calls by booked meetings for agent efficiency. |

---

## 4. Live Sync & Performance Audit

**Objective**: Verify the live connection to Google Sheets and speed of data loading.

### Checklist:
- [ ] **Status Indicator**: Look at the badge next to the dashboard title:
  - **Live Sheets** (Green): Successfully synced with Google Sheets API v4.
  - **Demo Data / Local Cache** (Amber): Using cached local `.xlsx` fallback.
- [ ] **Refresh Button**: Click the **Refresh** button in the header.
  - Check the terminal logs to observe:
    ```
    [Google Sheets] Live pull complete: X calls, Y meetings loaded.
    ```
  - Verify that the sync completes within 1–2 seconds without page freezing.
- [ ] **Quick Preset Filters**: Click each preset button (**Today**, **This Week**, **This Month**, **Last 30 Days**, **All Time**).
  - Verify that metrics re-aggregate instantly in under 50ms.

---

## 5. Keyboard & Accessibility Audit

### Checklist:
- [ ] **Keyboard Accordion**: In the **Daily** or **Weekly** tab, use the `Tab` key to focus on a period row, then press `Enter` or `Space` to expand/collapse.
- [ ] **Contrast**: Check readability across slate background and metric highlight colors.
