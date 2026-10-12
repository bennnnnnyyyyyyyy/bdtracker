# Audit Findings and Resolution Status

Result of a full code review, with what was done about each item. The pure-logic fixes are covered by `npm test` (`tests/`). Items that depend on your live Google Sheets, Supabase project or Vercel environment could not be exercised from the development sandbox and are marked **verify live**.

## A. Correctness

| # | Finding | Status |
| :--- | :--- | :--- |
| 1 | Show rate defined two ways | **Fixed** — the owner confirmed show rate is `attended ÷ (attended + no-show)` everywhere, so the org total (previously `attended ÷ booked`) now uses the same formula. A pending-only person is no longer flagged "needs attention". |
| 2 | Supabase sync could wipe the fallback after a failed Sheets read | **Fixed** — sync returns 503 when any source failed and the save refuses empty calls/meetings. |
| 3 | Fallback unreachable when a source failed | **Fixed** — `failedSources` is tracked; the dashboard falls back to the snapshot and says so in a banner. |
| 4 | Supabase errors never checked; delete-then-insert not safe | **Fixed** — all responses checked, new rows written before old ones removed (with rollback), stale rows removed last, reads return `null` on error, stable paging, timed-out queries are aborted. |
| 5 | Med B / PPO lost on the fallback path | **Fixed** in code. **Action:** run `supabase_schema.sql` in the Supabase SQL editor (adds `med_b`, `ppo`; also fixes the policy syntax and restricts policies to `service_role`). |
| 6 | Ultatel department report dates every call "today" | **Mitigated** — the report has no dates at all, so it cannot be fixed; the dashboard now shows a warning banner whenever it is the call source. |
| 7 | Junk dates (`"Suite 2"` parsed as a date) | **Fixed** — strict date validation; the row-scan skips text columns. |
| 8 | Contact column resolving to Company Name | **Fixed.** |
| 9 | Attendance blocks overwriting an earlier mark with a blank | **Fixed** (a later blank no longer erases an earlier mark). Column AH totals are still parsed but unused by design — the dashboard re-sums the daily codes so any date range works. |
| 10 | Loose name matching (`Ben`↔`Benjamin`, `Georgette`↔`George`) | **Fixed** — whole-word, unique matching in the web app and the Apps Script. Unmapped plain names still appear as their own opener on purpose so data is never silently dropped. |
| 11 | Exact-case call type / outcome | **Fixed** — normalized to OUT-Bound / IN-Bound / ANSWERED / NO ANSWER; `INTERNAL` calls are excluded entirely; other unknown values (e.g. `BUSY` outcome) are kept and count only toward total calls. |
| 12 | Week keys not ISO-8601 | **Fixed** — true ISO weeks (`2026-W53` handling around New Year is tested). |
| 13 | Timezone drift in the working-day count | **Fixed** — UTC calendar arithmetic. Call dates are Cairo time written by the Apps Script and are used as written, which is consistent. |
| 14 | Silent fallbacks when attendance is missing | **Mitigated** — a banner appears when no attendance data is found; the fallback is documented. |
| 15 | Stage counts are a snapshot by Date Added | **By design** — documented. |

## B. Performance
- **Caching** — done (60 s, configurable, with stale-on-error).
- **Full call list in every response** — done: calls are only requested when the Call Logs tab is opened.
- **Repeated name resolution / date parsing / attendance lookups** — done: per-run memoization, a bounded date-parse cache, and a cached attendance-key lookup.
- **Supabase 15 s timeout did not cancel queries** — done (AbortController).
- **Sheets call-log read** — now chunked (20 000 rows per request).

## C. Security and hygiene
- **No auth on `/api/dashboard`** — a shared-password login was built and then removed at the owner's request, so the dashboard and its data (phone numbers, call notes) are reachable by anyone with the URL. Consider Vercel Deployment Protection instead.
- **Open Supabase policies for anon** — fixed in `supabase_schema.sql` (service role only). **Action:** use `SUPABASE_SERVICE_ROLE_KEY`, not the anon key.
- **Repository clutter** — removed: OpenSSL installer, duplicate `Untitled-1*.txt`, empty `x.txt`, `supabase/.temp/` (now git-ignored), stale `my-dashboard/`, a Windows key path in `.gitignore`. A history check found no service-account key or `.env` ever committed. The local `.xlsx` workbooks stay: the app uses them as fallbacks and `agents.md` asks that they be preserved.
- **Hard-coded Supabase URL and sheet IDs** — left as defaults on purpose (identifiers, not secrets; removing them could break an existing deployment that relies on them). They can be overridden by environment variables.

## D. Gaps
- **Tests** — added (Vitest, 29 tests): date/duration parsing, ISO weeks, normalization, exclusions, opener resolution, attendance, and end-to-end metric formulas.
- **CI** — added (`.github/workflows/ci.yml`: typecheck, lint, tests, build).
- **Dead code** — removed Firestore/Firebase modules and the `@google-cloud/firestore` dependency; removed unused config keys.
- **Duplicated config** — cross-referenced in comments (`config.ts` ↔ `apps-script/Code.js`); still maintained in both places by hand because Apps Script cannot import from the app.
- **Error visibility** — the dashboard now shows a banner for any source warning (fallback in use, partial load, missing attendance, department-report dates).

## Still open (deliberate or needs your decision)
- Run `clasp push` yourself if you want the Apps Script exclusion change deployed (not done from here).
- A holiday calendar for adherence (needs a list of holidays from you).
- **Verify live:** caching behaviour with real Sheets credentials, and the Supabase sync after running the migration.
