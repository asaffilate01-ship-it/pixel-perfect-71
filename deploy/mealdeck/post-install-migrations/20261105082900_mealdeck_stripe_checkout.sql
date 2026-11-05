-- Additive independent MealDeck checkout adapter. Apply after customer-membership.
-- Starts disabled; neither this migration nor public keys activate payments.
begin;
set local lock_timeout='5s';

do $guard$ begin
  if to_regclass('mealdeck_private.installation') is null
    or to_regprocedure('mealdeck_private.customer_registration_authority(uuid)') is null
    or to_regnamespace('dishbee_private') is not null
    or not exists(select 1 from mealdeck_private.installation where singleton
      and profile='mealdeck-independent-v1') then
    raise exception 'mealdeck_checkout_independent_membership_required';
  end if;
end $guard$;

-- Legacy status='accepted' makes a verified paid order visible in the shared
-- queued KDS. Actual staff acceptance is a separate timestamp, never set by payment.
alter table public.orders add column accepted_at timestamptz;
alter table public.orders add column cutlery_requested boolean not null default false;
alter table public.orders add column packing_plan jsonb;
alter table public.orders add column review_confirmed_at timestamptz;
-- A display code is unique among unresolved orders in this kitchen. Historical
-- receipts keep their number after a verified terminal lifecycle releases it.
alter table public.orders add column handoff_code_reserved boolean not null default false;
alter table public.orders add constraint mealdeck_reserved_handoff_code_check
  check(not handoff_code_reserved or (source='mealdeck' and handoff_code is not null));
create unique index mealdeck_reserved_handoff_code_unique
  on public.orders(tenant_id,location_id,handoff_code) where handoff_code_reserved;
alter table public.order_items add column checkout_line_id text;
alter table public.order_items add column parent_checkout_line_id text;
alter table public.order_items add column base_unit_price_pence integer check(base_unit_price_pence between 0 and 1000000);
alter table public.order_items add constraint mealdeck_checkout_line_unique unique(order_id,checkout_line_id);

create table mealdeck_private.checkout_settings(
  tenant_id uuid not null,location_id uuid not null,
  checkout_enabled boolean not null default false,
  opening_start_date date,
  collection_estimate_minutes integer check(collection_estimate_minutes between 5 and 180),
  updated_at timestamptz not null default now(),
  primary key(tenant_id,location_id),
  foreign key(tenant_id,location_id) references public.tenant_locations(tenant_id,id)
);
create table mealdeck_private.checkout_quotes(
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,location_id uuid not null,customer_id uuid not null references auth.users(id),
  fulfilment text not null check(fulfilment in ('pickup','curbside')),
  vehicle jsonb,
  packing_plan jsonb not null check(jsonb_typeof(packing_plan)='object'),
  request_hash text not null check(request_hash ~ '^[a-f0-9]{64}$'),
  selection jsonb not null check(jsonb_typeof(selection)='array'),
  priced_lines jsonb not null check(jsonb_typeof(priced_lines)='array'),
  gross_pence integer not null check(gross_pence between 1 and 10000000),
  discount_pence integer not null check(discount_pence>=0),
  total_pence integer not null check(total_pence>0),
  opening_start_date date,
  created_at timestamptz not null default now(),
  collection_estimate_minutes integer not null check(collection_estimate_minutes between 5 and 180),
  expires_at timestamptz not null default now()+interval '10 minutes',
  foreign key(tenant_id,location_id) references public.tenant_locations(tenant_id,id),
  check(total_pence=gross_pence-discount_pence),
  check((fulfilment='curbside')=(vehicle is not null))
);
create index checkout_quotes_customer_created on mealdeck_private.checkout_quotes(customer_id,created_at desc);
create table mealdeck_private.stripe_orders(
  order_id uuid primary key references public.orders(id),
  quote_id uuid not null unique references mealdeck_private.checkout_quotes(id),
  customer_id uuid not null references auth.users(id),attempt_id uuid not null,
  stripe_account text not null check(stripe_account ~ '^acct_[A-Za-z0-9]+$'),
  livemode boolean not null,
  session_id text unique check(session_id is null or session_id ~ '^cs_(test_|live_)?[A-Za-z0-9]+$'),
  session_url text,
  payment_intent_id text unique check(payment_intent_id is null or payment_intent_id ~ '^pi_[A-Za-z0-9]+$'),
  captured_pence integer not null default 0 check(captured_pence>=0),
  refunded_pence integer not null default 0 check(refunded_pence>=0),
  void_reason text,
  release_id uuid not null unique default gen_random_uuid(),
  verified_at timestamptz,
  expires_at timestamptz not null default now()+interval '35 minutes',
  created_at timestamptz not null default now(),
  unique(customer_id,attempt_id),
  check(refunded_pence<=captured_pence)
);
create table mealdeck_private.stripe_events(
  event_id text primary key check(event_id ~ '^evt_[A-Za-z0-9]+$'),
  payload_hash text not null check(payload_hash ~ '^[a-f0-9]{64}$'),
  event_type text not null,
  order_id uuid not null references public.orders(id),
  verified_at timestamptz not null default now()
);
do $security$ declare t text; begin
  foreach t in array array['checkout_settings','checkout_quotes','stripe_orders','stripe_events'] loop
    execute format('alter table mealdeck_private.%I enable row level security',t);
    execute format('revoke all on mealdeck_private.%I from public,anon,authenticated,service_role',t);
  end loop;
end $security$;

create function mealdeck_private.opening_offer(p_tenant uuid,p_location uuid)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare d date;s timestamptz;e timestamptz;
begin
  select opening_start_date into d from mealdeck_private.checkout_settings
    where tenant_id=p_tenant and location_id=p_location;
  if d is not null then
    s:=d::timestamp at time zone 'Europe/London';
    e:=(d+3)::timestamp at time zone 'Europe/London';
  end if;
  return jsonb_build_object('status',case when d is null then 'unscheduled'
    when now()<s then 'upcoming' when now()>=e then 'ended' else 'active' end,
    'startsAt',s,'endsAt',e,'timezone','Europe/London','serverNow',now());
end $$;
revoke all on function mealdeck_private.opening_offer(uuid,uuid) from public,anon,authenticated,service_role;

create function public.mealdeck_online_checkout_status(p_tenant uuid,p_location uuid)
returns jsonb language sql stable security definer set search_path='' as $$
  select jsonb_build_object('channelOpen',coalesce(exists(
    select 1 from mealdeck_private.checkout_settings s
    join mealdeck_private.installation i on i.business_id=s.tenant_id and i.singleton
    join public.tenants t on t.id=s.tenant_id and t.active and t.currency='GBP'
    join public.tenant_locations l on l.tenant_id=s.tenant_id and l.id=s.location_id
      and l.active and l.slug='shared-kitchen'
    join public.ordering_channels c on c.tenant_id=s.tenant_id and c.location_id=s.location_id
      and c.channel_key='mealdeck' and c.enabled
    where s.tenant_id=p_tenant and s.location_id=p_location and s.checkout_enabled
      and array['pickup','curbside']::text[] <@ c.fulfilment_modes
      and s.collection_estimate_minutes is not null
      and exists(select 1 from public.mealdeck_ops_audit_log a where a.tenant_id=p_tenant
        and a.action='catalogue.menu_revision' and a.next_value->>'priceRevision'='owner-menu-20261105-v2')
  ),false),'openingOffer',mealdeck_private.opening_offer(p_tenant,p_location))
$$;
revoke all on function public.mealdeck_online_checkout_status(uuid,uuid) from public,anon,authenticated,service_role;
grant execute on function public.mealdeck_online_checkout_status(uuid,uuid) to anon,authenticated,service_role;

create function public.mealdeck_ops_checkout_settings(p_tenant uuid,p_location uuid)
returns jsonb language plpgsql stable security definer set search_path='' as $$
begin
  if not mealdeck_ops_private.can(p_tenant,p_location,'finance.manage') then
    raise exception 'mealdeck_ops_forbidden';
  end if;
  return coalesce((select jsonb_build_object('enabled',s.checkout_enabled,
    'openingStartDate',s.opening_start_date,'collectionEstimateMinutes',s.collection_estimate_minutes,
    'openingOffer',mealdeck_private.opening_offer(p_tenant,p_location))
    from mealdeck_private.checkout_settings s where s.tenant_id=p_tenant and s.location_id=p_location),
    jsonb_build_object('enabled',false,'openingStartDate',null,'collectionEstimateMinutes',null,
      'openingOffer',mealdeck_private.opening_offer(p_tenant,p_location)));
end $$;
revoke all on function public.mealdeck_ops_checkout_settings(uuid,uuid) from public,anon,authenticated,service_role;
grant execute on function public.mealdeck_ops_checkout_settings(uuid,uuid) to authenticated;

create function public.mealdeck_ops_update_checkout_settings(
  p_tenant uuid,p_location uuid,p_enabled boolean,p_opening_start_date date,p_collection_estimate_minutes integer
) returns jsonb language plpgsql security definer set search_path='' as $$
declare previous jsonb;
begin
  if not mealdeck_ops_private.can(p_tenant,p_location,'finance.manage')
    or not exists(select 1 from public.mealdeck_ops_staff_access a
      where a.tenant_id=p_tenant and a.user_id=auth.uid() and a.enabled
        and a.role in ('owner','admin') and (a.location_id is null or a.location_id=p_location)) then
    raise exception 'mealdeck_ops_forbidden';
  end if;
  if p_enabled is null or (p_enabled and p_collection_estimate_minutes is null)
    or (p_collection_estimate_minutes is not null and p_collection_estimate_minutes not between 5 and 180)
    or not exists(select 1 from mealdeck_private.installation i
    join public.tenant_locations l on l.tenant_id=i.business_id
    where i.singleton and i.business_id=p_tenant and l.id=p_location
      and l.slug='shared-kitchen' and l.active) then
    raise exception 'mealdeck_checkout_location_unavailable';
  end if;
  select to_jsonb(s) into previous from mealdeck_private.checkout_settings s
    where s.tenant_id=p_tenant and s.location_id=p_location for update;
  insert into mealdeck_private.checkout_settings(tenant_id,location_id,checkout_enabled,opening_start_date,collection_estimate_minutes)
    values(p_tenant,p_location,p_enabled,p_opening_start_date,p_collection_estimate_minutes)
    on conflict(tenant_id,location_id) do update set checkout_enabled=excluded.checkout_enabled,
      opening_start_date=excluded.opening_start_date,collection_estimate_minutes=excluded.collection_estimate_minutes,updated_at=now();
  insert into public.mealdeck_ops_audit_log(tenant_id,location_id,actor_id,action,entity_type,entity_id,previous_value,next_value)
    values(p_tenant,p_location,auth.uid(),'checkout.settings','location',p_location,previous,
      jsonb_build_object('enabled',p_enabled,'openingStartDate',p_opening_start_date,
        'collectionEstimateMinutes',p_collection_estimate_minutes,'openingDays',3));
  return public.mealdeck_ops_checkout_settings(p_tenant,p_location);
end $$;
revoke all on function public.mealdeck_ops_update_checkout_settings(uuid,uuid,boolean,date,integer) from public,anon,authenticated,service_role;
grant execute on function public.mealdeck_ops_update_checkout_settings(uuid,uuid,boolean,date,integer) to authenticated;

-- Called only inside service RPC transactions, after source selectors have been
-- validated by the server. Locks and prices the current canonical rows, including
-- administrator overrides. It never accepts a client amount or client item name.
create function mealdeck_private.price_checkout_lines(p_tenant uuid,p_location uuid,p_selection jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare line jsonb;m record;opt jsonb;v_option record;g record;mods jsonb;
  target_id uuid;target_brand text;target_description text;
  qty integer;unit integer;gross bigint:=0;lines jsonb:='[]';n integer;target_count integer;
begin
  if jsonb_typeof(p_selection) is distinct from 'array' or jsonb_array_length(p_selection) not between 1 and 180 then
    raise exception 'mealdeck_checkout_invalid_selection';
  end if;
  if (select count(*) from jsonb_array_elements(p_selection)) <>
    (select count(distinct x->>'lineId') from jsonb_array_elements(p_selection) x) then
    raise exception 'mealdeck_checkout_invalid_selection'; end if;
  for line in select value from jsonb_array_elements(p_selection) loop
    if jsonb_typeof(line) is distinct from 'object' or coalesce(line->>'quantity','') !~ '^([1-9]|1[0-9]|20)$'
      or jsonb_typeof(line->'modifiers') is distinct from 'array' or jsonb_array_length(line->'modifiers')>40
      or coalesce(line->>'lineId','') !~ '^line-([1-9]|[1-5][0-9]|60)(-extra-(side|drink))?$' then
      raise exception 'mealdeck_checkout_invalid_selection';
    end if;
    qty:=(line->>'quantity')::integer;
    if (select count(*) from public.menu_items x where x.tenant_id=p_tenant and x.sku=line->>'sku')<>1 then
      raise exception 'mealdeck_checkout_item_unavailable';
    end if;
    select x.id,x.brand_id,b.name as brand_name,x.name,coalesce(r.price_override_pence,x.price_pence) as price into m
      from public.menu_items x join public.tenant_brands b on b.id=x.brand_id and b.tenant_id=x.tenant_id
      join public.menu_categories c on c.id=x.category_id and c.tenant_id=x.tenant_id and c.brand_id=x.brand_id
      join public.menu_item_channel_rules r on r.menu_item_id=x.id and r.tenant_id=x.tenant_id
        and r.location_id=p_location and r.channel_key='mealdeck'
      where x.tenant_id=p_tenant and x.sku=line->>'sku' and x.active and b.active and c.active and r.visible
        and b.slug in ('skorch-burgers','loadd','moktl','tavo-chicken','souvano')
      for share of x,b,c,r;
    if not found or m.price is null then raise exception 'mealdeck_checkout_item_unavailable'; end if;
    if not exists(select 1 from public.menu_item_station_routes r join public.kitchen_stations s
      on s.id=r.station_id and s.tenant_id=r.tenant_id and s.location_id=r.location_id and s.active
      where r.tenant_id=p_tenant and r.location_id=p_location and r.item_id=m.id) then
      raise exception 'mealdeck_checkout_routing_unavailable';
    end if;
    unit:=m.price;mods:='[]';
    if (select count(*) from jsonb_array_elements(line->'modifiers')) <>
      (select count(distinct x->>'optionId') from jsonb_array_elements(line->'modifiers') x) then
      raise exception 'mealdeck_checkout_invalid_modifier';
    end if;
    for opt in select value from jsonb_array_elements(line->'modifiers') loop
      target_id:=null;target_brand:=null;target_description:=null;
      select o.id,o.group_id,o.name,o.price_delta_pence,mg.name as group_name into v_option from public.modifier_options o
        join public.modifier_groups mg on mg.id=o.group_id and mg.tenant_id=o.tenant_id
        where o.id=(opt->>'optionId')::uuid and o.group_id=(opt->>'groupId')::uuid
          and o.tenant_id=p_tenant and o.active for share;
      if not found or opt->>'kind' not in ('source','cross','variant') then
        raise exception 'mealdeck_checkout_modifier_unavailable';
      end if;
      if opt->>'kind' in ('source','variant') and not exists(select 1 from public.menu_item_modifier_groups a
        where a.tenant_id=p_tenant and a.item_id=m.id and a.group_id=v_option.group_id) then
        raise exception 'mealdeck_checkout_invalid_modifier';
      end if;
      if opt->>'kind'='cross' then
        select count(*) into target_count from public.menu_items x
          join public.tenant_brands b on b.id=x.brand_id and b.tenant_id=x.tenant_id
          join public.menu_categories c on c.id=x.category_id and c.tenant_id=x.tenant_id
          join public.menu_item_channel_rules r on r.menu_item_id=x.id and r.tenant_id=x.tenant_id
            and r.location_id=p_location and r.channel_key='mealdeck'
          where x.tenant_id=p_tenant and x.sku=opt->>'targetSku' and x.active and b.active and c.active and r.visible
            and b.slug in ('loadd','moktl')
            and exists(select 1 from public.menu_item_station_routes rt join public.kitchen_stations st
              on st.id=rt.station_id and st.tenant_id=rt.tenant_id and st.location_id=rt.location_id and st.active
              where rt.item_id=x.id and rt.tenant_id=p_tenant and rt.location_id=p_location);
        if target_count<>1 then raise exception 'mealdeck_checkout_upgrade_unavailable'; end if;
        select x.id,x.description,b.name into target_id,target_description,target_brand from public.menu_items x
          join public.tenant_brands b on b.id=x.brand_id and b.tenant_id=x.tenant_id
          where x.tenant_id=p_tenant and x.sku=opt->>'targetSku' for share of x,b;
      end if;
      unit:=unit+v_option.price_delta_pence;
      mods:=mods||jsonb_build_array(jsonb_build_object('id',v_option.id,'group_id',v_option.group_id,
        'group_name',v_option.group_name,'name',v_option.name,'price_delta_pence',v_option.price_delta_pence,
        'quantity_per_parent',1,'kind',opt->>'kind',
        'target_item_id',target_id,'target_brand_name',target_brand,'target_description',target_description));
    end loop;
    for g in select mg.id,mg.min_select,mg.max_select from public.modifier_groups mg
      join public.menu_item_modifier_groups a on a.group_id=mg.id and a.tenant_id=mg.tenant_id
      where a.item_id=m.id and a.tenant_id=p_tenant for share of mg,a loop
      select count(*) into n from jsonb_array_elements(line->'modifiers') x
        where x->>'groupId'=g.id::text;
      if n<g.min_select or n>g.max_select then raise exception 'mealdeck_checkout_required_choice'; end if;
    end loop;
    if unit<0 or unit>1000000 then raise exception 'mealdeck_checkout_invalid_amount'; end if;
    gross:=gross+unit::bigint*qty;
    lines:=lines||jsonb_build_array(jsonb_build_object('lineId',line->>'lineId','parentLineId',line->>'parentLineId',
      'menu_item_id',m.id,'brand_id',m.brand_id,'brand_name',m.brand_name,
      'sku',line->>'sku','name',m.name,'quantity',qty,'base_unit_pence',m.price,'unit_pence',unit,'line_pence',unit*qty,
      'modifiers',mods,'attachment',left(line->>'attachment',300)));
  end loop;
  if gross not between 1 and 10000000 then raise exception 'mealdeck_checkout_invalid_amount'; end if;
  return jsonb_build_object('lines',lines,'grossPence',gross);
end $$;
revoke all on function mealdeck_private.price_checkout_lines(uuid,uuid,jsonb) from public,anon,authenticated,service_role;

create function mealdeck_private.validate_checkout_packing(p_selection jsonb,p_packing jsonb)
returns boolean language plpgsql immutable security invoker set search_path='' as $$
declare bag jsonb;allocation jsonb;line jsonb;number integer:=0;n integer;parent_qty integer;
begin
  if jsonb_typeof(p_packing) is distinct from 'object' or p_packing->'version' is distinct from '1'::jsonb
    or jsonb_typeof(p_packing->'separateBags') is distinct from 'boolean'
    or jsonb_typeof(p_packing->'cutleryRequested') is distinct from 'boolean'
    or jsonb_typeof(p_packing->'bags') is distinct from 'array'
    or jsonb_array_length(p_packing->'bags') not between 1 and 10
    or (p_packing->'separateBags'='false'::jsonb and jsonb_array_length(p_packing->'bags')<>1)
    or p_packing-array['version','separateBags','cutleryRequested','bags']::text[]<>'{}'::jsonb then
    raise exception 'mealdeck_checkout_invalid_packing'; end if;
  for bag in select value from jsonb_array_elements(p_packing->'bags') loop
    number:=number+1;
    if bag->'number' is distinct from to_jsonb(number)
      or jsonb_typeof(bag->'allocations') is distinct from 'array' or jsonb_array_length(bag->'allocations')=0
      or bag-array['number','allocations']::text[]<>'{}'::jsonb then raise exception 'mealdeck_checkout_invalid_packing'; end if;
    if (select count(*) from jsonb_array_elements(bag->'allocations')) <>
      (select count(distinct a->>'lineId') from jsonb_array_elements(bag->'allocations') a) then
      raise exception 'mealdeck_checkout_invalid_packing'; end if;
    for allocation in select value from jsonb_array_elements(bag->'allocations') loop
      if coalesce(allocation->>'quantity','') !~ '^([1-9]|1[0-9]|20)$'
        or allocation-array['lineId','quantity']::text[]<>'{}'::jsonb then raise exception 'mealdeck_checkout_invalid_packing'; end if;
      select value into line from jsonb_array_elements(p_selection) where value->>'lineId'=allocation->>'lineId';
      if not found then raise exception 'mealdeck_checkout_invalid_packing'; end if;
      if line->>'parentLineId' is not null then
        select (value->>'quantity')::integer into parent_qty from jsonb_array_elements(bag->'allocations')
          where value->>'lineId'=line->>'parentLineId';
        if not found or parent_qty<>(allocation->>'quantity')::integer then
          raise exception 'mealdeck_checkout_linked_extra_bag_mismatch'; end if;
      end if;
    end loop;
  end loop;
  for line in select value from jsonb_array_elements(p_selection) loop
    select coalesce(sum((a.value->>'quantity')::integer),0) into n
      from jsonb_array_elements(p_packing->'bags') b
      cross join lateral jsonb_array_elements(b.value->'allocations') a
      where a.value->>'lineId'=line->>'lineId';
    if n<>(line->>'quantity')::integer then raise exception 'mealdeck_checkout_incomplete_packing'; end if;
  end loop;
  return true;
end $$;
revoke all on function mealdeck_private.validate_checkout_packing(jsonb,jsonb) from public,anon,authenticated,service_role;

create function mealdeck_private.allocate_checkout_handoff_code(p_tenant uuid,p_location uuid)
returns text language plpgsql security definer set search_path='' set lock_timeout='3s' as $$
declare first_code integer;code text;
begin
  if p_tenant is null or p_location is null then raise exception 'mealdeck_checkout_location_unavailable'; end if;
  -- Held to transaction end, including the following reserved order INSERT.
  -- A partial unique index also protects against an unintended second writer.
  perform pg_advisory_xact_lock(hashtextextended('mealdeck-handoff:'||p_tenant::text||':'||p_location::text,0));
  first_code:=floor(random()*10000)::integer;
  select lpad(((first_code+n)%10000)::text,4,'0') into code
    from generate_series(0,9999) n
    where not exists(select 1 from public.orders o where o.tenant_id=p_tenant and o.location_id=p_location
      and o.handoff_code_reserved and o.handoff_code=lpad(((first_code+n)%10000)::text,4,'0'))
    order by n limit 1;
  if code is null then raise exception 'mealdeck_checkout_handoff_capacity'; end if;
  return code;
end $$;
revoke all on function mealdeck_private.allocate_checkout_handoff_code(uuid,uuid) from public,anon,authenticated,service_role;

create function public.mealdeck_create_checkout_quote(
  p_tenant uuid,p_location uuid,p_customer uuid,p_fulfilment text,p_vehicle jsonb,p_selection jsonb,p_request_hash text,p_packing jsonb
) returns jsonb language plpgsql security definer set search_path='' as $$
declare member jsonb;priced jsonb;offer jsonb;q mealdeck_private.checkout_quotes%rowtype;
  gross integer;discount integer:=0;d date;estimate_minutes integer;
begin
  member:=mealdeck_private.customer_registration_authority(p_customer);
  if member->'registered' is distinct from 'true'::jsonb then raise exception 'mealdeck_checkout_registration_required'; end if;
  if public.mealdeck_online_checkout_status(p_tenant,p_location)->'channelOpen' is distinct from 'true'::jsonb
    or p_fulfilment is null or p_fulfilment not in ('pickup','curbside') then
    raise exception 'mealdeck_checkout_unavailable';
  end if;
  if p_request_hash is null or p_request_hash !~ '^[a-f0-9]{64}$' then raise exception 'mealdeck_checkout_invalid_selection'; end if;
  if p_fulfilment='curbside' then
    if jsonb_typeof(p_vehicle) is distinct from 'object'
      or length(trim(coalesce(p_vehicle->>'make',''))) not between 2 and 60
      or length(trim(coalesce(p_vehicle->>'colour',''))) not between 2 and 40
      or coalesce(p_vehicle->>'registrationLast4','') !~ '^[A-Z0-9]{4}$'
      or p_vehicle - array['make','colour','registrationLast4']::text[] <> '{}'::jsonb then
      raise exception 'mealdeck_checkout_vehicle_required';
    end if;
  elsif p_vehicle is not null then raise exception 'mealdeck_checkout_vehicle_not_needed'; end if;
  perform mealdeck_private.validate_checkout_packing(p_selection,p_packing);
  perform pg_advisory_xact_lock(hashtextextended('checkout-quote:'||p_customer::text,0));
  if (select count(*) from mealdeck_private.checkout_quotes where customer_id=p_customer
    and created_at>now()-interval '5 minutes')>=30 then raise exception 'mealdeck_checkout_retry_later'; end if;
  priced:=mealdeck_private.price_checkout_lines(p_tenant,p_location,p_selection);
  gross:=(priced->>'grossPence')::integer;
  offer:=mealdeck_private.opening_offer(p_tenant,p_location);
  if offer->>'status'='active' then
    discount:=(gross::bigint*30+50)/100;
    select opening_start_date into d from mealdeck_private.checkout_settings where tenant_id=p_tenant and location_id=p_location;
  end if;
  select collection_estimate_minutes into estimate_minutes from mealdeck_private.checkout_settings
    where tenant_id=p_tenant and location_id=p_location;
  insert into mealdeck_private.checkout_quotes(tenant_id,location_id,customer_id,fulfilment,vehicle,
    request_hash,selection,priced_lines,gross_pence,discount_pence,total_pence,opening_start_date,collection_estimate_minutes,packing_plan)
    values(p_tenant,p_location,p_customer,p_fulfilment,p_vehicle,p_request_hash,p_selection,
      priced->'lines',gross,discount,gross-discount,d,estimate_minutes,p_packing) returning * into q;
  return jsonb_build_object('quoteId',q.id,'expiresAt',q.expires_at,'grossPence',gross,
    'discountPence',discount,'totalPence',q.total_pence,'currency','GBP','fulfilment',p_fulfilment,
    'lines',q.priced_lines,'openingOffer',offer,'collectionEstimateMinutes',estimate_minutes,'packingPlan',q.packing_plan);
end $$;
revoke all on function public.mealdeck_create_checkout_quote(uuid,uuid,uuid,text,jsonb,jsonb,text,jsonb) from public,anon,authenticated,service_role;
grant execute on function public.mealdeck_create_checkout_quote(uuid,uuid,uuid,text,jsonb,jsonb,text,jsonb) to service_role;

create function public.mealdeck_prepare_stripe_order(
  p_quote uuid,p_customer uuid,p_attempt uuid,p_stripe_account text,p_livemode boolean
) returns jsonb language plpgsql security definer set search_path='' as $$
declare q mealdeck_private.checkout_quotes%rowtype;s mealdeck_private.stripe_orders%rowtype;
  member jsonb;priced jsonb;o public.orders%rowtype;line jsonb;offer jsonb;handoff text;
begin
  member:=mealdeck_private.customer_registration_authority(p_customer);
  if member->'registered' is distinct from 'true'::jsonb then raise exception 'mealdeck_checkout_registration_required'; end if;
  if p_attempt is null or p_stripe_account is null or p_stripe_account !~ '^acct_[A-Za-z0-9]+$' or p_livemode is null then
    raise exception 'mealdeck_checkout_configuration_required'; end if;
  perform pg_advisory_xact_lock(hashtextextended('checkout-attempt:'||p_customer::text||':'||p_attempt::text,0));
  select * into q from mealdeck_private.checkout_quotes where id=p_quote and customer_id=p_customer for update;
  if not found then raise exception 'mealdeck_checkout_quote_unavailable'; end if;
  select * into s from mealdeck_private.stripe_orders where customer_id=p_customer
    and (attempt_id=p_attempt or quote_id=p_quote) for update;
  if found then
    if s.quote_id<>p_quote or s.stripe_account<>p_stripe_account or s.livemode<>p_livemode then
      raise exception 'mealdeck_checkout_attempt_conflict'; end if;
    if s.captured_pence>0 then raise exception 'mealdeck_checkout_already_paid'; end if;
    if s.void_reason is not null or s.expires_at<=now() then raise exception 'mealdeck_checkout_session_expired'; end if;
    select * into o from public.orders where id=s.order_id;
  else
    if q.expires_at<=now() then raise exception 'mealdeck_checkout_quote_expired'; end if;
    if public.mealdeck_online_checkout_status(q.tenant_id,q.location_id)->'channelOpen' is distinct from 'true'::jsonb then
      raise exception 'mealdeck_checkout_unavailable'; end if;
    priced:=mealdeck_private.price_checkout_lines(q.tenant_id,q.location_id,q.selection);
    if priced->'lines' is distinct from q.priced_lines or (priced->>'grossPence')::integer<>q.gross_pence then
      raise exception 'mealdeck_checkout_price_changed'; end if;
    offer:=mealdeck_private.opening_offer(q.tenant_id,q.location_id);
    if q.discount_pence>0 and (offer->>'status'<>'active' or not exists(
      select 1 from mealdeck_private.checkout_settings c where c.tenant_id=q.tenant_id and c.location_id=q.location_id
        and c.opening_start_date=q.opening_start_date)) then raise exception 'mealdeck_checkout_offer_changed'; end if;
    -- Existing canonical total = net goods + delivery. Gross/discount remain
    -- immutable in the linked quote, avoiding a fabricated free line or fee.
    handoff:=mealdeck_private.allocate_checkout_handoff_code(q.tenant_id,q.location_id);
    insert into public.orders(tenant_id,location_id,customer_id,status,fulfilment,source,currency,
      subtotal_pence,delivery_pence,total_pence,customer_name,customer_email,customer_phone,vehicle,
      vehicle_registration,handoff_code,packing_plan,cutlery_requested,review_confirmed_at,handoff_code_reserved)
      values(q.tenant_id,q.location_id,p_customer,'payment_pending',q.fulfilment::public.fulfilment_type,
        'mealdeck','GBP',q.total_pence,0,q.total_pence,member->>'name',member->>'email',member->>'phone',
        q.vehicle,q.vehicle->>'registrationLast4',handoff,
        q.packing_plan,(q.packing_plan->>'cutleryRequested')::boolean,now(),true) returning * into o;
    for line in select value from jsonb_array_elements(q.priced_lines) loop
      insert into public.order_items(tenant_id,order_id,brand_id,menu_item_id,item_name,quantity,unit_price_pence,modifiers,notes,
        checkout_line_id,parent_checkout_line_id,base_unit_price_pence)
        values(q.tenant_id,o.id,(line->>'brand_id')::uuid,(line->>'menu_item_id')::uuid,line->>'name',
          (line->>'quantity')::integer,(line->>'unit_pence')::integer,line->'modifiers',line->>'attachment',
          line->>'lineId',line->>'parentLineId',(line->>'base_unit_pence')::integer);
    end loop;
    insert into mealdeck_private.stripe_orders(order_id,quote_id,customer_id,attempt_id,stripe_account,livemode)
      values(o.id,q.id,p_customer,p_attempt,p_stripe_account,p_livemode) returning * into s;
  end if;
  return jsonb_build_object('orderId',o.id,'quoteId',q.id,'totalPence',o.total_pence,
    'grossPence',q.gross_pence,'discountPence',q.discount_pence,'currency','gbp','email',o.customer_email,
    'fulfilment',q.fulfilment,'sessionId',s.session_id,'sessionUrl',s.session_url,'expiresAt',s.expires_at,
    'lines',q.priced_lines,'requestHash',q.request_hash);
end $$;
revoke all on function public.mealdeck_prepare_stripe_order(uuid,uuid,uuid,text,boolean) from public,anon,authenticated,service_role;
grant execute on function public.mealdeck_prepare_stripe_order(uuid,uuid,uuid,text,boolean) to service_role;

create function public.mealdeck_bind_stripe_session(p_order uuid,p_session text,p_url text,p_account text,p_livemode boolean)
returns boolean language plpgsql security definer set search_path='' as $$
declare s mealdeck_private.stripe_orders%rowtype;
begin
  select * into s from mealdeck_private.stripe_orders where order_id=p_order for update;
  if not found or s.stripe_account is distinct from p_account or s.livemode is distinct from p_livemode
    or coalesce(p_session,'') !~ '^cs_(test_|live_)?[A-Za-z0-9]+$'
    or coalesce(p_url,'') !~ '^https://checkout[.]stripe[.]com/c/pay/[A-Za-z0-9_/#=?%&.~-]+$'
    or (s.session_id is not null and s.session_id<>p_session) then
    raise exception 'mealdeck_checkout_session_mismatch'; end if;
  update mealdeck_private.stripe_orders set session_id=p_session,session_url=p_url where order_id=p_order;
  return true;
end $$;
revoke all on function public.mealdeck_bind_stripe_session(uuid,text,text,text,boolean) from public,anon,authenticated,service_role;
grant execute on function public.mealdeck_bind_stripe_session(uuid,text,text,text,boolean) to service_role;

-- A signed webhook is verified and the Session/PaymentIntent/Charge are fetched
-- from the configured Stripe account by the server before this narrow RPC.
-- Recording money and releasing all brands into the shared KDS are one transaction.
create function public.mealdeck_reconcile_stripe_event(
  p_event text,p_hash text,p_type text,p_order uuid,p_session text,p_intent text,p_account text,
  p_livemode boolean,p_currency text,p_captured integer,p_refunded integer,p_disputed boolean
) returns jsonb language plpgsql security definer set search_path='' as $$
declare s mealdeck_private.stripe_orders%rowtype;o public.orders%rowtype;prior record;delta integer;
begin
  if p_event is null or p_event !~ '^evt_[A-Za-z0-9]+$' or p_hash is null or p_hash !~ '^[a-f0-9]{64}$'
    or p_type not in ('checkout.session.completed','checkout.session.async_payment_succeeded',
      'charge.refunded','charge.dispute.created','charge.dispute.closed') then
    raise exception 'mealdeck_checkout_invalid_event'; end if;
  select * into o from public.orders where id=p_order and source='mealdeck' for update;
  select * into s from mealdeck_private.stripe_orders where order_id=p_order for update;
  if o.id is null or s.order_id is null or o.group_order_room_id is not null
    or s.stripe_account is distinct from p_account or s.livemode is distinct from p_livemode
    or s.session_id is distinct from p_session or p_currency is distinct from 'gbp'
    or coalesce(p_intent,'') !~ '^pi_[A-Za-z0-9]+$'
    or (s.payment_intent_id is not null and s.payment_intent_id<>p_intent)
    or p_captured is distinct from o.total_pence or p_refunded is null
    or p_refunded<0 or p_refunded>p_captured or p_disputed is null then
    raise exception 'mealdeck_checkout_payment_mismatch'; end if;
  select * into prior from mealdeck_private.stripe_events where event_id=p_event;
  if found then
    if prior.payload_hash<>p_hash or prior.order_id<>p_order or prior.event_type<>p_type then
      raise exception 'mealdeck_checkout_event_conflict'; end if;
    return jsonb_build_object('ok',true,'replayed',true);
  end if;
  insert into mealdeck_private.stripe_events(event_id,payload_hash,event_type,order_id) values(p_event,p_hash,p_type,p_order);
  delta:=greatest(s.refunded_pence,p_refunded)-s.refunded_pence;
  update mealdeck_private.stripe_orders set payment_intent_id=p_intent,captured_pence=p_captured,
    refunded_pence=greatest(refunded_pence,p_refunded),verified_at=coalesce(verified_at,now()),
    void_reason=case when p_disputed then 'dispute' when p_refunded>0 then 'refund' else void_reason end
    where order_id=p_order returning * into s;
  if delta>0 then
    insert into public.mealdeck_refund_allocations(tenant_id,location_id,order_id,amount_pence,status,provider_event_ref)
      values(o.tenant_id,o.location_id,o.id,delta,'settled',p_event);
  end if;
  if s.void_reason is not null or o.status in ('cancelled','refunded') then
    update public.orders set payment_reference=p_intent,paid_at=coalesce(paid_at,now()),
      payment_status=case when s.refunded_pence=p_captured then 'refunded'
        when s.refunded_pence>0 then 'partially_refunded' else 'paid' end,
      status=case when s.refunded_pence=p_captured then 'refunded'::public.order_status else status end,
      handoff_code_reserved=case when s.refunded_pence=p_captured then false else handoff_code_reserved end
      where id=o.id;
  else
    -- Route parents are locked before tickets; a missing route aborts the
    -- transaction and Stripe retries. A confirmed payment is never hidden by a 200.
    perform 1 from public.menu_items m where exists(select 1 from public.order_items i
      where i.order_id=o.id and i.menu_item_id=m.id) order by m.id for update;
    perform 1 from public.menu_item_station_routes r where r.location_id=o.location_id and exists(
      select 1 from public.order_items i where i.order_id=o.id and i.menu_item_id=r.item_id)
      order by r.item_id,r.station_id for share;
    if exists(select 1 from public.order_items i where i.order_id=o.id and not exists(
      select 1 from public.menu_item_station_routes r join public.kitchen_stations st
        on st.id=r.station_id and st.tenant_id=r.tenant_id and st.location_id=r.location_id and st.active
      where r.item_id=i.menu_item_id and r.tenant_id=o.tenant_id and r.location_id=o.location_id)) then
      raise exception 'mealdeck_checkout_routing_unavailable'; end if;
    insert into public.kds_tickets(tenant_id,location_id,order_id,station_id)
      select distinct o.tenant_id,o.location_id,o.id,r.station_id from public.order_items i
      join public.menu_item_station_routes r on r.item_id=i.menu_item_id and r.tenant_id=o.tenant_id and r.location_id=o.location_id
      join public.kitchen_stations st on st.id=r.station_id and st.tenant_id=r.tenant_id and st.location_id=r.location_id and st.active
      where i.order_id=o.id on conflict(order_id,station_id) do nothing;
    insert into public.kds_ticket_items(tenant_id,location_id,order_id,ticket_id,order_item_id,station_id,prep_kind,prep_seconds,quantity)
      select o.tenant_id,o.location_id,o.id,t.id,i.id,r.station_id,r.prep_kind,r.prep_seconds,i.quantity
      from public.order_items i join public.menu_item_station_routes r on r.item_id=i.menu_item_id
        and r.tenant_id=o.tenant_id and r.location_id=o.location_id
      join public.kds_tickets t on t.order_id=o.id and t.station_id=r.station_id
      where i.order_id=o.id on conflict(ticket_id,order_item_id,station_id) do nothing;
    if not mealdeck_ops_private.kds_routing_complete(o.id) then raise exception 'mealdeck_checkout_routing_unavailable'; end if;
    update public.orders set payment_status='paid',payment_reference=p_intent,paid_at=coalesce(paid_at,now()),
      status=case when status in ('draft','payment_pending','paid') then 'accepted'::public.order_status else status end where id=o.id;
    insert into public.mealdeck_pass_orders(order_id,tenant_id,location_id) values(o.id,o.tenant_id,o.location_id)
      on conflict(order_id) do nothing;
  end if;
  insert into public.mealdeck_ops_audit_log(tenant_id,location_id,actor_id,action,entity_type,entity_id,next_value)
    values(o.tenant_id,o.location_id,null,'payment.stripe_verified','order',o.id,
      jsonb_build_object('providerEvent',p_event,'capturedPence',p_captured,'refundedPence',s.refunded_pence,
        'held',s.void_reason is not null));
  return jsonb_build_object('ok',true,'replayed',false,'orderId',o.id,'held',s.void_reason is not null);
end $$;
revoke all on function public.mealdeck_reconcile_stripe_event(text,text,text,uuid,text,text,text,boolean,text,integer,integer,boolean)
  from public,anon,authenticated,service_role;
grant execute on function public.mealdeck_reconcile_stripe_event(text,text,text,uuid,text,text,text,boolean,text,integer,integer,boolean) to service_role;

create function mealdeck_private.kds_release_authority(p_order uuid)
returns jsonb language sql stable security definer set search_path='' as $$
  select jsonb_build_object('schema_version',1,'eligible',true,'order_id',o.id,'tenant_id',o.tenant_id,
    'location_id',o.location_id,'source','mealdeck','release_id',s.release_id,
    'verified_at',to_char(s.verified_at at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"'))
  from public.orders o join mealdeck_private.stripe_orders s on s.order_id=o.id
  where o.id=p_order and o.source='mealdeck' and o.group_order_room_id is null
    and s.verified_at is not null and s.verified_at<=now() and s.payment_intent_id=o.payment_reference
    and s.captured_pence=o.total_pence and s.refunded_pence=0 and s.void_reason is null
    and o.payment_status='paid' and o.paid_at is not null
    and exists(select 1 from mealdeck_private.stripe_events e where e.order_id=o.id)
$$;
revoke all on function mealdeck_private.kds_release_authority(uuid) from public,anon,authenticated,service_role;

create function public.mealdeck_customer_order_receipt(p_order uuid,p_customer uuid)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare o public.orders%rowtype;q mealdeck_private.checkout_quotes%rowtype;s mealdeck_private.stripe_orders%rowtype;
begin
  select * into o from public.orders where id=p_order and customer_id=p_customer and source='mealdeck';
  select * into s from mealdeck_private.stripe_orders where order_id=o.id and customer_id=p_customer;
  if o.id is null or s.order_id is null then raise exception 'mealdeck_checkout_order_unavailable'; end if;
  select * into q from mealdeck_private.checkout_quotes where id=s.quote_id;
  return jsonb_build_object('orderId',o.id,'quoteId',q.id,'status',o.status,'paymentStatus',o.payment_status,
    'verifiedPaid',s.captured_pence=o.total_pence and s.verified_at is not null and s.refunded_pence=0
      and s.void_reason is null and o.payment_status='paid',
    'handoffCode',case when s.verified_at is not null then o.handoff_code else null end,
    'fulfilment',o.fulfilment,'createdAt',o.created_at,'paidAt',o.paid_at,'acceptedAt',o.accepted_at,'serverNow',now(),
    'collectionEstimateMinutes',q.collection_estimate_minutes,
    'estimatedReadyAt',case when o.paid_at is not null then o.paid_at+make_interval(mins=>q.collection_estimate_minutes) else null end,
    'grossPence',q.gross_pence,'discountPence',q.discount_pence,'totalPence',o.total_pence,'lines',q.priced_lines,
    'packingPlan',o.packing_plan,'cutleryRequested',o.cutlery_requested,
    'passStatus',(select p.status from public.mealdeck_pass_orders p where p.order_id=o.id),
    'preparingAt',(select min(t.started_at) from public.kds_tickets t where t.order_id=o.id),
    'readyAt',(select max(t.ready_at) from public.kds_tickets t where t.order_id=o.id),
    'readyForCollectionAt',(select p.ready_for_handoff_at from public.mealdeck_pass_orders p where p.order_id=o.id),
    'completedAt',(select p.handed_off_at from public.mealdeck_pass_orders p where p.order_id=o.id),
    'paymentSessionExpired',s.captured_pence=0 and s.expires_at<=now(),
    'held',s.void_reason is not null);
end $$;
revoke all on function public.mealdeck_customer_order_receipt(uuid,uuid) from public,anon,authenticated,service_role;
grant execute on function public.mealdeck_customer_order_receipt(uuid,uuid) to service_role;

create index orders_mealdeck_customer_recent on public.orders(customer_id,created_at desc,id desc)
  where source='mealdeck';

-- A customer's account can recover their own confirmation links after closing
-- the payment tab. Identity comes only from Auth; no caller-supplied customer ID.
create function public.mealdeck_customer_orders()
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare customer uuid:=auth.uid();authority jsonb;row record;receipt jsonb;orders jsonb:='[]'::jsonb;
begin
  authority:=mealdeck_private.customer_registration_authority(customer);
  if customer is null or authority is null or authority->'registered' is distinct from 'true'::jsonb then
    raise exception 'mealdeck_checkout_registration_required'; end if;
  for row in
    select o.id from public.orders o
    join mealdeck_private.stripe_orders s on s.order_id=o.id and s.customer_id=customer
    where o.customer_id=customer and o.source='mealdeck'
    order by o.created_at desc,o.id desc limit 20
  loop
    receipt:=public.mealdeck_customer_order_receipt(row.id,customer);
    orders:=orders||jsonb_build_array(jsonb_build_object(
      'orderId',receipt->'orderId','handoffCode',receipt->'handoffCode',
      'verifiedPaid',receipt->'verifiedPaid','held',receipt->'held',
      'paymentSessionExpired',receipt->'paymentSessionExpired','fulfilment',receipt->'fulfilment',
      'totalPence',receipt->'totalPence','createdAt',receipt->'createdAt','paidAt',receipt->'paidAt',
      'acceptedAt',receipt->'acceptedAt','preparingAt',receipt->'preparingAt',
      'readyForCollectionAt',receipt->'readyForCollectionAt','completedAt',receipt->'completedAt'));
  end loop;
  return jsonb_build_object('orders',orders);
end $$;
revoke all on function public.mealdeck_customer_orders() from public,anon,authenticated,service_role;
grant execute on function public.mealdeck_customer_orders() to authenticated;

commit;
