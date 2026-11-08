-- Free own-driver delivery for Luton only, bounded and fail-closed.
-- Apply after the ordered post-install MealDeck migrations, before enabling the
-- MEALDECK_OWN_DRIVER_DELIVERY_ENABLED runtime flag. No third-party dispatch.
begin;
set local lock_timeout='5s';
set local statement_timeout='60s';
set local check_function_bodies=on;

-- Prevent installation into another business's database or an incomplete
-- MealDeck schema. This migration never upgrades the separate DISHBEE project.
do $guard$
begin
  if to_regnamespace('dishbee_private') is not null
    or to_regclass('mealdeck_private.installation') is null
    or to_regclass('mealdeck_private.checkout_quotes') is null
    or to_regclass('mealdeck_private.stripe_orders') is null
    or to_regprocedure('mealdeck_ops_private.kds_order_card(uuid,jsonb)') is null
    or to_regprocedure('mealdeck_ops_private.receipt_snapshot(uuid)') is null
    or to_regprocedure('public.mealdeck_printer_acceptance_board(uuid,uuid)') is null
    or to_regprocedure('mealdeck_private.checkout_receipt_for_identity(uuid,uuid,uuid)') is null
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
    'deliveryDeadlineAt',o.paid_at+interval '60 minutes',
    'driverStatus',state.driver_status,
    'driverVersion',mealdeck_private.local_driver_version(state.order_id,state.driver_status,state.updated_at),
    'driverHandoverAt',state.handed_to_driver_at,'deliveredAt',state.delivered_at);
end $$;

-- Rebind the protected KDS board call to the new delivery-enriched card,
-- without relaxing paid-order visibility or staff authorisation.
CREATE OR REPLACE FUNCTION public.mealdeck_ops_kds_board(p_tenant uuid, p_location uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare o record; evidence jsonb; cards jsonb:='[]'; stations jsonb;
  held integer:=0; remaining integer:=0; ready boolean;
begin
  perform mealdeck_ops_private.kds_assert_scope(p_tenant,p_location,'orders.read');
  ready:=mealdeck_ops_private.kds_authority_ready();
  select coalesce(jsonb_agg(jsonb_build_object('station_id',s.id,'name',left(s.name,200),
    'code',left(s.code,100),'active',s.active) order by s.sort_order,s.name,s.id),'[]'::jsonb)
  into stations from public.kitchen_stations s
  where s.tenant_id=p_tenant and s.location_id=p_location;
  for o in select x.id from public.orders x
    where x.tenant_id=p_tenant and x.location_id=p_location and x.source='mealdeck'
      and x.status in ('accepted','preparing','ready')
      and not exists(select 1 from public.mealdeck_pass_orders p
        where p.order_id=x.id and p.status in ('handed_off','cancelled'))
    order by x.created_at,x.id
  loop
    evidence:=case when ready then mealdeck_ops_private.kds_release_evidence(o.id) else null end;
    if evidence is null then held:=held+1;
    elsif jsonb_array_length(cards)>=250 then remaining:=remaining+1;
    else
      perform mealdeck_ops_private.kds_assert_instructions(o.id);
      cards:=cards||jsonb_build_array(mealdeck_ops_private.kds_order_card(o.id,evidence));
    end if;
  end loop;
  return jsonb_build_object('schema_version',1,'tenant_id',p_tenant,'location_id',p_location,
    'generated_at',now(),'readiness',case when ready then 'ready' else 'setup_required' end,
    'held_order_count',held,'remaining_order_count',remaining,'stations',stations,'orders',cards);
end $function$;

-- Extend the existing approved print snapshot and printer queue functions
-- to include delivery, preserving their price/payment checks.
create or replace function mealdeck_ops_private.receipt_snapshot_before_meal_components(p_order uuid)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare o public.orders%rowtype;q mealdeck_private.checkout_quotes%rowtype;items jsonb;loc text;
begin
  select * into o from public.orders where id=p_order;
  select cq.* into q from mealdeck_private.checkout_quotes cq
    where cq.id=mealdeck_private.order_checkout_quote_id(p_order);
  if not found or o.accepted_at is null or o.fulfilment not in ('pickup','curbside','delivery') or o.handoff_code !~ '^\d{4}$'
    or o.packing_plan is distinct from q.packing_plan then raise exception 'mealdeck_printer_snapshot_unavailable'; end if;
  select name into loc from public.tenant_locations where id=o.location_id and tenant_id=o.tenant_id;
  select jsonb_agg(jsonb_build_object('lineId',l->>'lineId','parentLineId',l->>'parentLineId',
    'brandName',coalesce(l->>'brand_name','MealDeck'),'name',l->>'name','quantity',l->'quantity',
    'baseUnitPence',l->'base_unit_pence','unitPence',l->'unit_pence','linePence',l->'line_pence','notes',i.notes,
    'modifiers',coalesce((select jsonb_agg(jsonb_build_object('name',m->>'name','groupName',m->>'group_name',
      'quantityPerParent',m->'quantity_per_parent','priceDeltaPence',m->'price_delta_pence') order by n)
      from jsonb_array_elements(l->'modifiers') with ordinality v(m,n)),'[]'::jsonb)) order by n)
    into items from jsonb_array_elements(q.priced_lines) with ordinality v(l,n)
    join public.order_items i on i.order_id=p_order and i.checkout_line_id=l->>'lineId';
  if jsonb_array_length(items) is distinct from jsonb_array_length(q.priced_lines) then
    raise exception 'mealdeck_printer_snapshot_unavailable'; end if;
  return jsonb_build_object('schemaVersion',1,'orderId',o.id,'copyNumber',1,'reprintOf',null,'reprintReason',null,
    'orderNumber',mealdeck_private.paid_order_number(p_order),'displayCode',o.handoff_code,'brand','MealDeck','tradingName','313 Brands Ltd','locationName',loc,
    'createdAt',o.created_at,'paidAt',o.paid_at,'acceptedAt',o.accepted_at,'fulfilment',o.fulfilment,
    'customerName',coalesce(o.customer_name,'Customer'),'car',case when o.fulfilment='curbside' then o.vehicle else null end,
    'cutleryRequested',o.cutlery_requested,'packingPlan',o.packing_plan,'items',items,
    'subtotalPence',q.gross_pence,'discountPence',q.discount_pence,'totalPence',q.total_pence,
    'currency','GBP','orderNotes',o.notes)
    ||case when exists(select 1 from mealdeck_private.cash_orders where order_id=p_order)
      then jsonb_build_object('paymentMethod','cash') else '{}'::jsonb end;
end $$;

create or replace function public.mealdeck_printer_acceptance_board(p_tenant uuid,p_location uuid)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare o record;e jsonb;card jsonb;items jsonb;cards jsonb:='[]'::jsonb;remaining integer:=0;
begin
  perform mealdeck_ops_private.printer_assert_scope(p_tenant,p_location);
  if not mealdeck_ops_private.kds_authority_ready() then raise exception 'mealdeck_kds_release_required'; end if;
  for o in select x.id,x.paid_at,x.total_pence from public.orders x
    where x.tenant_id=p_tenant and x.location_id=p_location and x.source='mealdeck'
      and x.status='accepted' and x.accepted_at is null and x.payment_status='paid'
      and x.fulfilment in ('pickup','curbside','delivery')
      and x.paid_at is not null and x.paid_at<=now()
      and not exists(select 1 from public.mealdeck_pass_orders p
        where p.order_id=x.id and p.status in ('handed_off','cancelled'))
    order by x.paid_at,x.id
  loop
    e:=mealdeck_ops_private.kds_release_evidence(o.id);
    if e is null or not mealdeck_ops_private.kds_routing_complete(o.id)
      or mealdeck_ops_private.kds_preparation_status(o.id)<>'queued' then continue; end if;
    perform mealdeck_ops_private.kds_assert_instructions(o.id);
    if jsonb_array_length(cards)>=100 then remaining:=remaining+1;continue;end if;
    card:=mealdeck_ops_private.kds_order_card(o.id,e);
    select coalesce(jsonb_agg(jsonb_build_object(
      'lineId',i->'checkout_line_id','parentLineId',i->'parent_checkout_line_id',
      'name',i->'item_name','brandName',i->'brand_name','quantity',i->'quantity',
      'unitPence',i->'unit_pence','modifiers',i->'modifiers','notes',i->'notes','bags',i->'bags',
      'mealComponents',i->'mealComponents'
    ) order by i->>'checkout_line_id'),'[]'::jsonb) into items from jsonb_array_elements(card->'items') i;
    cards:=cards||jsonb_build_array(jsonb_build_object(
      'orderNumber',card->'order_number','orderId',o.id,'version',card->'version','displayCode',card->'display_code',
      'paidAt',o.paid_at,'fulfilment',card->'fulfilment','totalPence',o.total_pence,
      'cutleryRequested',card->'cutlery_requested','notes',card->'notes',
      'packingPlan',card->'packing_plan','items',items));
  end loop;
  return jsonb_build_object('schemaVersion',1,'tenantId',p_tenant,'locationId',p_location,
    'generatedAt',now(),'orders',cards,'remainingOrderCount',remaining);
end $$;

CREATE OR REPLACE FUNCTION public.mealdeck_ops_kds_workflow_board(p_tenant uuid, p_location uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare board jsonb; completed jsonb:='[]'::jsonb; extra integer:=0;
  candidate record; evidence jsonb; card jsonb;
begin
  -- Retain the existing live identity, location permission and paid-release
  -- checks. This read does not create receipts or perform any transition.
  board:=public.mealdeck_ops_kds_board(p_tenant,p_location);
  if board->>'readiness'='ready' then
    for candidate in
      select o.id,p.handed_off_at from public.orders o
      join public.mealdeck_pass_orders p on p.order_id=o.id
        and p.tenant_id=o.tenant_id and p.location_id=o.location_id
      where o.tenant_id=p_tenant and o.location_id=p_location
        and o.source='mealdeck' and o.status='fulfilled'
        and o.payment_status='paid' and o.paid_at is not null
        and o.accepted_at is not null and p.status='handed_off'
        and p.handed_off_at>=now()-interval '12 hours' and p.handed_off_at<=now()
        and p.handed_off_at>=o.accepted_at
      order by p.handed_off_at desc,o.id
    loop
      -- A completed status alone is not evidence of a verified payment. Holds,
      -- refunds and disputes remain governed by the canonical payment ledger.
      evidence:=mealdeck_private.kds_release_authority(candidate.id);
      if evidence->'eligible' is distinct from 'true'::jsonb
        or evidence->'schema_version' is distinct from '1'::jsonb
        or evidence->>'order_id' is distinct from candidate.id::text
        or evidence->>'tenant_id' is distinct from p_tenant::text
        or evidence->>'location_id' is distinct from p_location::text
        or evidence->>'source' is distinct from 'mealdeck' then continue; end if;
      if jsonb_array_length(completed)>=100 then extra:=extra+1; continue; end if;
      perform mealdeck_ops_private.kds_assert_instructions(candidate.id);
      card:=mealdeck_ops_private.kds_order_card(candidate.id,evidence);
      completed:=completed||jsonb_build_array(jsonb_build_object(
        'order_number',card->'order_number','order_id',card->'order_id','display_code',card->'display_code',
        'order_status','fulfilled','handoff_status','handed_off',
        'accepted_at',card->'accepted_at','completed_at',candidate.handed_off_at,
        'fulfilment',card->'fulfilment','group_order',card->'group_order','pickupContact',card->'pickupContact',
        'deliveryAddress',card->'deliveryAddress','deliveryContact',card->'deliveryContact',
        'driverStatus',card->'driverStatus','deliveryDeadlineAt',card->'deliveryDeadlineAt',
        'driverHandoverAt',card->'driverHandoverAt','deliveredAt',card->'deliveredAt',
        'cutlery_requested',coalesce(card->'cutlery_requested','false'::jsonb),
        'notes',card->'notes','items',card->'items'));
    end loop;
  end if;
  return board||jsonb_build_object('completed_orders',completed,
    'completed_remaining_order_count',extra,'completed_window_hours',12);
end
$function$;

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
    'readyForCollectionAt',(select coalesce(p.ready_for_handoff_at,p.sealed_at)
      from public.mealdeck_pass_orders p where p.order_id=p_order),
    'driverHandoverAt',state.handed_to_driver_at,'deliveredAt',state.delivered_at,
    'completedAt',state.delivered_at);
end $$;

-- Preserve scoped customer/member receipt authority and rebind to
-- the new driver timestamps. No public access to delivery address tables.
create or replace function public.mealdeck_customer_order_receipt(p_order uuid,p_customer uuid)
returns jsonb language sql stable security definer set search_path='' as $$
  select mealdeck_private.checkout_receipt_for_identity(p_order,p_customer,null)
$$;

CREATE OR REPLACE FUNCTION public.mealdeck_guest_order_receipt(p_tenant uuid, p_location uuid, p_token_hash text, p_order uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare g mealdeck_private.guest_sessions%rowtype;
begin
  g:=mealdeck_private.guest_session_authority(p_tenant,p_location,p_token_hash);
  if g.id is null then raise exception 'mealdeck_checkout_guest_session_invalid'; end if;
  if not exists(select 1 from public.orders o where o.id=p_order and o.tenant_id=p_tenant and o.location_id=p_location
    and o.customer_id is null and o.guest_checkout and (
      exists(select 1 from mealdeck_private.stripe_orders s where s.order_id=o.id and s.guest_id=g.id)
      or exists(select 1 from mealdeck_private.payment_orders p where p.order_id=o.id and p.guest_id=g.id and p.staff_id is null))) then
    raise exception 'mealdeck_checkout_order_unavailable'; end if;
  return mealdeck_private.checkout_receipt_for_identity(p_order,null,g.id);
end $function$;
revoke all on function public.mealdeck_customer_order_receipt(uuid,uuid),
  public.mealdeck_guest_order_receipt(uuid,uuid,text,uuid)
  from public,anon,authenticated,service_role;
grant execute on function public.mealdeck_customer_order_receipt(uuid,uuid),
  public.mealdeck_guest_order_receipt(uuid,uuid,text,uuid) to service_role;

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
