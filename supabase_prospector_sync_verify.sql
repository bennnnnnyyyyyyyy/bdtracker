-- ============================================================
-- READ-ONLY checks for the Prospector sync tables. Safe to run any time in the BD Tracker project.
-- Part A: before applying. Part B: after applying.
-- ============================================================

-- ---------- Part A: before ----------
select pg_size_pretty(pg_database_size(current_database())) as db_size,
       pg_database_size(current_database()) / 1024 / 1024 as db_mb;

-- None of these may exist yet (expect zero rows).
select table_schema, table_name
from information_schema.tables
where table_schema = 'public'
  and table_name in ('prospector_taps', 'prospector_lead_intel', 'prospector_lead_notes', 'prospector_user_map',
                     'prospector_tap_outcomes', 'call_records', 'prospector_call_records');

-- ---------- Part B: after ----------
-- B1. All four tables exist with RLS on (expect 4 rows, rowsecurity = true).
select tablename, rowsecurity
from pg_tables
where schemaname = 'public'
  and tablename in ('prospector_taps', 'prospector_lead_intel', 'prospector_lead_notes', 'prospector_user_map')
order by tablename;

-- B2. No privileges for anon/authenticated/public on tables or the view (expect ZERO rows).
select table_name, grantee, privilege_type
from information_schema.role_table_grants
where table_schema = 'public' and table_name like 'prospector\_%'
  and grantee in ('anon', 'authenticated', 'PUBLIC');

-- B3. service_role privileges (expect SELECT, INSERT, UPDATE, DELETE on tables; SELECT on the view).
select table_name, string_agg(privilege_type, ', ' order by privilege_type) as privileges
from information_schema.role_table_grants
where table_schema = 'public' and table_name like 'prospector\_%' and grantee = 'service_role'
group by table_name
order by table_name;

-- B4. Indexes.
select tablename, indexname
from pg_indexes
where schemaname = 'public' and (tablename like 'prospector\_%' or indexname = 'calls_to_num_last10')
order by tablename, indexname;

-- B5. Constraints (primary keys, unique key on taps, checks).
select conrelid::regclass as table_name, conname, contype, pg_get_constraintdef(oid) as definition
from pg_constraint
where conrelid in ('public.prospector_taps'::regclass, 'public.prospector_lead_intel'::regclass,
                   'public.prospector_lead_notes'::regclass, 'public.prospector_user_map'::regclass)
order by conrelid::regclass::text, contype, conname;

-- B6. Policies (expect "Service role only" on each of the four tables).
select tablename, policyname, roles, cmd
from pg_policies
where schemaname = 'public' and tablename like 'prospector\_%'
order by tablename;

-- B7. The view exists and runs as the caller (expect reloptions to include security_invoker=true).
select c.relname, c.reloptions
from pg_class c join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public' and c.relname = 'prospector_tap_outcomes';

-- B8. Tables start empty (expect 0 in each).
select (select count(*) from public.prospector_taps) as taps,
       (select count(*) from public.prospector_lead_intel) as intel,
       (select count(*) from public.prospector_lead_notes) as notes,
       (select count(*) from public.prospector_user_map) as user_map;

-- B9. After the first sync: how many taps found a call (read-only; matched share by day).
-- select tapped_at::date as day, count(*) as taps, count(*) filter (where matched) as matched
-- from public.prospector_tap_outcomes group by 1 order by 1 desc limit 14;

-- Do not test access with the BD Tracker anon key beyond confirming it is refused.
