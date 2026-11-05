-- Independent MealDeck only. Additive shared Checkout and native Terminal ledger.
-- This installs payment authority, not merchant configuration or checkout activation.
begin;
set local lock_timeout='5s';

-- Never infer independent-project authority from a matching public schema.
-- Check the installation receipt before any DDL, then every extension relied on
-- by the shared canonical quote, receipt and kitchen paths.
do $guard$ begin
  if to_regclass('mealdeck_private.installation') is null
    or to_regnamespace('dishbee_private') is not null then
    raise exception 'mealdeck_payment_independent_profile_required';
  end if;
  if not exists(select 1 from mealdeck_private.installation where singleton
    and profile='mealdeck-independent-v1') then
    raise exception 'mealdeck_payment_independent_profile_required';
  end if;
  if to_regclass('mealdeck_private.checkout_quotes') is null
    or to_regclass('mealdeck_private.stripe_orders') is null
    or to_regclass('mealdeck_private.receipt_jobs') is null
    or to_regclass('mealdeck_private.guest_sessions') is null
    or to_regclass('mealdeck_private.checkout_settings') is null
    or to_regprocedure('mealdeck_private.customer_registration_authority(uuid)') is null
    or to_regprocedure('mealdeck_private.guest_session_authority(uuid,uuid,text)') is null
    or to_regprocedure('mealdeck_private.launch_window()') is null
    or to_regprocedure('mealdeck_private.price_checkout_lines(uuid,uuid,jsonb)') is null
    or to_regprocedure('mealdeck_private.validate_checkout_packing(jsonb,jsonb)') is null
    or to_regprocedure('mealdeck_private.create_checkout_quote_for_identity(uuid,uuid,uuid,uuid,text,jsonb,jsonb,text,jsonb)') is null
    or to_regprocedure('mealdeck_private.prepare_stripe_order_for_identity(uuid,uuid,uuid,uuid,text,boolean)') is null
    or to_regprocedure('mealdeck_private.checkout_receipt_for_identity(uuid,uuid,uuid)') is null
    or to_regprocedure('mealdeck_private.guard_payment_preparation_availability()') is null
    or to_regprocedure('mealdeck_private.update_checkout_availability(uuid,uuid,text,integer,text)') is null
    or to_regprocedure('mealdeck_private.kds_release_authority(uuid)') is null
    or to_regprocedure('mealdeck_ops_private.receipt_snapshot(uuid)') is null
    or to_regprocedure('public.mealdeck_guest_order_receipt(uuid,uuid,text,uuid)') is null
    or not exists(select 1 from information_schema.columns where table_schema='mealdeck_private'
      and table_name='checkout_settings' and column_name='availability_state') then
    raise exception 'mealdeck_payment_previous_extensions_required';
  end if;
end $guard$;

alter table mealdeck_private.checkout_quotes add column staff_id uuid references auth.users(id);
alter table mealdeck_private.checkout_quotes drop constraint checkout_quote_one_identity;
alter table mealdeck_private.checkout_quotes add constraint checkout_quote_one_identity
  check(num_nonnulls(customer_id,guest_id,staff_id)=1);

create table mealdeck_private.payment_orders(
  order_id uuid primary key references public.orders(id),
  quote_id uuid not null unique references mealdeck_private.checkout_quotes(id),
  tenant_id uuid not null,
  location_id uuid not null,
  room_id uuid unique references public.group_order_rooms(id),
  channel text not null check(channel in ('group','terminal')),
  customer_id uuid references auth.users(id),
  guest_id uuid references mealdeck_private.guest_sessions(id),
  staff_id uuid references auth.users(id),
  attempt_id uuid not null,
  split_mode text not null check(split_mode in ('by_bag','equal','single')),
  stripe_account text not null check(stripe_account ~ '^acct_[A-Za-z0-9]+$'),
  livemode boolean not null,
  total_pence integer not null check(total_pence>0),
  release_id uuid not null unique default gen_random_uuid(),
  verified_at timestamptz,
  cancel_requested_at timestamptz,
  hold_reason text,
  expires_at timestamptz not null default now()+interval '60 minutes',
  created_at timestamptz not null default now(),
  check(num_nonnulls(customer_id,guest_id,staff_id)=1),
  check((channel='group' and room_id is not null and split_mode in ('by_bag','equal') and staff_id is null)
    or (channel='terminal' and room_id is null and split_mode='single' and staff_id is not null)),
  foreign key(tenant_id,location_id,order_id) references public.orders(tenant_id,location_id,id),
  unique(customer_id,attempt_id),unique(guest_id,attempt_id),unique(staff_id,attempt_id)
);
create index payment_orders_scope_idx on mealdeck_private.payment_orders(tenant_id,location_id,created_at desc);
create table mealdeck_private.payment_shares(
  id uuid primary key,
  order_id uuid not null references mealdeck_private.payment_orders(order_id),
  bag_number integer not null check(bag_number between 1 and 10),
  token_hash text unique check(token_hash ~ '^[a-f0-9]{64}$'),
  amount_pence integer not null check(amount_pence>0),
  unique(order_id,bag_number),unique(order_id,id)
);
create table mealdeck_private.payment_collections(
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references mealdeck_private.payment_orders(order_id),
  attempt_id uuid not null,
  customer_id uuid references auth.users(id),
  guest_id uuid references mealdeck_private.guest_sessions(id),
  staff_id uuid references auth.users(id),
  method text not null check(method in ('checkout','terminal')),
  request_share_id uuid references mealdeck_private.payment_shares(id),
  cover_remaining boolean not null default false,
  amount_pence integer not null check(amount_pence>0),
  session_id text unique check(session_id ~ '^cs_[A-Za-z0-9_]+$'),
  session_url text,
  payment_intent_id text unique check(payment_intent_id ~ '^pi_[A-Za-z0-9]+$'),
  terminal_location_id text check(terminal_location_id ~ '^tml_[A-Za-z0-9]+$'),
  captured_pence integer not null default 0,
  refunded_pence integer not null default 0,
  cancel_requested_at timestamptz,
  provider_cancelled_at timestamptz,
  hold_reason text,
  verified_at timestamptz,
  expires_at timestamptz not null,
  created_at timestamptz not null default now(),
  check(num_nonnulls(customer_id,guest_id,staff_id)=1),
  check((method='terminal' and staff_id is not null and terminal_location_id is not null and session_id is null and session_url is null)
    or (method='checkout' and staff_id is null and terminal_location_id is null)),
  check(captured_pence between 0 and amount_pence and refunded_pence between 0 and captured_pence),
  unique(order_id,attempt_id),unique(staff_id,attempt_id),unique(order_id,id)
);
create index payment_collections_order_idx on mealdeck_private.payment_collections(order_id,created_at);
create table mealdeck_private.payment_collection_shares(
  order_id uuid not null,
  collection_id uuid not null,
  share_id uuid not null,
  active boolean not null default true,
  primary key(collection_id,share_id),
  foreign key(order_id,collection_id) references mealdeck_private.payment_collections(order_id,id),
  foreign key(order_id,share_id) references mealdeck_private.payment_shares(order_id,id)
);
create unique index payment_share_single_active_claim on mealdeck_private.payment_collection_shares(share_id) where active;
create index payment_collection_shares_order_idx on mealdeck_private.payment_collection_shares(order_id);
create table mealdeck_private.payment_events(
  event_id text primary key check(event_id ~ '^(evt_[A-Za-z0-9]+|obs_[a-f0-9]{64})$'),
  payload_hash text not null check(payload_hash ~ '^[a-f0-9]{64}$'),
  event_type text not null,
  order_id uuid not null,
  collection_id uuid not null,
  verified_at timestamptz not null default now(),
  foreign key(order_id,collection_id) references mealdeck_private.payment_collections(order_id,id)
);
create index payment_events_order_idx on mealdeck_private.payment_events(order_id,collection_id);

alter table mealdeck_private.payment_orders enable row level security;
alter table mealdeck_private.payment_shares enable row level security;
alter table mealdeck_private.payment_collections enable row level security;
alter table mealdeck_private.payment_collection_shares enable row level security;
alter table mealdeck_private.payment_events enable row level security;
revoke all on mealdeck_private.payment_orders,mealdeck_private.payment_shares,
  mealdeck_private.payment_collections,mealdeck_private.payment_collection_shares,
  mealdeck_private.payment_events from public,anon,authenticated,service_role;

-- Both adapters lock the canonical quote before claiming it. This closes the
-- ordinary Checkout / group / Terminal overlap even with two database clients.
create function mealdeck_private.guard_payment_quote_owner()
returns trigger language plpgsql security definer set search_path='' as $$
begin
  perform 1 from mealdeck_private.checkout_quotes where id=new.quote_id for update;
  if tg_table_name='stripe_orders' then
    if exists(select 1 from mealdeck_private.payment_orders where quote_id=new.quote_id) then
      raise exception 'mealdeck_payment_quote_already_frozen'; end if;
  elsif exists(select 1 from mealdeck_private.stripe_orders where quote_id=new.quote_id or order_id=new.order_id) then
    raise exception 'mealdeck_payment_online_overlap';
  end if;
  return new;
end $$;
create trigger payment_legacy_quote_owner before insert on mealdeck_private.stripe_orders
  for each row execute function mealdeck_private.guard_payment_quote_owner();
create trigger payment_shared_quote_owner before insert on mealdeck_private.payment_orders
  for each row execute function mealdeck_private.guard_payment_quote_owner();

-- All collection calls authenticate again. A matching email is never identity.
create function mealdeck_private.payment_actor(
  p_tenant uuid,p_location uuid,p_customer uuid,p_guest_token_hash text
) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare g mealdeck_private.guest_sessions%rowtype;member jsonb;
begin
  if num_nonnulls(p_customer,p_guest_token_hash)<>1 then raise exception 'mealdeck_payment_identity_required'; end if;
  if p_guest_token_hash is not null then
    g:=mealdeck_private.guest_session_authority(p_tenant,p_location,p_guest_token_hash);
    if g.id is null then raise exception 'mealdeck_checkout_guest_session_invalid'; end if;
  end if;
  member:=mealdeck_private.checkout_identity(p_tenant,p_location,p_customer,g.id);
  return member || jsonb_build_object('customerId',p_customer,'guestId',g.id);
end $$;

create function mealdeck_private.assert_payment_open(p_tenant uuid,p_location uuid,p_guest boolean)
returns void language plpgsql security definer set search_path='' as $$
declare w jsonb:=mealdeck_private.launch_window();
begin
  -- This matches the existing quote/prepare linearization. No settings lock is
  -- taken after an order lock: availability changes also lock unprepared quotes.
  if p_guest and w->'guestEligible' is distinct from 'true'::jsonb then
    raise exception 'mealdeck_checkout_guest_unavailable'; end if;
  if w->'orderingOpen' is distinct from 'true'::jsonb then raise exception 'mealdeck_checkout_outside_opening_hours'; end if;
  if public.mealdeck_online_checkout_status(p_tenant,p_location)->'channelOpen' is distinct from 'true'::jsonb then
    raise exception 'mealdeck_checkout_unavailable'; end if;
end $$;

create function mealdeck_private.payment_collection_json(p_collection uuid)
returns jsonb language sql stable security definer set search_path='' as $$
  select jsonb_build_object('collectionId',c.id,'attemptId',c.attempt_id,'orderId',c.order_id,
    'quoteId',o.quote_id,'roomId',o.room_id,'tenantId',o.tenant_id,'locationId',o.location_id,
    'stripeAccount',o.stripe_account,'livemode',o.livemode,'method',c.method,'amountPence',c.amount_pence,
    'currency','gbp','requestHash',q.request_hash,'status',case
      when c.hold_reason is not null or (o.hold_reason is not null and c.captured_pence>0) then 'refund_review'
      when c.captured_pence=c.amount_pence then 'paid'
      when c.provider_cancelled_at is not null then 'cancelled'
      when c.session_id is not null or c.payment_intent_id is not null then 'pending' else 'reserved' end,
    'capturedPence',c.captured_pence,'refundedPence',c.refunded_pence,
    'cancelRequested',c.cancel_requested_at is not null or o.cancel_requested_at is not null,
    'coverRemaining',c.cover_remaining,'requestShareId',c.request_share_id,
    'shareIds',(select coalesce(jsonb_agg(s.share_id order by p.bag_number),'[]'::jsonb)
      from mealdeck_private.payment_collection_shares s join mealdeck_private.payment_shares p on p.id=s.share_id
      where s.collection_id=c.id),
    'sessionId',c.session_id,'sessionUrl',c.session_url,'paymentIntentId',c.payment_intent_id,
    'expiresAt',c.expires_at,'terminalLocationId',c.terminal_location_id,
    'email',case when c.customer_id is not null then (select email::text from auth.users where id=c.customer_id)
      when c.guest_id is not null then (select email from mealdeck_private.guest_sessions where id=c.guest_id) else null end)
  from mealdeck_private.payment_collections c join mealdeck_private.payment_orders o on o.order_id=c.order_id
    join mealdeck_private.checkout_quotes q on q.id=o.quote_id where c.id=p_collection
$$;

create function public.mealdeck_order_payment_collection(p_collection uuid,p_account text,p_livemode boolean)
returns jsonb language sql stable security definer set search_path='' as $$
  select mealdeck_private.payment_collection_json(c.id) from mealdeck_private.payment_collections c
    join mealdeck_private.payment_orders o on o.order_id=c.order_id
  where c.id=p_collection and o.stripe_account=p_account and o.livemode=p_livemode
$$;

-- One explicit-actor permission implementation, shared with existing ops checks.


create or replace function mealdeck_ops_private.can_actor(
  p_actor uuid,p_tenant uuid,p_location uuid,p_permission text
) returns boolean
language sql stable security definer set search_path=''
as $$
  select coalesce(
    p_actor is not null
    and p_permission = any(array[
      'menu.read','menu.write','orders.read','orders.status',
      'recipes.read','recipes.write','costs.read','costs.write',
      'finance.read','finance.manage','analytics.read',
      'inventory.read','inventory.write','staff.read','staff.manage','payments.collect'
    ]::text[])
    and not exists(
      select 1 from public.mealdeck_ops_staff_access denied
      where denied.user_id=(select p_actor)
        and denied.tenant_id=p_tenant and denied.enabled
        and (denied.location_id is null or
          (p_location is not null and denied.location_id=p_location))
        and p_permission=any(denied.deny_permissions)
    )
    and exists(
      select 1 from public.mealdeck_ops_staff_access a
      where a.user_id=(select p_actor)
        and a.tenant_id=p_tenant and a.enabled
        and (a.location_id is null or
          (p_location is not null and a.location_id=p_location))
        and not(p_permission=any(a.deny_permissions))
        and (
          p_permission=any(a.grant_permissions)
          or p_permission=any(case a.role
            when 'owner' then array[
              'menu.read','menu.write','orders.read','orders.status',
              'recipes.read','recipes.write','costs.read','costs.write',
              'finance.read','finance.manage','analytics.read',
              'inventory.read','inventory.write','staff.read','staff.manage','payments.collect'
            ]::text[]
            when 'admin' then array[
              'menu.read','menu.write','orders.read','orders.status',
              'recipes.read','recipes.write','costs.read','costs.write',
              'finance.read','finance.manage','analytics.read',
              'inventory.read','inventory.write','staff.read','staff.manage','payments.collect'
            ]::text[]
            when 'operations' then array[
              'menu.read','orders.read','orders.status',
              'recipes.read','analytics.read','inventory.read','inventory.write'
            ]::text[]
            when 'kitchen' then array[
              'menu.read','orders.read','orders.status','recipes.read','inventory.read'
            ]::text[]
            when 'menu' then array[
              'menu.read','menu.write','recipes.read','recipes.write','inventory.read'
            ]::text[]
            when 'finance' then array[
              'menu.read','orders.read','recipes.read','costs.read','costs.write',
              'finance.read','finance.manage','analytics.read','inventory.read'
            ]::text[]
            when 'analyst' then array[
              'menu.read','analytics.read'
            ]::text[]
            else array['menu.read']::text[]
          end)
        )
    ),false
  );
$$;


create or replace function mealdeck_ops_private.can(p_tenant uuid,p_location uuid,p_permission text)
returns boolean language sql stable security definer set search_path='' as $$
  select mealdeck_ops_private.can_actor(auth.uid(),p_tenant,p_location,p_permission)
$$;


create or replace function public.mealdeck_ops_assign_staff(
  p_tenant uuid,p_user uuid,p_location uuid,p_role text,
  p_grants text[],p_denies text[],p_enabled boolean
) returns uuid
language plpgsql security definer set search_path=''
as $$
declare
  v_actor_role text;
  v_existing public.mealdeck_ops_staff_access%rowtype;
  v_id uuid;
  v_all text[]:=array[
    'menu.read','menu.write','orders.read','orders.status',
    'recipes.read','recipes.write','costs.read','costs.write',
    'finance.read','finance.manage','analytics.read',
    'inventory.read','inventory.write','staff.read','staff.manage','payments.collect'
  ];
begin
  if not mealdeck_ops_private.can(p_tenant,null,'staff.manage') then
    raise exception 'mealdeck_ops_forbidden';
  end if;
  select a.role into v_actor_role
    from public.mealdeck_ops_staff_access a
    where a.user_id=(select auth.uid()) and a.tenant_id=p_tenant
      and a.location_id is null and a.enabled
      and a.role in ('owner','admin')
    order by case when a.role='owner' then 0 else 1 end
    limit 1;
  if not found then raise exception 'mealdeck_ops_owner_admin_required'; end if;
  if p_user=(select auth.uid()) then
    raise exception 'mealdeck_ops_no_self_role_changes';
  end if;
  if p_user is null or p_enabled is null or
      p_role not in ('owner','admin','operations','kitchen','menu','finance','analyst','viewer')
      or p_grants is null or p_denies is null or
      cardinality(p_grants)>20 or cardinality(p_denies)>20 or
      p_grants && p_denies or
      not(p_grants <@ v_all) or not(p_denies <@ v_all) then
    raise exception 'mealdeck_ops_invalid_staff_assignment';
  end if;
  if p_location is not null and not exists(
    select 1 from public.tenant_locations l
      where l.id=p_location and l.tenant_id=p_tenant
  ) then raise exception 'mealdeck_ops_location_mismatch'; end if;
  if not exists(select 1 from auth.users u where u.id=p_user) then
    raise exception 'mealdeck_ops_user_not_provisioned';
  end if;
  if v_actor_role <> 'owner' and (
    p_role in ('owner','admin') or
    p_grants && array['staff.manage','finance.manage']::text[]
  ) then raise exception 'mealdeck_ops_owner_approval_required'; end if;

  select * into v_existing from public.mealdeck_ops_staff_access a
  where a.tenant_id=p_tenant and a.user_id=p_user
    and a.location_id is not distinct from p_location for update;
  if found and v_existing.role='owner' and v_actor_role<>'owner' then
    raise exception 'mealdeck_ops_owner_approval_required';
  end if;

  insert into public.mealdeck_ops_staff_access(
    tenant_id,user_id,location_id,role,grant_permissions,
    deny_permissions,enabled,created_by
  ) values (
    p_tenant,p_user,p_location,p_role,p_grants,p_denies,p_enabled,(select auth.uid())
  ) on conflict(tenant_id,user_id,scope_key) do update set
    role=excluded.role,
    grant_permissions=excluded.grant_permissions,
    deny_permissions=excluded.deny_permissions,
    enabled=excluded.enabled,
    updated_at=now()
  returning id into v_id;
  insert into public.mealdeck_ops_audit_log(
    tenant_id,location_id,actor_id,action,entity_type,entity_id,
    previous_value,next_value
  ) values(
    p_tenant,p_location,(select auth.uid()),'staff.assignment','staff_access',v_id,
    case when v_existing.id is null then null else
      jsonb_build_object(
        'userId',v_existing.user_id,'role',v_existing.role,
        'enabled',v_existing.enabled,
        'grants',v_existing.grant_permissions,
        'denials',v_existing.deny_permissions
      ) end,
    jsonb_build_object(
      'userId',p_user,'role',p_role,'enabled',p_enabled,
      'grants',p_grants,'denials',p_denies
    )
  );
  return v_id;
end;
$$;


create function public.mealdeck_terminal_authorize(p_actor uuid,p_tenant uuid,p_location uuid)
returns jsonb language plpgsql stable security definer set search_path='' as $$
begin
  if p_actor is null or not exists(select 1 from auth.users u where u.id=p_actor and u.email_confirmed_at is not null
      and not coalesce(u.is_anonymous,false) and u.deleted_at is null and (u.banned_until is null or u.banned_until<=now()))
    or not exists(select 1 from public.tenant_locations where id=p_location and tenant_id=p_tenant)
    or not mealdeck_ops_private.can_actor(p_actor,p_tenant,p_location,'payments.collect') then
    raise exception 'mealdeck_payment_staff_forbidden'; end if;
  return jsonb_build_object('authorized',true,'tenantId',p_tenant,'locationId',p_location);
end $$;


create function mealdeck_private.create_checkout_quote_for_actor(
  p_tenant uuid,p_location uuid,p_customer uuid,p_guest uuid,p_staff uuid,p_fulfilment text,p_vehicle jsonb,p_selection jsonb,p_request_hash text,p_packing jsonb
) returns jsonb language plpgsql security definer set search_path='' as $$
declare member jsonb;priced jsonb;offer jsonb;q mealdeck_private.checkout_quotes%rowtype;
  gross integer;discount integer:=0;d date;estimate_minutes integer;launch jsonb:=mealdeck_private.launch_window();
begin
  if p_staff is null then member:=mealdeck_private.checkout_identity(p_tenant,p_location,p_customer,p_guest);
  else
    if p_customer is not null or p_guest is not null then raise exception 'mealdeck_payment_identity_required'; end if;
    perform public.mealdeck_terminal_authorize(p_staff,p_tenant,p_location);
  end if;
  if p_guest is not null and launch->'guestEligible' is distinct from 'true'::jsonb then
    raise exception 'mealdeck_checkout_guest_unavailable'; end if;
  if launch->'orderingOpen' is distinct from 'true'::jsonb then
    raise exception 'mealdeck_checkout_outside_opening_hours'; end if;
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
  perform pg_advisory_xact_lock(hashtextextended('checkout-quote:'||case when p_staff is not null then 'staff:'||p_staff::text when p_guest is null then 'member:'||p_customer::text else 'guest:'||p_guest::text end,0));
  if (select count(*) from mealdeck_private.checkout_quotes where customer_id is not distinct from p_customer and guest_id is not distinct from p_guest and staff_id is not distinct from p_staff
    and created_at>now()-interval '5 minutes')>=30 then raise exception 'mealdeck_checkout_retry_later'; end if;
  priced:=mealdeck_private.price_checkout_lines(p_tenant,p_location,p_selection);
  gross:=(priced->>'grossPence')::integer;
  offer:=mealdeck_private.opening_offer(p_tenant,p_location);
  if offer->>'status'='active' and launch->'guestEligible'='true'::jsonb then
    discount:=(gross::bigint*30+50)/100;
    select opening_start_date into d from mealdeck_private.checkout_settings where tenant_id=p_tenant and location_id=p_location;
  end if;
  select collection_estimate_minutes into estimate_minutes from mealdeck_private.checkout_settings
    where tenant_id=p_tenant and location_id=p_location;
  insert into mealdeck_private.checkout_quotes(tenant_id,location_id,customer_id,guest_id,staff_id,fulfilment,vehicle,
    request_hash,selection,priced_lines,gross_pence,discount_pence,total_pence,opening_start_date,collection_estimate_minutes,packing_plan,expires_at)
    values(p_tenant,p_location,p_customer,p_guest,p_staff,p_fulfilment,p_vehicle,p_request_hash,p_selection,
      priced->'lines',gross,discount,gross-discount,d,estimate_minutes,p_packing,
      least(now()+interval '10 minutes',coalesce((launch->>'currentClosesAt')::timestamptz,now()+interval '10 minutes'))) returning * into q;
  return jsonb_build_object('quoteId',q.id,'expiresAt',q.expires_at,'grossPence',gross,
    'discountPence',discount,'totalPence',q.total_pence,'currency','GBP','fulfilment',p_fulfilment,
    'guestOrder',p_guest is not null,'lines',q.priced_lines,'openingOffer',offer,'collectionEstimateMinutes',estimate_minutes,'packingPlan',q.packing_plan)
    ||case when p_guest is not null then jsonb_build_object('loyaltyEligible',false) else '{}'::jsonb end;
end $$;


create or replace function mealdeck_private.create_checkout_quote_for_identity(
 p_tenant uuid,p_location uuid,p_customer uuid,p_guest uuid,p_fulfilment text,p_vehicle jsonb,p_selection jsonb,p_request_hash text,p_packing jsonb
) returns jsonb language sql security definer set search_path='' as $$
 select mealdeck_private.create_checkout_quote_for_actor(p_tenant,p_location,p_customer,p_guest,null,p_fulfilment,p_vehicle,p_selection,p_request_hash,p_packing)
$$;
create function public.mealdeck_create_terminal_quote(
 p_actor uuid,p_tenant uuid,p_location uuid,p_fulfilment text,p_vehicle jsonb,p_selection jsonb,p_packing jsonb,p_request_hash text
) returns jsonb language sql security definer set search_path='' as $$
 select mealdeck_private.create_checkout_quote_for_actor(p_tenant,p_location,null,null,p_actor,p_fulfilment,p_vehicle,p_selection,p_request_hash,p_packing)
$$;
-- Ordinary and shared payments materialize the very same canonical order/items.


create function mealdeck_private.materialize_payment_order(p_quote uuid,p_customer uuid,p_guest uuid,p_staff uuid,p_room uuid)
returns public.orders language plpgsql security definer set search_path='' as $$
declare q mealdeck_private.checkout_quotes%rowtype;o public.orders%rowtype;
  member jsonb:='{}'::jsonb;priced jsonb;offer jsonb;handoff text;line jsonb;
begin
  select * into q from mealdeck_private.checkout_quotes where id=p_quote
    and customer_id is not distinct from p_customer and guest_id is not distinct from p_guest
    and staff_id is not distinct from p_staff for update;
  if not found then raise exception 'mealdeck_checkout_quote_unavailable'; end if;
  if p_staff is null then member:=mealdeck_private.checkout_identity(q.tenant_id,q.location_id,p_customer,p_guest);
  else perform public.mealdeck_terminal_authorize(p_staff,q.tenant_id,q.location_id); end if;
  perform mealdeck_private.assert_payment_open(q.tenant_id,q.location_id,p_guest is not null);
  perform mealdeck_private.validate_checkout_packing(q.selection,q.packing_plan);
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
      vehicle_registration,handoff_code,packing_plan,cutlery_requested,review_confirmed_at,handoff_code_reserved,guest_checkout,group_order_room_id)
      values(q.tenant_id,q.location_id,p_customer,'payment_pending',q.fulfilment::public.fulfilment_type,
        'mealdeck','GBP',q.total_pence,0,q.total_pence,member->>'name',member->>'email',member->>'phone',
        q.vehicle,q.vehicle->>'registrationLast4',handoff,
        q.packing_plan,(q.packing_plan->>'cutleryRequested')::boolean,now(),true,p_guest is not null,p_room) returning * into o;
    for line in select value from jsonb_array_elements(q.priced_lines) loop
      insert into public.order_items(tenant_id,order_id,brand_id,menu_item_id,item_name,quantity,unit_price_pence,modifiers,notes,
        checkout_line_id,parent_checkout_line_id,base_unit_price_pence)
        values(q.tenant_id,o.id,(line->>'brand_id')::uuid,(line->>'menu_item_id')::uuid,line->>'name',
          (line->>'quantity')::integer,(line->>'unit_pence')::integer,line->'modifiers',line->>'attachment',
          line->>'lineId',line->>'parentLineId',(line->>'base_unit_pence')::integer);
    end loop;
  return o;
end $$;

create or replace function mealdeck_private.prepare_stripe_order_for_identity(
  p_quote uuid,p_customer uuid,p_guest uuid,p_attempt uuid,p_stripe_account text,p_livemode boolean
) returns jsonb language plpgsql security definer set search_path='' as $$
declare q mealdeck_private.checkout_quotes%rowtype;s mealdeck_private.stripe_orders%rowtype;
  member jsonb;priced jsonb;o public.orders%rowtype;line jsonb;offer jsonb;handoff text;launch jsonb:=mealdeck_private.launch_window();
begin
  if p_attempt is null or p_stripe_account is null or p_stripe_account !~ '^acct_[A-Za-z0-9]+$' or p_livemode is null then
    raise exception 'mealdeck_checkout_configuration_required'; end if;
  perform pg_advisory_xact_lock(hashtextextended('checkout-attempt:'||case when p_guest is null then 'member:'||p_customer::text else 'guest:'||p_guest::text end||':'||p_attempt::text,0));
  select * into q from mealdeck_private.checkout_quotes where id=p_quote and customer_id is not distinct from p_customer
    and guest_id is not distinct from p_guest for update;
  if not found then raise exception 'mealdeck_checkout_quote_unavailable'; end if;
  member:=mealdeck_private.checkout_identity(q.tenant_id,q.location_id,p_customer,p_guest);
  if p_guest is not null and launch->'guestEligible' is distinct from 'true'::jsonb then
    raise exception 'mealdeck_checkout_guest_unavailable'; end if;
  if launch->'orderingOpen' is distinct from 'true'::jsonb then
    raise exception 'mealdeck_checkout_outside_opening_hours'; end if;
  -- A previously prepared Stripe session can still complete through its webhook,
  -- but a new prepare request or retry is never admitted outside opening hours.
  if public.mealdeck_online_checkout_status(q.tenant_id,q.location_id)->'channelOpen' is distinct from 'true'::jsonb then
    raise exception 'mealdeck_checkout_unavailable'; end if;
  select * into s from mealdeck_private.stripe_orders where customer_id is not distinct from p_customer and guest_id is not distinct from p_guest
    and (attempt_id=p_attempt or quote_id=p_quote) for update;
  if found then
    if s.quote_id<>p_quote or s.stripe_account<>p_stripe_account or s.livemode<>p_livemode then
      raise exception 'mealdeck_checkout_attempt_conflict'; end if;
    if s.captured_pence>0 then raise exception 'mealdeck_checkout_already_paid'; end if;
    if s.void_reason is not null or s.expires_at<=now() then raise exception 'mealdeck_checkout_session_expired'; end if;
    select * into o from public.orders where id=s.order_id;
  else
    o:=mealdeck_private.materialize_payment_order(p_quote,p_customer,p_guest,null,null);
    insert into mealdeck_private.stripe_orders(order_id,quote_id,customer_id,guest_id,attempt_id,stripe_account,livemode)
      values(o.id,q.id,p_customer,p_guest,p_attempt,p_stripe_account,p_livemode) returning * into s;
  end if;
  return jsonb_build_object('orderId',o.id,'quoteId',q.id,'totalPence',o.total_pence,
    'grossPence',q.gross_pence,'discountPence',q.discount_pence,'currency','gbp','email',o.customer_email,
    'fulfilment',q.fulfilment,'sessionId',s.session_id,'sessionUrl',s.session_url,'expiresAt',s.expires_at,
    'lines',q.priced_lines,'requestHash',q.request_hash);
end $$;

create or replace function mealdeck_private.update_checkout_availability(
  p_tenant uuid,p_location uuid,p_state text,p_collection_estimate_minutes integer,p_audit_action text
) returns jsonb language plpgsql security definer set search_path='' as $$
declare previous jsonb;previous_estimate integer;saved_estimate integer;
  expired_quotes integer:=0;changed_quotes integer;candidate uuid;
begin
  perform mealdeck_private.assert_checkout_availability_manager(p_tenant,p_location);
  if p_state is null or p_state not in ('online','busy','paused','closed')
    or p_audit_action is null or p_audit_action not in ('checkout.availability','checkout.settings','checkout.estimate') then
    raise exception 'mealdeck_checkout_availability_invalid';
  end if;
  if (p_state in ('online','busy') and p_collection_estimate_minutes is null)
    or (p_collection_estimate_minutes is not null and p_collection_estimate_minutes not between 5 and 180) then
    raise exception 'mealdeck_checkout_collection_estimate_required';
  end if;
  -- Serialize transitions even before the settings row exists. The audit's
  -- previous state is the actual last committed setting, never browser state.
  perform pg_advisory_xact_lock(hashtextextended('mealdeck-checkout-settings:'||p_tenant::text||':'||p_location::text,0));
  perform mealdeck_private.assert_checkout_availability_manager(p_tenant,p_location);
  select to_jsonb(s),s.collection_estimate_minutes into previous,previous_estimate
    from mealdeck_private.checkout_settings s where s.tenant_id=p_tenant and s.location_id=p_location for update;
  saved_estimate:=coalesce(p_collection_estimate_minutes,previous_estimate);
  insert into mealdeck_private.checkout_settings(tenant_id,location_id,checkout_enabled,availability_state,
    opening_start_date,collection_estimate_minutes)
    values(p_tenant,p_location,p_state in ('online','busy'),p_state,date '2026-11-06',saved_estimate)
    on conflict(tenant_id,location_id) do update set checkout_enabled=excluded.checkout_enabled,
      availability_state=excluded.availability_state,opening_start_date=excluded.opening_start_date,
      collection_estimate_minutes=excluded.collection_estimate_minutes,updated_at=now();
  if previous_estimate is distinct from saved_estimate then
    -- A changed pickup promise needs a fresh review. Sessions already prepared
    -- with Stripe retain their original immutable quote and may finish normally.
    for candidate in select q.id from mealdeck_private.checkout_quotes q
      where q.tenant_id=p_tenant and q.location_id=p_location
        and q.collection_estimate_minutes is distinct from saved_estimate
        and q.expires_at>now()
        and not exists(select 1 from mealdeck_private.stripe_orders s where s.quote_id=q.id)
        and not exists(select 1 from mealdeck_private.payment_orders p where p.quote_id=q.id)
      order by q.id for update of q loop
      -- Preparation owns the same quote lock. Recheck after waiting with a new
      -- command snapshot so a session prepared concurrently stays untouched.
      update mealdeck_private.checkout_quotes q set expires_at=least(q.expires_at,now())
        where q.id=candidate
          and not exists(select 1 from mealdeck_private.stripe_orders s where s.quote_id=q.id)
        and not exists(select 1 from mealdeck_private.payment_orders p where p.quote_id=q.id);
      get diagnostics changed_quotes = row_count;
      expired_quotes:=expired_quotes+changed_quotes;
    end loop;
  end if;
  insert into public.mealdeck_ops_audit_log(tenant_id,location_id,actor_id,action,entity_type,entity_id,previous_value,next_value)
    values(p_tenant,p_location,auth.uid(),p_audit_action,'location',p_location,previous,
      jsonb_build_object('enabled',p_state in ('online','busy'),'availabilityState',p_state,
        'openingStartDate',date '2026-11-06','collectionEstimateMinutes',saved_estimate,
        'openingDays',3,'expiredUnpreparedQuotes',expired_quotes));
  return public.mealdeck_ops_checkout_settings(p_tenant,p_location);
end $$;


create trigger mealdeck_shared_payment_availability_admission before insert on mealdeck_private.payment_orders
  for each row execute function mealdeck_private.guard_payment_preparation_availability();


create function mealdeck_private.lock_payment_order(p_order uuid)
returns mealdeck_private.payment_orders language plpgsql security definer set search_path='' as $$
declare p mealdeck_private.payment_orders%rowtype;
begin
  perform 1 from public.orders where id=p_order and source='mealdeck' for update;
  select * into p from mealdeck_private.payment_orders where order_id=p_order for update;
  if not found then raise exception 'mealdeck_payment_order_unavailable'; end if;
  return p;
end $$;

create function mealdeck_private.group_payment_access(
 p_room uuid,p_customer uuid,p_guest_token_hash text,p_share_token_hash text
) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare p mealdeck_private.payment_orders%rowtype;a jsonb;member jsonb;owned boolean:=false;share uuid;
begin
  select * into p from mealdeck_private.payment_orders where room_id=p_room and channel='group';
  if not found then raise exception 'mealdeck_payment_room_unavailable'; end if;
  if p_share_token_hash ~ '^[a-f0-9]{64}$' then
    select id into share from mealdeck_private.payment_shares where order_id=p.order_id and token_hash=p_share_token_hash;
  end if;
  if p_customer is not null or p_guest_token_hash is not null then
    -- A valid capability permits viewing before customer registration. Only the
    -- authority's explicit current-verified, registered:false result qualifies;
    -- invalid/banned identities and unrelated database errors are never masked.
    if share is not null and p_customer is not null and p_guest_token_hash is null then
      member:=mealdeck_private.customer_registration_authority(p_customer);
    end if;
    if member->'registered' is distinct from 'false'::jsonb then
      a:=mealdeck_private.payment_actor(p.tenant_id,p.location_id,p_customer,p_guest_token_hash);
      owned:=p.customer_id is not distinct from (a->>'customerId')::uuid
        and p.guest_id is not distinct from (a->>'guestId')::uuid;
    end if;
  end if;
  if not owned and share is null then raise exception 'mealdeck_payment_room_unavailable'; end if;
  return jsonb_build_object('orderId',p.order_id,'owner',owned,'shareId',share,
    'actorCustomerId',a->>'customerId','actorGuestId',a->>'guestId');
end $$;

create function mealdeck_private.group_payment_snapshot(p_order uuid,p_owner boolean,p_share uuid)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare p mealdeck_private.payment_orders%rowtype;q mealdeck_private.checkout_quotes%rowtype;
  o public.orders%rowtype;captured integer;refunded integer;available integer;shares jsonb;lines jsonb;packing jsonb;
begin
  select * into p from mealdeck_private.payment_orders where order_id=p_order;
  select * into q from mealdeck_private.checkout_quotes where id=p.quote_id;
  select * into o from public.orders where id=p_order;
  select coalesce(sum(captured_pence),0),coalesce(sum(refunded_pence),0) into captured,refunded
    from mealdeck_private.payment_collections where order_id=p_order;
  select coalesce(sum(s.amount_pence),0) into available from mealdeck_private.payment_shares s
    where s.order_id=p_order and not exists(select 1 from mealdeck_private.payment_collection_shares cs where cs.share_id=s.id and cs.active);
  select jsonb_agg(jsonb_build_object('shareId',s.id,'bagNumber',s.bag_number,'amountPence',s.amount_pence,
    'paidPence',case when c.captured_pence=c.amount_pence then s.amount_pence else 0 end,
    'status',case when c.hold_reason is not null or (p.hold_reason is not null and c.captured_pence>0) then 'refund_review'
      when c.captured_pence=c.amount_pence then 'paid' when c.id is not null then 'pending' else 'unclaimed' end)
    order by s.bag_number) into shares
    from mealdeck_private.payment_shares s
      left join mealdeck_private.payment_collection_shares cs on cs.share_id=s.id and cs.active
      left join mealdeck_private.payment_collections c on c.id=cs.collection_id where s.order_id=p_order and (p_owner or s.id=p_share);
  if p_owner then lines:=q.priced_lines;packing:=q.packing_plan;
  else
    select q.packing_plan || jsonb_build_object('bags',jsonb_build_array(b)) into packing
      from jsonb_array_elements(q.packing_plan->'bags') b join mealdeck_private.payment_shares s
        on s.bag_number=(b->>'number')::integer where s.id=p_share and s.order_id=p_order;
    select coalesce(jsonb_agg(l || jsonb_build_object('quantity',(a->>'quantity')::integer,
      'line_pence',(a->>'quantity')::integer*(l->>'unit_pence')::integer) order by n),'[]'::jsonb) into lines
      from jsonb_array_elements(q.priced_lines) with ordinality x(l,n)
      join jsonb_array_elements(packing->'bags'->0->'allocations') a on a->>'lineId'=l->>'lineId';
  end if;
  return jsonb_build_object('roomId',p.room_id,'orderId',p.order_id,'version',1,'splitMode',p.split_mode,
    'currency','GBP','status',case when p.hold_reason is not null and captured>0 then 'refund_review'
      when p.cancel_requested_at is not null then 'cancelled' when p.hold_reason is not null then 'refund_review'
      when p.verified_at is not null then 'paid' else 'collecting' end,
    'totalPence',p.total_pence,'capturedPence',captured,'paidPence',greatest(0,captured-refunded),
    'refundedPence',refunded,'remainingPence',greatest(0,p.total_pence-captured+refunded),
    'unclaimedPence',available,'expiresAt',p.expires_at,'fundingExpired',p.expires_at<=now(),
    'holdReason',p.hold_reason,'ownerAccess',p_owner,'ownShareId',p_share,
    'viewer',jsonb_build_object('role',case when p_owner then 'organiser' else 'participant' end,'shareId',p_share),'shares',shares,
    'lines',lines,'packingPlan',packing,'collectionEstimateMinutes',q.collection_estimate_minutes,
    'fulfilment',o.fulfilment,'createdAt',o.created_at,'paidAt',o.paid_at,'acceptedAt',o.accepted_at,
    'handoffCode',case when p.verified_at is not null and p.hold_reason is null then o.handoff_code else null end,
    'serverNow',now()) || case when p_owner then jsonb_build_object('quoteId',q.id) else '{}'::jsonb end;
end $$;

create function public.mealdeck_group_payment_status(
 p_room uuid,p_customer uuid,p_guest_token_hash text,p_share_token_hash text
) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare a jsonb;
begin
  a:=mealdeck_private.group_payment_access(p_room,p_customer,p_guest_token_hash,p_share_token_hash);
  return mealdeck_private.group_payment_snapshot((a->>'orderId')::uuid,(a->>'owner')::boolean,(a->>'shareId')::uuid);
end $$;

create function public.mealdeck_group_payment_collections(
 p_room uuid,p_customer uuid,p_guest_token_hash text,p_share_token_hash text
) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare a jsonb;result jsonb;actor_data jsonb;
begin
  a:=mealdeck_private.group_payment_access(p_room,p_customer,p_guest_token_hash,p_share_token_hash);
  if a->>'actorCustomerId' is not null or a->>'actorGuestId' is not null then
    actor_data:=jsonb_build_object('customerId',a->>'actorCustomerId','guestId',a->>'actorGuestId');
  end if;
  select coalesce(jsonb_agg(mealdeck_private.payment_collection_json(c.id) || jsonb_build_object('payerAccess',
    actor_data is not null and c.staff_id is null
      and c.customer_id is not distinct from (actor_data->>'customerId')::uuid
      and c.guest_id is not distinct from (actor_data->>'guestId')::uuid) order by c.created_at),'[]'::jsonb) into result
    from mealdeck_private.payment_collections c where c.order_id=(a->>'orderId')::uuid
    and ((a->>'owner')::boolean or exists(select 1 from mealdeck_private.payment_collection_shares s
      where s.collection_id=c.id and s.share_id=(a->>'shareId')::uuid));
  return result;
end $$;

create function public.mealdeck_create_group_payment_room(
 p_room uuid,p_quote uuid,p_customer uuid,p_guest_token_hash text,p_attempt uuid,p_split_mode text,
 p_share_tokens jsonb,p_stripe_account text,p_livemode boolean
) returns jsonb language plpgsql security definer set search_path='' as $$
declare q mealdeck_private.checkout_quotes%rowtype;p mealdeck_private.payment_orders%rowtype;
 o public.orders%rowtype;actor_data jsonb;g uuid;bag_count integer;tokens jsonb;
begin
  if p_room is null or p_attempt is null or p_split_mode is null or p_split_mode not in ('by_bag','equal')
    or p_stripe_account is null or p_stripe_account !~ '^acct_[A-Za-z0-9]+$' or p_livemode is null
    or jsonb_typeof(p_share_tokens) is distinct from 'array' then raise exception 'mealdeck_payment_room_invalid'; end if;
  select * into q from mealdeck_private.checkout_quotes where id=p_quote;
  if not found then raise exception 'mealdeck_checkout_quote_unavailable'; end if;
  actor_data:=mealdeck_private.payment_actor(q.tenant_id,q.location_id,p_customer,p_guest_token_hash);g:=(actor_data->>'guestId')::uuid;
  if q.customer_id is distinct from p_customer or q.guest_id is distinct from g or q.staff_id is not null then
    raise exception 'mealdeck_checkout_quote_unavailable'; end if;
  perform pg_advisory_xact_lock(hashtextextended('mealdeck-payment-create:'||coalesce(p_customer,g)::text||':'||p_attempt::text,0));
  select * into q from mealdeck_private.checkout_quotes where id=p_quote for update;
  bag_count:=jsonb_array_length(q.packing_plan->'bags');
  if bag_count not between 2 and 10 or q.packing_plan->'separateBags' is distinct from 'true'::jsonb
    or jsonb_array_length(p_share_tokens)<>bag_count or exists(
      select 1 from jsonb_array_elements(p_share_tokens) t where jsonb_typeof(t) is distinct from 'object'
      or t-array['shareId','bagNumber','tokenHash']::text[]<>'{}'::jsonb
      or jsonb_typeof(t->'shareId') is distinct from 'string' or jsonb_typeof(t->'tokenHash') is distinct from 'string'
      or jsonb_typeof(t->'bagNumber') is distinct from 'number'
      or coalesce(t->>'shareId','') !~ '^[a-f0-9]{8}-[a-f0-9]{4}-[1-5][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$'
      or coalesce(t->>'bagNumber','') !~ '^(10|[1-9])$' or coalesce(t->>'tokenHash','') !~ '^[a-f0-9]{64}$') then
    raise exception 'mealdeck_payment_shares_invalid'; end if;
  if (select count(distinct t->>'shareId') from jsonb_array_elements(p_share_tokens) t)<>bag_count
    or (select count(distinct t->>'tokenHash') from jsonb_array_elements(p_share_tokens) t)<>bag_count
    or (select count(distinct t->>'bagNumber') from jsonb_array_elements(p_share_tokens) t)<>bag_count
    or exists(select 1 from jsonb_array_elements(p_share_tokens) t where not exists(
      select 1 from jsonb_array_elements(q.packing_plan->'bags') b where (b->>'number')::integer=(t->>'bagNumber')::integer)) then
    raise exception 'mealdeck_payment_shares_invalid'; end if;
  select * into p from mealdeck_private.payment_orders where quote_id=p_quote or room_id=p_room
    or (attempt_id=p_attempt and customer_id is not distinct from p_customer and guest_id is not distinct from g);
  if found then
    select jsonb_agg(jsonb_build_object('shareId',s.id,'bagNumber',s.bag_number,'tokenHash',s.token_hash) order by s.bag_number)
      into tokens from mealdeck_private.payment_shares s where s.order_id=p.order_id;
    if p.room_id is distinct from p_room or p.quote_id<>p_quote or p.attempt_id<>p_attempt
      or p.customer_id is distinct from p_customer or p.guest_id is distinct from g
      or p.split_mode<>p_split_mode or p.stripe_account<>p_stripe_account or p.livemode<>p_livemode
      or tokens is distinct from (select jsonb_agg(t order by (t->>'bagNumber')::integer) from jsonb_array_elements(p_share_tokens) t) then
      raise exception 'mealdeck_payment_attempt_conflict'; end if;
    return mealdeck_private.group_payment_snapshot(p.order_id,true,null);
  end if;
  if exists(select 1 from mealdeck_private.stripe_orders where quote_id=p_quote) then raise exception 'mealdeck_payment_online_overlap'; end if;
  perform mealdeck_private.assert_payment_open(q.tenant_id,q.location_id,g is not null);
  insert into public.group_order_rooms(id,tenant_id,location_id,status,payment_mode)
    values(p_room,q.tenant_id,q.location_id,'collecting','separate_host_balance');
  o:=mealdeck_private.materialize_payment_order(p_quote,p_customer,g,null,p_room);
  insert into mealdeck_private.payment_orders(order_id,quote_id,tenant_id,location_id,room_id,channel,
    customer_id,guest_id,attempt_id,split_mode,stripe_account,livemode,total_pence)
    values(o.id,q.id,q.tenant_id,q.location_id,p_room,'group',p_customer,g,p_attempt,p_split_mode,p_stripe_account,p_livemode,q.total_pence);
  update public.group_order_rooms set master_order_id=o.id where id=p_room;
  -- Allocate exact integer pennies. By-bag discounts use largest remainder;
  -- equal contributions allocate any remaining pennies to earlier bag numbers.
  with weights as (
    select (b->>'number')::integer bag_number,sum((a->>'quantity')::integer*(l->>'unit_pence')::integer)::bigint weight
      from jsonb_array_elements(q.packing_plan->'bags') b cross join jsonb_array_elements(b->'allocations') a
      join jsonb_array_elements(q.priced_lines) l on l->>'lineId'=a->>'lineId' group by b->>'number'
  ), parts as (
    select bag_number,case when p_split_mode='equal' then q.total_pence/bag_count else (q.total_pence::bigint*weight/q.gross_pence)::integer end base,
      case when p_split_mode='equal' then 0 else q.total_pence::bigint*weight%q.gross_pence end remainder from weights
  ), ranked as (
    select *,row_number() over(order by remainder desc,bag_number) rank,q.total_pence-sum(base) over() extra from parts
  ) insert into mealdeck_private.payment_shares(id,order_id,bag_number,token_hash,amount_pence)
    select (t->>'shareId')::uuid,o.id,r.bag_number,t->>'tokenHash',r.base+case when r.rank<=r.extra then 1 else 0 end
      from ranked r join jsonb_array_elements(p_share_tokens) t on (t->>'bagNumber')::integer=r.bag_number;
  if (select sum(amount_pence) from mealdeck_private.payment_shares where order_id=o.id)<>q.total_pence then
    raise exception 'mealdeck_payment_allocation_invalid'; end if;
  insert into public.mealdeck_ops_audit_log(tenant_id,location_id,actor_id,action,entity_type,entity_id,next_value)
    values(q.tenant_id,q.location_id,p_customer,'payment.group_created','order',o.id,
      jsonb_build_object('roomId',p_room,'splitMode',p_split_mode,'shareCount',bag_count,'totalPence',q.total_pence));
  return mealdeck_private.group_payment_snapshot(o.id,true,null);
end $$;

create function mealdeck_private.reserve_payment_collection(
 p_order uuid,p_customer uuid,p_guest uuid,p_staff uuid,p_method text,p_shares uuid[],p_attempt uuid,
 p_request_share uuid,p_cover_remaining boolean,p_terminal_location text
) returns jsonb language plpgsql security definer set search_path='' as $$
declare p mealdeck_private.payment_orders%rowtype;c mealdeck_private.payment_collections%rowtype;amount integer;
begin
  p:=mealdeck_private.lock_payment_order(p_order);
  if p.hold_reason is not null or p.cancel_requested_at is not null then raise exception 'mealdeck_payment_order_held'; end if;
  if p.verified_at is not null then raise exception 'mealdeck_checkout_already_paid'; end if;
  if p.expires_at<now()+interval '30 minutes' then raise exception 'mealdeck_payment_funding_expired'; end if;
  if p_attempt is null or cardinality(p_shares) is null or cardinality(p_shares)=0
    or cardinality(p_shares)<>(select count(distinct s) from unnest(p_shares) s) then raise exception 'mealdeck_payment_nothing_available'; end if;
  if exists(select 1 from mealdeck_private.payment_collections where order_id=p_order and method<>p_method
    and provider_cancelled_at is null and captured_pence=0) then raise exception 'mealdeck_payment_online_overlap'; end if;
  select sum(amount_pence) into amount from mealdeck_private.payment_shares where order_id=p_order and id=any(p_shares);
  if amount is null or (select count(*) from mealdeck_private.payment_shares where order_id=p_order and id=any(p_shares))<>cardinality(p_shares)
    or exists(select 1 from mealdeck_private.payment_collection_shares where share_id=any(p_shares) and active) then
    raise exception 'mealdeck_payment_share_claimed'; end if;
  insert into mealdeck_private.payment_collections(order_id,attempt_id,customer_id,guest_id,staff_id,method,amount_pence,
    request_share_id,cover_remaining,terminal_location_id,expires_at)
    values(p_order,p_attempt,p_customer,p_guest,p_staff,p_method,amount,p_request_share,p_cover_remaining,p_terminal_location,
      least(now()+interval '35 minutes',p.expires_at)) returning * into c;
  insert into mealdeck_private.payment_collection_shares(order_id,collection_id,share_id)
    select p_order,c.id,s from unnest(p_shares) s;
  return mealdeck_private.payment_collection_json(c.id);
end $$;

create function public.mealdeck_prepare_group_payment(
 p_room uuid,p_customer uuid,p_guest_token_hash text,p_share_token_hash text,p_cover_remaining boolean,
 p_attempt uuid,p_stripe_account text,p_livemode boolean
) returns jsonb language plpgsql security definer set search_path='' as $$
declare a jsonb;actor jsonb;p mealdeck_private.payment_orders%rowtype;c mealdeck_private.payment_collections%rowtype;
  g uuid;share uuid;shares uuid[];
begin
  a:=mealdeck_private.group_payment_access(p_room,p_customer,p_guest_token_hash,p_share_token_hash);
  p:=mealdeck_private.lock_payment_order((a->>'orderId')::uuid);
  actor:=mealdeck_private.payment_actor(p.tenant_id,p.location_id,p_customer,p_guest_token_hash);g:=(actor->>'guestId')::uuid;
  share:=case when p_cover_remaining then null else (a->>'shareId')::uuid end;
  if p_cover_remaining is null or p_attempt is null or p.stripe_account is distinct from p_stripe_account or p.livemode is distinct from p_livemode
    or (p_cover_remaining and not (a->>'owner')::boolean) or (not p_cover_remaining and share is null) then
    raise exception 'mealdeck_payment_claim_forbidden'; end if;
  select * into c from mealdeck_private.payment_collections where order_id=p.order_id and attempt_id=p_attempt;
  if found then
    if c.customer_id is distinct from p_customer or c.guest_id is distinct from g or c.staff_id is not null
      or c.method<>'checkout' or c.request_share_id is distinct from share or c.cover_remaining<>p_cover_remaining then
      raise exception 'mealdeck_payment_attempt_conflict'; end if;
    return mealdeck_private.payment_collection_json(c.id);
  end if;
  perform mealdeck_private.assert_payment_open(p.tenant_id,p.location_id,g is not null);
  if p_cover_remaining then
    select array_agg(s.id order by s.bag_number) into shares from mealdeck_private.payment_shares s where s.order_id=p.order_id
      and not exists(select 1 from mealdeck_private.payment_collection_shares cs where cs.share_id=s.id and cs.active);
  else shares:=array[share]; end if;
  return mealdeck_private.reserve_payment_collection(p.order_id,p_customer,g,null,'checkout',shares,p_attempt,share,p_cover_remaining,null);
end $$;

create function public.mealdeck_terminal_payment_attempt(p_actor uuid,p_tenant uuid,p_location uuid,p_attempt uuid)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare result jsonb;
begin
  perform public.mealdeck_terminal_authorize(p_actor,p_tenant,p_location);
  select mealdeck_private.payment_collection_json(c.id) into result from mealdeck_private.payment_collections c
    join mealdeck_private.payment_orders p on p.order_id=c.order_id
    where c.staff_id=p_actor and c.attempt_id=p_attempt and c.method='terminal'
      and p.tenant_id=p_tenant and p.location_id=p_location;
  return result;
end $$;

create function public.mealdeck_terminal_order_status(p_actor uuid,p_tenant uuid,p_location uuid,p_reference text)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare o public.orders%rowtype;p mealdeck_private.payment_orders%rowtype;q mealdeck_private.checkout_quotes%rowtype;
  legacy mealdeck_private.stripe_orders%rowtype;captured integer;refunded integer;available integer;active jsonb;
begin
  perform public.mealdeck_terminal_authorize(p_actor,p_tenant,p_location);
  select * into o from public.orders where tenant_id=p_tenant and location_id=p_location and source='mealdeck'
    and (id::text=p_reference or (p_reference ~ '^[0-9]{4}$' and handoff_code=p_reference and handoff_code_reserved));
  if not found then raise exception 'mealdeck_payment_order_unavailable'; end if;
  select * into p from mealdeck_private.payment_orders where order_id=o.id;
  if found then
    select * into q from mealdeck_private.checkout_quotes where id=p.quote_id;
    select coalesce(sum(captured_pence),0),coalesce(sum(refunded_pence),0) into captured,refunded
      from mealdeck_private.payment_collections where order_id=o.id;
    select coalesce(sum(s.amount_pence),0) into available from mealdeck_private.payment_shares s where s.order_id=o.id
      and not exists(select 1 from mealdeck_private.payment_collection_shares cs where cs.share_id=s.id and cs.active);
    select mealdeck_private.payment_collection_json(c.id) into active from mealdeck_private.payment_collections c
      where c.order_id=o.id and c.staff_id=p_actor and c.method='terminal' and c.provider_cancelled_at is null
      order by c.created_at desc limit 1;
  else
    select * into legacy from mealdeck_private.stripe_orders where order_id=o.id;
    if not found then raise exception 'mealdeck_payment_order_unavailable'; end if;
    select * into q from mealdeck_private.checkout_quotes where id=legacy.quote_id;
    captured:=legacy.captured_pence;refunded:=legacy.refunded_pence;available:=0;
  end if;
  return jsonb_build_object('orderId',o.id,'quoteId',q.id,'roomId',p.room_id,'currency','GBP',
    'displayCode',o.handoff_code,'status',o.status,'paymentStatus',o.payment_status,
    'verifiedPaid',mealdeck_private.kds_release_authority(o.id) is not null,
    'totalPence',o.total_pence,'capturedPence',captured,'paidPence',greatest(0,captured-refunded),
    'refundedPence',refunded,'remainingPence',greatest(0,o.total_pence-captured+refunded),
    'collectiblePence',case when p.hold_reason is null and p.cancel_requested_at is null and p.expires_at>=now()+interval '30 minutes'
      and not exists(select 1 from mealdeck_private.payment_collections where order_id=o.id and captured_pence=0 and provider_cancelled_at is null)
      then available else 0 end,
    'held',p.hold_reason is not null or legacy.void_reason is not null,'activeCollection',active,
    'onlinePaymentActive',legacy.order_id is not null or exists(select 1 from mealdeck_private.payment_collections
      where order_id=o.id and method='checkout' and captured_pence=0 and provider_cancelled_at is null),
    'lines',q.priced_lines,'packingPlan',o.packing_plan,'collectionEstimateMinutes',q.collection_estimate_minutes,
    'fulfilment',o.fulfilment,'vehicle',o.vehicle,'serverNow',now());
end $$;

create function public.mealdeck_prepare_terminal_payment(
 p_actor uuid,p_tenant uuid,p_location uuid,p_quote uuid,p_order uuid,p_attempt uuid,
 p_stripe_account text,p_livemode boolean,p_terminal_location text
) returns jsonb language plpgsql security definer set search_path='' as $$
declare q mealdeck_private.checkout_quotes%rowtype;p mealdeck_private.payment_orders%rowtype;
  o public.orders%rowtype;c mealdeck_private.payment_collections%rowtype;shares uuid[];
begin
  perform public.mealdeck_terminal_authorize(p_actor,p_tenant,p_location);
  if num_nonnulls(p_quote,p_order)<>1 or p_attempt is null or p_stripe_account is null
    or p_stripe_account !~ '^acct_[A-Za-z0-9]+$' or p_livemode is null
    or p_terminal_location is null or p_terminal_location !~ '^tml_[A-Za-z0-9]+$' then
    raise exception 'mealdeck_payment_terminal_invalid'; end if;
  perform pg_advisory_xact_lock(hashtextextended('mealdeck-terminal-attempt:'||p_actor::text||':'||p_attempt::text,0));
  select * into c from mealdeck_private.payment_collections where staff_id=p_actor and attempt_id=p_attempt;
  if found then
    p:=mealdeck_private.lock_payment_order(c.order_id);
    if p.tenant_id<>p_tenant or p.location_id<>p_location or p.stripe_account<>p_stripe_account or p.livemode<>p_livemode
      or c.method<>'terminal' or c.terminal_location_id<>p_terminal_location
      or (p_quote is not null and p.quote_id<>p_quote) or (p_order is not null and p.order_id<>p_order) then
      raise exception 'mealdeck_payment_attempt_conflict'; end if;
    -- Recovery reads a frozen attempt; it never opens a second charge or requires
    -- the kitchen to reopen after a provider session has already started.
    return mealdeck_private.payment_collection_json(c.id);
  end if;
  perform mealdeck_private.assert_payment_open(p_tenant,p_location,false);
  if p_quote is not null then
    select * into q from mealdeck_private.checkout_quotes where id=p_quote and tenant_id=p_tenant
      and location_id=p_location and staff_id=p_actor for update;
    if not found then raise exception 'mealdeck_checkout_quote_unavailable'; end if;
    select * into p from mealdeck_private.payment_orders where quote_id=p_quote;
    if not found then
      if exists(select 1 from mealdeck_private.stripe_orders where quote_id=p_quote) then raise exception 'mealdeck_payment_online_overlap'; end if;
      o:=mealdeck_private.materialize_payment_order(p_quote,null,null,p_actor,null);
      insert into mealdeck_private.payment_orders(order_id,quote_id,tenant_id,location_id,channel,staff_id,
        attempt_id,split_mode,stripe_account,livemode,total_pence)
        values(o.id,q.id,p_tenant,p_location,'terminal',p_actor,p_attempt,'single',p_stripe_account,p_livemode,q.total_pence)
        returning * into p;
      insert into mealdeck_private.payment_shares(id,order_id,bag_number,amount_pence)
        values(gen_random_uuid(),o.id,1,q.total_pence);
    end if;
  else
    select * into o from public.orders where id=p_order and tenant_id=p_tenant and location_id=p_location and source='mealdeck' for update;
    if not found then raise exception 'mealdeck_payment_order_unavailable'; end if;
    if exists(select 1 from mealdeck_private.stripe_orders where order_id=p_order) then
      if o.payment_status='paid' then raise exception 'mealdeck_checkout_already_paid'; end if;
      raise exception 'mealdeck_payment_online_overlap'; end if;
    select * into p from mealdeck_private.payment_orders where order_id=p_order;
    if not found then raise exception 'mealdeck_payment_order_unavailable'; end if;
  end if;
  p:=mealdeck_private.lock_payment_order(p.order_id);
  if p.tenant_id<>p_tenant or p.location_id<>p_location or p.stripe_account<>p_stripe_account or p.livemode<>p_livemode then
    raise exception 'mealdeck_payment_attempt_conflict'; end if;
  if exists(select 1 from mealdeck_private.payment_collections where order_id=p.order_id and captured_pence=0 and provider_cancelled_at is null) then
    raise exception 'mealdeck_payment_online_overlap'; end if;
  select array_agg(s.id order by s.bag_number) into shares from mealdeck_private.payment_shares s where s.order_id=p.order_id
    and not exists(select 1 from mealdeck_private.payment_collection_shares cs where cs.share_id=s.id and cs.active);
  return mealdeck_private.reserve_payment_collection(p.order_id,null,null,p_actor,'terminal',shares,p_attempt,null,true,p_terminal_location);
end $$;

create function public.mealdeck_cancel_terminal_payment(p_actor uuid,p_tenant uuid,p_location uuid,p_collection uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare p mealdeck_private.payment_orders%rowtype;c mealdeck_private.payment_collections%rowtype;
begin
  perform public.mealdeck_terminal_authorize(p_actor,p_tenant,p_location);
  select * into c from mealdeck_private.payment_collections where id=p_collection and staff_id=p_actor and method='terminal';
  if not found then raise exception 'mealdeck_payment_attempt_unavailable'; end if;
  p:=mealdeck_private.lock_payment_order(c.order_id);
  if p.tenant_id<>p_tenant or p.location_id<>p_location then raise exception 'mealdeck_payment_attempt_unavailable'; end if;
  select * into c from mealdeck_private.payment_collections where id=p_collection;
  if c.captured_pence>0 then raise exception 'mealdeck_checkout_already_paid'; end if;
  update mealdeck_private.payment_collections set cancel_requested_at=coalesce(cancel_requested_at,now()) where id=c.id;
  insert into public.mealdeck_ops_audit_log(tenant_id,location_id,actor_id,action,entity_type,entity_id)
    values(p_tenant,p_location,p_actor,'payment.cancel_requested','payment_collection',c.id);
  return mealdeck_private.payment_collection_json(c.id);
end $$;

create function public.mealdeck_cancel_group_payment_room(p_room uuid,p_customer uuid,p_guest_token_hash text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare a jsonb;p mealdeck_private.payment_orders%rowtype;captured integer;collections jsonb;
begin
  a:=mealdeck_private.group_payment_access(p_room,p_customer,p_guest_token_hash,null);
  if (a->>'owner')::boolean is distinct from true then raise exception 'mealdeck_payment_claim_forbidden'; end if;
  p:=mealdeck_private.lock_payment_order((a->>'orderId')::uuid);
  update mealdeck_private.payment_orders set cancel_requested_at=coalesce(cancel_requested_at,now()),
    hold_reason=coalesce(hold_reason,'cancelled') where order_id=p.order_id;
  update mealdeck_private.payment_collections set cancel_requested_at=coalesce(cancel_requested_at,now())
    where order_id=p.order_id and captured_pence=0 and provider_cancelled_at is null;
  select coalesce(sum(captured_pence),0) into captured from mealdeck_private.payment_collections where order_id=p.order_id;
  update public.group_order_rooms set status='cancelled' where id=p_room;
  update public.orders set status='cancelled' where id=p.order_id and status not in ('fulfilled','refunded');
  select coalesce(jsonb_agg(mealdeck_private.payment_collection_json(id) order by created_at),'[]'::jsonb) into collections
    from mealdeck_private.payment_collections where order_id=p.order_id and captured_pence=0 and provider_cancelled_at is null;
  insert into public.mealdeck_ops_audit_log(tenant_id,location_id,actor_id,action,entity_type,entity_id,next_value)
    values(p.tenant_id,p.location_id,p_customer,'payment.group_cancel_requested','order',p.order_id,
      jsonb_build_object('refundReviewRequired',captured>0));
  return jsonb_build_object('roomId',p_room,'orderId',p.order_id,'status',case when captured>0 then 'refund_review' else 'cancelled' end,
    'refundReviewRequired',captured>0,'collectionsToCancel',collections);
end $$;

create function public.mealdeck_bind_order_payment(p_collection uuid,p_session text,p_intent text,p_url text,p_account text,p_livemode boolean)
returns jsonb language plpgsql security definer set search_path='' as $$
declare c mealdeck_private.payment_collections%rowtype;p mealdeck_private.payment_orders%rowtype;
begin
  select * into c from mealdeck_private.payment_collections where id=p_collection;
  if not found then raise exception 'mealdeck_payment_attempt_unavailable'; end if;
  p:=mealdeck_private.lock_payment_order(c.order_id);
  select * into c from mealdeck_private.payment_collections where id=p_collection for update;
  if p.stripe_account is distinct from p_account or p.livemode is distinct from p_livemode
    or (p_intent is not null and p_intent !~ '^pi_[A-Za-z0-9]+$')
    or (c.payment_intent_id is not null and c.payment_intent_id is distinct from p_intent)
    or (c.method='terminal' and (p_session is not null or p_url is not null or p_intent is null))
    or (c.method='checkout' and (p_session is null or p_session !~ '^cs_[A-Za-z0-9_]+$'
      or p_url is null or length(p_url)>4096 or p_url !~ '^https://checkout[.]stripe[.]com/'
      or (c.session_id is not null and c.session_id<>p_session) or (c.session_url is not null and c.session_url<>p_url))) then
    raise exception 'mealdeck_checkout_payment_mismatch'; end if;
  -- Persist an already-created provider object even if cancellation raced the
  -- network response. The server can then cancel/reconcile it safely.
  update mealdeck_private.payment_collections set session_id=p_session,session_url=p_url,
    payment_intent_id=coalesce(payment_intent_id,p_intent) where id=p_collection;
  return mealdeck_private.payment_collection_json(p_collection);
end $$;

-- The same routing transaction is reused by ordinary and shared payment receipts.
create function mealdeck_private.release_paid_order(p_order uuid,p_reference text)
returns void language plpgsql security definer set search_path='' as $$
declare o public.orders%rowtype;
begin
 select * into o from public.orders where id=p_order and source='mealdeck' for update;
 if not found then raise exception 'mealdeck_payment_order_unavailable'; end if;
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
    update public.orders set payment_status='paid',payment_reference=p_reference,paid_at=coalesce(paid_at,now()),
      status=case when status in ('draft','payment_pending','paid') then 'accepted'::public.order_status else status end where id=o.id;
    insert into public.mealdeck_pass_orders(order_id,tenant_id,location_id) values(o.id,o.tenant_id,o.location_id)
      on conflict(order_id) do nothing;
end $$;

create or replace function public.mealdeck_reconcile_stripe_event(
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
    perform mealdeck_private.release_paid_order(o.id,p_intent);
  end if;
  insert into public.mealdeck_ops_audit_log(tenant_id,location_id,actor_id,action,entity_type,entity_id,next_value)
    values(o.tenant_id,o.location_id,null,'payment.stripe_verified','order',o.id,
      jsonb_build_object('providerEvent',p_event,'capturedPence',p_captured,'refundedPence',s.refunded_pence,
        'held',s.void_reason is not null));
  return jsonb_build_object('ok',true,'replayed',false,'orderId',o.id,'held',s.void_reason is not null);
end $$;

create function public.mealdeck_reconcile_order_payment(
 p_event text,p_hash text,p_type text,p_collection uuid,p_order uuid,p_session text,p_intent text,
 p_account text,p_livemode boolean,p_currency text,p_captured integer,p_refunded integer,p_disputed boolean
) returns jsonb language plpgsql security definer set search_path='' as $$
declare p mealdeck_private.payment_orders%rowtype;c mealdeck_private.payment_collections%rowtype;
  o public.orders%rowtype;prior mealdeck_private.payment_events%rowtype;
  cancelled boolean;delta integer;captured integer;refunded integer;held text;
begin
  if p_event is null or p_event !~ '^(evt_[A-Za-z0-9]+|obs_[a-f0-9]{64})$'
    or p_hash is null or p_hash !~ '^[a-f0-9]{64}$' or p_type is null or p_type not in (
      'checkout.session.completed','checkout.session.async_payment_succeeded','checkout.session.expired',
      'payment_intent.succeeded','payment_intent.canceled','payment_intent.processing','payment_intent.payment_failed',
      'charge.refunded','charge.dispute.created','charge.dispute.closed') then raise exception 'mealdeck_checkout_invalid_event'; end if;
  p:=mealdeck_private.lock_payment_order(p_order);
  select * into o from public.orders where id=p_order;
  select * into c from mealdeck_private.payment_collections where id=p_collection and order_id=p_order for update;
  if not found or p.stripe_account is distinct from p_account or p.livemode is distinct from p_livemode
    or p_currency is distinct from 'gbp' or p_captured is null or p_captured not in (0,c.amount_pence)
    or p_refunded is null or p_refunded<0 or p_refunded>p_captured or p_disputed is null
    or o.total_pence<>p.total_pence or o.tenant_id<>p.tenant_id or o.location_id<>p.location_id
    or o.group_order_room_id is distinct from p.room_id
    or (c.method='checkout' and (p_session is null or p_session !~ '^cs_[A-Za-z0-9_]+$'
      or (c.session_id is not null and c.session_id is distinct from p_session)))
    or (c.method='terminal' and (p_session is not null or p_intent is null))
    or (p_intent is not null and p_intent !~ '^pi_[A-Za-z0-9]+$')
    or (c.payment_intent_id is not null and c.payment_intent_id is distinct from p_intent)
    or (p_captured>0 and p_intent is null) then raise exception 'mealdeck_checkout_payment_mismatch'; end if;
  cancelled:=p_type in ('checkout.session.expired','payment_intent.canceled');
  if (cancelled and (p_captured<>0 or p_refunded<>0 or p_disputed))
    or (p_type in ('checkout.session.completed','checkout.session.async_payment_succeeded','payment_intent.succeeded','charge.refunded','charge.dispute.created','charge.dispute.closed') and p_captured<>c.amount_pence)
    or (p_type in ('payment_intent.processing','payment_intent.payment_failed') and (p_captured<>0 or p_refunded<>0 or p_disputed))
    or (p_type like 'checkout.%' and c.method<>'checkout')
    or (p_type='payment_intent.canceled' and c.method<>'terminal')
    or (p_type='charge.dispute.created' and not p_disputed)
    or (p_type='charge.refunded' and p_refunded=0) then
    raise exception 'mealdeck_checkout_payment_mismatch'; end if;
  select * into prior from mealdeck_private.payment_events where event_id=p_event;
  if found then
    if prior.payload_hash<>p_hash or prior.event_type<>p_type or prior.order_id<>p_order or prior.collection_id<>p_collection then
      raise exception 'mealdeck_checkout_event_conflict'; end if;
    return jsonb_build_object('ok',true,'replayed',true,'orderId',p_order,'collectionId',p_collection,
      'status',mealdeck_private.payment_collection_json(p_collection)->>'status',
      'orderPaid',p.verified_at is not null and p.hold_reason is null,'held',p.hold_reason is not null);
  end if;
  -- Provider receipts are monotonic. An older unpaid observation cannot undo a
  -- charge that another webhook has already verified.
  if p_captured<c.captured_pence then raise exception 'mealdeck_checkout_payment_mismatch'; end if;
  insert into mealdeck_private.payment_events(event_id,payload_hash,event_type,order_id,collection_id)
    values(p_event,p_hash,p_type,p_order,p_collection);
  delta:=greatest(c.refunded_pence,p_refunded)-c.refunded_pence;
  held:=case when p_disputed then 'dispute' when p_refunded>0 then 'refund'
    when p_captured>0 and c.captured_pence=0 and (c.cancel_requested_at is not null or c.provider_cancelled_at is not null
      or p.cancel_requested_at is not null) then 'capture_after_cancel'
    when p_captured>0 and c.captured_pence=0 and (now()>c.expires_at or now()>p.expires_at) then 'late_capture' else null end;
  update mealdeck_private.payment_collections set captured_pence=greatest(captured_pence,p_captured),
    refunded_pence=greatest(refunded_pence,p_refunded),session_id=coalesce(session_id,p_session),
    payment_intent_id=coalesce(payment_intent_id,p_intent),
    verified_at=case when p_captured>0 then coalesce(verified_at,now()) else verified_at end,
    provider_cancelled_at=case when cancelled then coalesce(provider_cancelled_at,now()) else provider_cancelled_at end,
    hold_reason=coalesce(hold_reason,held) where id=p_collection returning * into c;
  if cancelled then
    update mealdeck_private.payment_collection_shares set active=false where collection_id=p_collection and active;
  end if;
  if delta>0 then
    insert into public.mealdeck_refund_allocations(tenant_id,location_id,order_id,amount_pence,status,provider_event_ref)
      values(p.tenant_id,p.location_id,p_order,delta,'settled',p_event);
  end if;
  select coalesce(sum(captured_pence),0),coalesce(sum(refunded_pence),0) into captured,refunded
    from mealdeck_private.payment_collections where order_id=p_order;
  if captured>p.total_pence then held:=coalesce(held,'overfunded'); end if;
  if o.status in ('cancelled','refunded') then held:=coalesce(held,'order_cancelled'); end if;
  update mealdeck_private.payment_orders set hold_reason=coalesce(hold_reason,held) where order_id=p_order returning * into p;
  if p.hold_reason is not null then
    update public.orders set payment_status=case when captured>0 and refunded=captured then 'refunded'
      when refunded>0 then 'partially_refunded' when captured>=total_pence then 'paid' else 'pending' end,
      payment_reference=case when captured>0 then 'md_payments_'||id::text else payment_reference end,
      status=case when captured>0 and refunded=captured then 'refunded'::public.order_status else status end,
      handoff_code_reserved=case when captured>0 and refunded=captured then false else handoff_code_reserved end
      where id=p_order;
  elsif captured=p.total_pence and refunded=0 and p.verified_at is null then
    if exists(select 1 from mealdeck_private.payment_shares s where s.order_id=p_order and not exists(
      select 1 from mealdeck_private.payment_collection_shares cs join mealdeck_private.payment_collections pay on pay.id=cs.collection_id
      where cs.share_id=s.id and cs.active and pay.captured_pence=pay.amount_pence and pay.verified_at is not null
        and pay.hold_reason is null and pay.refunded_pence=0)) then raise exception 'mealdeck_payment_allocation_invalid'; end if;
    update mealdeck_private.payment_orders set verified_at=coalesce(verified_at,now()) where order_id=p_order returning * into p;
    perform mealdeck_private.release_paid_order(p_order,'md_payments_'||p_order::text);
    if p.room_id is not null then update public.group_order_rooms set status='submitted' where id=p.room_id; end if;
  end if;
  insert into public.mealdeck_ops_audit_log(tenant_id,location_id,actor_id,action,entity_type,entity_id,next_value)
    values(p.tenant_id,p.location_id,null,'payment.collection_verified','payment_collection',p_collection,
      jsonb_build_object('providerEvent',p_event,'capturedPence',c.captured_pence,'refundedPence',c.refunded_pence,
        'orderPaid',p.verified_at is not null and p.hold_reason is null,'held',p.hold_reason is not null));
  return jsonb_build_object('ok',true,'replayed',false,'orderId',p_order,'collectionId',p_collection,
    'status',mealdeck_private.payment_collection_json(p_collection)->>'status',
    'orderPaid',p.verified_at is not null and p.hold_reason is null,'held',p.hold_reason is not null);
end $$;

create function mealdeck_private.payment_order_financial_ready(p_order uuid)
returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from mealdeck_private.payment_orders p join public.orders o on o.id=p.order_id
  where p.order_id=p_order and p.verified_at is not null and p.verified_at<=now()
    and p.hold_reason is null and p.cancel_requested_at is null and o.source='mealdeck'
    and o.tenant_id=p.tenant_id and o.location_id=p.location_id and o.total_pence=p.total_pence
    and o.group_order_room_id is not distinct from p.room_id and o.payment_status='paid' and o.paid_at is not null
    and o.payment_reference='md_payments_'||o.id::text
    and (select coalesce(sum(amount_pence),0) from mealdeck_private.payment_shares where order_id=p_order)=p.total_pence
    and (select coalesce(sum(captured_pence),0) from mealdeck_private.payment_collections where order_id=p_order)=p.total_pence
    and not exists(select 1 from mealdeck_private.payment_collections where order_id=p_order and (refunded_pence>0 or hold_reason is not null))
    and not exists(select 1 from mealdeck_private.payment_shares s where s.order_id=p_order and not exists(
      select 1 from mealdeck_private.payment_collection_shares cs join mealdeck_private.payment_collections c on c.id=cs.collection_id
      where cs.share_id=s.id and cs.active and c.captured_pence=c.amount_pence and c.verified_at is not null and c.verified_at<=now()
        and c.payment_intent_id is not null and exists(select 1 from mealdeck_private.payment_events e where e.collection_id=c.id))))
$$;
create function mealdeck_private.group_payment_authority(p_room uuid)
returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from mealdeck_private.payment_orders p join public.group_order_rooms r on r.id=p.room_id
  where p.room_id=p_room and p.channel='group' and r.master_order_id=p.order_id and r.tenant_id=p.tenant_id and r.location_id=p.location_id
    and r.status in ('verified','submitted') and mealdeck_private.payment_order_financial_ready(p.order_id))
$$;


create or replace function mealdeck_private.kds_release_authority(p_order uuid)
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
  union all
  select jsonb_build_object('schema_version',1,'eligible',true,'order_id',p.order_id,'tenant_id',p.tenant_id,
    'location_id',p.location_id,'source','mealdeck','release_id',p.release_id,
    'verified_at',to_char(p.verified_at at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"'))
    from mealdeck_private.payment_orders p where p.order_id=p_order and mealdeck_private.payment_order_financial_ready(p_order)
      and (p.room_id is null or mealdeck_private.group_payment_authority(p.room_id))
$$;

create or replace function mealdeck_ops_private.receipt_snapshot(p_order uuid)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare o public.orders%rowtype;q mealdeck_private.checkout_quotes%rowtype;items jsonb;loc text;
begin
  select * into o from public.orders where id=p_order;
  select cq.* into q from mealdeck_private.checkout_quotes cq where cq.id=(
    select s.quote_id from mealdeck_private.stripe_orders s where s.order_id=p_order
    union all select p.quote_id from mealdeck_private.payment_orders p where p.order_id=p_order);
  if not found or o.accepted_at is null or o.fulfilment not in ('pickup','curbside') or o.handoff_code !~ '^\d{4}$'
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
    'displayCode',o.handoff_code,'brand','MealDeck','tradingName','313 Brands Ltd','locationName',loc,
    'createdAt',o.created_at,'paidAt',o.paid_at,'acceptedAt',o.accepted_at,'fulfilment',o.fulfilment,
    'customerName',coalesce(o.customer_name,'Customer'),'car',case when o.fulfilment='curbside' then o.vehicle else null end,
    'cutleryRequested',o.cutlery_requested,'packingPlan',o.packing_plan,'items',items,
    'subtotalPence',q.gross_pence,'discountPence',q.discount_pence,'totalPence',q.total_pence,
    'currency','GBP','orderNotes',o.notes);
end $$;

create or replace function mealdeck_private.checkout_receipt_for_identity(p_order uuid,p_customer uuid,p_guest uuid)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare o public.orders%rowtype;q mealdeck_private.checkout_quotes%rowtype;s mealdeck_private.stripe_orders%rowtype;funding mealdeck_private.payment_orders%rowtype;
begin
  select * into o from public.orders where id=p_order and customer_id is not distinct from p_customer and source='mealdeck'
    and guest_checkout=(p_guest is not null);
  select * into s from mealdeck_private.stripe_orders where order_id=o.id and customer_id is not distinct from p_customer and guest_id is not distinct from p_guest;
  if s.order_id is null then
    select * into funding from mealdeck_private.payment_orders where order_id=o.id and customer_id is not distinct from p_customer
      and guest_id is not distinct from p_guest and staff_id is null;
    if found then
      s.order_id:=funding.order_id;s.quote_id:=funding.quote_id;s.verified_at:=funding.verified_at;s.void_reason:=funding.hold_reason;s.expires_at:=funding.expires_at;
      select coalesce(sum(captured_pence),0),coalesce(sum(refunded_pence),0) into s.captured_pence,s.refunded_pence
        from mealdeck_private.payment_collections where order_id=funding.order_id;
    end if;
  end if;
  if o.id is null or s.order_id is null then raise exception 'mealdeck_checkout_order_unavailable'; end if;
  perform mealdeck_private.checkout_identity(o.tenant_id,o.location_id,p_customer,p_guest);
  select * into q from mealdeck_private.checkout_quotes where id=s.quote_id and tenant_id=o.tenant_id
    and location_id=o.location_id and customer_id is not distinct from p_customer and guest_id is not distinct from p_guest;
  if not found then raise exception 'mealdeck_checkout_order_unavailable'; end if;
  return jsonb_build_object('orderId',o.id,'quoteId',q.id,'guestOrder',o.guest_checkout,'status',o.status,'paymentStatus',o.payment_status,
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
    'held',s.void_reason is not null)
    ||case when p_guest is not null then jsonb_build_object('loyaltyEligible',false) else '{}'::jsonb end;
end $$;


create or replace function public.mealdeck_guest_order_receipt(p_tenant uuid,p_location uuid,p_token_hash text,p_order uuid)
returns jsonb language plpgsql stable security definer set search_path='' as $$
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
end $$;

-- No application role can call the authority/helpers or touch ledger tables.
revoke all on all functions in schema mealdeck_private from public,anon,authenticated,service_role;
revoke all on all functions in schema mealdeck_ops_private from public,anon,authenticated,service_role;
revoke all on all tables in schema mealdeck_private from public,anon,authenticated,service_role;
-- The public service boundary is explicit; Supabase's default PUBLIC EXECUTE
-- must not let a caller supply an arbitrary actor or payment observation.
do $$
declare f record;
begin
  for f in select p.oid::regprocedure signature from pg_proc p join pg_namespace n on n.oid=p.pronamespace
    where n.nspname='public' and p.proname in (
      'mealdeck_create_group_payment_room','mealdeck_group_payment_status','mealdeck_group_payment_collections',
      'mealdeck_prepare_group_payment','mealdeck_cancel_group_payment_room','mealdeck_order_payment_collection',
      'mealdeck_bind_order_payment','mealdeck_reconcile_order_payment','mealdeck_terminal_authorize',
      'mealdeck_create_terminal_quote','mealdeck_terminal_order_status','mealdeck_prepare_terminal_payment',
      'mealdeck_terminal_payment_attempt','mealdeck_cancel_terminal_payment') loop
    execute format('revoke all on function %s from public,anon,authenticated,service_role',f.signature);
    execute format('grant execute on function %s to service_role',f.signature);
  end loop;
end $$;

commit;
