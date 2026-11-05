-- Independent MealDeck membership extension. Generated with Supabase CLI 3.0.0.
-- Apply the COMPLETE migration atomically after the frozen independent profile.
-- Registration is independent of checkout and never grants staff access.
begin;
set local lock_timeout='5s';
set local statement_timeout='30s';
set local check_function_bodies=on;

do $profile$
begin
  if pg_catalog.to_regclass('mealdeck_private.installation') is null
    or pg_catalog.to_regnamespace('dishbee_private') is not null then
    raise exception 'mealdeck_customer_independent_profile_required';
  end if;
  if current_user in ('anon','authenticated','service_role') or not exists(
    select 1 from pg_catalog.pg_class c
    where c.oid='mealdeck_private.installation'::pg_catalog.regclass
      and pg_catalog.pg_has_role(current_user,c.relowner,'USAGE')
  ) then raise exception 'mealdeck_customer_database_owner_required'; end if;
  if not exists(select 1 from mealdeck_private.installation i
    where i.singleton and i.profile='mealdeck-independent-v1') then
    raise exception 'mealdeck_customer_installed_profile_required';
  end if;
end $profile$;

create table if not exists mealdeck_private.customer_profiles(
  user_id uuid primary key references auth.users(id) on delete cascade,
  name text not null check(length(name) between 1 and 120 and name=btrim(name)
    and name!~'[[:cntrl:]]'),
  phone text not null check(phone~'^\+[1-9][0-9]{7,14}$'),
  email_marketing boolean not null default false,
  email_marketing_address text,
  push_marketing boolean not null default false,
  order_notifications boolean not null default false,
  privacy_notice_version text not null,
  created_at timestamptz not null default clock_timestamp(),
  updated_at timestamptz not null default clock_timestamp()
);
create table if not exists mealdeck_private.customer_consent_events(
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  channel text not null check(channel in ('email_marketing','push_marketing','order_notifications')),
  allowed boolean not null,
  previous_allowed boolean,
  destination text,
  notice_version text not null,
  source text not null check(source in ('registration','account','unsubscribe')),
  occurred_at timestamptz not null default clock_timestamp()
);
create index if not exists customer_consent_user_time
  on mealdeck_private.customer_consent_events(user_id,occurred_at desc);

-- Disabled until the sender and approved loyalty terms are configured and tested.
-- A boolean is an operator control, never evidence that a push was delivered.
create table if not exists mealdeck_private.customer_features(
  singleton boolean primary key default true check(singleton),
  push_enabled boolean not null default false,
  loyalty_enabled boolean not null default false,
  loyalty_terms text,
  check(not loyalty_enabled or (loyalty_terms is not null and length(btrim(loyalty_terms)) between 1 and 2000))
);
insert into mealdeck_private.customer_features(singleton) values(true) on conflict do nothing;

create table if not exists mealdeck_private.customer_loyalty_ledger(
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  event_key text not null unique check(length(event_key) between 1 and 160),
  points integer not null check(points<>0 and points between -1000000 and 1000000),
  reason text not null check(length(reason) between 1 and 240),
  occurred_at timestamptz not null default clock_timestamp()
);
create index if not exists customer_loyalty_user_time
  on mealdeck_private.customer_loyalty_ledger(user_id,occurred_at desc);

create table if not exists mealdeck_private.customer_push_subscriptions(
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references mealdeck_private.customer_profiles(user_id) on delete cascade,
  endpoint text not null unique check(length(endpoint) between 20 and 2048),
  p256dh text not null check(p256dh~'^[A-Za-z0-9_-]{86,88}={0,2}$'),
  auth_key text not null check(auth_key~'^[A-Za-z0-9_-]{22,24}={0,2}$'),
  created_at timestamptz not null default clock_timestamp(),
  updated_at timestamptz not null default clock_timestamp()
);
create index if not exists customer_push_user on mealdeck_private.customer_push_subscriptions(user_id);

alter table mealdeck_private.customer_profiles enable row level security;
alter table mealdeck_private.customer_consent_events enable row level security;
alter table mealdeck_private.customer_features enable row level security;
alter table mealdeck_private.customer_loyalty_ledger enable row level security;
alter table mealdeck_private.customer_push_subscriptions enable row level security;
revoke all on mealdeck_private.customer_profiles,mealdeck_private.customer_consent_events,
  mealdeck_private.customer_features,mealdeck_private.customer_loyalty_ledger,
  mealdeck_private.customer_push_subscriptions from public,anon,authenticated,service_role;

-- Canonical identity comes from Auth's server-owned columns. Metadata, claims
-- supplied in a request, phone verification and marketing consent confer no
-- registered-customer or staff authority. This helper has no API-role grants.
create or replace function mealdeck_private.customer_registration_authority(p_user_id uuid)
returns jsonb language plpgsql stable security definer set search_path=''
as $$
declare
  v_user auth.users%rowtype;
  v_profile mealdeck_private.customer_profiles%rowtype;
  v_features mealdeck_private.customer_features%rowtype;
  v_points bigint;
  v_registered boolean;
begin
  select * into v_user from auth.users u where u.id=p_user_id
    and u.email_confirmed_at is not null and nullif(btrim(u.email),'') is not null
    and not coalesce(u.is_anonymous,false) and u.deleted_at is null
    and (u.banned_until is null or u.banned_until<=now());
  if not found then return null; end if;
  select * into v_profile from mealdeck_private.customer_profiles p where p.user_id=p_user_id;
  v_registered:=found;
  select * into v_features from mealdeck_private.customer_features f where f.singleton;
  select coalesce(sum(l.points),0) into v_points
    from mealdeck_private.customer_loyalty_ledger l where l.user_id=p_user_id;
  return jsonb_build_object(
    'registered',v_registered,'userId',p_user_id,'email',v_user.email,
    'emailConfirmedAt',v_user.email_confirmed_at,'name',v_profile.name,
    'phone',v_profile.phone,'updatedAt',v_profile.updated_at,
    'preferences',jsonb_build_object(
      'emailMarketing',coalesce(v_profile.email_marketing and lower(v_profile.email_marketing_address)=lower(v_user.email),false),
      'pushMarketing',coalesce(v_profile.push_marketing,false),
      'orderNotifications',coalesce(v_profile.order_notifications,false)),
    'loyalty',jsonb_build_object('enabled',coalesce(v_features.loyalty_enabled,false),
      'points',greatest(v_points,0),'terms',v_features.loyalty_terms)
  );
end;
$$;
revoke all on function mealdeck_private.customer_registration_authority(uuid)
  from public,anon,authenticated,service_role;

create or replace function public.mealdeck_customer_capabilities()
returns jsonb language sql stable security definer set search_path=''
as $$
  select jsonb_build_object('schemaVersion',1,'registration',true,
    'pushReady',coalesce(f.push_enabled,false),'loyaltyReady',coalesce(f.loyalty_enabled,false))
  from mealdeck_private.customer_features f where f.singleton
$$;
revoke all on function public.mealdeck_customer_capabilities() from public,anon,authenticated,service_role;
grant execute on function public.mealdeck_customer_capabilities() to anon,authenticated;

create or replace function public.mealdeck_customer_profile()
returns jsonb language plpgsql stable security definer set search_path=''
as $$
declare v_profile jsonb;
begin
  if auth.uid() is null then raise exception 'mealdeck_customer_unauthenticated' using errcode='42501'; end if;
  v_profile:=mealdeck_private.customer_registration_authority(auth.uid());
  if v_profile is null then raise exception 'mealdeck_customer_email_verification_required' using errcode='42501'; end if;
  return v_profile;
end;
$$;
revoke all on function public.mealdeck_customer_profile() from public,anon,authenticated,service_role;
grant execute on function public.mealdeck_customer_profile() to authenticated;

create or replace function mealdeck_private.record_customer_preferences(
  p_user_id uuid,p_email boolean,p_push boolean,p_orders boolean,
  p_old_email boolean,p_old_push boolean,p_old_orders boolean,p_source text,p_email_destination text
) returns void language plpgsql security definer set search_path=''
as $$
begin
  insert into mealdeck_private.customer_consent_events(
    user_id,channel,allowed,previous_allowed,notice_version,source,destination
  ) select p_user_id,v.channel,v.allowed,v.previous,
    'mealdeck-preferences-2026-11-05',p_source,case when v.channel='email_marketing' then p_email_destination else null end
  from (values
    ('email_marketing',p_email,p_old_email),
    ('push_marketing',p_push,p_old_push),
    ('order_notifications',p_orders,p_old_orders)
  ) v(channel,allowed,previous) where v.allowed is distinct from v.previous;
  if not p_push and not p_orders then
    delete from mealdeck_private.customer_push_subscriptions where user_id=p_user_id;
  end if;
end;
$$;
revoke all on function mealdeck_private.record_customer_preferences(uuid,boolean,boolean,boolean,boolean,boolean,boolean,text,text)
  from public,anon,authenticated,service_role;

create or replace function public.mealdeck_customer_register(
  p_name text,p_phone text,p_email_marketing boolean,p_push_marketing boolean,
  p_order_notifications boolean,p_privacy_version text,p_consent_version text
) returns jsonb language plpgsql security definer set search_path=''
as $$
declare v_user uuid:=auth.uid(); v_inserted integer; v_authority jsonb; v_email text;
begin
  if v_user is null then raise exception 'mealdeck_customer_unauthenticated' using errcode='42501'; end if;
  v_authority:=mealdeck_private.customer_registration_authority(v_user);
  if v_authority is null then
    raise exception 'mealdeck_customer_email_verification_required' using errcode='42501';
  end if;
  v_email:=v_authority->>'email';
  if p_name is null or length(btrim(p_name)) not between 1 and 120 or p_name~'[[:cntrl:]]'
    or p_phone is null or p_phone!~'^\+[1-9][0-9]{7,14}$'
    or p_email_marketing is null or p_push_marketing is null or p_order_notifications is null
    or p_privacy_version is distinct from 'mealdeck-customer-2026-11-05'
    or p_consent_version is distinct from 'mealdeck-preferences-2026-11-05' then
    raise exception 'mealdeck_customer_invalid_profile';
  end if;
  insert into mealdeck_private.customer_profiles(
    user_id,name,phone,email_marketing,email_marketing_address,push_marketing,order_notifications,privacy_notice_version
  ) values(v_user,btrim(p_name),p_phone,p_email_marketing,case when p_email_marketing then v_email else null end,
    p_push_marketing,p_order_notifications,p_privacy_version)
    on conflict(user_id) do nothing;
  get diagnostics v_inserted=row_count;
  if v_inserted=1 then
    perform mealdeck_private.record_customer_preferences(v_user,p_email_marketing,p_push_marketing,
      p_order_notifications,null,null,null,'registration',v_email);
  end if;
  -- An email-link retry never overwrites the customer's newer preferences.
  return public.mealdeck_customer_profile();
end;
$$;
revoke all on function public.mealdeck_customer_register(text,text,boolean,boolean,boolean,text,text)
  from public,anon,authenticated,service_role;
grant execute on function public.mealdeck_customer_register(text,text,boolean,boolean,boolean,text,text)
  to authenticated;

create or replace function public.mealdeck_customer_update(
  p_name text,p_phone text,p_email_marketing boolean,p_push_marketing boolean,
  p_order_notifications boolean,p_expected_updated_at timestamptz,p_consent_version text
) returns jsonb language plpgsql security definer set search_path=''
as $$
declare v_user uuid:=auth.uid(); v_before mealdeck_private.customer_profiles%rowtype;
  v_authority jsonb; v_email text; v_old_email_allowed boolean;
begin
  if v_user is null then raise exception 'mealdeck_customer_unauthenticated' using errcode='42501'; end if;
  v_authority:=mealdeck_private.customer_registration_authority(v_user);
  if v_authority is null then
    raise exception 'mealdeck_customer_email_verification_required' using errcode='42501';
  end if;
  v_email:=v_authority->>'email';
  if p_name is null or length(btrim(p_name)) not between 1 and 120 or p_name~'[[:cntrl:]]'
    or p_phone is null or p_phone!~'^\+[1-9][0-9]{7,14}$'
    or p_email_marketing is null or p_push_marketing is null or p_order_notifications is null
    or p_expected_updated_at is null
    or p_consent_version is distinct from 'mealdeck-preferences-2026-11-05' then
    raise exception 'mealdeck_customer_invalid_profile';
  end if;
  select * into v_before from mealdeck_private.customer_profiles p where p.user_id=v_user for update;
  if not found then raise exception 'mealdeck_customer_registration_required'; end if;
  if mealdeck_private.customer_registration_authority(v_user) is null then
    raise exception 'mealdeck_customer_email_verification_required' using errcode='42501';
  end if;
  if v_before.updated_at is distinct from p_expected_updated_at then
    raise exception 'mealdeck_customer_profile_conflict';
  end if;
  v_old_email_allowed:=coalesce(v_before.email_marketing and lower(v_before.email_marketing_address)=lower(v_email),false);
  if (v_before.name,v_before.phone,v_before.email_marketing,v_before.email_marketing_address,v_before.push_marketing,v_before.order_notifications)
    is distinct from (btrim(p_name),p_phone,p_email_marketing,case when p_email_marketing then v_email else null end,p_push_marketing,p_order_notifications) then
    update mealdeck_private.customer_profiles set name=btrim(p_name),phone=p_phone,
      email_marketing=p_email_marketing,email_marketing_address=case when p_email_marketing then v_email else null end,
      push_marketing=p_push_marketing,
      order_notifications=p_order_notifications,updated_at=clock_timestamp()
      where user_id=v_user;
    perform mealdeck_private.record_customer_preferences(v_user,p_email_marketing,p_push_marketing,
      p_order_notifications,v_old_email_allowed,v_before.push_marketing,v_before.order_notifications,'account',
      case when p_email_marketing then v_email else coalesce(v_before.email_marketing_address,v_email) end);
  end if;
  return public.mealdeck_customer_profile();
end;
$$;
revoke all on function public.mealdeck_customer_update(text,text,boolean,boolean,boolean,timestamptz,text)
  from public,anon,authenticated,service_role;
grant execute on function public.mealdeck_customer_update(text,text,boolean,boolean,boolean,timestamptz,text)
  to authenticated;

create or replace function public.mealdeck_customer_save_push(p_endpoint text,p_p256dh text,p_auth text)
returns jsonb language plpgsql security definer set search_path=''
as $$
declare v_user uuid:=auth.uid(); v_profile mealdeck_private.customer_profiles%rowtype; v_id uuid;
begin
  if v_user is null or mealdeck_private.customer_registration_authority(v_user) is null then
    raise exception 'mealdeck_customer_email_verification_required' using errcode='42501';
  end if;
  select * into v_profile from mealdeck_private.customer_profiles where user_id=v_user for update;
  if not found then raise exception 'mealdeck_customer_registration_required'; end if;
  if not exists(select 1 from mealdeck_private.customer_features where singleton and push_enabled) then
    raise exception 'mealdeck_customer_push_unavailable';
  end if;
  if not v_profile.push_marketing and not v_profile.order_notifications then
    raise exception 'mealdeck_customer_push_preference_required';
  end if;
  -- Restrict stored endpoints before any future sender performs a network call.
  -- No arbitrary host, credentials, port, query-only URL or private-address URL.
  if p_endpoint is null or length(p_endpoint)>2048 or p_endpoint!~
    '^https://(fcm\.googleapis\.com|updates\.push\.services\.mozilla\.com|web\.push\.apple\.com|[a-z0-9-]+\.notify\.windows\.com)/[A-Za-z0-9_/?=&%:.-]+$'
    or p_p256dh is null or p_p256dh!~'^[A-Za-z0-9_-]{86,88}={0,2}$'
    or p_auth is null or p_auth!~'^[A-Za-z0-9_-]{22,24}={0,2}$' then
    raise exception 'mealdeck_customer_invalid_subscription';
  end if;
  if exists(select 1 from mealdeck_private.customer_push_subscriptions
    where endpoint=p_endpoint and user_id<>v_user) then
    raise exception 'mealdeck_customer_subscription_conflict';
  end if;
  if not exists(select 1 from mealdeck_private.customer_push_subscriptions where endpoint=p_endpoint)
    and (select count(*) from mealdeck_private.customer_push_subscriptions where user_id=v_user)>=10 then
    raise exception 'mealdeck_customer_subscription_limit';
  end if;
  insert into mealdeck_private.customer_push_subscriptions(user_id,endpoint,p256dh,auth_key)
    values(v_user,p_endpoint,p_p256dh,p_auth)
    on conflict(endpoint) do update set p256dh=excluded.p256dh,auth_key=excluded.auth_key,
      updated_at=clock_timestamp()
      where mealdeck_private.customer_push_subscriptions.user_id=v_user
    returning id into v_id;
  if v_id is null then raise exception 'mealdeck_customer_subscription_conflict'; end if;
  return jsonb_build_object('saved',true,'subscriptionId',v_id);
end;
$$;
revoke all on function public.mealdeck_customer_save_push(text,text,text)
  from public,anon,authenticated,service_role;
grant execute on function public.mealdeck_customer_save_push(text,text,text) to authenticated;

create or replace function public.mealdeck_customer_remove_push(p_endpoint text)
returns jsonb language plpgsql security definer set search_path=''
as $$
begin
  if auth.uid() is null then raise exception 'mealdeck_customer_unauthenticated' using errcode='42501'; end if;
  delete from mealdeck_private.customer_push_subscriptions
    where user_id=auth.uid() and endpoint=p_endpoint;
  return jsonb_build_object('removed',true);
end;
$$;
revoke all on function public.mealdeck_customer_remove_push(text) from public,anon,authenticated,service_role;
grant execute on function public.mealdeck_customer_remove_push(text) to authenticated;

create or replace function public.mealdeck_customer_has_push(p_endpoint text)
returns jsonb language plpgsql stable security definer set search_path=''
as $$
begin
  if auth.uid() is null then raise exception 'mealdeck_customer_unauthenticated' using errcode='42501'; end if;
  return jsonb_build_object('connected',exists(
    select 1 from mealdeck_private.customer_push_subscriptions s
    join mealdeck_private.customer_profiles p on p.user_id=s.user_id
    join mealdeck_private.customer_features f on f.singleton and f.push_enabled
    where s.user_id=auth.uid() and s.endpoint=p_endpoint
      and (p.push_marketing or p.order_notifications)
      and mealdeck_private.customer_registration_authority(auth.uid()) is not null
  ));
end;
$$;
revoke all on function public.mealdeck_customer_has_push(text) from public,anon,authenticated,service_role;
grant execute on function public.mealdeck_customer_has_push(text) to authenticated;

-- Account exports contain only the signed-in customer's profile and consent
-- evidence. Do not export transport endpoints or other customers' records.
create or replace function public.mealdeck_customer_export()
returns jsonb language plpgsql stable security definer set search_path=''
as $$
declare v_profile jsonb; v_events jsonb;
begin
  v_profile:=public.mealdeck_customer_profile();
  select coalesce(jsonb_agg(jsonb_build_object('channel',e.channel,'allowed',e.allowed,
    'previousAllowed',e.previous_allowed,'noticeVersion',e.notice_version,
    'source',e.source,'destination',e.destination,'occurredAt',e.occurred_at) order by e.occurred_at,e.id),'[]'::jsonb)
    into v_events from mealdeck_private.customer_consent_events e where e.user_id=auth.uid();
  return jsonb_build_object('profile',v_profile,'communicationHistory',v_events,'exportedAt',now());
end;
$$;
revoke all on function public.mealdeck_customer_export() from public,anon,authenticated,service_role;
grant execute on function public.mealdeck_customer_export() to authenticated;

commit;
