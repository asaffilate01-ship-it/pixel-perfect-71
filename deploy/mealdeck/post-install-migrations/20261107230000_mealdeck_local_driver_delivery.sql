-- Free own-driver delivery for Luton only, bounded and fail-closed.
-- Apply after the ordered post-install MealDeck migrations, before enabling the
-- MEALDECK_OWN_DRIVER_DELIVERY_ENABLED runtime flag. No third-party dispatch.
begin;

alter table mealdeck_private.checkout_quotes drop constraint if exists checkout_quotes_fulfilment_check;
alter table mealdeck_private.checkout_quotes
  add constraint checkout_quotes_fulfilment_check
  check (fulfilment in ('pickup','curbside','delivery'));

create table if not exists mealdeck_private.local_driver_quotes (
  quote_id uuid primary key references mealdeck_private.checkout_quotes(id) on delete cascade,
  tenant_id uuid not null,
  location_id uuid not null,
  address jsonb not null check(jsonb_typeof(address)='object'),
  distance_metres integer not null check(distance_metres between 0 and 3000),
  request_hash text not null check(request_hash ~ '^[a-f0-9]{64}$'),
  confirmed_at timestamptz not null default now()
);
alter table mealdeck_private.local_driver_quotes enable row level security;
revoke all on mealdeck_private.local_driver_quotes from public,anon,authenticated,service_role;

create table if not exists mealdeck_private.local_driver_orders (
  order_id uuid primary key references public.orders(id),
  quote_id uuid not null unique references mealdeck_private.local_driver_quotes(quote_id),
  tenant_id uuid not null,
  location_id uuid not null,
  driver_status text not null default 'awaiting_driver'
    check (driver_status in ('awaiting_driver','with_driver','delivered')),
  handed_to_driver_at timestamptz,
  delivered_at timestamptz,
  updated_at timestamptz not null default now(),
  check((handed_to_driver_at is not null)=(driver_status in ('with_driver','delivered'))),
  check((delivered_at is not null)=(driver_status='delivered'))
);
alter table mealdeck_private.local_driver_orders enable row level security;
revoke all on mealdeck_private.local_driver_orders from public,anon,authenticated,service_role;

-- The published channel is restricted to the installed MealDeck shared kitchen,
-- not Dishbee's other tenants or other planned MealDeck branches.
update public.ordering_channels c
set fulfilment_modes=array_append(c.fulfilment_modes,'delivery')
from public.tenant_locations l
where c.tenant_id=l.tenant_id and c.location_id=l.id
  and l.slug='shared-kitchen' and c.channel_key='mealdeck'
  and not 'delivery'=any(c.fulfilment_modes)
  and exists(select 1 from mealdeck_private.installation i
    where i.business_id=c.tenant_id and i.singleton);

-- Guest orders remain available while online ordering is open, not just launch weekend.
-- Opening weekend discount itself retains its original, independently bounded window.
create or replace function mealdeck_private.launch_window_at(p_at timestamptz)
returns jsonb language sql immutable security definer set search_path='' as $$
  with periods(opens,closes) as (values
    (timestamptz '2026-11-06 15:00:00 Europe/London',timestamptz '2026-11-07 00:00:00 Europe/London'),
    (timestamptz '2026-11-07 15:00:00 Europe/London',timestamptz '2026-11-08 00:00:00 Europe/London'),
    (timestamptz '2026-11-08 15:00:00 Europe/London',timestamptz '2026-11-08 23:00:00 Europe/London')
  ), current_period as (select closes from periods where p_at>=opens and p_at<closes),
  status as (select coalesce(exists(select 1 from current_period)
    or p_at>=timestamptz '2026-11-09 00:00:00 Europe/London',false) as ordering_open)
  select jsonb_build_object(
    'orderingOpen',(select ordering_open from status),
    'guestEligible',(select ordering_open from status),
    'currentClosesAt',(select closes from current_period),
    'startsAt',timestamptz '2026-11-06 15:00:00 Europe/London',
    'endsAt',timestamptz '2026-11-08 23:00:00 Europe/London',
    'status',case when p_at is null or p_at<timestamptz '2026-11-06 15:00:00 Europe/London' then 'upcoming'
      when p_at>=timestamptz '2026-11-08 23:00:00 Europe/London' then 'ended' else 'active' end,
    'timezone','Europe/London','serverNow',p_at)
  from status
$$;
revoke all on function mealdeck_private.launch_window_at(timestamptz)
  from public,anon,authenticated,service_role;

create or replace function public.mealdeck_local_delivery_ready(p_tenant uuid,p_location uuid)
returns boolean language sql stable security definer set search_path='' as $$
  select exists(
    select 1 from public.ordering_channels c
    join public.tenant_locations l on l.id=c.location_id and l.tenant_id=c.tenant_id
    join mealdeck_private.installation i on i.business_id=c.tenant_id and i.singleton
    where c.tenant_id=p_tenant and c.location_id=p_location and l.slug='shared-kitchen'
      and l.active and c.enabled and c.channel_key='mealdeck'
      and 'delivery'=any(c.fulfilment_modes))
$$;
revoke all on function public.mealdeck_local_delivery_ready(uuid,uuid)
  from public,anon,authenticated,service_role;
grant execute on function public.mealdeck_local_delivery_ready(uuid,uuid) to service_role;

-- Only the trusted server may bind a delivery address to its own live, priced
-- pickup quote. No browser is given coordinates, courier pricing or a delivery
-- flag. The final £15 threshold is the *discounted* authoritative quote total.
create or replace function public.mealdeck_bind_local_delivery_quote(
  p_tenant uuid,p_location uuid,p_quote uuid,p_customer uuid,p_token_hash text,
  p_request_hash text,p_address jsonb,p_distance_metres integer
) returns jsonb language plpgsql security definer set search_path='' as $$
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
    or p_distance_metres is null or p_distance_metres not between 0 and 3000
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
end $$;
revoke all on function public.mealdeck_bind_local_delivery_quote(
 uuid,uuid,uuid,uuid,text,text,jsonb,integer) from public,anon,authenticated,service_role;
grant execute on function public.mealdeck_bind_local_delivery_quote(
 uuid,uuid,uuid,uuid,text,text,jsonb,integer) to service_role;

create or replace function public.mealdeck_local_delivery_quote_for_actor(
  p_quote uuid,p_customer uuid,p_token_hash text
) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare q mealdeck_private.checkout_quotes%rowtype; g uuid; info mealdeck_private.local_driver_quotes%rowtype;
begin
  if p_customer is null then
    if p_token_hash is null or p_token_hash !~ '^[a-f0-9]{64}$'
      then raise exception 'mealdeck_checkout_guest_session_invalid'; end if;
    select id into g from mealdeck_private.guest_sessions
      where token_hash=p_token_hash and revoked_at is null and expires_at>now();
    if g is null then raise exception 'mealdeck_checkout_guest_session_invalid'; end if;
  elsif p_token_hash is not null then raise exception 'mealdeck_delivery_identity_invalid'; end if;
  select * into q from mealdeck_private.checkout_quotes
    where id=p_quote and customer_id is not distinct from p_customer and guest_id is not distinct from g;
  if not found or q.staff_id is not null or q.expires_at<=now() then
    raise exception 'mealdeck_checkout_quote_unavailable'; end if;
  perform mealdeck_private.checkout_identity(q.tenant_id,q.location_id,p_customer,g);
  if q.fulfilment<>'delivery' then return jsonb_build_object('delivery',false); end if;
  select * into info from mealdeck_private.local_driver_quotes
    where quote_id=q.id and tenant_id=q.tenant_id and location_id=q.location_id;
  if not found or q.total_pence<1500 or info.request_hash<>q.request_hash then
    raise exception 'mealdeck_delivery_quote_invalid'; end if;
  return jsonb_build_object('delivery',true,'postcode',info.address->>'postcode',
    'totalPence',q.total_pence,'distanceMetres',info.distance_metres);
end $$;
revoke all on function public.mealdeck_local_delivery_quote_for_actor(uuid,uuid,text)
 from public,anon,authenticated,service_role;
grant execute on function public.mealdeck_local_delivery_quote_for_actor(uuid,uuid,text)
 to service_role;

-- The delivery register is created only after a canonical order is materialised
-- and a Stripe checkout record exists. An orphan/forged delivery order cannot be
-- committed, thanks to the deferred constraint trigger.
create or replace function mealdeck_private.register_local_driver_order()
returns trigger language plpgsql security definer set search_path='' as $$
declare q mealdeck_private.checkout_quotes%rowtype; o public.orders%rowtype; d mealdeck_private.local_driver_quotes%rowtype;
begin
  select * into q from mealdeck_private.checkout_quotes where id=new.quote_id;
  if q.fulfilment<>'delivery' then return new; end if;
  select * into d from mealdeck_private.local_driver_quotes where quote_id=q.id;
  select * into o from public.orders where id=new.order_id;
  if d.quote_id is null or q.total_pence<1500 or q.total_pence<>o.total_pence
     or o.fulfilment<>'delivery' or o.source<>'mealdeck'
     or d.tenant_id<>o.tenant_id or d.location_id<>o.location_id
     or d.request_hash<>q.request_hash
    then raise exception 'mealdeck_delivery_order_invalid'; end if;
  insert into mealdeck_private.local_driver_orders(order_id,quote_id,tenant_id,location_id)
    values(o.id,q.id,o.tenant_id,o.location_id);
  return new;
end $$;
drop trigger if exists mealdeck_local_delivery_stripe_registered on mealdeck_private.stripe_orders;
create trigger mealdeck_local_delivery_stripe_registered
after insert on mealdeck_private.stripe_orders for each row
execute function mealdeck_private.register_local_driver_order();

create or replace function mealdeck_private.assert_local_driver_order_exists()
returns trigger language plpgsql security definer set search_path='' as $$
begin
  if not exists(select 1 from mealdeck_private.local_driver_orders where order_id=new.id)
    then raise exception 'mealdeck_delivery_order_unregistered'; end if;
  return new;
end $$;
drop trigger if exists mealdeck_local_driver_order_required on public.orders;
create constraint trigger mealdeck_local_driver_order_required
after insert on public.orders deferrable initially deferred for each row
when (new.source='mealdeck' and new.fulfilment='delivery')
execute function mealdeck_private.assert_local_driver_order_exists();

create or replace function mealdeck_private.local_driver_version(
  p_order uuid,p_status text,p_updated timestamptz
) returns text language sql immutable set search_path='' as $$
  select md5(jsonb_build_array(p_order,p_status,p_updated)::text)
$$;

-- Attach the destination only to the already-permissioned kitchen projection.
alter function mealdeck_ops_private.kds_order_card(uuid,jsonb)
rename to kds_order_card_before_own_driver;
create function mealdeck_ops_private.kds_order_card(p_order uuid,p_evidence jsonb)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare card jsonb; o public.orders%rowtype; d mealdeck_private.local_driver_quotes%rowtype;
  state mealdeck_private.local_driver_orders%rowtype;
begin
  card:=mealdeck_ops_private.kds_order_card_before_own_driver(p_order,p_evidence);
  select * into o from public.orders where id=p_order;
  if o.fulfilment<>'delivery' then return card; end if;
  select * into state from mealdeck_private.local_driver_orders where order_id=p_order;
  select * into d from mealdeck_private.local_driver_quotes where quote_id=state.quote_id;
  if state.order_id is null or d.quote_id is null then raise exception 'mealdeck_delivery_order_invalid'; end if;
  return card||jsonb_build_object(
    'deliveryAddress',d.address,'deliveryContact',jsonb_build_object(
      'name',o.customer_name,'phone',o.customer_phone),
    'driverStatus',state.driver_status,
    'driverVersion',mealdeck_private.local_driver_version(state.order_id,state.driver_status,state.updated_at),
    'driverHandoverAt',state.handed_to_driver_at,'deliveredAt',state.delivered_at);
end $$;

-- Only signed-in kitchen staff with orders.status may hand an entirely packed
-- and verified-paid delivery to their own driver, then confirm delivery.
create or replace function public.mealdeck_ops_kds_transition_local_driver(
  p_tenant uuid,p_location uuid,p_order uuid,p_expected_version text,p_status text
) returns jsonb language plpgsql security definer set search_path='' set lock_timeout='3s' as $$
declare o public.orders%rowtype; d mealdeck_private.local_driver_orders%rowtype;
 p public.mealdeck_pass_orders%rowtype; evidence jsonb; expected text;
begin
  perform mealdeck_ops_private.kds_assert_scope(p_tenant,p_location,'orders.status');
  if p_status not in ('with_driver','delivered') or p_expected_version !~ '^[a-f0-9]{32}$'
    then raise exception 'mealdeck_kds_invalid_transition'; end if;
  select * into o from public.orders where id=p_order and tenant_id=p_tenant
    and location_id=p_location and source='mealdeck' and fulfilment='delivery' for update;
  if not found then raise exception 'mealdeck_kds_order_unavailable'; end if;
  select * into d from mealdeck_private.local_driver_orders
    where order_id=p_order and tenant_id=p_tenant and location_id=p_location for update;
  select * into p from public.mealdeck_pass_orders
    where order_id=p_order and tenant_id=p_tenant and location_id=p_location for update;
  perform mealdeck_ops_private.kds_assert_scope(p_tenant,p_location,'orders.status');
  if d.order_id is null or p.order_id is null then raise exception 'mealdeck_kds_not_ready'; end if;
  expected:=mealdeck_private.local_driver_version(d.order_id,d.driver_status,d.updated_at);
  if d.driver_status=p_status then
    return jsonb_build_object('ok',true,'replayed',true,'order_id',p_order,'status',p_status);
  end if;
  if expected is distinct from p_expected_version then raise exception 'mealdeck_kds_conflict'; end if;
  evidence:=mealdeck_ops_private.kds_release_evidence(p_order);
  if evidence is null or o.payment_status<>'paid'
     or not mealdeck_ops_private.kds_routing_complete(p_order)
     then raise exception 'mealdeck_kds_release_required'; end if;
  if p_status='with_driver' then
    if d.driver_status<>'awaiting_driver' or o.status<>'ready'
      or mealdeck_ops_private.kds_preparation_status(p_order)<>'ready'
      or p.status not in ('sealed','ready_for_handoff')
      then raise exception 'mealdeck_kds_not_ready'; end if;
    update mealdeck_private.local_driver_orders set driver_status='with_driver',
      handed_to_driver_at=now(),updated_at=now() where order_id=p_order;
  else
    if d.driver_status<>'with_driver' or o.status<>'ready'
      or p.status not in ('sealed','ready_for_handoff')
      then raise exception 'mealdeck_kds_invalid_transition'; end if;
    update mealdeck_private.local_driver_orders set driver_status='delivered',
      delivered_at=now(),updated_at=now() where order_id=p_order;
    update public.mealdeck_pass_orders set status='handed_off',handed_off_at=now(),
      updated_at=now(),updated_by=auth.uid()
      where order_id=p_order and tenant_id=p_tenant and location_id=p_location;
    update public.orders set status='fulfilled'
      where id=p_order and tenant_id=p_tenant and location_id=p_location;
  end if;
  insert into public.mealdeck_ops_audit_log(
    tenant_id,location_id,actor_id,action,entity_type,entity_id,previous_value,next_value)
    values(p_tenant,p_location,auth.uid(),'kds.driver.'||p_status,'order',p_order,
      jsonb_build_object('driverStatus',d.driver_status),
      jsonb_build_object('driverStatus',p_status,'releaseId',evidence->>'release_id'));
  return jsonb_build_object('ok',true,'replayed',false,'order_id',p_order,'status',p_status);
end $$;

-- A confirmed guest/member alone can access their private delivery timestamps,
-- not the staff address register, fleet register or unrelated orders.
alter function mealdeck_private.checkout_receipt_for_identity(uuid,uuid,uuid)
rename to checkout_receipt_before_own_driver;
create function mealdeck_private.checkout_receipt_for_identity(
  p_order uuid,p_customer uuid,p_guest uuid
) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare base jsonb; o public.orders%rowtype; state mealdeck_private.local_driver_orders%rowtype;
begin
  base:=mealdeck_private.checkout_receipt_before_own_driver(p_order,p_customer,p_guest);
  select * into o from public.orders where id=p_order;
  if o.fulfilment<>'delivery' then return base; end if;
  select * into state from mealdeck_private.local_driver_orders where order_id=p_order;
  if state.order_id is null then raise exception 'mealdeck_delivery_order_invalid'; end if;
  return base||jsonb_build_object(
    'collectionEstimateMinutes',60,
    'estimatedReadyAt',case when o.paid_at is null then null else o.paid_at+interval '60 minutes' end,
    'driverHandoverAt',state.handed_to_driver_at,'deliveredAt',state.delivered_at,
    'completedAt',state.delivered_at);
end $$;

revoke all on function mealdeck_private.register_local_driver_order(),
  mealdeck_private.assert_local_driver_order_exists(),
  mealdeck_private.local_driver_version(uuid,text,timestamptz),
  mealdeck_ops_private.kds_order_card_before_own_driver(uuid,jsonb),
  mealdeck_ops_private.kds_order_card(uuid,jsonb),
  mealdeck_private.checkout_receipt_before_own_driver(uuid,uuid,uuid),
  mealdeck_private.checkout_receipt_for_identity(uuid,uuid,uuid)
  from public,anon,authenticated,service_role;
revoke all on function public.mealdeck_ops_kds_transition_local_driver(uuid,uuid,uuid,text,text)
  from public,anon,authenticated,service_role;
grant execute on function public.mealdeck_ops_kds_transition_local_driver(uuid,uuid,uuid,text,text)
  to authenticated;
commit;
