-- ============================================================
-- Supabase SQL Schema for BD Tracker
-- Copy & paste this into the Supabase SQL Editor and click RUN
-- ============================================================

-- 1. Agent Mappings Table
CREATE TABLE IF NOT EXISTS public.agent_mappings (
  agent TEXT PRIMARY KEY,
  opener TEXT NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. Meetings Table (BD Tracker pipeline tabs)
CREATE TABLE IF NOT EXISTS public.meetings (
  id BIGSERIAL PRIMARY KEY,
  stage TEXT NOT NULL,
  opener TEXT NOT NULL,
  date_added TEXT,
  company_name TEXT,
  authorized_person TEXT,
  med_b BOOLEAN DEFAULT FALSE,
  ppo BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Migration for databases created before Med B / PPO were tracked (safe to re-run):
ALTER TABLE public.meetings ADD COLUMN IF NOT EXISTS med_b BOOLEAN DEFAULT FALSE;
ALTER TABLE public.meetings ADD COLUMN IF NOT EXISTS ppo BOOLEAN DEFAULT FALSE;

-- 3. Calls Table (Ultatel CDR logs)
CREATE TABLE IF NOT EXISTS public.calls (
  call_id TEXT PRIMARY KEY,
  call_date TEXT,
  from_num TEXT,
  to_num TEXT,
  extension TEXT,
  department TEXT,
  did TEXT,
  description TEXT,
  call_type TEXT,
  outcome TEXT,
  duration TEXT,
  duration_sec INTEGER DEFAULT 0,
  notes TEXT,
  call_path TEXT,
  agent TEXT,
  opener TEXT,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 4. Metadata Table (Sync status & aggregated tracker counts)
CREATE TABLE IF NOT EXISTS public.metadata (
  key TEXT PRIMARY KEY,
  value JSONB,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 5. Indexes for fast queries
CREATE INDEX IF NOT EXISTS idx_calls_opener ON public.calls (opener);
CREATE INDEX IF NOT EXISTS idx_calls_date ON public.calls (call_date);
CREATE INDEX IF NOT EXISTS idx_meetings_opener ON public.meetings (opener);
CREATE INDEX IF NOT EXISTS idx_meetings_date ON public.meetings (date_added);
CREATE INDEX IF NOT EXISTS idx_meetings_stage ON public.meetings (stage);

-- Disable Row Level Security (RLS) or enable public read for dashboard
ALTER TABLE public.agent_mappings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.meetings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.calls ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.metadata ENABLE ROW LEVEL SECURITY;

-- Allow only the server's service_role key (the app's SUPABASE_SERVICE_ROLE_KEY) full access.
-- Postgres has no CREATE POLICY IF NOT EXISTS, so drop-then-create keeps this re-runnable.
-- NOTE: no policy is granted to anon/authenticated, so the public anon key cannot read or write these tables.
DROP POLICY IF EXISTS "Allow all for service role" ON public.agent_mappings;
DROP POLICY IF EXISTS "Allow all for service role" ON public.meetings;
DROP POLICY IF EXISTS "Allow all for service role" ON public.calls;
DROP POLICY IF EXISTS "Allow all for service role" ON public.metadata;
CREATE POLICY "Allow all for service role" ON public.agent_mappings FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "Allow all for service role" ON public.meetings FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "Allow all for service role" ON public.calls FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "Allow all for service role" ON public.metadata FOR ALL TO service_role USING (true) WITH CHECK (true);

-- ============================================================
-- User accounts and management show confirmations
-- (safe to re-run; run this whole file again after pulling updates)
-- ============================================================

CREATE TABLE IF NOT EXISTS public.app_users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('admin', 'manager', 'uploader', 'viewer')),
  password_hash TEXT NOT NULL,
  active BOOLEAN NOT NULL DEFAULT TRUE,
  must_change_password BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_login_at TIMESTAMPTZ
);

-- Existing installs: widen the role check to include 'uploader' (safe to re-run).
ALTER TABLE public.app_users DROP CONSTRAINT IF EXISTS app_users_role_check;
ALTER TABLE public.app_users ADD CONSTRAINT app_users_role_check CHECK (role IN ('admin', 'manager', 'uploader', 'viewer'));

-- A meeting counts as a show only if a row exists here.
CREATE TABLE IF NOT EXISTS public.show_confirmations (
  meeting_key TEXT PRIMARY KEY,
  opener TEXT,
  company_name TEXT,
  authorized_person TEXT,
  date_added TEXT,
  stage_at_confirmation TEXT,
  confirmed_by_id UUID REFERENCES public.app_users (id),
  confirmed_by_name TEXT NOT NULL,
  confirmed_by_email TEXT,
  confirmed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  source TEXT NOT NULL DEFAULT 'manual'
);

-- Append-only audit trail of every confirm / undo.
CREATE TABLE IF NOT EXISTS public.show_confirmation_events (
  id BIGSERIAL PRIMARY KEY,
  meeting_key TEXT NOT NULL,
  action TEXT NOT NULL CHECK (action IN ('confirm', 'revoke')),
  user_id UUID,
  user_name TEXT,
  user_email TEXT,
  stage TEXT,
  source TEXT,
  at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_show_events_key ON public.show_confirmation_events (meeting_key);

-- Meetings the dashboard has seen with the status "Rescheduled": once held, they need a show confirmation
-- even if they were booked before the confirmation start date.
CREATE TABLE IF NOT EXISTS public.rescheduled_meetings (
  meeting_key TEXT PRIMARY KEY,
  opener TEXT,
  company_name TEXT,
  date_added TEXT,
  first_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.app_users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.show_confirmations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.show_confirmation_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.rescheduled_meetings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Service role only" ON public.app_users;
DROP POLICY IF EXISTS "Service role only" ON public.show_confirmations;
DROP POLICY IF EXISTS "Service role only" ON public.show_confirmation_events;
DROP POLICY IF EXISTS "Service role only" ON public.rescheduled_meetings;
CREATE POLICY "Service role only" ON public.app_users FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "Service role only" ON public.show_confirmations FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "Service role only" ON public.show_confirmation_events FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "Service role only" ON public.rescheduled_meetings FOR ALL TO service_role USING (true) WITH CHECK (true);

-- Agents who have left: they stop appearing in date ranges that start after their last day.
CREATE TABLE IF NOT EXISTS public.agent_retirements (
  opener_key TEXT PRIMARY KEY,           -- lower-case opener name
  opener TEXT NOT NULL,
  last_day TEXT NOT NULL,                -- yyyy-MM-dd, the last day they worked
  set_by TEXT,
  set_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
ALTER TABLE public.agent_retirements ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Service role only" ON public.agent_retirements;
CREATE POLICY "Service role only" ON public.agent_retirements FOR ALL TO service_role USING (true) WITH CHECK (true);
