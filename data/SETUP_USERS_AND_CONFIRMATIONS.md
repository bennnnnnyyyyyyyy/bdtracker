# Setup: Accounts, Show Confirmations and Live Updates

## What management gets
- **Per-person sign-in.** Every user has their own email + password. Roles: **admin** (everything, including managing users), **manager** (can confirm shows and upload), **uploader** (read-only, plus uploads the daily call reports and sees the missing-upload reminder), **viewer** (read-only). Existing installs must re-run `supabase_schema.sql` once so the database accepts the `uploader` role.
- **Shows need confirmation.** A meeting counts as a show only after an admin or manager confirms it in the dashboard (**Confirm shows** tab). Unconfirmed meetings never count, whatever tab they sit in. Meetings in **No-Show** or **Dead Leads** can never be confirmed as shows.
- **Follow-up queue.** Meetings in Follow Ups / Contract Sent / Invoice Sent / Onboarded / Temporary Inactive that nobody has confirmed yet are counted as **awaiting confirmation** on the Show rate card, on each person's card and as a badge on the tab.
- **Audit trail.** Who confirmed or undid each meeting, and when, is stored permanently (`show_confirmation_events`).
- **Live numbers.** An open dashboard re-reads the server every 30 seconds (only while the browser tab is visible, plus immediately when you return to it). The header shows "● Live" and the time the data was actually read from the sheets.

## One-time setup
1. **Run the schema.** Open `supabase_schema.sql` in the Supabase SQL editor and run the whole file (it is safe to re-run). It adds the `rescheduled_meetings` table (remembers rescheduled meetings) and the `app_users`, `show_confirmations` and `show_confirmation_events` tables, locked to the service role.
2. **Environment variables** (Vercel project settings, and `.env.local` for local use):
   | Variable | Purpose |
   | :--- | :--- |
   | `AUTH_SECRET` | Random string, 32+ characters. Signs the session cookies. In production the site returns 503 without it. Generate one with `openssl rand -base64 48`. Changing it signs everyone out. |
   | `SUPABASE_SERVICE_ROLE_KEY` | Required for accounts and confirmations (the anon key cannot access these tables). |
   | `NEXT_PUBLIC_SUPABASE_URL` | Your Supabase URL (already defaulted in code). |
   | `IMPORT_WEBHOOK_URL` / `IMPORT_WEBHOOK_SECRET` | Needed to upload Ultatel reports from the dashboard (see "Uploading Ultatel reports" below). |
   | `CRON_SECRET` | Protects `/api/sync` (unchanged). |
   | `CALL_DAY_TIMEZONE` | Optional. Which clock decides a call's day. Default `Africa/Cairo` (the local time stored in the sheet; Ultatel exports are now in local time too). Set `Etc/GMT+6` only to count days on Ultatel's old UTC-6 clock. |
   | `DASHBOARD_CACHE_TTL_SECONDS` | Optional. How long server-side sheet reads are reused (default 30). |
3. **Create the first admin** on your computer (needs `.env.local` with the two Supabase variables):
   ```
   npm run create-user -- --email you@company.com --name "Your Name" --role admin
   ```
   It asks for a password (10+ characters). Then sign in and use **Manage users** (user menu, top right) to add everyone else. New users get a temporary password and must change it at first sign-in.
4. **Nothing to import.** Meetings added before 2026-09-28 count by the tab they sit in (see HOW_NUMBERS_WORK.md); from 2026-09-28 on, shows are confirmed in the **Confirm shows** tab.

Local development without `AUTH_SECRET` runs signed in as a built-in admin ("Local development") so you can work without Supabase; confirmations then show as unavailable.

## How a meeting is identified
The tracker has no ID column, so each row gets a key made of **opener | date added | company | contact** (lower-cased). The stage is not part of the key, so moving a lead to another tab keeps its confirmation. If someone edits one of those four cells (for example renames the company), the meeting looks new and needs confirming again. Two rows with identical values get separate keys in order.

## What is not live
Call numbers are only as fresh as the last uploaded report (upload yesterday's Total Calls Per Extension report each morning; the dashboard reminds managers when a working day is missing). Meetings and attendance update as soon as the sheet is edited (within about 30-60 seconds on screen).

## Uploading Ultatel reports from the dashboard
In the dashboard open **Actions > Import Excel**, drop one or more Ultatel *Total Calls Per Extension* reports (CSV or Excel) and press **Upload**. The days come from the dates typed in the window, else from `Date from / Date to` in the file, else from the file name (several files can be uploaded at once). The sheet's Apps Script stores them in the `Daily Totals` tab and rebuilds the readable `Totals` tab; uploading a day again replaces it. The dialog lists any new agent that needs an Opener name (type `ignore` for people who are not on the BD team). Only admins and managers can upload. Details: `HOW_NUMBERS_WORK.md` section 2.1.

One-time setup (about 5 minutes):
1. In the call-log sheet open **Extensions > Apps Script**, paste the latest `apps-script/Code.js` and `appsscript.json` (or `clasp push`).
2. **Project Settings (gear) > Script properties > Add script property**: name `IMPORT_SECRET`, value = a long random string (for example `openssl rand -base64 32`).
3. **Deploy > New deployment > Web app**: *Execute as: Me*, *Who has access: Anyone*. Authorise when asked, then copy the **Web app URL** (ends in `/exec`). Anyone can reach the URL, but without the secret it only answers "Unauthorized".
4. In Vercel (and `.env.local`) set `IMPORT_WEBHOOK_URL` = that URL and `IMPORT_WEBHOOK_SECRET` = the same secret. Redeploy.
5. Test: upload a report. If you see "did not answer with data", the deployment access is not "Anyone"; if you see "Unauthorized", the two secrets differ.
After changing `Code.js` later, use **Deploy > Manage deployments > Edit > New version** so the web app runs the new code.

Tabs you can delete from the call-log spreadsheet once you are happy: `Import Staging`, any hidden `Backup …` tabs and `Replace Job` (left over from the earlier call-by-call uploads). Keep `Call Logs` and its month tabs (fallback), `Daily Totals`, `Totals`, `Agent Mapping` and `BD Dashboard`.

## Keeping the call log fast: automatic monthly archive
`Call Logs` grows every day and the import, the repair tools and every dashboard refresh read all of it. In the sheet run **BD Call Dashboard > Turn ON automatic archiving (weekly)** once. Every Sunday around 03:00 it moves calls older than 45 days into tabs named `Call Logs YYYY-MM`, confirming each row is in its archive tab before removing it from the active log (no manual step, no backup copy; use **Archive closed months now** if you want a hidden backup). **Automatic archiving status** shows whether it is on and what the last run did. A lock keeps it from running while an upload or repair is editing the log; it just tries again next week.
The dashboard reads archive tabs automatically when you pick a date range that reaches them. Do not rename the archive tabs; keep the `Call Logs ` prefix. Run **Repair duplicate calls** *before* the first archive, so duplicates are not archived.

## Maintenance from the dashboard (no sheet menus needed)
Everything you would otherwise do from the sheet's **BD Call Dashboard** menu is a button in the dashboard, through the same Apps Script web app used for uploads (after you redeploy it with the latest `Code.js`):
- **Actions > Call log maintenance** (admins and managers): shows how many rows the active log has and which archive tabs exist; **Check now**, **Repair duplicates** and **Fix call times** (admin); **Archive old months now**, **Turn on / off automatic archiving** (admin); and a form to type the **Opener name** for any new agent (admins and managers).
- **After an upload** whose check fails, admins see a **Repair duplicates and check again** button that repairs the sheet and re-checks the same file in one click. When a file brings new agents, the dialog asks for their Opener names right there.
Repair keeps one hidden backup sheet (`Call Logs backup (web repair)`) that is replaced each time, so backups do not pile up.

## BD Dashboard sheet mirror
In the Apps Script editor open Project Settings > Script properties and add `DASHBOARD_URL` = the dashboard address (for example `https://your-app.vercel.app`, no trailing slash). The mirror then pulls official meeting numbers from `/api/mirror`, authenticated with `IMPORT_SECRET` (which must equal `IMPORT_WEBHOOK_SECRET` in Vercel). Run any function once from the editor to approve the new "connect to an external service" permission, then deploy a new version.
