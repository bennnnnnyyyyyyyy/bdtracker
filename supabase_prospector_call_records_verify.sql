-- SUPERSEDED: use supabase_prospector_sync_verify.sql instead.
-- ============================================================
-- READ-ONLY checks for the Prospector call table. Safe to run any time in the BD Tracker project's SQL editor.
-- Part A: before applying. Part B: after applying.
-- ============================================================

-- ---------- Part A: before ----------
-- A1. Database size now (the free plan limit is 500 MB; compare with Settings > Usage in the dashboard).
select pg_size_pretty(pg_database_size(current_database())) as db_size,
       pg_database_size(current_database()) / 1024 / 1024 as db_mb;

-- A2. Biggest tables, to see what is using the space.
select relname as table_name,
       pg_size_pretty(pg_total_relation_size(c.oid)) as total_size,
       reltuples::bigint as approx_rows
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public' and c.relkind = 'r'
order by pg_total_relation_size(c.oid) desc;

-- A3. Neither name may exist yet (expect zero rows).
select table_schema, table_name
from information_schema.tables
where table_name in ('call_records', 'prospector_call_records');

-- Region is not in SQL: dashboard > Project Settings > General (or Infrastructure).

-- ---------- Part B: after ----------
-- B1. Table exists (expect 1 row) and RLS is on (expect rowsecurity = true).
select schemaname, tablename, rowsecurity
from pg_tables
where schemaname = 'public' and tablename = 'prospector_call_records';

-- B2. No privileges for anon/authenticated/public (expect ZERO rows).
select grantee, privilege_type
from information_schema.role_table_grants
where table_schema = 'public' and table_name = 'prospector_call_records'
  and grantee in ('anon', 'authenticated', 'PUBLIC');

-- B3. Service role has access (expect SELECT, INSERT, UPDATE, DELETE).
select grantee, privilege_type
from information_schema.role_table_grants
where table_schema = 'public' and table_name = 'prospector_call_records' and grantee = 'service_role'
order by privilege_type;

-- B4. Indexes (expect pkey, unique (agent, phone, called_at), _phone, _time).
select indexname, indexdef
from pg_indexes
where schemaname = 'public' and tablename = 'prospector_call_records'
order by indexname;

-- B5. Constraints (expect primary key, unique, and the checks for agent, phone, duration_sec, disposition).
select conname, contype, pg_get_constraintdef(oid) as definition
from pg_constraint
where conrelid = 'public.prospector_call_records'::regclass
order by contype, conname;

-- B6. Policy (expect "Service role only" for service_role).
select policyname, roles, cmd
from pg_policies
where schemaname = 'public' and tablename = 'prospector_call_records';

-- B7. Table is empty and tiny (expect 0 rows).
select count(*) as rows from public.prospector_call_records;

-- B8. Only if the optional function was applied: execute rights (expect service_role only, no anon/authenticated).
select r.rolname,
       has_function_privilege(r.rolname, 'public.prospector_call_stats(text[])', 'execute') as can_execute
from pg_roles r
where r.rolname in ('anon', 'authenticated', 'service_role');

-- Do not use the BD Tracker API anon key to test access: it must be refused.
