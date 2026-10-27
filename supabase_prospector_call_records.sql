-- SUPERSEDED: do not run. Replaced by supabase_prospector_sync.sql (the Prospector records taps, not a call log).
-- ============================================================
-- DME Desk Prospector: call log table (hosted in the BD Tracker project)
-- Status: FOR REVIEW. NOT APPLIED. Do not run until the owner says so.
--
-- Additive only: no DROP, TRUNCATE or DELETE. Safe to re-run.
-- Run in the SQL editor of the BD TRACKER project (check the project ref first),
-- never in the Prospector's own project.
--
-- Named prospector_call_records (not call_records) so it cannot be mixed up with
-- public.calls, which already holds this project's Ultatel CDR snapshot.
-- If you keep the Prospector Worker's table name "call_records", replace the name below.
--
-- imported_by is a plain nullable uuid: it holds a Prospector user id, and this
-- project's public.app_users is a different user list, so there is no foreign key.
-- ============================================================

begin;

create table if not exists public.prospector_call_records (
  id bigint generated always as identity primary key,
  called_at timestamptz not null,
  agent text not null default '' check (char_length(agent) <= 80),
  phone text not null check (phone ~ '^[0-9]{10}$'),
  duration_sec integer check (duration_sec is null or duration_sec between 0 and 86400),
  disposition text check (disposition is null or char_length(disposition) <= 40),
  imported_by uuid,
  imported_at timestamptz not null default now(),
  unique (agent, phone, called_at)
);

create index if not exists prospector_call_records_phone on public.prospector_call_records (phone);
create index if not exists prospector_call_records_time on public.prospector_call_records (called_at desc);

-- Service role only. Supabase default privileges grant new tables to anon/authenticated, so revoke explicitly.
alter table public.prospector_call_records enable row level security;
revoke all on table public.prospector_call_records from public, anon, authenticated;
revoke all on sequence public.prospector_call_records_id_seq from public, anon, authenticated;
grant select, insert, update, delete on table public.prospector_call_records to service_role;
grant usage, select on sequence public.prospector_call_records_id_seq to service_role;

-- Same policy style as supabase_schema.sql, guarded instead of drop-then-create (service_role bypasses RLS anyway).
do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'prospector_call_records' and policyname = 'Service role only'
  ) then
    create policy "Service role only" on public.prospector_call_records
      for all to service_role using (true) with check (true);
  end if;
end $$;

commit;
