-- Owner-authorised early registration on 9 November 2026 from 10:35 GMT.
-- Additive replacement of the independently verified time gate ONLY.
-- Email confirmation, legal identity, phone, consent and owner checks stay intact.
begin;
set local lock_timeout='5s';
set local statement_timeout='20s';
do $guard$
begin
  if current_user in ('anon','authenticated','service_role','authenticator')
    or to_regnamespace('dishbee_private') is not null
    or to_regclass('mealdeck_private.installation') is null
    or to_regclass('mealdeck_private.customer_profiles') is null
    or to_regprocedure('public.mealdeck_customer_register(text,text,boolean,boolean,boolean,text,text)') is null
    or not exists(
      select 1 from mealdeck_private.installation i
      where i.singleton and i.profile='mealdeck-independent-v1' and i.business_id is not null
    )
    or not exists(
      select 1 from pg_class c
      where c.oid='mealdeck_private.installation'::regclass
        and pg_has_role(current_user,c.relowner,'USAGE')
    )
  then raise exception 'mealdeck_registration_wrong_database_or_actor'; end if;
  if (select md5(prosrc) from pg_proc
      where oid='mealdeck_private.email_registration_available_at(timestamptz)'::regprocedure)
      not in ('819b5fa50341a135b3b80e2e55393231',
              md5(E'  SELECT p_at IS NOT NULL AND\n    (p_at<timestamptz \'2026-11-06 00:00:00 Europe/London\'\n      OR p_at>=timestamptz \'2026-11-09 10:35:00 Europe/London\')\n'))
  then raise exception 'mealdeck_registration_unreviewed_gate_definition'; end if;
end $guard$;

create or replace function mealdeck_private.email_registration_available_at(p_at timestamptz)
returns boolean language sql immutable set search_path=''
as $policy$
  select p_at is not null and
    (p_at<timestamptz '2026-11-06 00:00:00 Europe/London'
      or p_at>=timestamptz '2026-11-09 10:35:00 Europe/London')
$policy$;
commit;
