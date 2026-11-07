-- Generated with Supabase CLI 3.0.0: mealdeck_weekend_3pm_opening.
-- Owner-approved Luton launch hours: Fri 15:00–midnight, Sat 15:00–midnight,
-- Sun 15:00–23:00, Europe/London. Only the pure dated-window helper changes.
-- Preserve the clock/test-identity wrapper, kitchen controls and all stored data.
begin;
set local lock_timeout='5s';
set local statement_timeout='30s';
set local check_function_bodies=on;

do $guard$
declare routine record;
begin
  if to_regnamespace('dishbee_private') is not null
    or to_regclass('mealdeck_private.installation') is null then
    raise exception 'mealdeck_weekend_hours_independent_profile_required';
  end if;
  if current_user in ('anon','authenticated','service_role') or not exists(
    select 1 from pg_class where oid='mealdeck_private.installation'::regclass
      and pg_has_role(current_user,relowner,'USAGE')) then
    raise exception 'mealdeck_weekend_hours_database_owner_required';
  end if;
  if not exists(select 1 from mealdeck_private.installation where singleton
      and profile='mealdeck-independent-v1' and business_id is not null)
    or to_regclass('mealdeck_private.checkout_settings') is null
    or to_regprocedure('mealdeck_private.launch_window()') is null then
    raise exception 'mealdeck_weekend_hours_previous_extensions_required';
  end if;
  select p.*,l.lanname into routine from pg_proc p
    join pg_language l on l.oid=p.prolang
    where p.oid=to_regprocedure('mealdeck_private.launch_window_at(timestamptz)');
  if not found or routine.lanname<>'sql' or not routine.prosecdef
    or routine.provolatile<>'i' or routine.proisstrict or routine.proretset
    or routine.prorettype<>'jsonb'::regtype
    or routine.proconfig is distinct from array['search_path=""']::text[]
    or md5(routine.prosrc) not in (
      '3656af8909e8939f3c17e7e202320df2', -- Original reviewed installation.
      '37a9eddb4ba0fe55a04b3fbc777a7914', -- Reviewed Friday/Saturday midnight extension.
      '979f623039044e22178c0192bd045aa9'  -- This exact update, for safe reruns.
    ) then
    raise exception 'mealdeck_weekend_hours_unreviewed_definition';
  end if;
  if has_function_privilege('anon',routine.oid,'EXECUTE')
    or has_function_privilege('authenticated',routine.oid,'EXECUTE')
    or has_function_privilege('service_role',routine.oid,'EXECUTE') then
    raise exception 'mealdeck_weekend_hours_private_helper_required';
  end if;
end $guard$;

-- CREATE OR REPLACE retains the existing function owner and ACL. No grants,
-- wrapper replacement, settings writes or payment/order updates belong here.
create or replace function mealdeck_private.launch_window_at(p_at timestamptz)
returns jsonb language sql immutable security definer set search_path='' as $$
  with periods(opens,closes) as (values
    (timestamptz '2026-11-06 15:00:00 Europe/London',timestamptz '2026-11-07 00:00:00 Europe/London'),
    (timestamptz '2026-11-07 15:00:00 Europe/London',timestamptz '2026-11-08 00:00:00 Europe/London'),
    (timestamptz '2026-11-08 15:00:00 Europe/London',timestamptz '2026-11-08 23:00:00 Europe/London')
  ), current_period as (select closes from periods where p_at>=opens and p_at<closes)
  select jsonb_build_object(
    'orderingOpen',coalesce(exists(select 1 from current_period)
      or p_at>=timestamptz '2026-11-09 00:00:00 Europe/London',false),
    'guestEligible',exists(select 1 from current_period),
    'currentClosesAt',(select closes from current_period),
    'startsAt',timestamptz '2026-11-06 15:00:00 Europe/London',
    'endsAt',timestamptz '2026-11-08 23:00:00 Europe/London',
    'status',case when p_at is null or p_at<timestamptz '2026-11-06 15:00:00 Europe/London' then 'upcoming'
      when p_at>=timestamptz '2026-11-08 23:00:00 Europe/London' then 'ended' else 'active' end,
    'timezone','Europe/London','serverNow',p_at)
$$;

commit;
