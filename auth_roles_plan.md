# Google Auth + Admin/User Role System

## Environment Setup Status (2026-10-01)

- **Google Cloud CLI:** authenticated as `ben.arthur.wiz@gmail.com`; active project is `bd-tracker-auth-2026` (`BD Tracker Auth`, project number `682900500567`).
- **Supabase CLI:** authenticated as the owner of organization `awjabidnhwqepsklbovx` and linked to project `tyideivywfxxvqbfdxag` (`judy.collins.wiz@gmail.com's Project`, region `eu-west-3`). This is the intended project for this rollout.
- **Hosted Supabase project:** active and healthy; the existing `agent_mappings`, `calls`, `meetings`, `metadata`, and `user_profiles` tables are present.
- **Local Supabase status:** linked successfully. `supabase status` may still report a Docker/Podman warning because local emulation is not installed; hosted operations do not require Docker.
- **Decision:** use this existing Supabase project with the new GCP project. Do not create a second Supabase project or modify the old data tables destructively.

## New Cloud Project Checklist

### You need to have open

1. **Google Cloud Console:** the new project selected, with its project ID recorded.
2. **Google Cloud OAuth consent screen:** app name, support email, and developer contact email ready.
3. **Google Cloud OAuth client:** Web application client creation page ready; the client ID and secret will be copied into Supabase.
4. **Supabase Dashboard:** the new project open at **Authentication → Providers → Google**.
5. **This repository:** `.env.local` available for the new Supabase URL and anon key. Keep the service-role key private and do not commit it.

### CLI steps after the projects exist

```powershell
# The new GCP project is already created and selected.
gcloud config set project bd-tracker-auth-2026

# The intended Supabase project is already linked.
supabase link --project-ref tyideivywfxxvqbfdxag
```

After linking, verify the target before applying anything:

```powershell
supabase projects list
supabase status
```

The Google OAuth redirect URI will be:

```text
https://tyideivywfxxvqbfdxag.supabase.co/auth/v1/callback
```

Use that URI in the Google OAuth client, then paste the Google client ID and secret into the new Supabase project's Google provider settings.

## Goal

Replace the current HTTP Basic Auth middleware with **Supabase Google OAuth** login.
After login, the app shows one of two experiences based on the user's role:


| Role             | Who                                                | What they see                                                                             |
| ------------------ | ---------------------------------------------------- | ------------------------------------------------------------------------------------------- |
| **Admin**        | ben.arthur.wiz@gmail.com, mike.woods.wiz@gmail.com | Full existing dashboard +**Admin menu** (Import Excel, Sync, manage user→agent mappings) |
| **Agent (User)** | All other approved Google accounts                 | Their own KPIs only — calls, bookings, connection rate, etc. No other agents visible     |

---

## User Review Required

> [!IMPORTANT]
> **Supabase OAuth Setup required**: Before the app can use Google login, you need to enable the Google provider in Supabase **and** configure a Google Cloud OAuth 2.0 Client. Step-by-step instructions are in the Verification Plan section below — this takes ~10 minutes in the Supabase dashboard + Google Cloud Console.

> [!IMPORTANT]
> **New env vars needed** in `.env.local` (and in Vercel's project settings):
>
> - `NEXT_PUBLIC_SUPABASE_ANON_KEY` — already present ✓
> - `NEXT_PUBLIC_SUPABASE_URL` — already present ✓
> - No new server-side vars needed (the anon key + Supabase Auth handles everything)

> [!WARNING]
> The current `middleware.ts` HTTP Basic Auth will be **replaced**. Anyone who knew the old Basic Auth credentials will no longer be able to bypass the login screen.

---

## Open Questions

> [!IMPORTANT]
> **Agent email → opener name mapping**: Agents log in with their Gmail. Admins will use the new "User Mappings" panel in the Admin menu to map e.g. `sarah@gmail.com → Sarah`. This mapping is stored in a new `user_profiles` Supabase table.

---

## Proposed Changes

### Architecture Overview

```
Browser
  ├─ /login             → LoginPage (Google OAuth button)
  ├─ /                  → Protected by middleware:
  │    ├─ Admin         → existing full DashboardPage + AdminMenu drawer
  │    └─ Agent         → new AgentSelfView (own KPIs only)
  └─ /admin/users       → AdminUsersPage (map emails → opener names)
```

Auth flow:

1. User hits any page → middleware checks for Supabase session cookie
2. No session → redirect to `/login`
3. Login page → Supabase `signInWithOAuth({ provider: 'google' })`
4. Google redirects back → Supabase exchanges code for session
5. Session created → middleware reads `user.email`, checks `user_profiles` table for role
6. Admin email hardcoded in config → render full dashboard + AdminMenu
7. Agent email → lookup their `opener_name` in `user_profiles` → render AgentSelfView

---

### 1. Supabase: New `user_profiles` table

#### [NEW] `supabase_schema_users.sql` (run in Supabase SQL Editor)

```sql
-- User profiles table: maps Google email → opener name + role
CREATE TABLE IF NOT EXISTS public.user_profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT UNIQUE NOT NULL,
  opener_name TEXT,                    -- matches opener column in calls/meetings tables
  role TEXT NOT NULL DEFAULT 'agent',  -- 'admin' | 'agent'
  display_name TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Allow authenticated users to read their own row
ALTER TABLE public.user_profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read own profile"
  ON public.user_profiles FOR SELECT
  TO authenticated
  USING (email = auth.jwt() ->> 'email');

-- Service role can do everything (for admin panel writes)
CREATE POLICY "Service role full access"
  ON public.user_profiles FOR ALL
  TO service_role USING (true) WITH CHECK (true);
```

---

### 2. Auth configuration

#### [MODIFY] `src/lib/auth.ts` [NEW FILE]

```ts
import { createBrowserClient } from "@supabase/ssr";

// Admin emails — hardcoded for simplicity
export const ADMIN_EMAILS = [
  "ben.arthur.wiz@gmail.com",
  "mike.woods.wiz@gmail.com",
];

export function isAdmin(email: string | undefined | null): boolean {
  if (!email) return false;
  return ADMIN_EMAILS.includes(email.toLowerCase().trim());
}

export function createSupabaseBrowserClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  );
}
```

#### [MODIFY] `src/lib/supabase-server.ts` [NEW FILE]

Server-side Supabase client using `@supabase/ssr` cookies helper (for middleware + Server Components).

---

### 3. Middleware (replace HTTP Basic Auth)

#### [MODIFY] `src/middleware.ts`

Replace the Basic Auth check with a Supabase session check:

```ts
import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Always allow login page and auth callback
  if (pathname.startsWith("/login") || pathname.startsWith("/auth/callback")) {
    return NextResponse.next();
  }

  // Check Supabase session via cookies
  const response = NextResponse.next();
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        /* read from request, write to response */
      },
    },
  );

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.redirect(new URL("/login", request.url));
  }

  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
```

---

### 4. New pages & components

#### [NEW] `src/app/login/page.tsx`

A full-screen login page matching the existing dark aesthetic:

- "BD Manager Dashboard" branding
- "Sign in with Google" button → calls `supabase.auth.signInWithOAuth({ provider: 'google', options: { redirectTo: '/auth/callback' } })`

#### [NEW] `src/app/auth/callback/route.ts`

OAuth callback handler — exchanges the code for a session and redirects to `/`.

```ts
import { createServerClient } from "@supabase/ssr";
import { NextRequest, NextResponse } from "next/server";

export async function GET(request: NextRequest) {
  const code = request.nextUrl.searchParams.get("code");
  if (code) {
    // exchange code for session
    await supabase.auth.exchangeCodeForSession(code);
  }
  return NextResponse.redirect(new URL("/", request.url));
}
```

#### [MODIFY] `src/app/page.tsx`

Add role-check at the top. After data loads:

- If `isAdmin(user.email)` → render existing full dashboard (no changes to the existing view code)
- Else → render `<AgentSelfView openerName={profile.opener_name} />`

#### [NEW] `src/components/AgentSelfView.tsx`

Shows only the logged-in agent's stats. Reuses existing `AgentDashboardView` with a single agent filtered. Displays:

- Their personal KPI cards (calls, booked, connection rate, close rate)
- Their personal call logs
- A "Hello, [Name]" greeting with their Google avatar + sign-out button

#### [MODIFY] `src/components/Header.tsx`

Add a **user avatar + sign-out button** in the top-right corner (for both admin and agent views).
For admins, also show an **"Admin" badge** that opens the Admin drawer.

#### [NEW] `src/components/AdminMenu.tsx`

A slide-in drawer accessible from the Header. Contains:

- **Import Excel** (existing `FileImportModal` trigger)
- **Sync to Sheets** (existing sync button)
- **User Mappings** → opens `UserMappingsPanel`

#### [NEW] `src/components/UserMappingsPanel.tsx`

Admin-only panel (inside AdminMenu) that lets admins:

- See all rows in `user_profiles`
- Add new row: email + opener_name dropdown (from `availableOpeners`)
- Edit opener_name for existing rows
- Delete rows

Talks to a new API route: `/api/admin/users`.

#### [NEW] `src/app/api/admin/users/route.ts`

Server-side CRUD for `user_profiles`:

- `GET` → list all profiles (admin only, verified server-side)
- `POST` → create/update a mapping
- `DELETE` → remove a mapping

---

### 5. Install `@supabase/ssr`

```
npm install @supabase/ssr
```

The `@supabase/ssr` package replaces the deprecated `@supabase/auth-helpers-nextjs` and works with Next.js App Router middleware + Server Components.

---

## Verification Plan

### Step 1: Supabase Setup (manual, ~10 min)

1. Go to [Supabase Dashboard](https://supabase.com/dashboard) → your project → **Authentication → Providers**
2. Enable **Google** provider
3. You'll get a **Supabase Redirect URI** (e.g. `https://tyideivywfxxvqbfdxag.supabase.co/auth/v1/callback`)
4. Go to [Google Cloud Console](https://console.cloud.google.com) → APIs & Services → Credentials → Create OAuth 2.0 Client ID
5. Add the Supabase redirect URI as an **Authorized Redirect URI**
6. Copy the **Client ID** and **Client Secret** back into Supabase Google provider settings
7. Also add your local dev URL: `http://localhost:3000/auth/callback` as an authorized origin in Google Console

### Step 2: Run SQL

Run `supabase_schema_users.sql` in Supabase SQL Editor.

### Automated Tests

None automated (this is UI auth flow) — manual verification steps below.

### Manual Verification

1. Open `http://localhost:3000` → should redirect to `/login`
2. Click "Sign in with Google" → Google OAuth → returns to app
3. **As admin (ben.arthur.wiz@gmail.com)**: full dashboard visible, Admin menu accessible, User Mappings panel works
4. **As agent**: only own KPIs visible (need to first add their email in User Mappings as admin)
5. Sign out → redirected back to `/login`
