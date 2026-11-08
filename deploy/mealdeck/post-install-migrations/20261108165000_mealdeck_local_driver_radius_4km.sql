-- Increase MealDeck Luton own-driver distance from 3 km to 4 km.
-- Run after 20261107230000_mealdeck_local_driver_delivery.sql and before
-- deploying the 4 km checkout runtime; no new grants, payments, or dispatch.
-- Historical 3 km migration is intentionally left unchanged.
begin;
set local lock_timeout='5s';
set local statement_timeout='60s';
set local check_function_bodies=on;
do $guard$
begin
  if to_regnamespace('dishbee_private') is not null
    or to_regclass('mealdeck_private.installation') is null
    or to_regclass('mealdeck_private.local_driver_quotes') is null
    or to_regprocedure('public.mealdeck_bind_local_delivery_quote(uuid,uuid,uuid,uuid,text,text,jsonb,integer)') is null
  then raise exception 'mealdeck_delivery_dedicated_backend_required'; end if;
  if current_user in ('anon','authenticated','service_role') or not exists(
    select 1 from pg_class c
    where c.oid='mealdeck_private.installation'::regclass
      and pg_has_role(current_user,c.relowner,'USAGE')
  ) or not exists(
    select 1 from mealdeck_private.installation i
    where i.singleton and i.profile='mealdeck-independent-v1' and i.business_id is not null
  ) then raise exception 'mealdeck_delivery_database_owner_required'; end if;
end $guard$;

alter table mealdeck_private.local_driver_quotes
  drop constraint if exists local_driver_quotes_distance_metres_check;
alter table mealdeck_private.local_driver_quotes
  add constraint local_driver_quotes_distance_metres_check
  check (distance_metres between 0 and 4000);

-- Preserve the existing role grants and complete payment/identity protection.
CREATE OR REPLACE FUNCTION public.mealdeck_bind_local_delivery_quote(p_tenant uuid, p_location uuid, p_quote uuid, p_customer uuid, p_token_hash text, p_request_hash text, p_address jsonb, p_distance_metres integer)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare q mealdeck_private.checkout_quotes%rowtype; g uuid; prior mealdeck_private.local_driver_quotes%rowtype;
begin
  if not public.mealdeck_local_delivery_ready(p_tenant,p_location)
    or p_address is null or jsonb_typeof(p_address)<>'object'
    or p_address - array['postcode','doorNumber','roadName','addressLine2']::text[] <> '{}'::jsonb
    or coalesce(p_address->>'postcode','') !~ '^[A-Z]{1,2}[0-9][A-Z0-9]? [0-9][A-Z]{2}$'
    or length(btrim(coalesce(p_address->>'doorNumber',''))) not between 1 and 40
    or length(btrim(coalesce(p_address->>'roadName',''))) not between 2 and 120
    or length(coalesce(p_address->>'addressLine2',''))>120
    or p_address::text ~ U&'[\0001-\001F\007F-\009F\202A-\202E\2066-\2069]'
    or p_distance_metres is null or p_distance_metres not between 0 and 4000
  then raise exception 'mealdeck_delivery_address_invalid'; end if;

  if p_customer is null then
    if p_token_hash is null or p_token_hash !~ '^[a-f0-9]{64}$' then
      raise exception 'mealdeck_checkout_guest_session_invalid'; end if;
    select s.id into g from mealdeck_private.guest_sessions s
      where s.token_hash=p_token_hash and s.tenant_id=p_tenant and s.location_id=p_location
        and s.revoked_at is null and s.expires_at>now();
    if g is null then raise exception 'mealdeck_checkout_guest_session_invalid'; end if;
  elsif p_token_hash is not null then
    raise exception 'mealdeck_delivery_identity_invalid';
  end if;

  select * into q from mealdeck_private.checkout_quotes
    where id=p_quote and tenant_id=p_tenant and location_id=p_location
      and customer_id is not distinct from p_customer and guest_id is not distinct from g
    for update;
  if not found or q.staff_id is not null or q.expires_at<=now()
    or q.request_hash is distinct from p_request_hash or q.total_pence<1500
    or q.vehicle is not null or q.fulfilment not in ('pickup','delivery')
    or exists(select 1 from mealdeck_private.stripe_orders s where s.quote_id=q.id)
    or exists(select 1 from mealdeck_private.payment_orders s where s.quote_id=q.id)
  then raise exception 'mealdeck_delivery_quote_invalid'; end if;
  perform mealdeck_private.checkout_identity(p_tenant,p_location,p_customer,g);
  perform mealdeck_private.assert_payment_open(p_tenant,p_location,g is not null);
  if q.fulfilment='delivery' then
    select * into prior from mealdeck_private.local_driver_quotes where quote_id=q.id;
    if not found or prior.address is distinct from p_address
       or prior.request_hash is distinct from p_request_hash then
       raise exception 'mealdeck_delivery_quote_invalid'; end if;
    return jsonb_build_object('delivery',true,'totalPence',q.total_pence);
  end if;
  insert into mealdeck_private.local_driver_quotes
    (quote_id,tenant_id,location_id,address,distance_metres,request_hash)
    values(q.id,p_tenant,p_location,p_address,p_distance_metres,p_request_hash);
  update mealdeck_private.checkout_quotes set fulfilment='delivery' where id=q.id;
  return jsonb_build_object('delivery',true,'totalPence',q.total_pence);
end $function$;
commit;
