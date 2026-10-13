# Setup: Accounts, Show Confirmations and Live Updates

## What management gets
- **Per-person sign-in.** Every user has their own email + password. Roles: **admin** (everything, including managing users), **manager** (can confirm shows), **viewer** (read-only).
- **Shows need confirmation.** A meeting counts as a show only after an admin or manager confirms it in the dashboard (**Confirm shows** tab). Unconfirmed meetings never count, whatever tab they sit in. Meetings in **No-Show** or **Dead Leads** can never be confirmed as shows.
- **Follow-up queue.** Meetings in Follow Ups / Contract Sent / Invoice Sent / Onboarded / Temporary Inactive that nobody has confirmed yet are counted as **awaiting confirmation** on the Show rate card, on each person's card and as a badge on the tab.
- **Audit trail.** Who confirmed or undid each meeting, and when, is stored permanently (`show_confirmation_events`).
- **Live numbers.** An open dashboard re-reads the server every 30 seconds (only while the browser tab is visible, plus immediately when you return to it). The header shows "● Live" and the time the data was actually read from the sheets.

## One-time setup
1. **Run the schema.** Open `supabase_schema.sql` in the Supabase SQL editor and run the whole file (it is safe to re-run). It adds the `app_users`, `show_confirmations` and `show_confirmation_events` tables, locked to the service role.
2. **Environment variables** (Vercel project settings, and `.env.local` for local use):
   | Variable | Purpose |
   | :--- | :--- |
   | `AUTH_SECRET` | Random string, 32+ characters. Signs the session cookies. In production the site returns 503 without it. Generate one with `openssl rand -base64 48`. Changing it signs everyone out. |
   | `SUPABASE_SERVICE_ROLE_KEY` | Required for accounts and confirmations (the anon key cannot access these tables). |
   | `NEXT_PUBLIC_SUPABASE_URL` | Your Supabase URL (already defaulted in code). |
   | `CRON_SECRET` | Protects `/api/sync` (unchanged). |
   | `CALL_DAY_TIMEZONE` | Optional. Which clock decides a call's day. Default `Etc/GMT+6` (Ultatel's clock, matches Ultatel reports). Use `Africa/Cairo` to count days from Cairo midnight. |
   | `DASHBOARD_CACHE_TTL_SECONDS` | Optional. How long server-side sheet reads are reused (default 30). |
3. **Create the first admin** on your computer (needs `.env.local` with the two Supabase variables):
   ```
   npm run create-user -- --email you@company.com --name "Your Name" --role admin
   ```
   It asks for a password (10+ characters). Then sign in and use **Manage users** (user menu, top right) to add everyone else. New users get a temporary password and must change it at first sign-in.
4. **Confirm the history once.** Signed in as an admin, open **Confirm shows** and press **One-time: confirm existing show-stage meetings**. It confirms every meeting currently in a show stage, recorded as an "initial-import" under your name. Without this, historical show rates start at 0%.

Local development without `AUTH_SECRET` runs signed in as a built-in admin ("Local development") so you can work without Supabase; confirmations then show as unavailable.

## How a meeting is identified
The tracker has no ID column, so each row gets a key made of **opener | date added | company | contact** (lower-cased). The stage is not part of the key, so moving a lead to another tab keeps its confirmation. If someone edits one of those four cells (for example renames the company), the meeting looks new and needs confirming again. Two rows with identical values get separate keys in order.

## What is not live
Phone-call numbers can only be as fresh as the last import into the `Call Logs` sheet (calls arrive by pasting the Ultatel export). Meetings and attendance update as soon as the sheet is edited (within about 30–60 seconds on screen). Making calls live too would need an Ultatel API/automatic export, which does not exist in this project today.
