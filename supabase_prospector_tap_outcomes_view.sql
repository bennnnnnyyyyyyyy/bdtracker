-- ============================================================
-- Taps matched to Ultatel calls. FOR REVIEW. NOT APPLIED.
-- Run after supabase_prospector_sync.sql. Safe to re-run; nothing is dropped.
--
-- Matching rule: a tap is matched to the FIRST outbound call in public.calls to the same 10-digit number that
-- started from 30 seconds before the tap to 3 minutes after it. Times are exact: Ultatel Call IDs such as
-- "1791808392.14495" start with the call's Unix start time, and tapped_at is UTC. No time-zone guessing and no
-- use of the text call_date column. Taps with no such call stay in the view with matched = false.
-- Outcome comes from Ultatel (ANSWERED / NO ANSWER), not from duration, which is not talk time in this data.
--
-- Known limits: a call placed from another phone, or on another number, will not match. Two taps on one number
-- within the window can match the same call.
-- ============================================================

begin;

-- Touches the EXISTING table public.calls, but only adds an index (no data or column change).
-- Without it, matching scans all calls for every tap.
create index if not exists calls_to_num_last10
  on public.calls ((right(regexp_replace(coalesce(to_num, ''), '\D', '', 'g'), 10)));

create or replace view public.prospector_tap_outcomes
with (security_invoker = true) as
select
  t.id as tap_id,
  t.user_id,
  m.opener,
  t.npi,
  t.phone,
  t.tapped_at,
  c.call_id,
  c.agent as call_agent,
  c.outcome as call_outcome,
  c.duration_sec,
  (c.call_id is not null) as matched,
  case when c.call_id is null then null else (c.outcome = 'ANSWERED') end as answered,
  intel.objection,
  intel.patient_volume,
  intel.current_biller
from public.prospector_taps t
left join public.prospector_user_map m on m.user_id = t.user_id
left join public.prospector_lead_intel intel on intel.npi = t.npi
left join lateral (
  select x.call_id, x.agent, x.outcome, x.duration_sec
  from (
    select
      c0.call_id, c0.agent, c0.outcome, c0.duration_sec,
      case when c0.call_id ~ '^[0-9]{9,10}(\.[0-9]+)?$'
           then to_timestamp(split_part(c0.call_id, '.', 1)::bigint) end as call_ts
    from public.calls c0
    where c0.call_type = 'OUT-Bound'
      and right(regexp_replace(coalesce(c0.to_num, ''), '\D', '', 'g'), 10) = t.phone
  ) x
  where x.call_ts between t.tapped_at - interval '30 seconds' and t.tapped_at + interval '3 minutes'
  order by x.call_ts
  limit 1
) c on true;

-- The view reads service-role-only tables; keep it service role only too.
revoke all on public.prospector_tap_outcomes from public, anon, authenticated;
grant select on public.prospector_tap_outcomes to service_role;

commit;
