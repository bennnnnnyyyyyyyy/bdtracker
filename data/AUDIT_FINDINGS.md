# Audit Findings (code review, no code changed)

Static review of the repository. Nothing here was run: `node_modules` was not installed, so `tsc`, lint and the app were not executed. Items are ordered by impact.

## A. Bugs / correctness (items 1–5 resolved, see below)

1. ~~Show rate is defined two ways.~~ **Not a bug (confirmed by the owner):** show rate means *clients who showed up to meetings*. Per-opener/period rows use `attended / (attended + noShow)`, the org total uses `attended / booked`; this is intentional.
2. ~~**Supabase sync can wipe the fallback.**~~ **Fixed.** `/api/sync` now skips (HTTP 503) if any live source failed, and `saveRawDataToSupabase` refuses empty calls/meetings.
3. ~~**Fallback unreachable when it matters.**~~ **Fixed.** `getDashboardRawData` now returns `failedSources`; `/api/dashboard` uses the Supabase snapshot when any core source failed (and says so in `dataSourceInfo.notes`). If no snapshot exists it shows the partial live data with a warning note.
4. ~~**Supabase errors never checked.**~~ **Fixed.** Every write is checked and throws; new meetings are inserted before the old ones are deleted (rolled back on failure); calls are upserted first and only stale rows are removed afterwards; `sync_status` is written last. Reads return `null` on any error instead of serving truncated data, and call paging is now ordered by `call_id`.
5. ~~**Med B / PPO lost on the fallback path.**~~ **Fixed in code**; the database needs the migration at the top of `supabase_schema.sql` (`ALTER TABLE ... ADD COLUMN IF NOT EXISTS med_b / ppo`). Until it is applied, sync keeps working without those columns and returns a warning.
6. **Ultatel department fallback dates every call "today".** `deptSummariesToCallRecords` stamps all synthesized calls with the server's current UTC date and creates one object per call. Date filters, trends and per-day metrics are meaningless in this mode, and the header should say so.
7. **Junk dates in the tracker.** If a meeting row has no parsable date in the detected date column, `fetchBDTrackerData` scans every other cell with `parseDateToISO`, whose last step is `new Date(s)`. V8 parses strings such as `"Suite 2"` or `"Plaza 5"` as valid dates, so a company name can become the meeting date.
8. **`personIdx` can pick the company column.** The matcher includes `'name'`, so `Company Name` can match before `Authorized Person`.
9. **Attendance parsing overwrites.** The comment says repeated dates keep the non-zero weight, but `agentDaily[agent][date] = weight` simply overwrites. Duplicate blocks for the same date can zero out a valid day. `agentMonthly` (column AH) is parsed but never used.
10. **Loose name matching.** `resolveOpener` and `calculateAgentPresentDays` use `startsWith(firstName)`, so `Ben` can match `Benjamin`; `isExcludedAgent` uses `startsWith`/`endsWith`, so `Georgette` is excluded with `George`. Any unmapped alphabetic name is accepted as a new opener.
11. **Exact-case enums.** Call `type` and `outcome` are compared to `'OUT-Bound'`, `'IN-Bound'`, `'ANSWERED'`, `'NO ANSWER'`. Any other casing or wording in the sheet silently counts as neither answered nor unanswered.
12. **Week keys are not ISO weeks.** `getIsoWeekKey` computes a US-style week number from the Monday's year; labels like `2026-W33` may not match ISO-8601 and can misgroup around New Year. Grouping itself (Mon–Sun) is correct.
13. **Timezone drift.** `expectedWorkingDays` builds dates with `new Date('YYYY-MM-DD')` (UTC) but reads `getDay()` (local), which shifts weekdays on a server or browser west of UTC. The Apps Script converts call dates to Cairo time while the Next.js side parses date strings as written.
14. **Misleading fallback values.** `callsPerPresentDay` falls back to raw call count (periodic rows) or calls-per-calendar-day when there is no attendance match, with no indication in the UI.
15. **Rolling-stage counts are a snapshot.** Meetings are counted in the tab they currently sit in, using the original *Date Added*. A lead that moves to Onboarded later still counts in its original period; this is by design but should be understood when reading period close rates.

## B. Performance / scalability

- **No caching.** Every dashboard request (including each filter change and refresh) re-reads three to five Sheets ranges plus local Excel files. This is the likeliest cause of quota errors. *Fix:* cache raw data in memory for 1–5 minutes (or read from Supabase by default and refresh via cron), and compute metrics from the cache.
- **Whole call log in the response.** `/api/dashboard` returns every filtered call record; for a month that can be tens of thousands of rows of JSON. Paginate or only send calls for the Call Logs tab on demand.
- `computeDashboardMetrics` calls `resolveOpener` (linear scan of mappings) for every call and meeting and `parseDateToISO` repeatedly; a `Map` lookup and a single parse per record would help.
- `buildPeriodicBreakdown` runs three times and `calculateAgentPresentDays` re-resolves names per agent per period; precompute an agent→attendance-key map once.
- The Supabase read loop runs sequential pages of 1,000 with a 15 s timeout that does not cancel the underlying queries.

## C. Security / hygiene

- **`/api/dashboard` has no authentication** and returns phone numbers, notes and call paths. Anyone with the URL can read it.
- Hard-coded defaults in source: Supabase project URL, both sheet IDs, and the service-account email in an error message.
- Repository clutter: `Win64OpenSSL_Light-4_0_2.exe` (5.7 MB installer), `Untitled-1.txt` / `Untitled-1 copy.txt` (identical, 20 KB), empty `x.txt`, `supabase/.temp/*` (CLI state), two real data workbooks at the root, and a stale `my-dashboard/` folder. `.gitignore` contains a Windows path to a service-account key; make sure that key was never committed (`git log --all -- '*.json'`).
- `agents.md` forbids committing/pushing unless asked and assumes Windows/PowerShell; keep that in mind for automation.

## D. Gaps

- **No tests.** The date parsers, `resolveOpener`, attendance weighting and the metric formulas are pure functions and are the best place to start (Vitest/Jest, using small fixtures).
- **No CI** (type-check, lint, build).
- **Dead code**: `src/lib/firestore.ts` and its `@google-cloud/firestore` dependency, `firebase.ts` stub, `Untitled-1*.txt`, `my-dashboard/`.
- Unused/duplicate config: `OPENER_COL`, `RAW_HEADERS`, `CALL_LOG_EXTRA` in `config.ts` are not referenced by the Next.js code (they mirror the Apps Script).
- Excluded agents and the sheet structure are duplicated in `config.ts` and `apps-script/Code.js`; they must be kept in sync by hand.
- The `Call Logs` range `A2:O` is read in a single call with no paging; very large sheets will approach Sheets API response limits.
- Error-handling gaps: partial failures (e.g. tracker down, calls up) are logged but not surfaced in the UI; `dataSourceInfo.notes` is only set for local attendance.

## Suggested order of work
1. ~~Sync/fallback safety (#2–#5)~~ done; apply the Supabase migration.
2. Add a short in-memory cache and drop the full call list from the default response.
3. Add auth to `/api/dashboard` (or restrict via Vercel protection).
4. Add unit tests for the pure functions, then clean up the dead code and repo clutter.
