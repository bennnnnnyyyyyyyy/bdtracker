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
  created_at TIMESTAMPTZ DEFAULT NOW()
);

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

-- 5. Google-authenticated dashboard users and their dashboard roles.
-- The following ALTER statements also make this safe to run on older projects.
CREATE TABLE IF NOT EXISTS public.user_profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT UNIQUE NOT NULL,
  opener_name TEXT,
  role TEXT NOT NULL DEFAULT 'agent' CHECK (role IN ('admin', 'agent')),
  display_name TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
ALTER TABLE public.user_profiles ADD COLUMN IF NOT EXISTS opener_name TEXT;
ALTER TABLE public.user_profiles ADD COLUMN IF NOT EXISTS role TEXT NOT NULL DEFAULT 'agent';
ALTER TABLE public.user_profiles ADD COLUMN IF NOT EXISTS display_name TEXT;
ALTER TABLE public.user_profiles ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT NOW();
ALTER TABLE public.user_profiles ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();
CREATE UNIQUE INDEX IF NOT EXISTS idx_user_profiles_email_lower ON public.user_profiles (LOWER(email));

-- 5. Indexes for fast queries
CREATE INDEX IF NOT EXISTS idx_calls_opener ON public.calls (opener);
CREATE INDEX IF NOT EXISTS idx_calls_date ON public.calls (call_date);
CREATE INDEX IF NOT EXISTS idx_meetings_opener ON public.meetings (opener);
CREATE INDEX IF NOT EXISTS idx_meetings_date ON public.meetings (date_added);
CREATE INDEX IF NOT EXISTS idx_meetings_stage ON public.meetings (stage);

-- Keep RLS enabled. The application uses the server-only service_role key.
ALTER TABLE public.agent_mappings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.meetings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.calls ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.metadata ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_profiles ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'agent_mappings' AND policyname = 'Service role full access') THEN
    CREATE POLICY "Service role full access" ON public.agent_mappings FOR ALL TO service_role USING (true) WITH CHECK (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'meetings' AND policyname = 'Service role full access') THEN
    CREATE POLICY "Service role full access" ON public.meetings FOR ALL TO service_role USING (true) WITH CHECK (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'calls' AND policyname = 'Service role full access') THEN
    CREATE POLICY "Service role full access" ON public.calls FOR ALL TO service_role USING (true) WITH CHECK (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'metadata' AND policyname = 'Service role full access') THEN
    CREATE POLICY "Service role full access" ON public.metadata FOR ALL TO service_role USING (true) WITH CHECK (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'user_profiles' AND policyname = 'Users can read own profile') THEN
    CREATE POLICY "Users can read own profile" ON public.user_profiles FOR SELECT TO authenticated USING (LOWER(email) = LOWER(auth.jwt() ->> 'email'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'user_profiles' AND policyname = 'Service role full access') THEN
    CREATE POLICY "Service role full access" ON public.user_profiles FOR ALL TO service_role USING (true) WITH CHECK (true);
  END IF;
END $$;
