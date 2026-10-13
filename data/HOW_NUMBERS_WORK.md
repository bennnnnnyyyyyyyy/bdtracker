# How Every Number Is Recorded, Read and Calculated

This is the end-to-end trace of the data: who types or pastes what, where it is stored, how the dashboard reads it, and the exact formula behind every figure. Every statement here comes from the code (file names given) and the call-count examples were checked against the real export in `data/`.

---

## 1. The big picture

```
RECORDING (people + Apps Script)                        READING (Next.js server)                       SHOWING
────────────────────────────────                        ────────────────────────                       ───────
Ultatel export ──paste──► "Import Staging" tab
   Apps Script: fix time zone, dedupe, add Agent,
   Duration (sec) ──► "Call Logs" tab  ────────────┐
   new agent names ──► "Agent Mapping" tab ────────┤
BD team types meetings into 8 stage tabs ──────────┼──► Google Sheets API v4 ──► in-memory cache (60 s)
French Dashboard ──bridge──► "Attendance" tab ─────┘            │                      │
                                                                 ▼                      ▼
                                              analytics.ts computeDashboardMetrics()  /api/dashboard ──► React tabs
                                                                 ▲
        daily 05:00 cron /api/sync ──► Supabase snapshot ────────┘ (used only if the live read fails)
```

Two things never change in the pipeline: **the sheets are the single source of truth**, and **the dashboard never writes to them** (the Sheets credential is read-only). The only things the dashboard itself stores are the Supabase snapshot and the browser's remembered filters.

---

## 2. Recording: where each raw fact comes from

### 2.1 Calls (Ultatel → `Call Logs`)
1. Someone exports call details from Ultatel (columns: *Call Date, Call ID, From, To, Extension, Department, DID, Description, Type, Outcome, Duration, Notes, Call Path*). Example row: `07-18-2026 05:59:49 | 1784375989.17 | … | 103 (MMS-Rick Nelson) | Business Development Team | … | IN-Bound | ANSWERED | 00:01`.
2. Management uploads the file in the dashboard (**Actions > Import Excel**); the server hands the rows to the sheet's Apps Script web app, which runs the same import as the old menu (the `Import Staging` menu remains as a fallback: paste at row 2, then **Process Staged Call Import**) (`apps-script/Code.js › processStagingImport`). For each row it:
   - **Sets the Cairo time.** The Call ID's number before the dot is the call's start time in Unix seconds, so the script converts that to Africa/Cairo time (DST aware) and stores text like `2026-08-10 09:00:00`. Only if an ID has no timestamp does it fall back to converting the export's UTC-6 clock. **All call dates on the dashboard are Cairo dates.**
   - **Skips duplicate copies, keeps repeated legs.** Ultatel can list the SAME Call ID on several rows (ring attempts / call legs with their own time, duration and outcome) and counts every row, so every row is kept. A row is only skipped if the sheet already holds as many rows of the same call as the export does (same ID timestamp, From, To, Extension, Type, Outcome and Duration; phone numbers are compared by their last 10 digits, so `+16156173189` and `16156173189` are the same number), so re-importing an overlapping export adds nothing while genuinely repeated rows in one export all land. The export's extra `Team Call` column is ignored. After every import the completion message ends with a per-agent **check** comparing the export with what `Call Logs` now holds for that period; if it says CHECK FAILED, extra rows are old duplicates (run **Repair duplicate calls**, then import the file again).
   - **Derives Agent** = the text inside `(MMS-…)` of *Extension* (`112 (MMS-Ben Arthur)` → `Ben Arthur`; if there is no `(MMS-…)` the whole extension text is used).
   - **Derives Duration (sec)** from *Duration* (`mm:ss` or `hh:mm:ss`).
   - Appends the row to `Call Logs` (columns A–M raw, **N = Agent**, **O = Duration (sec)**).
   - Adds any **new agent name** to `Agent Mapping` column A with a blank Opener. *A person must fill in column B (the opener name) for the new agent.* Excluded people (Russ, George, Caroline) are not added.
   - Deletes the staging tab and refreshes the in-sheet `BD Dashboard` mirror.
3. **Monthly archive.** Automatically every Sunday (turn it on once with **BD Call Dashboard > Turn ON automatic archiving (weekly)**; **Archive closed months now** does it on demand). Calls older than 45 days move out of `Call Logs` into one tab per month (`Call Logs 2026-08`, `Call Logs 2026-09`, …); the newest 45 days stay in `Call Logs`. A hidden backup is saved first, rows are only removed after the archive tabs are confirmed, and later imports compare against archive tabs too, so re-importing an old export never duplicates archived calls. The dashboard reads archive tabs only when your date range reaches those months (and caches them for an hour), so current numbers stay fast.
4. `Agent Mapping` (A = PBX agent name, B = canonical Opener name) is maintained by hand.

### 2.2 Meetings (BD tracker)
The team keeps one row per meeting in the tracker, **in the tab that is the meeting's current stage**: `New Meetings`, `Follow Ups`, `Contract Sent`, `Invoice Sent`, `Onboarded`, `No-Show`, `Dead Leads`, `Temporary Inactive`. Moving a lead between stages means moving its row to another tab. Columns the dashboard looks for (by header text, not fixed position): **Opener** (header contains "opener", or is "agent"/"rep"; default column B), **Date Added** (also accepts "meeting date", "date booked", "date", "created", "timestamp"), **Company**, **Authorized Person / Contact**, and the **MEDB** and **PPO** checkboxes (a row counts if ticked/TRUE/1/yes).

### 2.3 Attendance
The French Dashboard workbook is copied into the tracker's `Attendance` tab by a bridge script. The parser (`attendance.ts`) expects blocks: a row whose first cell is `Date` followed by dates in columns B–AG, then one row per agent with a code per day. Codes: **P, L1, L2 = 1 day; Q = 0.75; H = 0.5; anything else/blank = 0**. Notes in brackets in the name, e.g. `Ben (Part-time)`, are stripped. If the same date appears in several blocks, a later blank never erases an earlier mark. (Column AH, the sheet's own total, is read but not used — the dashboard re-adds the daily codes itself so any date range works.)

### 2.4 Fallback inputs
- `OutBound Calls Per Department (…).xlsx` — per-agent *totals* (no individual calls, no dates). Used only if `Call Logs` returns zero calls.
- `BD _ French Dashboard 2026 (3).xlsx` — used if the Attendance tab cannot be read.
- Both can be replaced from the dashboard's import dialog when running locally.

---

## 3. Reading: what the server does on each request

1. **Auth**: the proxy requires a signed session cookie (`/api/sync` has its own secret).
2. **Cache** (`sheets.ts › getDashboardRawData`): reuses the last load if it is under 30 s old (Refresh forces a reload, at most every 10 s). The open page also re-requests every 30 s, so the screen follows the sheets within about a minute. Concurrent requests share one load.
3. **Load** (parallel):
   - `Agent Mapping!A2:B` and `Call Logs!A2:O`, read in 20 000-row chunks; plus, when the date range reaches closed months, the matching `Call Logs YYYY-MM` archive tabs (cached for an hour).
   - The 8 stage tabs with one batch call, range `A1:Z`.
   - `Attendance!A1:AT`, falling back to the local workbook.
4. **Failure handling**: if the call log or tracker cannot be read, the server serves the last good in-memory copy, else the Supabase snapshot, else partial data — and always says so in the yellow banner. A partial load is never cached and never written to Supabase.
5. **Confirmations**: every current show confirmation is read from Supabase and attached to the meetings (if that fails, the banner says so and no meeting counts as a show).
6. **Compute** (`analytics.ts › computeDashboardMetrics`) with the filters from the URL: start date, end date, opener.
7. **Respond**: the Call Logs tab's raw rows are only sent when that tab is opened (`includeCalls=true`).
8. **Snapshot**: once a day `/api/sync` re-reads everything and writes it to Supabase (refusing partial data). The dashboard reads Supabase only as an emergency fallback.

---

## 4. Interpretation rules applied before any math

| Rule | Detail |
| :--- | :--- |
| **Call dating and duplicates** | The web app applies the same rule when reading `Call Logs`: every row counts, except extra copies of a row that are written differently (a raw export-clock copy next to a Cairo-time copy, `+1615…` next to `1615…`, or a different seconds column); rows written identically are separate legs and all count. Talk time is taken from the Duration text (`0:37` = 37 seconds), because the `Duration (sec)` column can be wrong when Sheets reads `0:37` as 37 minutes; **Repair duplicate calls** recomputes that column. Each call's time is put on Cairo time using the timestamp inside its Call ID; a banner reports how many duplicate rows were ignored. Use **Preview duplicate-call repair** / **Repair duplicate calls** in the sheet menu to clean the sheet itself (a hidden backup sheet is saved first). |
| **Which day a call belongs to** | By default the web app uses **Ultatel's own clock (UTC-6)** to decide the day, so daily/weekly/monthly call numbers equal Ultatel's reports for the same date (the export `Call Details 10-12-2026` covers 00:00-23:59 on that clock). The sheet still stores Cairo time, which runs 9 hours ahead (3:00 pm Ultatel time is already midnight in Cairo), so an evening shift can land on the next day in Cairo. To count days from Cairo midnight instead, set the environment variable `CALL_DAY_TIMEZONE=Africa/Cairo`. Meetings are unaffected. |
| **Dates** | Accepted: `YYYY-MM-DD[ time]`, `MM/DD/YYYY`, `MM-DD-YYYY[ time]`, 2-digit years (`M/D/YY` → 20YY), `DD/MM/YYYY` when the first number is > 12, Excel serial numbers, and text with a month name and a 4-digit year (`March 5, 2026`). Impossible dates and free text are rejected. The date is used **as written** (no timezone shifting); call dates are already Cairo. |
| **Which date filters what** | Calls use *Call Date*. Meetings use *Date Added*. A meeting with no valid date is **dropped whenever a date range is set** (the page always sends one). If a row's date column is empty the loader scans the other cells (never the opener, company or contact columns) for a date. |
| **Who is an opener** | Each call agent / tracker opener / attendance name goes through `resolveOpener`: excluded names → dropped; numeric extensions and `front desk, conference, support, ivr, unmapped, main line, fax, unknown` → dropped; exact match in `Agent Mapping` (agent or opener column, case-insensitive) → that opener; whole-first-name match that points to exactly one opener → that opener; any other plain name → kept as its own opener. |
| **Excluded people** | `russ, george, caroline, caroline richards`, matched as whole words. |
| **Call direction** | `Type` starting with OUT → outbound; IN → inbound. **`INTERNAL` calls are dropped completely** (not in Calls, Call Logs, talk time or any rate). Any other unknown type is kept in Calls but is neither outbound nor inbound. |
| **Call result** | `ANSWERED` → answered; `NO ANSWER`/unanswered/missed → no answer; other values (e.g. `BUSY`) count as neither. |
| **Duration** | `mm:ss`, `hh:mm:ss`, Excel time fractions, or Ultatel `1 H , 2.53 M`. Talk time = sum of *Duration (sec)*, which includes only what is recorded per call. |
| **Weeks / months** | Weeks are ISO-8601, Monday–Sunday, keyed `YYYY-Www` (week belongs to the year containing its Thursday). Months are calendar months. |
| **Working days** | Mon–Fri between the start and end date inclusive (no public holidays). |

---

## 5. Every metric

Opener = one person. Org = the "Team" figures in the top cards and totals rows.

### Calls
| Metric | Formula |
| :--- | :--- |
| **Calls** | Count of that opener's call rows in the date range, excluding `INTERNAL` calls. |
| **Outbound / Inbound** | Count with direction OUT / IN. (Outbound + Inbound = Calls unless the export contains some other, unknown type.) |
| **Answered / No answer** | Count with result ANSWERED / NO ANSWER. |
| **Connection rate** (= answer rate) | `answered ÷ calls`. |
| **Total talk time** | Sum of `Duration (sec)`. |
| **Avg call** | `round(talk seconds ÷ calls)` — note it divides by *all* calls including unanswered ones. |

### Meetings (pipeline)
| Metric | Formula |
| :--- | :--- |
| **Stage counts** | Rows per stage tab for the opener in the date range (by *Date Added*). |
| **Booked** | Sum of all 8 stage counts. |
| **Attended (a "show")** | Meetings that **management confirmed** in the dashboard (Confirm shows tab) and that are not in No-Show or Dead Leads. The stage alone never makes a show; New Meetings or Temporary Inactive count once confirmed. |
| **Awaiting confirmation** | Unconfirmed meetings sitting in Follow Ups, Contract Sent, Invoice Sent, Onboarded or Temporary Inactive: the follow-up queue for management. |
| **No-show** | Rows in the No-Show tab. |
| **Show rate (every card, row and total)** | `attended ÷ (attended + no-show)`. Unconfirmed meetings and Dead Leads are not counted either way. The same formula is used for each person, each period, the Team card and the totals row. |
| **Onboarded / Close rate** | `Onboarded ÷ booked`. |
| **Calls per meeting** | `calls ÷ booked` (1 decimal). |
| **Med B / PPO** | Count of ticked rows; rate = `count ÷ booked × 100` (1 decimal). |

A meeting is counted in the **tab it sits in today but in the period of its Date Added**; its confirmation follows the row (see `SETUP_USERS_AND_CONFIRMATIONS.md` for how rows are identified). If a lead booked in July is onboarded in August, it counts as a July meeting that is now onboarded.

### Attendance and productivity
| Metric | Formula |
| :--- | :--- |
| **Present days** | Sum of the attendance weights for the opener's matching attendance row, for dates inside the range. The row is found by canonical opener name, else a unique whole first name; no match = 0. |
| **Adherence** | `present days ÷ Mon–Fri days in the range × 100`, capped at 100; 0 if there is no attendance or no range. |
| **Calls per present day** | `calls ÷ present days`; if present days is 0 it shows calls per active day instead (see below). |
| **Active days** | Number of distinct dates on which the opener had at least one call or meeting in range (the Team-wide count if they had none). |
| **Calls per calendar day** | `calls ÷ active days`. |
| **Daily / weekly / monthly averages** | Daily calls = calls per present day; daily meetings = `booked ÷ present days` (or ÷ active days). Weekly = `÷ max(1, ceil(distinct team days ÷ 7))`; monthly = `÷ max(1, ceil(distinct team days ÷ 30))`. |

### Team (org) totals
Counts (calls, outbound, inbound, answered, no answer, talk time, booked, stage counts, attended, no-show, onboarded, Med B, PPO, present days) are **sums over the openers listed**. Rates are recomputed from those sums: connection `answered ÷ calls`; show `attended ÷ (attended + no-show)`; close `onboarded ÷ booked`; adherence `present days ÷ (working days × number of openers)`; calls per present day `calls ÷ total present days`. The Team card therefore equals the sum of the rows shown beneath it.

### Trends tab (daily / weekly / monthly)
Each row groups calls by *Call Date* and meetings by *Date Added* into the day/ISO-week/month. Per opener and period: calls, answered, connection rate, meetings, no-show, attended, onboarded, show rate `attended ÷ (attended + no-show)`, close rate `onboarded ÷ meetings`, calls per meeting, present days for that period's dates, calls per present day. Openers with no calls and no meetings in a period are omitted. Period totals add the openers; the total show rate uses the same completed-meetings denominator. Rows are newest first.

### Team-tab labels
- "Show rate needs attention": the opener has at least one attended/no-show result and show rate < 40%.
- "Activity needs attention": present days > 0 and calls per present day < 10.
- Otherwise "On track". The top card in gold is the opener with the most calls.

---

## 6. Worked example with the real export

`data/Call Details 7-18-2026 … 8-16-2026.xlsx` (the file the team exported) contains **8 366 rows**. Running the dashboard's own calculation over it for 2026-07-18 → 2026-08-16:

| | Raw rows by agent | Dashboard |
| :--- | :--- | :--- |
| Rick Nelson | 1 465 (1 178 answered) | 1 465 calls, 1 178 answered, 80.4% |
| Selene Myles | 2 706 (2 159) | 2 706, 79.8% |
| Nora Atkins | 2 170 (1 765) | 2 170, 81.3% |
| Kaity James → *Jane* | 1 036 (911) | 1 036, 87.9% |
| Ben Arthur → *Ben* | 503 (406) | 501 calls (486 out / 15 in), 81.0% — his 2 internal calls are excluded |
| Jasmine Green | 307 (268) | 307, 87.3% |
| Jimmy Pearson | 177 (140) | 177, 79.1% |
| Caroline Richards | 2 (2) | **excluded** |
| Total | 8 366 | **8 362** (= 8 366 − 2 Caroline − 2 internal); 6 827 answered; 8 150 out + 212 in |

Ben's calls: 486 outbound + 15 inbound = 501; the 2 internal calls are dropped. 406 answered ÷ 501 = 81.0% connection rate. If the attendance sheet gives Ben 16 present days in that range, calls per present day = 501 ÷ 16 = 31.3 and adherence = 16 ÷ the number of Mon–Fri days in the range.

---

## 7. Known limits (be aware when reading the numbers)
- The daily Supabase snapshot (emergency fallback) holds only the active `Call Logs`, not archived months.
- The in-sheet `BD Dashboard` mirror (Apps Script) reads only the active `Call Logs`.
- Show confirmations are keyed on opener + date added + company + contact; editing any of those cells makes the meeting need confirming again.
- Stage counts are a snapshot of where each meeting is *now*, grouped by the date it was added.
- Meetings without a valid Date Added disappear as soon as a date range is applied.
- With only the department summary report, calls have no real dates (shown with a warning).
- No holiday calendar: adherence uses plain Mon–Fri days.
- Per-day figures fall back to calendar/active days when attendance is missing (shown with a warning when no attendance data is found at all).
- Anyone with a name that is not in `Agent Mapping` and is not excluded appears as their own row — fix by adding them to the mapping.
