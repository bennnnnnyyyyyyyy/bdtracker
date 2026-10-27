-- ============================================================
-- DME Desk Prospector data, hosted in the BD Tracker project, for analysis alongside public.calls.
-- Status: FOR REVIEW. NOT APPLIED. Do not run until the owner says so.
--
-- Additive only: no DROP, TRUNCATE or DELETE. Safe to re-run. One transaction.
-- Run in the BD TRACKER project (ref tyideivywfxxvqbfdxag), never in the Prospector's own project.
--
-- Only analysis columns are copied. Contact details (email, direct line, gatekeeper name) and the note text
-- are NOT copied; the Prospector keeps them. Booleans and a note length stand in for them.
-- Prospector user ids and NPIs are plain columns with no foreign keys: this project's public.app_users
-- is a different user list.
-- ============================================================

begin;

-- One row per tap (user_id, npi, number, tapped_at in UTC). The scheduled job upserts with
-- onConflict "user_id,npi,phone,tapped_at" and ignoreDuplicates, so re-sending a tap adds nothing.
create table if not exists public.prospector_taps (
  id bigint generated always as identity primary key,
  user_id uuid not null,
  npi text not null check (char_length(npi) between 1 and 20),
  phone text not null check (phone ~ '^[0-9]{10}$'),
  tapped_at timestamptz not null,
  synced_at timestamptz not null default now(),
  unique (user_id, npi, phone, tapped_at)
);
create index if not exists prospector_taps_phone_time on public.prospector_taps (phone, tapped_at);
create index if not exists prospector_taps_time on public.prospector_taps (tapped_at desc);
create index if not exists prospector_taps_npi on public.prospector_taps (npi);

-- Analysis copy of the Prospector's lead_intel (same checks), minus contact details.
create table if not exists public.prospector_lead_intel (
  npi text primary key check (char_length(npi) between 1 and 20),
  current_biller text check (char_length(current_biller) <= 80),
  patient_volume text check (char_length(patient_volume) <= 60),
  objection text check (objection in ('price', 'in-house', 'happy with current', 'bad timing', 'not the decision maker', 'no need', 'other')),
  has_gatekeeper boolean not null default false,
  has_direct_line boolean not null default false,
  has_email boolean not null default false,
  follow_up_at date,
  updated_by uuid,
  updated_at timestamptz not null,
  synced_at timestamptz not null default now()
);
create index if not exists prospector_lead_intel_objection on public.prospector_lead_intel (objection) where objection is not null;
create index if not exists prospector_lead_intel_follow_up on public.prospector_lead_intel (follow_up_at) where follow_up_at is not null;

-- One row per note, with its length but not its text. npi is looked up from the Prospector's leads table by the job.
create table if not exists public.prospector_lead_notes (
  id uuid primary key,
  npi text not null check (char_length(npi) between 1 and 20),
  note_chars integer not null check (note_chars >= 0),
  created_by uuid,
  created_at timestamptz not null,
  synced_at timestamptz not null default now()
);
create index if not exists prospector_lead_notes_npi on public.prospector_lead_notes (npi);
create index if not exists prospector_lead_notes_time on public.prospector_lead_notes (created_at desc);

-- Analysis copy of the Prospector's lead_tags (short labels, 1 to 24 characters, same check). One row per lead and tag.
create table if not exists public.prospector_lead_tags (
  npi text not null check (char_length(npi) between 1 and 20),
  tag text not null check (char_length(tag) between 1 and 24),
  user_id uuid not null,
  created_at timestamptz not null,
  synced_at timestamptz not null default now(),
  primary key (npi, tag)
);
create index if not exists prospector_lead_tags_tag on public.prospector_lead_tags (tag);

-- Prospector user id -> BD Tracker opener name. Filled by hand; empty until then.
create table if not exists public.prospector_user_map (
  user_id uuid primary key,
  opener text not null check (char_length(opener) <= 80),
  created_at timestamptz not null default now()
);

-- Service role only. Supabase default privileges grant new tables to anon/authenticated, so revoke explicitly.
do $$
declare
  t text;
begin
  foreach t in array array['prospector_taps', 'prospector_lead_intel', 'prospector_lead_notes', 'prospector_lead_tags', 'prospector_user_map'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on table public.%I from public, anon, authenticated', t);
    execute format('grant select, insert, update, delete on table public.%I to service_role', t);
    if not exists (
      select 1 from pg_policies where schemaname = 'public' and tablename = t and policyname = 'Service role only'
    ) then
      execute format('create policy "Service role only" on public.%I for all to service_role using (true) with check (true)', t);
    end if;
  end loop;
end $$;

revoke all on sequence public.prospector_taps_id_seq from public, anon, authenticated;
grant usage, select on sequence public.prospector_taps_id_seq to service_role;

commit;
