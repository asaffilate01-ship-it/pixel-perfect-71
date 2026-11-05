-- Confirmed 6–8 November 2026 launch hours and account-free guest checkout.
-- Additive extension: preserves historical installers, member identity and the
-- existing server-priced payment/reconciliation/KDS path. It enables no channel.
begin;
set local lock_timeout='5s';

do $guard$ begin
  if to_regclass('mealdeck_private.installation') is null
    or to_regclass('mealdeck_private.stripe_orders') is null
    or to_regclass('mealdeck_private.receipt_jobs') is null
    or to_regprocedure('mealdeck_private.customer_registration_authority(uuid)') is null
    or to_regnamespace('dishbee_private') is not null
    or not exists(select 1 from mealdeck_private.installation where singleton
      and profile='mealdeck-independent-v1') then
    raise exception 'mealdeck_guest_independent_checkout_required';
  end if;
end $guard$;

-- This is a checkout capability, not an Auth account or a loyalty membership.
-- The browser receives a random HttpOnly secret; only its server-computed SHA-256
-- hash reaches these RPCs. Contact data never determines receipt access.
create table mealdeck_private.guest_sessions(
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,location_id uuid not null,
  token_hash text not null unique check(token_hash ~ '^[a-f0-9]{64}$'),
  name text not null check(length(name) between 1 and 120 and name !~ '[[:cntrl:]]'),
  email text not null check(length(email) between 3 and 254 and email ~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'),
  phone text not null check(phone ~ '^\+[1-9][0-9]{7,14}$'),
  privacy_version text not null default 'mealdeck-guest-2026-11-05'
    check(privacy_version='mealdeck-guest-2026-11-05'),
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default now()+interval '30 days',
  revoked_at timestamptz,
  foreign key(tenant_id,location_id) references public.tenant_locations(tenant_id,id),
  unique(id,tenant_id,location_id),
  check(expires_at>created_at and expires_at<=created_at+interval '30 days')
);
create index guest_sessions_scope_created on mealdeck_private.guest_sessions(tenant_id,location_id,created_at desc);
create index guest_sessions_email_created on mealdeck_private.guest_sessions(tenant_id,location_id,email,created_at desc);
create index guest_sessions_phone_created on mealdeck_private.guest_sessions(tenant_id,location_id,phone,created_at desc);
alter table mealdeck_private.guest_sessions enable row level security;
revoke all on mealdeck_private.guest_sessions from public,anon,authenticated,service_role;

alter table mealdeck_private.checkout_quotes alter column customer_id drop not null;
alter table mealdeck_private.checkout_quotes add column guest_id uuid;
alter table mealdeck_private.checkout_quotes add constraint checkout_quote_one_identity
  check(num_nonnulls(customer_id,guest_id)=1);
alter table mealdeck_private.checkout_quotes add constraint checkout_quote_guest_scope
  foreign key(guest_id,tenant_id,location_id) references mealdeck_private.guest_sessions(id,tenant_id,location_id);
alter table mealdeck_private.checkout_quotes add constraint checkout_quote_guest_key unique(id,guest_id);
create index checkout_quotes_guest_created on mealdeck_private.checkout_quotes(guest_id,created_at desc)
  where guest_id is not null;

alter table mealdeck_private.stripe_orders alter column customer_id drop not null;
alter table mealdeck_private.stripe_orders add column guest_id uuid references mealdeck_private.guest_sessions(id);
alter table mealdeck_private.stripe_orders add constraint stripe_order_one_identity
  check(num_nonnulls(customer_id,guest_id)=1);
alter table mealdeck_private.stripe_orders add constraint stripe_order_guest_quote
  foreign key(quote_id,guest_id) references mealdeck_private.checkout_quotes(id,guest_id);
alter table mealdeck_private.stripe_orders add constraint stripe_order_guest_attempt unique(guest_id,attempt_id);

alter table public.orders add column guest_checkout boolean not null default false;
alter table public.orders add constraint guest_order_has_no_member
  check(not guest_checkout or customer_id is null);

-- Dates are now explicitly supplied by the owner. Do not change enablement,
-- fulfilments, staff rights, pickup estimates, catalogue or payment credentials.
alter table mealdeck_private.checkout_settings alter column opening_start_date set default date '2026-11-06';
update mealdeck_private.checkout_settings set opening_start_date=date '2026-11-06',updated_at=now()
  where opening_start_date is distinct from date '2026-11-06';
alter table mealdeck_private.checkout_settings alter column opening_start_date set not null;
alter table mealdeck_private.checkout_settings add constraint confirmed_opening_date
  check(opening_start_date=date '2026-11-06');

-- Pure time calculation used by the public status and both checkout identities.
-- UK dates are fixed, never inferred from browser time, signup time or settings.
create function mealdeck_private.launch_window_at(p_at timestamptz)
returns jsonb language sql immutable security definer set search_path='' as $$
  with periods(opens,closes) as (values
    (timestamptz '2026-11-06 15:00:00 Europe/London',timestamptz '2026-11-06 23:00:00 Europe/London'),
    (timestamptz '2026-11-07 13:00:00 Europe/London',timestamptz '2026-11-07 23:00:00 Europe/London'),
    (timestamptz '2026-11-08 13:00:00 Europe/London',timestamptz '2026-11-08 23:00:00 Europe/London')
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
create function mealdeck_private.launch_window()
returns jsonb language sql stable security definer set search_path='' as $$
  select mealdeck_private.launch_window_at(now())
$$;
revoke all on function mealdeck_private.launch_window_at(timestamptz),mealdeck_private.launch_window()
  from public,anon,authenticated,service_role;

create or replace function mealdeck_private.opening_offer(p_tenant uuid,p_location uuid)
returns jsonb language sql stable security definer set search_path='' as $$
  select mealdeck_private.launch_window() - array['orderingOpen','guestEligible','currentClosesAt']::text[]
$$;
revoke all on function mealdeck_private.opening_offer(uuid,uuid) from public,anon,authenticated,service_role;

create or replace function public.mealdeck_online_checkout_status(p_tenant uuid,p_location uuid)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare ready boolean;launch jsonb:=mealdeck_private.launch_window();
begin
  select exists(
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
  ) into ready;
  return jsonb_build_object('channelOpen',ready and launch->'orderingOpen'='true'::jsonb,
    'guestCheckoutEligible',ready and launch->'guestEligible'='true'::jsonb,
    'openingOffer',mealdeck_private.opening_offer(p_tenant,p_location));
end $$;
revoke all on function public.mealdeck_online_checkout_status(uuid,uuid) from public,anon,authenticated,service_role;
grant execute on function public.mealdeck_online_checkout_status(uuid,uuid) to anon,authenticated,service_role;

create or replace function public.mealdeck_ops_checkout_settings(p_tenant uuid,p_location uuid)
returns jsonb language plpgsql stable security definer set search_path='' as $$
begin
  if not mealdeck_ops_private.can(p_tenant,p_location,'finance.manage') then
    raise exception 'mealdeck_ops_forbidden';
  end if;
  return coalesce((select jsonb_build_object('enabled',s.checkout_enabled,
    'openingStartDate',s.opening_start_date,'collectionEstimateMinutes',s.collection_estimate_minutes,
    'openingOffer',mealdeck_private.opening_offer(p_tenant,p_location))
    from mealdeck_private.checkout_settings s where s.tenant_id=p_tenant and s.location_id=p_location),
    jsonb_build_object('enabled',false,'openingStartDate',date '2026-11-06','collectionEstimateMinutes',null,
      'openingOffer',mealdeck_private.opening_offer(p_tenant,p_location)));
end $$;
revoke all on function public.mealdeck_ops_checkout_settings(uuid,uuid) from public,anon,authenticated,service_role;
grant execute on function public.mealdeck_ops_checkout_settings(uuid,uuid) to authenticated;

create or replace function public.mealdeck_ops_update_checkout_settings(
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
  if p_opening_start_date is not null and p_opening_start_date<>date '2026-11-06' then
    raise exception 'mealdeck_checkout_opening_date_fixed';
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
    values(p_tenant,p_location,p_enabled,date '2026-11-06',p_collection_estimate_minutes)
    on conflict(tenant_id,location_id) do update set checkout_enabled=excluded.checkout_enabled,
      opening_start_date=excluded.opening_start_date,collection_estimate_minutes=excluded.collection_estimate_minutes,updated_at=now();
  insert into public.mealdeck_ops_audit_log(tenant_id,location_id,actor_id,action,entity_type,entity_id,previous_value,next_value)
    values(p_tenant,p_location,auth.uid(),'checkout.settings','location',p_location,previous,
      jsonb_build_object('enabled',p_enabled,'openingStartDate',date '2026-11-06',
        'collectionEstimateMinutes',p_collection_estimate_minutes,'openingDays',3));
  return public.mealdeck_ops_checkout_settings(p_tenant,p_location);
end $$;
revoke all on function public.mealdeck_ops_update_checkout_settings(uuid,uuid,boolean,date,integer) from public,anon,authenticated,service_role;
grant execute on function public.mealdeck_ops_update_checkout_settings(uuid,uuid,boolean,date,integer) to authenticated;

create function mealdeck_private.guest_session_authority(p_tenant uuid,p_location uuid,p_token_hash text)
returns mealdeck_private.guest_sessions language sql stable security definer set search_path='' as $$
  select g from mealdeck_private.guest_sessions g
    where g.tenant_id=p_tenant and g.location_id=p_location and g.token_hash=p_token_hash
      and p_token_hash ~ '^[a-f0-9]{64}$' and g.revoked_at is null and g.expires_at>now()
$$;
create function mealdeck_private.guest_session_card(p_guest mealdeck_private.guest_sessions)
returns jsonb language sql immutable security definer set search_path='' as $$
  select case when p_guest.id is null then null else jsonb_build_object(
    'guestId',p_guest.id,'name',p_guest.name,'email',p_guest.email,'phone',p_guest.phone,
    'expiresAt',p_guest.expires_at,'loyaltyEligible',false) end
$$;
revoke all on function mealdeck_private.guest_session_authority(uuid,uuid,text),
  mealdeck_private.guest_session_card(mealdeck_private.guest_sessions) from public,anon,authenticated,service_role;

create function public.mealdeck_begin_guest_session(
  p_tenant uuid,p_location uuid,p_token_hash text,p_name text,p_email text,p_phone text
) returns jsonb language plpgsql security definer set search_path='' as $$
declare g mealdeck_private.guest_sessions%rowtype;v_name text;v_email text;
begin
  if public.mealdeck_online_checkout_status(p_tenant,p_location)->'guestCheckoutEligible' is distinct from 'true'::jsonb then
    raise exception 'mealdeck_checkout_guest_unavailable';
  end if;
  v_name:=regexp_replace(btrim(p_name),'[[:space:]]+',' ','g');v_email:=lower(btrim(p_email));
  if p_token_hash is null or p_token_hash !~ '^[a-f0-9]{64}$'
    or p_name is null or p_name ~ '[[:cntrl:]]' or length(v_name) not between 1 and 120
    or v_email is null or length(v_email) not between 3 and 254
    or v_email !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'
    or p_phone is null or p_phone !~ '^\+[1-9][0-9]{7,14}$' then
    raise exception 'mealdeck_checkout_guest_details_invalid';
  end if;
  -- Serialize creation per kitchen so unique contacts cannot evade the global
  -- bound. Repeat requests for the same secret/contact are idempotent.
  perform pg_advisory_xact_lock(hashtextextended('mealdeck-guest-create:'||p_tenant::text||':'||p_location::text,0));
  select * into g from mealdeck_private.guest_sessions where token_hash=p_token_hash;
  if found then
    if g.tenant_id<>p_tenant or g.location_id<>p_location or g.name<>v_name or g.email<>v_email or g.phone<>p_phone
      or g.revoked_at is not null or g.expires_at<=now() then
      raise exception 'mealdeck_checkout_guest_session_invalid';
    end if;
    return mealdeck_private.guest_session_card(g);
  end if;
  if (select count(*) from mealdeck_private.guest_sessions where tenant_id=p_tenant and location_id=p_location
      and created_at>now()-interval '10 minutes' and (email=v_email or phone=p_phone))>=6
    or (select count(*) from mealdeck_private.guest_sessions where tenant_id=p_tenant and location_id=p_location
      and created_at>now()-interval '5 minutes')>=500 then
    raise exception 'mealdeck_checkout_retry_later';
  end if;
  insert into mealdeck_private.guest_sessions(tenant_id,location_id,token_hash,name,email,phone)
    values(p_tenant,p_location,p_token_hash,v_name,v_email,p_phone) returning * into g;
  return mealdeck_private.guest_session_card(g);
end $$;
revoke all on function public.mealdeck_begin_guest_session(uuid,uuid,text,text,text,text) from public,anon,authenticated,service_role;
grant execute on function public.mealdeck_begin_guest_session(uuid,uuid,text,text,text,text) to service_role;

create function public.mealdeck_resolve_guest_session(p_tenant uuid,p_location uuid,p_token_hash text)
returns jsonb language sql stable security definer set search_path='' as $$
  select mealdeck_private.guest_session_card(mealdeck_private.guest_session_authority(p_tenant,p_location,p_token_hash))
$$;
revoke all on function public.mealdeck_resolve_guest_session(uuid,uuid,text) from public,anon,authenticated,service_role;
grant execute on function public.mealdeck_resolve_guest_session(uuid,uuid,text) to service_role;

create function public.mealdeck_end_guest_session(p_tenant uuid,p_location uuid,p_token_hash text)
returns boolean language plpgsql security definer set search_path='' as $$
begin
  update mealdeck_private.guest_sessions set revoked_at=now()
    where tenant_id=p_tenant and location_id=p_location and token_hash=p_token_hash
      and p_token_hash ~ '^[a-f0-9]{64}$' and revoked_at is null;
  return true;
end $$;
revoke all on function public.mealdeck_end_guest_session(uuid,uuid,text) from public,anon,authenticated,service_role;
grant execute on function public.mealdeck_end_guest_session(uuid,uuid,text) to service_role;

create function mealdeck_private.checkout_identity(p_tenant uuid,p_location uuid,p_customer uuid,p_guest uuid)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare member jsonb;g mealdeck_private.guest_sessions%rowtype;
begin
  if num_nonnulls(p_customer,p_guest)<>1 then raise exception 'mealdeck_checkout_registration_required'; end if;
  if p_guest is null then
    member:=mealdeck_private.customer_registration_authority(p_customer);
    if member->'registered' is distinct from 'true'::jsonb then raise exception 'mealdeck_checkout_registration_required'; end if;
    return member;
  end if;
  select * into g from mealdeck_private.guest_sessions where id=p_guest and tenant_id=p_tenant and location_id=p_location
    and revoked_at is null and expires_at>now();
  if not found then raise exception 'mealdeck_checkout_guest_session_invalid'; end if;
  return mealdeck_private.guest_session_card(g);
end $$;
revoke all on function mealdeck_private.checkout_identity(uuid,uuid,uuid,uuid) from public,anon,authenticated,service_role;

-- One pricing and payment preparation path for members and guests. Public wrappers
-- bind the member identity or validate the scoped guest capability before entry.
create function mealdeck_private.create_checkout_quote_for_identity(
  p_tenant uuid,p_location uuid,p_customer uuid,p_guest uuid,p_fulfilment text,p_vehicle jsonb,p_selection jsonb,p_request_hash text,p_packing jsonb
) returns jsonb language plpgsql security definer set search_path='' as $$
declare member jsonb;priced jsonb;offer jsonb;q mealdeck_private.checkout_quotes%rowtype;
  gross integer;discount integer:=0;d date;estimate_minutes integer;launch jsonb:=mealdeck_private.launch_window();
begin
  member:=mealdeck_private.checkout_identity(p_tenant,p_location,p_customer,p_guest);
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
  perform pg_advisory_xact_lock(hashtextextended('checkout-quote:'||case when p_guest is null then 'member:'||p_customer::text else 'guest:'||p_guest::text end,0));
  if (select count(*) from mealdeck_private.checkout_quotes where customer_id is not distinct from p_customer and guest_id is not distinct from p_guest
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
  insert into mealdeck_private.checkout_quotes(tenant_id,location_id,customer_id,guest_id,fulfilment,vehicle,
    request_hash,selection,priced_lines,gross_pence,discount_pence,total_pence,opening_start_date,collection_estimate_minutes,packing_plan,expires_at)
    values(p_tenant,p_location,p_customer,p_guest,p_fulfilment,p_vehicle,p_request_hash,p_selection,
      priced->'lines',gross,discount,gross-discount,d,estimate_minutes,p_packing,
      least(now()+interval '10 minutes',coalesce((launch->>'currentClosesAt')::timestamptz,now()+interval '10 minutes'))) returning * into q;
  return jsonb_build_object('quoteId',q.id,'expiresAt',q.expires_at,'grossPence',gross,
    'discountPence',discount,'totalPence',q.total_pence,'currency','GBP','fulfilment',p_fulfilment,
    'guestOrder',p_guest is not null,'lines',q.priced_lines,'openingOffer',offer,'collectionEstimateMinutes',estimate_minutes,'packingPlan',q.packing_plan)
    ||case when p_guest is not null then jsonb_build_object('loyaltyEligible',false) else '{}'::jsonb end;
end $$;
create function mealdeck_private.prepare_stripe_order_for_identity(
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
      vehicle_registration,handoff_code,packing_plan,cutlery_requested,review_confirmed_at,handoff_code_reserved,guest_checkout)
      values(q.tenant_id,q.location_id,p_customer,'payment_pending',q.fulfilment::public.fulfilment_type,
        'mealdeck','GBP',q.total_pence,0,q.total_pence,member->>'name',member->>'email',member->>'phone',
        q.vehicle,q.vehicle->>'registrationLast4',handoff,
        q.packing_plan,(q.packing_plan->>'cutleryRequested')::boolean,now(),true,p_guest is not null) returning * into o;
    for line in select value from jsonb_array_elements(q.priced_lines) loop
      insert into public.order_items(tenant_id,order_id,brand_id,menu_item_id,item_name,quantity,unit_price_pence,modifiers,notes,
        checkout_line_id,parent_checkout_line_id,base_unit_price_pence)
        values(q.tenant_id,o.id,(line->>'brand_id')::uuid,(line->>'menu_item_id')::uuid,line->>'name',
          (line->>'quantity')::integer,(line->>'unit_pence')::integer,line->'modifiers',line->>'attachment',
          line->>'lineId',line->>'parentLineId',(line->>'base_unit_pence')::integer);
    end loop;
    insert into mealdeck_private.stripe_orders(order_id,quote_id,customer_id,guest_id,attempt_id,stripe_account,livemode)
      values(o.id,q.id,p_customer,p_guest,p_attempt,p_stripe_account,p_livemode) returning * into s;
  end if;
  return jsonb_build_object('orderId',o.id,'quoteId',q.id,'totalPence',o.total_pence,
    'grossPence',q.gross_pence,'discountPence',q.discount_pence,'currency','gbp','email',o.customer_email,
    'fulfilment',q.fulfilment,'sessionId',s.session_id,'sessionUrl',s.session_url,'expiresAt',s.expires_at,
    'lines',q.priced_lines,'requestHash',q.request_hash);
end $$;
create function mealdeck_private.checkout_receipt_for_identity(p_order uuid,p_customer uuid,p_guest uuid)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare o public.orders%rowtype;q mealdeck_private.checkout_quotes%rowtype;s mealdeck_private.stripe_orders%rowtype;
begin
  select * into o from public.orders where id=p_order and customer_id is not distinct from p_customer and source='mealdeck'
    and guest_checkout=(p_guest is not null);
  select * into s from mealdeck_private.stripe_orders where order_id=o.id and customer_id is not distinct from p_customer and guest_id is not distinct from p_guest;
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
revoke all on function mealdeck_private.create_checkout_quote_for_identity(uuid,uuid,uuid,uuid,text,jsonb,jsonb,text,jsonb),
  mealdeck_private.prepare_stripe_order_for_identity(uuid,uuid,uuid,uuid,text,boolean),
  mealdeck_private.checkout_receipt_for_identity(uuid,uuid,uuid) from public,anon,authenticated,service_role;

create or replace function public.mealdeck_create_checkout_quote(
  p_tenant uuid,p_location uuid,p_customer uuid,p_fulfilment text,p_vehicle jsonb,p_selection jsonb,p_request_hash text,p_packing jsonb
) returns jsonb language sql security definer set search_path='' as $$
  select mealdeck_private.create_checkout_quote_for_identity(p_tenant,p_location,p_customer,null,p_fulfilment,
    p_vehicle,p_selection,p_request_hash,p_packing)
$$;
revoke all on function public.mealdeck_create_checkout_quote(uuid,uuid,uuid,text,jsonb,jsonb,text,jsonb) from public,anon,authenticated,service_role;
grant execute on function public.mealdeck_create_checkout_quote(uuid,uuid,uuid,text,jsonb,jsonb,text,jsonb) to service_role;

create or replace function public.mealdeck_prepare_stripe_order(
  p_quote uuid,p_customer uuid,p_attempt uuid,p_stripe_account text,p_livemode boolean
) returns jsonb language sql security definer set search_path='' as $$
  select mealdeck_private.prepare_stripe_order_for_identity(p_quote,p_customer,null,p_attempt,p_stripe_account,p_livemode)
$$;
revoke all on function public.mealdeck_prepare_stripe_order(uuid,uuid,uuid,text,boolean) from public,anon,authenticated,service_role;
grant execute on function public.mealdeck_prepare_stripe_order(uuid,uuid,uuid,text,boolean) to service_role;

create or replace function public.mealdeck_customer_order_receipt(p_order uuid,p_customer uuid)
returns jsonb language sql stable security definer set search_path='' as $$
  select mealdeck_private.checkout_receipt_for_identity(p_order,p_customer,null)
$$;
revoke all on function public.mealdeck_customer_order_receipt(uuid,uuid) from public,anon,authenticated,service_role;
grant execute on function public.mealdeck_customer_order_receipt(uuid,uuid) to service_role;

create function public.mealdeck_create_guest_checkout_quote(
  p_tenant uuid,p_location uuid,p_token_hash text,p_fulfilment text,p_vehicle jsonb,p_selection jsonb,p_request_hash text,p_packing jsonb
) returns jsonb language plpgsql security definer set search_path='' as $$
declare g mealdeck_private.guest_sessions%rowtype;
begin
  g:=mealdeck_private.guest_session_authority(p_tenant,p_location,p_token_hash);
  if g.id is null then raise exception 'mealdeck_checkout_guest_session_invalid'; end if;
  return mealdeck_private.create_checkout_quote_for_identity(p_tenant,p_location,null,g.id,p_fulfilment,
    p_vehicle,p_selection,p_request_hash,p_packing);
end $$;
revoke all on function public.mealdeck_create_guest_checkout_quote(uuid,uuid,text,text,jsonb,jsonb,text,jsonb) from public,anon,authenticated,service_role;
grant execute on function public.mealdeck_create_guest_checkout_quote(uuid,uuid,text,text,jsonb,jsonb,text,jsonb) to service_role;

create function public.mealdeck_prepare_guest_stripe_order(
  p_tenant uuid,p_location uuid,p_token_hash text,p_quote uuid,p_attempt uuid,p_stripe_account text,p_livemode boolean
) returns jsonb language plpgsql security definer set search_path='' as $$
declare g mealdeck_private.guest_sessions%rowtype;
begin
  g:=mealdeck_private.guest_session_authority(p_tenant,p_location,p_token_hash);
  if g.id is null then raise exception 'mealdeck_checkout_guest_session_invalid'; end if;
  if not exists(select 1 from mealdeck_private.checkout_quotes q where q.id=p_quote and q.guest_id=g.id
    and q.tenant_id=p_tenant and q.location_id=p_location) then raise exception 'mealdeck_checkout_quote_unavailable'; end if;
  return mealdeck_private.prepare_stripe_order_for_identity(p_quote,null,g.id,p_attempt,p_stripe_account,p_livemode);
end $$;
revoke all on function public.mealdeck_prepare_guest_stripe_order(uuid,uuid,text,uuid,uuid,text,boolean) from public,anon,authenticated,service_role;
grant execute on function public.mealdeck_prepare_guest_stripe_order(uuid,uuid,text,uuid,uuid,text,boolean) to service_role;

create function public.mealdeck_guest_order_receipt(p_tenant uuid,p_location uuid,p_token_hash text,p_order uuid)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare g mealdeck_private.guest_sessions%rowtype;
begin
  -- Window/checkout switches do not revoke already-placed order receipts.
  g:=mealdeck_private.guest_session_authority(p_tenant,p_location,p_token_hash);
  if g.id is null then raise exception 'mealdeck_checkout_guest_session_invalid'; end if;
  if not exists(select 1 from public.orders o join mealdeck_private.stripe_orders s on s.order_id=o.id
    where o.id=p_order and o.tenant_id=p_tenant and o.location_id=p_location and s.guest_id=g.id
      and o.customer_id is null and o.guest_checkout) then raise exception 'mealdeck_checkout_order_unavailable'; end if;
  return mealdeck_private.checkout_receipt_for_identity(p_order,null,g.id);
end $$;
revoke all on function public.mealdeck_guest_order_receipt(uuid,uuid,text,uuid) from public,anon,authenticated,service_role;
grant execute on function public.mealdeck_guest_order_receipt(uuid,uuid,text,uuid) to service_role;

-- Customer loyalty, membership preferences, staff roles and receipt-queue grants
-- remain untouched. Guests have no Auth user and every guest order keeps its
-- customer_id NULL, so matching an email never awards points or account access.
commit;
