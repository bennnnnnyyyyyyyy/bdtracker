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

-- 5. Indexes for fast queries
CREATE INDEX IF NOT EXISTS idx_calls_opener ON public.calls (opener);
CREATE INDEX IF NOT EXISTS idx_calls_date ON public.calls (call_date);
CREATE INDEX IF NOT EXISTS idx_meetings_opener ON public.meetings (opener);
CREATE INDEX IF NOT EXISTS idx_meetings_stage ON public.meetings (stage);

-- Disable Row Level Security (RLS) or enable public read for dashboard
ALTER TABLE public.agent_mappings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.meetings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.calls ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.metadata ENABLE ROW LEVEL SECURITY;

-- Allow server service_role key full access
CREATE POLICY IF NOT EXISTS "Allow all for service role" ON public.agent_mappings FOR ALL USING (true);
CREATE POLICY IF NOT EXISTS "Allow all for service role" ON public.meetings FOR ALL USING (true);
CREATE POLICY IF NOT EXISTS "Allow all for service role" ON public.calls FOR ALL USING (true);
CREATE POLICY IF NOT EXISTS "Allow all for service role" ON public.metadata FOR ALL USING (true);
