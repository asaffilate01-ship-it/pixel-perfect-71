-- MealDeck Luton: November 2026 free delivery ends 30 November.
-- From 1 December require actual, payment-authoritative quoted courier fee.
-- Until a reviewed courier-cost checkout adapter and signed quote are deployed,
-- reject NEW Luton delivery orders instead of collecting incorrect £0 fees.
-- This future-dated safeguard leaves November paid orders unchanged.
begin;
set local lock_timeout = '5s';
set local statement_timeout = '30s';
do $guard$ begin
  if current_user in ('anon','authenticated','service_role','authenticator')
     or to_regnamespace('dishbee_private') is not null
     or to_regclass('mealdeck_private.installation') is null
     or to_regclass('public.orders') is null
     or not exists(select 1 from mealdeck_private.installation i
       where i.singleton and i.profile='mealdeck-independent-v1'
         and i.business_id is not null)
  then raise exception 'mealdeck_december_quote_gate_wrong_installation_or_actor'; end if;
end $guard$;

create or replace function mealdeck_private.reject_unquoted_december_luton_delivery()
returns trigger language plpgsql security definer set search_path='' as $$
begin
  if new.source='mealdeck' and new.fulfilment='delivery'
     and clock_timestamp() >= timestamptz '2026-12-01 00:00:00+00'
     and exists (
       select 1 from mealdeck_private.installation i
       join public.tenant_locations l
         on l.tenant_id=i.business_id and l.id=new.location_id
       where i.singleton and i.profile='mealdeck-independent-v1'
         and l.slug='shared-kitchen' and l.active
     )
  then
    raise exception
      'mealdeck_delivery_verified_courier_quote_required'
      using errcode='23514';
  end if;
  return new;
end $$;
revoke all on function mealdeck_private.reject_unquoted_december_luton_delivery()
  from public,anon,authenticated,service_role;
drop trigger if exists mealdeck_december_paid_quote_gate on public.orders;
create trigger mealdeck_december_paid_quote_gate
  before insert or update of fulfilment,delivery_pence on public.orders
  for each row execute function
    mealdeck_private.reject_unquoted_december_luton_delivery();
commit;
