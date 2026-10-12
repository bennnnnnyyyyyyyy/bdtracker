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
2. In the sheet, **BD Call Dashboard ▸ Create / Open Staging Tab**, paste the export at row 2 of `Import Staging`, then **Process Staged Call Import** (`apps-script/Code.js › processStagingImport`). For each row it:
   - **Converts the clock.** Ultatel exports in fixed UTC-6; the script converts to Africa/Cairo time (`toCairoDate_`, DST aware) and stores text like `2026-08-10 09:00:00`. **All dates on the dashboard are therefore Cairo dates**, taken exactly as written.
   - **Skips duplicates** by *Call ID* (case-insensitive) against `Call Logs` and within the batch. Only when a row has *no* Call ID does it fall back to a key of date + from + to + duration + extension.
   - **Derives Agent** = the text inside `(MMS-…)` of *Extension* (`112 (MMS-Ben Arthur)` → `Ben Arthur`; if there is no `(MMS-…)` the whole extension text is used).
   - **Derives Duration (sec)** from *Duration* (`mm:ss` or `hh:mm:ss`).
   - Appends the row to `Call Logs` (columns A–M raw, **N = Agent**, **O = Duration (sec)**).
   - Adds any **new agent name** to `Agent Mapping` column A with a blank Opener. *A person must fill in column B (the opener name) for the new agent.* Excluded people (Russ, George, Caroline) are not added.
   - Deletes the staging tab and refreshes the in-sheet `BD Dashboard` mirror.
3. `Agent Mapping` (A = PBX agent name, B = canonical Opener name) is maintained by hand.

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

1. **Auth** (`src/proxy.ts`): requires the shared-password cookie.
2. **Cache** (`sheets.ts › getDashboardRawData`): reuses the last load if it is under 60 s old (Refresh forces a reload, at most every 10 s). Concurrent requests share one load.
3. **Load** (parallel):
   - `Agent Mapping!A2:B` and `Call Logs!A2:O`, read in 20 000-row chunks.
   - The 8 stage tabs with one batch call, range `A1:Z`.
   - `Attendance!A1:AT`, falling back to the local workbook.
4. **Failure handling**: if the call log or tracker cannot be read, the server serves the last good in-memory copy, else the Supabase snapshot, else partial data — and always says so in the yellow banner. A partial load is never cached and never written to Supabase.
5. **Compute** (`analytics.ts › computeDashboardMetrics`) with the filters from the URL: start date, end date, opener.
6. **Respond**: the Call Logs tab's raw rows are only sent when that tab is opened (`includeCalls=true`).
7. **Snapshot**: once a day `/api/sync` re-reads everything and writes it to Supabase (refusing partial data). The dashboard reads Supabase only as an emergency fallback.

---

## 4. Interpretation rules applied before any math

| Rule | Detail |
| :--- | :--- |
| **Dates** | Accepted: `YYYY-MM-DD[ time]`, `MM/DD/YYYY`, `MM-DD-YYYY[ time]`, 2-digit years (`M/D/YY` → 20YY), `DD/MM/YYYY` when the first number is > 12, Excel serial numbers, and text with a month name and a 4-digit year (`March 5, 2026`). Impossible dates and free text are rejected. The date is used **as written** (no timezone shifting); call dates are already Cairo. |
| **Which date filters what** | Calls use *Call Date*. Meetings use *Date Added*. A meeting with no valid date is **dropped whenever a date range is set** (the page always sends one). If a row's date column is empty the loader scans the other cells (never the opener, company or contact columns) for a date. |
| **Who is an opener** | Each call agent / tracker opener / attendance name goes through `resolveOpener`: excluded names → dropped; numeric extensions and `front desk, conference, support, ivr, unmapped, main line, fax, unknown` → dropped; exact match in `Agent Mapping` (agent or opener column, case-insensitive) → that opener; whole-first-name match that points to exactly one opener → that opener; any other plain name → kept as its own opener. |
| **Excluded people** | `russ, george, caroline, caroline richards`, matched as whole words. |
| **Call direction** | `Type` starting with OUT → outbound; IN (not INTERNAL) → inbound. Anything else, such as `INTERNAL`, is kept but counts as neither. |
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
| **Calls** | Count of that opener's call rows in the date range. Includes internal/other types. |
| **Outbound / Inbound** | Count with direction OUT / IN. (Calls can exceed Outbound + Inbound by the number of internal/other rows.) |
| **Answered / No answer** | Count with result ANSWERED / NO ANSWER. |
| **Connection rate** (= answer rate) | `answered ÷ calls`. |
| **Total talk time** | Sum of `Duration (sec)`. |
| **Avg call** | `round(talk seconds ÷ calls)` — note it divides by *all* calls including unanswered ones. |

### Meetings (pipeline)
| Metric | Formula |
| :--- | :--- |
| **Stage counts** | Rows per stage tab for the opener in the date range (by *Date Added*). |
| **Booked** | Sum of all 8 stage counts. |
| **Attended** | Rows now in Follow Ups + Contract Sent + Invoice Sent + Onboarded. |
| **No-show** | Rows in the No-Show tab. |
| **Show rate — opener rows and period rows** | `attended ÷ (attended + no-show)`. Meetings still in New Meetings, Dead Leads or Temporary Inactive are not counted either way. |
| **Show rate — Team card and totals row** | `attended ÷ booked` (clients who showed, out of everything booked). Intentionally different from the opener figure. |
| **Onboarded / Close rate** | `Onboarded ÷ booked`. |
| **Calls per meeting** | `calls ÷ booked` (1 decimal). |
| **Med B / PPO** | Count of ticked rows; rate = `count ÷ booked × 100` (1 decimal). |

A meeting is counted in the **tab it sits in today but in the period of its Date Added**. If a lead booked in July is onboarded in August, it counts as a July meeting that is now onboarded.

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
Counts (calls, outbound, inbound, answered, no answer, talk time, booked, stage counts, attended, no-show, onboarded, Med B, PPO, present days) are **sums over the openers listed**. Rates are recomputed from those sums: connection `answered ÷ calls`; show `attended ÷ booked`; close `onboarded ÷ booked`; adherence `present days ÷ (working days × number of openers)`; calls per present day `calls ÷ total present days`. The Team card therefore equals the sum of the rows shown beneath it.

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
| Ben Arthur → *Ben* | 503 (406) | 503 calls (486 out / 15 in / 2 other), 80.7% |
| Jasmine Green | 307 (268) | 307, 87.3% |
| Jimmy Pearson | 177 (140) | 177, 79.1% |
| Caroline Richards | 2 (2) | **excluded** |
| Total | 8 366 | **8 364** (= 8 366 − 2 excluded); 6 827 answered; 8 150 out + 212 in + 2 internal |

Ben's 503 calls: 503 − 97 unanswered = 406 answered → 406 ÷ 503 = 80.7% connection rate. If the attendance sheet gives Ben 16 present days in that range, calls per present day = 503 ÷ 16 = 31.4 and adherence = 16 ÷ the number of Mon–Fri days in the range.

---

## 7. Known limits (be aware when reading the numbers)
- Stage counts are a snapshot of where each meeting is *now*, grouped by the date it was added.
- Meetings without a valid Date Added disappear as soon as a date range is applied.
- Internal/other call types add to *Calls* but not to Outbound or Inbound.
- With only the department summary report, calls have no real dates (shown with a warning).
- No holiday calendar: adherence uses plain Mon–Fri days.
- Per-day figures fall back to calendar/active days when attendance is missing (shown with a warning when no attendance data is found at all).
- Anyone with a name that is not in `Agent Mapping` and is not excluded appears as their own row — fix by adding them to the mapping.
