-- ============================================================
-- OPTIONAL. FOR REVIEW. NOT APPLIED. Run only after supabase_prospector_call_records.sql.
-- Returns total and answered call counts for a list of phone numbers (one row per number that has calls).
--
-- Answered = (outcome says answered/connected/spoke/etc. and does not say a miss) OR duration >= 15 s.
-- Misses: no answer, unanswered, voicemail, busy, failed, abandoned, cancelled, rejected, missed.
-- The word lists below are my reading of your description. Copy the Worker's exact rule in before use
-- so both give identical numbers (see "Parity" in the plan).
--
-- create or replace only: re-runnable, nothing is dropped. SECURITY INVOKER, empty search_path,
-- execute limited to service_role.
-- ============================================================

begin;

create or replace function public.prospector_call_stats(p_phones text[])
returns table (phone text, total bigint, answered bigint)
language sql
stable
security invoker
set search_path = ''
as $$
  select
    r.phone,
    count(*) as total,
    count(*) filter (
      where coalesce(r.duration_sec, 0) >= 15
         or (
           lower(coalesce(r.disposition, '')) ~ '(answer|connect|spoke|talk|complete)'
           and lower(coalesce(r.disposition, '')) !~ '(no[ _-]?answer|unanswer|voicemail|voice mail|busy|fail|abandon|cancel|reject|miss)'
         )
    ) as answered
  from public.prospector_call_records r
  where r.phone = any (p_phones)
  group by r.phone
$$;

revoke all on function public.prospector_call_stats(text[]) from public, anon, authenticated;
grant execute on function public.prospector_call_stats(text[]) to service_role;

commit;
