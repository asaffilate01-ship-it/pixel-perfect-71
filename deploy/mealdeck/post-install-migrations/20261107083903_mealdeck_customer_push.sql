-- Generated with Supabase CLI 3.0.0: mealdeck_customer_push.
-- Independent MealDeck only. This installs a durable, consent-checked push
-- queue. It neither enables delivery nor sends any notification or campaign.
begin;
set local lock_timeout='5s';
set local statement_timeout='30s';
set local check_function_bodies=on;

do $guard$
begin
  if to_regnamespace('dishbee_private') is not null
    or to_regclass('mealdeck_private.installation') is null then
    raise exception 'mealdeck_push_independent_profile_required';
  end if;
  if current_user in ('anon','authenticated','service_role') or not exists(
    select 1 from pg_class where oid='mealdeck_private.installation'::regclass
      and pg_has_role(current_user,relowner,'USAGE')) then
    raise exception 'mealdeck_push_database_owner_required';
  end if;
  if not exists(select 1 from mealdeck_private.installation where singleton
      and profile='mealdeck-independent-v1' and business_id is not null)
    or to_regclass('mealdeck_private.customer_push_subscriptions') is null
    or to_regclass('mealdeck_private.guest_sessions') is null
    or to_regclass('mealdeck_private.payment_orders') is null
    or to_regprocedure('mealdeck_private.kds_release_authority(uuid)') is null
    or to_regprocedure('mealdeck_ops_private.kds_preparation_status(uuid)') is null then
    raise exception 'mealdeck_push_checkout_extensions_required';
  end if;
end $guard$;

create table if not exists mealdeck_private.order_push_subscriptions(
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,location_id uuid not null,order_id uuid not null,
  actor_id uuid references auth.users(id) on delete cascade,
  guest_id uuid references mealdeck_private.guest_sessions(id) on delete cascade,
  endpoint text not null check(length(endpoint) between 20 and 2048),
  p256dh text not null,auth_key text not null,
  enabled boolean not null default true,
  notice_version text not null default 'mealdeck-order-push-2026-11-07'
    check(notice_version='mealdeck-order-push-2026-11-07'),
  created_at timestamptz not null default clock_timestamp(),
  updated_at timestamptz not null default clock_timestamp(),
  expires_at timestamptz not null,
  check(num_nonnulls(actor_id,guest_id)=1),
  check(expires_at>created_at),
  unique(order_id,endpoint),
  foreign key(tenant_id,location_id,order_id) references public.orders(tenant_id,location_id,id)
);
create index if not exists order_push_endpoint on mealdeck_private.order_push_subscriptions(endpoint);
create index if not exists order_push_actor on mealdeck_private.order_push_subscriptions(actor_id) where actor_id is not null;

create table if not exists mealdeck_private.order_push_consent_events(
  id uuid primary key default gen_random_uuid(),
  subscription_id uuid references mealdeck_private.order_push_subscriptions(id) on delete set null,
  order_id uuid not null references public.orders(id),
  actor_id uuid references auth.users(id) on delete cascade,
  guest_id uuid references mealdeck_private.guest_sessions(id) on delete cascade,
  endpoint_hash text not null check(endpoint_hash ~ '^[a-f0-9]{64}$'),
  allowed boolean not null,
  notice_version text not null default 'mealdeck-order-push-2026-11-07',
  source text not null check(source in ('order_confirmation','account_withdrawal','device_removed','expired')),
  occurred_at timestamptz not null default clock_timestamp()
);

create table if not exists mealdeck_private.push_campaigns(
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,location_id uuid not null,
  title text not null check(length(title) between 1 and 60 and title=btrim(title) and title !~ '[[:cntrl:]]'),
  body text not null check(length(body) between 1 and 180 and body=btrim(body) and body !~ '[[:cntrl:]]'),
  path text not null check(path in ('/offers','/menus')),
  status text not null default 'draft' check(status in ('draft','queued','completed','cancelled','expired')),
  eligible_devices integer not null default 0 check(eligible_devices>=0),
  prepared_by uuid not null references auth.users(id),
  confirmed_by uuid references auth.users(id),
  created_at timestamptz not null default clock_timestamp(),
  confirmed_at timestamptz,expires_at timestamptz not null,
  unique(id,tenant_id,location_id),
  foreign key(tenant_id,location_id) references public.tenant_locations(tenant_id,id),
  check(expires_at>created_at and expires_at<=created_at+interval '24 hours')
);

create table if not exists mealdeck_private.push_events(
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,location_id uuid not null,
  kind text not null check(kind in ('order_update','offer')),
  order_id uuid,stage text,
  campaign_id uuid,
  occurred_at timestamptz not null default clock_timestamp(),
  expires_at timestamptz not null,
  unique(id,tenant_id,location_id),
  unique(order_id,stage),unique(campaign_id),
  foreign key(tenant_id,location_id,order_id) references public.orders(tenant_id,location_id,id),
  foreign key(campaign_id,tenant_id,location_id) references mealdeck_private.push_campaigns(id,tenant_id,location_id),
  check((kind='order_update' and order_id is not null and campaign_id is null
      and stage in ('accepted','preparing','ready_for_handover','with_driver','on_the_way','completed'))
    or (kind='offer' and campaign_id is not null and order_id is null and stage is null)),
  check(expires_at>occurred_at)
);

create table if not exists mealdeck_private.push_outbox(
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,location_id uuid not null,event_id uuid not null,
  source_type text not null check(source_type in ('order','account')),
  subscription_id uuid not null,
  endpoint_hash text not null check(endpoint_hash ~ '^[a-f0-9]{64}$'),
  status text not null default 'queued' check(status in ('queued','leased','sending','retry','accepted','failed','skipped')),
  attempts integer not null default 0 check(attempts between 0 and 5),
  next_attempt_at timestamptz not null default clock_timestamp(),
  lease_token uuid,lease_expires_at timestamptz,
  subscription_version timestamptz,
  last_http_status integer check(last_http_status between 100 and 599),
  created_at timestamptz not null default clock_timestamp(),
  updated_at timestamptz not null default clock_timestamp(),
  accepted_at timestamptz,
  unique(event_id,endpoint_hash),
  foreign key(event_id,tenant_id,location_id) references mealdeck_private.push_events(id,tenant_id,location_id)
);
create index if not exists push_outbox_pending on mealdeck_private.push_outbox(tenant_id,location_id,next_attempt_at,created_at)
  where status in ('queued','retry','leased','sending');
create index if not exists push_campaign_scope on mealdeck_private.push_campaigns(tenant_id,location_id,created_at desc);

do $security$ declare t text; begin
  foreach t in array array['order_push_subscriptions','order_push_consent_events','push_campaigns','push_events','push_outbox'] loop
    execute format('alter table mealdeck_private.%I enable row level security',t);
    execute format('revoke all on mealdeck_private.%I from public,anon,authenticated,service_role',t);
  end loop;
end $security$;

create or replace function mealdeck_private.push_endpoint_hash(p_endpoint text)
returns text language sql immutable set search_path='' as $$
  select encode(sha256(convert_to(p_endpoint,'UTF8')),'hex')
$$;

create or replace function mealdeck_private.push_valid_subscription(p_endpoint text,p_p256dh text,p_auth text)
returns boolean language sql immutable set search_path='' as $$
  select coalesce(length(p_endpoint) between 20 and 2048 and p_endpoint ~
    '^https://(fcm\.googleapis\.com|updates\.push\.services\.mozilla\.com|web\.push\.apple\.com|[a-z0-9-]+\.notify\.windows\.com)/[A-Za-z0-9_/?=&%:.-]+$'
    and p_p256dh ~ '^[A-Za-z0-9_-]{86,88}={0,2}$'
    and p_auth ~ '^[A-Za-z0-9_-]{22,24}={0,2}$',false)
$$;

create or replace function mealdeck_private.push_scope(p_tenant uuid,p_location uuid)
returns boolean language sql stable security definer set search_path='' as $$
  select exists(select 1 from mealdeck_private.installation i
    join public.tenant_locations l on l.tenant_id=i.business_id
    where i.singleton and i.profile='mealdeck-independent-v1'
      and i.business_id=p_tenant and l.id=p_location)
$$;

-- The endpoint is a private device capability. Both registration paths share a
-- lock, so simultaneous account/order opt-ins cannot reassign another identity.
create or replace function mealdeck_private.push_endpoint_owner_guard()
returns trigger language plpgsql security definer set search_path='' as $$
declare actor uuid;guest uuid;
begin
  if tg_table_name='customer_push_subscriptions' then actor:=new.user_id;
  else actor:=new.actor_id;guest:=new.guest_id;end if;
  perform pg_advisory_xact_lock(hashtextextended(new.endpoint,0));
  if exists(select 1 from mealdeck_private.customer_push_subscriptions s
      where s.endpoint=new.endpoint and s.user_id is distinct from actor)
    or exists(select 1 from mealdeck_private.order_push_subscriptions s
      where s.endpoint=new.endpoint and s.enabled and s.expires_at>clock_timestamp()
        and (s.actor_id,s.guest_id) is distinct from (actor,guest)) then
    raise exception 'mealdeck_customer_subscription_conflict';
  end if;
  return new;
end $$;
drop trigger if exists customer_push_endpoint_owner on mealdeck_private.customer_push_subscriptions;
create trigger customer_push_endpoint_owner before insert or update of endpoint,user_id on mealdeck_private.customer_push_subscriptions
  for each row execute function mealdeck_private.push_endpoint_owner_guard();
drop trigger if exists order_push_endpoint_owner on mealdeck_private.order_push_subscriptions;
create trigger order_push_endpoint_owner before insert or update of endpoint,actor_id,guest_id,enabled on mealdeck_private.order_push_subscriptions
  for each row when (new.enabled) execute function mealdeck_private.push_endpoint_owner_guard();

create or replace function mealdeck_private.push_revoke_order_subscriptions(p_actor uuid,p_endpoint text,p_source text)
returns void language plpgsql security definer set search_path='' as $$
begin
  with changed as (
    update mealdeck_private.order_push_subscriptions set enabled=false,updated_at=clock_timestamp()
      where actor_id=p_actor and enabled and (p_endpoint is null or endpoint=p_endpoint)
      returning *
  ) insert into mealdeck_private.order_push_consent_events(subscription_id,order_id,actor_id,guest_id,endpoint_hash,allowed,source)
    select id,order_id,actor_id,guest_id,mealdeck_private.push_endpoint_hash(endpoint),false,p_source from changed;
end $$;

create or replace function mealdeck_private.push_account_withdrawal()
returns trigger language plpgsql security definer set search_path='' as $$
begin
  if old.order_notifications and not new.order_notifications then
    perform mealdeck_private.push_revoke_order_subscriptions(new.user_id,null,'account_withdrawal');
  end if;
  return new;
end $$;
drop trigger if exists push_order_account_withdrawal on mealdeck_private.customer_profiles;
create trigger push_order_account_withdrawal after update of order_notifications on mealdeck_private.customer_profiles
  for each row execute function mealdeck_private.push_account_withdrawal();

-- Existing account/sign-out removal also stops order-only subscriptions on the
-- same device. Removing an account endpoint never changes marketing consent.
create or replace function public.mealdeck_customer_remove_push(p_endpoint text)
returns jsonb language plpgsql security definer set search_path='' as $$
begin
  if auth.uid() is null then raise exception 'mealdeck_customer_unauthenticated' using errcode='42501'; end if;
  perform mealdeck_private.push_revoke_order_subscriptions(auth.uid(),p_endpoint,'device_removed');
  delete from mealdeck_private.customer_push_subscriptions where user_id=auth.uid() and endpoint=p_endpoint;
  return jsonb_build_object('removed',true);
end $$;
revoke all on function public.mealdeck_customer_remove_push(text) from public,anon,authenticated,service_role;
grant execute on function public.mealdeck_customer_remove_push(text) to authenticated;

create or replace function mealdeck_private.push_order_identity(
  p_tenant uuid,p_location uuid,p_order uuid,p_actor uuid,p_guest_hash text)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare o public.orders%rowtype;g mealdeck_private.guest_sessions%rowtype;member jsonb;
begin
  if not mealdeck_private.push_scope(p_tenant,p_location) or num_nonnulls(p_actor,p_guest_hash)<>1 then
    raise exception 'mealdeck_push_order_unavailable'; end if;
  select * into o from public.orders where id=p_order and tenant_id=p_tenant and location_id=p_location and source='mealdeck';
  if not found then raise exception 'mealdeck_push_order_unavailable'; end if;
  if p_actor is not null then
    member:=mealdeck_private.customer_registration_authority(p_actor);
    if o.customer_id is distinct from p_actor or o.guest_checkout or not coalesce((member->>'registered')::boolean,false) then
      raise exception 'mealdeck_push_order_unavailable'; end if;
    return jsonb_build_object('actorId',p_actor,'guestId',null,'checkoutMode','member');
  end if;
  g:=mealdeck_private.guest_session_authority(p_tenant,p_location,p_guest_hash);
  if g.id is null or not o.guest_checkout or o.customer_id is not null or not (
    exists(select 1 from mealdeck_private.stripe_orders s where s.order_id=p_order and s.guest_id=g.id)
    or exists(select 1 from mealdeck_private.payment_orders s where s.order_id=p_order and s.guest_id=g.id)) then
    raise exception 'mealdeck_push_order_unavailable'; end if;
  return jsonb_build_object('actorId',null,'guestId',g.id,'checkoutMode','guest','guestExpiresAt',g.expires_at);
end $$;

create or replace function public.mealdeck_push_order_subscription(
  p_tenant uuid,p_location uuid,p_order uuid,p_actor uuid,p_guest_hash text,
  p_action text,p_endpoint text,p_p256dh text default null,p_auth text default null)
returns jsonb language plpgsql security definer set search_path='' as $$
declare identity jsonb;o public.orders%rowtype;s mealdeck_private.order_push_subscriptions%rowtype;
  account_subscription mealdeck_private.customer_push_subscriptions%rowtype;
  allowed boolean;sender_enabled boolean;expiry timestamptz;was_enabled boolean;sid uuid;account_connected boolean:=false;
begin
  if p_action is null or p_action not in ('state','subscribe','unsubscribe') then
    raise exception 'mealdeck_push_invalid_action'; end if;
  identity:=mealdeck_private.push_order_identity(p_tenant,p_location,p_order,p_actor,p_guest_hash);
  select * into o from public.orders where id=p_order;
  sender_enabled:=exists(select 1 from mealdeck_private.customer_features where singleton and push_enabled);
  allowed:=o.status in ('accepted','preparing','ready')
    and o.created_at>clock_timestamp()-interval '24 hours'
    and coalesce((mealdeck_private.kds_release_authority(p_order)->>'eligible')::boolean,false);
  select * into s from mealdeck_private.order_push_subscriptions where order_id=p_order and endpoint=p_endpoint;
  if p_actor is not null then
    select cs.* into account_subscription from mealdeck_private.customer_push_subscriptions cs
      join mealdeck_private.customer_profiles cp on cp.user_id=cs.user_id
      where cs.endpoint=p_endpoint and cs.user_id=p_actor and cp.order_notifications;
    account_connected:=found;
  end if;
  if p_action='state' then
    return jsonb_build_object('enabled',allowed and sender_enabled,'connected',coalesce(allowed and
        case when s.id is null then account_connected else s.enabled and s.expires_at>clock_timestamp() end,false),
      'expiresAt',s.expires_at);
  end if;
  if p_endpoint is null or length(p_endpoint)>2048 then raise exception 'mealdeck_customer_invalid_subscription'; end if;
  if p_action='unsubscribe' then
    if s.id is null and account_connected and allowed then
      -- Persist this order's explicit withdrawal even if its device was first
      -- registered through the account's broader order-update preference.
      insert into mealdeck_private.order_push_subscriptions(tenant_id,location_id,order_id,actor_id,endpoint,p256dh,auth_key,enabled,expires_at)
        values(p_tenant,p_location,p_order,p_actor,p_endpoint,account_subscription.p256dh,account_subscription.auth_key,false,
          o.created_at+interval '24 hours') returning * into s;
      insert into mealdeck_private.order_push_consent_events(subscription_id,order_id,actor_id,guest_id,endpoint_hash,allowed,source)
        values(s.id,s.order_id,s.actor_id,s.guest_id,mealdeck_private.push_endpoint_hash(s.endpoint),false,'order_confirmation');
    end if;
    if s.id is not null and s.enabled then
      update mealdeck_private.order_push_subscriptions set enabled=false,updated_at=clock_timestamp() where id=s.id;
      insert into mealdeck_private.order_push_consent_events(subscription_id,order_id,actor_id,guest_id,endpoint_hash,allowed,source)
        values(s.id,s.order_id,s.actor_id,s.guest_id,mealdeck_private.push_endpoint_hash(s.endpoint),false,'order_confirmation');
    end if;
    return jsonb_build_object('removed',true,'connected',false,'enabled',allowed and sender_enabled);
  end if;
  if not allowed or not sender_enabled then raise exception 'mealdeck_customer_push_unavailable'; end if;
  if not mealdeck_private.push_valid_subscription(p_endpoint,p_p256dh,p_auth) then
    raise exception 'mealdeck_customer_invalid_subscription'; end if;
  perform pg_advisory_xact_lock(hashtextextended(p_endpoint,0));
  -- Recheck the current row after the shared endpoint lock; retries do not make
  -- another device or another customer's browser its owner.
  select * into s from mealdeck_private.order_push_subscriptions where order_id=p_order and endpoint=p_endpoint for update;
  if s.id is not null and (s.actor_id,s.guest_id) is distinct from
      (p_actor,(identity->>'guestId')::uuid) then raise exception 'mealdeck_customer_subscription_conflict'; end if;
  if s.id is null and (select count(*) from mealdeck_private.order_push_subscriptions
      where order_id=p_order and enabled and expires_at>clock_timestamp())>=10 then
    raise exception 'mealdeck_customer_subscription_limit'; end if;
  expiry:=least(clock_timestamp()+interval '24 hours',o.created_at+interval '24 hours',
    coalesce((identity->>'guestExpiresAt')::timestamptz,'infinity'::timestamptz));
  was_enabled:=coalesce(s.enabled and s.expires_at>clock_timestamp(),false);
  insert into mealdeck_private.order_push_subscriptions(tenant_id,location_id,order_id,actor_id,guest_id,endpoint,p256dh,auth_key,expires_at)
    values(p_tenant,p_location,p_order,p_actor,(identity->>'guestId')::uuid,p_endpoint,p_p256dh,p_auth,expiry)
    on conflict(order_id,endpoint) do update set p256dh=excluded.p256dh,auth_key=excluded.auth_key,enabled=true,
      expires_at=excluded.expires_at,updated_at=clock_timestamp()
    returning id into sid;
  if not was_enabled then
    insert into mealdeck_private.order_push_consent_events(subscription_id,order_id,actor_id,guest_id,endpoint_hash,allowed,source)
      values(sid,p_order,p_actor,(identity->>'guestId')::uuid,mealdeck_private.push_endpoint_hash(p_endpoint),true,'order_confirmation');
  end if;
  return jsonb_build_object('saved',true,'enabled',true,'connected',true,'expiresAt',expiry);
end $$;

-- Payment alone is never acceptance. Readiness requires every purchased item
-- plus sealed packing. Delivery stages are reserved but have no unverified
-- provider adapter and cannot be emitted by this migration.
create or replace function mealdeck_private.push_current_order_stage(p_order uuid)
returns text language plpgsql stable security definer set search_path='' as $$
declare o public.orders%rowtype;p public.mealdeck_pass_orders%rowtype;
begin
  select * into o from public.orders where id=p_order and source='mealdeck';
  if not found or o.accepted_at is null or o.accepted_at>now() or o.fulfilment not in ('pickup','curbside')
    or not coalesce((mealdeck_private.kds_release_authority(p_order)->>'eligible')::boolean,false) then return null; end if;
  select * into p from public.mealdeck_pass_orders where order_id=p_order;
  if o.status='fulfilled' and p.status='handed_off' and p.handed_off_at is not null and p.handed_off_at<=now() then return 'completed'; end if;
  if o.status='ready' and p.status='ready_for_handoff' and p.sealed_at is not null and p.ready_for_handoff_at is not null
    and mealdeck_ops_private.kds_preparation_status(p_order)='ready' then return 'ready_for_handover'; end if;
  if o.status in ('preparing','ready') and coalesce(p.status,'waiting_for_kitchen') not in ('ready_for_handoff','handed_off') then
    return 'preparing'; end if;
  if o.status='accepted' then return 'accepted'; end if;
  return null;
end $$;

create or replace function mealdeck_private.push_order_recipients(p_order uuid)
returns table(source_type text,subscription_id uuid,endpoint_hash text)
language sql stable security definer set search_path='' as $$
  select distinct on (candidate.endpoint_hash) candidate.source_type,candidate.subscription_id,candidate.endpoint_hash
  from (
    select 'order'::text source_type,s.id subscription_id,mealdeck_private.push_endpoint_hash(s.endpoint) endpoint_hash,0 priority
    from mealdeck_private.order_push_subscriptions s join public.orders o on o.id=s.order_id
    where s.order_id=p_order and s.enabled and s.expires_at>now() and (
      (s.actor_id=o.customer_id and not o.guest_checkout
        and coalesce((mealdeck_private.customer_registration_authority(s.actor_id)->>'registered')::boolean,false))
      or (s.guest_id is not null and o.guest_checkout and exists(select 1 from mealdeck_private.guest_sessions g
        where g.id=s.guest_id and g.revoked_at is null and g.expires_at>now())))
    union all
    select 'account',s.id,mealdeck_private.push_endpoint_hash(s.endpoint),1
    from public.orders o join mealdeck_private.customer_push_subscriptions s on s.user_id=o.customer_id
      join mealdeck_private.customer_profiles p on p.user_id=s.user_id
    where o.id=p_order and not o.guest_checkout and p.order_notifications
      and coalesce((mealdeck_private.customer_registration_authority(s.user_id)->>'registered')::boolean,false)
      and not exists(select 1 from mealdeck_private.order_push_subscriptions override
        where override.order_id=o.id and override.endpoint=s.endpoint)
  ) candidate order by candidate.endpoint_hash,candidate.priority
$$;

create or replace function mealdeck_private.push_capture_order_stage()
returns trigger language plpgsql security definer set search_path='' as $$
declare oid uuid;o public.orders%rowtype;v_stage text;eid uuid;
begin
  if not exists(select 1 from mealdeck_private.customer_features where singleton and push_enabled) then return new; end if;
  if tg_table_name='orders' then
    if (old.accepted_at,old.status) is not distinct from (new.accepted_at,new.status) then return new;end if;
    if new.status not in ('accepted','preparing','fulfilled') then return new;end if;
    oid:=new.id;
  else
    if new.status<>'ready_for_handoff' then return new;end if;
    if tg_op='UPDATE' and old.status is not distinct from new.status then return new;end if;
    oid:=new.order_id;
  end if;
  v_stage:=mealdeck_private.push_current_order_stage(oid);
  if v_stage is null then return new;end if;
  select * into o from public.orders where id=oid;
  if not mealdeck_private.push_scope(o.tenant_id,o.location_id) then return new;end if;
  insert into mealdeck_private.push_events(tenant_id,location_id,kind,order_id,stage,expires_at)
    values(o.tenant_id,o.location_id,'order_update',oid,v_stage,
      clock_timestamp()+case when v_stage='ready_for_handover' then interval '30 minutes' else interval '15 minutes' end)
    on conflict(order_id,stage) do nothing returning id into eid;
  if eid is not null then
    insert into mealdeck_private.push_outbox(tenant_id,location_id,event_id,source_type,subscription_id,endpoint_hash)
      select o.tenant_id,o.location_id,eid,r.source_type,r.subscription_id,r.endpoint_hash
        from mealdeck_private.push_order_recipients(oid) r on conflict(event_id,endpoint_hash) do nothing;
  end if;
  return new;
end $$;
drop trigger if exists push_order_stage on public.orders;
create trigger push_order_stage after update of accepted_at,status on public.orders
  for each row execute function mealdeck_private.push_capture_order_stage();
drop trigger if exists push_packing_stage on public.mealdeck_pass_orders;
create trigger push_packing_stage after insert or update of status on public.mealdeck_pass_orders
  for each row execute function mealdeck_private.push_capture_order_stage();

create or replace function public.mealdeck_push_claim(p_tenant uuid,p_location uuid,p_limit integer default 20)
returns jsonb language plpgsql security definer set search_path='' as $$
declare jobs jsonb;
begin
  if not mealdeck_private.push_scope(p_tenant,p_location) or p_limit is null or p_limit not between 1 and 50 then
    raise exception 'mealdeck_push_invalid_scope';end if;
  if not exists(select 1 from mealdeck_private.customer_features where singleton and push_enabled) then
    return jsonb_build_object('jobs','[]'::jsonb);end if;
  update mealdeck_private.push_outbox j set status='skipped',lease_token=null,lease_expires_at=null,updated_at=clock_timestamp()
    from mealdeck_private.push_events e where j.event_id=e.id and j.tenant_id=p_tenant and j.location_id=p_location
      and j.status in ('queued','retry','leased','sending') and
      (e.expires_at<=clock_timestamp() or (j.attempts>=5 and coalesce(j.lease_expires_at,'-infinity'::timestamptz)<=clock_timestamp()));
  with candidates as (
    select j.id from mealdeck_private.push_outbox j join mealdeck_private.push_events e on e.id=j.event_id
    where j.tenant_id=p_tenant and j.location_id=p_location and j.attempts<5 and e.expires_at>clock_timestamp()
      and ((j.status in ('queued','retry') and j.next_attempt_at<=clock_timestamp())
        or (j.status in ('leased','sending') and j.lease_expires_at<=clock_timestamp()))
    order by case e.kind when 'order_update' then 0 else 1 end,j.created_at,j.id
    for update of j skip locked limit p_limit
  ), claimed as (
    update mealdeck_private.push_outbox j set status='leased',attempts=j.attempts+1,lease_token=gen_random_uuid(),
      lease_expires_at=clock_timestamp()+interval '5 minutes',subscription_version=null,updated_at=clock_timestamp()
    from candidates c where j.id=c.id returning j.id,j.lease_token
  ) select coalesce(jsonb_agg(jsonb_build_object('jobId',id,'leaseToken',lease_token)),'[]'::jsonb) into jobs from claimed;
  return jsonb_build_object('jobs',jobs);
end $$;

create or replace function public.mealdeck_push_preflight(p_tenant uuid,p_location uuid,p_job uuid,p_lease uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare j mealdeck_private.push_outbox%rowtype;e mealdeck_private.push_events%rowtype;
  os mealdeck_private.order_push_subscriptions%rowtype;cs mealdeck_private.customer_push_subscriptions%rowtype;
  o public.orders%rowtype;c mealdeck_private.push_campaigns%rowtype;
  endpoint text;key text;secret text;version timestamptz;payload jsonb;allowed boolean:=false;
begin
  select * into j from mealdeck_private.push_outbox where id=p_job and tenant_id=p_tenant and location_id=p_location
    and status='leased' and lease_token=p_lease and lease_expires_at>clock_timestamp() for update;
  if not found then return jsonb_build_object('send',false);end if;
  select * into e from mealdeck_private.push_events where id=j.event_id;
  if not mealdeck_private.push_scope(p_tenant,p_location) or e.expires_at<=clock_timestamp()
    or not exists(select 1 from mealdeck_private.customer_features where singleton and push_enabled) then
    update mealdeck_private.push_outbox set status='skipped',updated_at=clock_timestamp() where id=j.id;
    return jsonb_build_object('send',false);
  end if;
  if e.kind='order_update' then
    select * into o from public.orders where id=e.order_id;
    if mealdeck_private.push_current_order_stage(e.order_id) is not distinct from e.stage
      and exists(select 1 from mealdeck_private.push_order_recipients(e.order_id) r
        where r.source_type=j.source_type and r.subscription_id=j.subscription_id and r.endpoint_hash=j.endpoint_hash) then
      allowed:=true;
      payload:=jsonb_build_object('type','order_update','stage',e.stage,'orderId',e.order_id,
        'checkoutMode',case when o.guest_checkout then 'guest' else 'member' end,
        'fulfilment',o.fulfilment,'notificationId',e.id,'occurredAt',e.occurred_at,'expiresAt',e.expires_at);
    end if;
  elsif e.kind='offer' and j.source_type='account' then
    select * into c from mealdeck_private.push_campaigns where id=e.campaign_id and status='queued' and expires_at>clock_timestamp();
    if found and exists(select 1 from mealdeck_private.customer_push_subscriptions s
      join mealdeck_private.customer_profiles p on p.user_id=s.user_id
      where s.id=j.subscription_id and p.push_marketing and mealdeck_private.push_endpoint_hash(s.endpoint)=j.endpoint_hash
        and coalesce((mealdeck_private.customer_registration_authority(s.user_id)->>'registered')::boolean,false)) then
      allowed:=true;
      payload:=jsonb_build_object('type','offer','campaignId',c.id,'title',c.title,'body',c.body,'path',c.path,
        'notificationId',e.id,'occurredAt',e.occurred_at,'expiresAt',e.expires_at);
    end if;
  end if;
  if allowed and j.source_type='order' then
    select * into os from mealdeck_private.order_push_subscriptions where id=j.subscription_id;
    endpoint:=os.endpoint;key:=os.p256dh;secret:=os.auth_key;version:=os.updated_at;
  elsif allowed and j.source_type='account' then
    select * into cs from mealdeck_private.customer_push_subscriptions where id=j.subscription_id;
    endpoint:=cs.endpoint;key:=cs.p256dh;secret:=cs.auth_key;version:=cs.updated_at;
  end if;
  if not allowed or not mealdeck_private.push_valid_subscription(endpoint,key,secret)
    or mealdeck_private.push_endpoint_hash(endpoint) is distinct from j.endpoint_hash then
    update mealdeck_private.push_outbox set status='skipped',updated_at=clock_timestamp() where id=j.id;
    return jsonb_build_object('send',false);
  end if;
  update mealdeck_private.push_outbox set status='sending',subscription_version=version,updated_at=clock_timestamp() where id=j.id;
  return jsonb_build_object('send',true,'subscription',jsonb_build_object('endpoint',endpoint,'keys',jsonb_build_object('p256dh',key,'auth',secret)),
    'payload',payload,'ttlSeconds',greatest(1,least(1800,floor(extract(epoch from (e.expires_at-clock_timestamp())))::integer)));
end $$;

create or replace function public.mealdeck_push_finish(
  p_tenant uuid,p_location uuid,p_job uuid,p_lease uuid,p_outcome text,p_status integer default null)
returns jsonb language plpgsql security definer set search_path='' as $$
declare j mealdeck_private.push_outbox%rowtype;e mealdeck_private.push_events%rowtype;next_state text;campaign uuid;
begin
  if p_outcome is null or p_outcome not in ('accepted','retry','expired','failed')
    or (p_status is not null and p_status not between 100 and 599)
    or (p_outcome='accepted' and (p_status is null or p_status not between 200 and 299))
    or (p_outcome='expired' and (p_status is null or p_status not in (404,410))) then
    raise exception 'mealdeck_push_invalid_outcome';end if;
  -- Cancellation takes campaign then job locks. Use the same order here so
  -- recording a completed transport cannot deadlock with an operator cancel.
  select pe.campaign_id into campaign from mealdeck_private.push_outbox pj
    join mealdeck_private.push_events pe on pe.id=pj.event_id
    where pj.id=p_job and pj.tenant_id=p_tenant and pj.location_id=p_location;
  if campaign is not null then perform 1 from mealdeck_private.push_campaigns where id=campaign for update;end if;
  select * into j from mealdeck_private.push_outbox where id=p_job and tenant_id=p_tenant and location_id=p_location
    and lease_token=p_lease and status in ('leased','sending') for update;
  if not found then return jsonb_build_object('recorded',false);end if;
  if p_outcome='accepted' and j.status<>'sending' then raise exception 'mealdeck_push_preflight_required';end if;
  select * into e from mealdeck_private.push_events where id=j.event_id;
  next_state:=case when p_outcome='accepted' then 'accepted'
    when p_outcome='retry' and j.attempts<5 and e.expires_at>clock_timestamp() then 'retry'
    when p_outcome='expired' then 'skipped' else 'failed' end;
  update mealdeck_private.push_outbox set status=next_state,last_http_status=p_status,
    accepted_at=case when next_state='accepted' then clock_timestamp() else accepted_at end,
    next_attempt_at=clock_timestamp()+make_interval(secs=>least(600,15*(2^least(j.attempts,5))::integer)),
    lease_token=null,lease_expires_at=null,updated_at=clock_timestamp() where id=j.id;
  if p_outcome='expired' and j.subscription_version is not null then
    if j.source_type='account' then
      delete from mealdeck_private.customer_push_subscriptions where id=j.subscription_id
        and updated_at=j.subscription_version and mealdeck_private.push_endpoint_hash(endpoint)=j.endpoint_hash;
    else
      with changed as (
        update mealdeck_private.order_push_subscriptions set enabled=false,updated_at=clock_timestamp()
          where id=j.subscription_id and enabled and updated_at=j.subscription_version
            and mealdeck_private.push_endpoint_hash(endpoint)=j.endpoint_hash returning *
      ) insert into mealdeck_private.order_push_consent_events(subscription_id,order_id,actor_id,guest_id,endpoint_hash,allowed,source)
        select id,order_id,actor_id,guest_id,j.endpoint_hash,false,'expired' from changed;
    end if;
  end if;
  if e.campaign_id is not null then
    update mealdeck_private.push_campaigns set status='completed' where id=e.campaign_id and status='queued'
      and not exists(select 1 from mealdeck_private.push_outbox where event_id=e.id and status in ('queued','leased','sending','retry'));
  end if;
  return jsonb_build_object('recorded',true,'status',next_state);
end $$;

create or replace function mealdeck_private.push_assert_campaign_staff(p_tenant uuid,p_location uuid)
returns void language plpgsql security definer set search_path='' as $$
declare enrolled boolean;aal text;
begin
  if auth.uid() is null or not mealdeck_private.push_scope(p_tenant,p_location)
    or not mealdeck_ops_private.kitchen_active_identity()
    or not mealdeck_ops_private.can(p_tenant,p_location,'finance.read')
    or not mealdeck_ops_private.can(p_tenant,p_location,'finance.manage')
    or not exists(select 1 from public.mealdeck_ops_staff_access a where a.user_id=auth.uid()
      and a.tenant_id=p_tenant and a.enabled and (a.location_id is null or a.location_id=p_location)
      and a.role in ('owner','admin')) then raise exception 'mealdeck_push_campaign_forbidden';end if;
  -- Auth owns factor status and signed JWT AAL, never editable user_metadata.
  if to_regclass('auth.mfa_factors') is null then raise exception 'mealdeck_push_mfa_unavailable';end if;
  execute 'select exists(select 1 from auth.mfa_factors where user_id=$1 and status=''verified'')' into enrolled using auth.uid();
  aal:=coalesce(nullif(current_setting('request.jwt.claims',true),'')::jsonb->>'aal',
    nullif(current_setting('request.jwt.claim.aal',true),''),'aal1');
  if enrolled and aal<>'aal2' then raise exception 'mealdeck_push_mfa_required';end if;
end $$;

create or replace function mealdeck_private.push_campaign_card(p_campaign uuid)
returns jsonb language sql stable security definer set search_path='' as $$
  select jsonb_build_object('campaignId',c.id,'title',c.title,'body',c.body,'path',c.path,'expiresAt',c.expires_at,
    'status',case when c.status='queued' and not exists(select 1 from mealdeck_private.push_outbox j
        join mealdeck_private.push_events e on e.id=j.event_id where e.campaign_id=c.id and j.status in ('queued','leased','sending','retry')) then 'completed'
      when c.status in ('draft','queued') and c.expires_at<=now() then 'expired' else c.status end,
    'createdAt',c.created_at,'confirmedAt',c.confirmed_at,'eligibleDevices',case when c.status='draft' then (
      select count(*) from mealdeck_private.customer_push_subscriptions s
        join mealdeck_private.customer_profiles p on p.user_id=s.user_id
      where p.push_marketing and coalesce((mealdeck_private.customer_registration_authority(s.user_id)->>'registered')::boolean,false)
    ) else c.eligible_devices end,
    'queued',(select count(*) from mealdeck_private.push_outbox j join mealdeck_private.push_events e on e.id=j.event_id where e.campaign_id=c.id),
    'accepted',(select count(*) from mealdeck_private.push_outbox j join mealdeck_private.push_events e on e.id=j.event_id where e.campaign_id=c.id and j.status='accepted'),
    'failed',(select count(*) from mealdeck_private.push_outbox j join mealdeck_private.push_events e on e.id=j.event_id where e.campaign_id=c.id and j.status='failed'),
    'skipped',(select count(*) from mealdeck_private.push_outbox j join mealdeck_private.push_events e on e.id=j.event_id where e.campaign_id=c.id and j.status='skipped'))
  from mealdeck_private.push_campaigns c where c.id=p_campaign
$$;

create or replace function public.mealdeck_push_campaign_list(p_tenant uuid,p_location uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare cards jsonb;
begin
  perform mealdeck_private.push_assert_campaign_staff(p_tenant,p_location);
  select coalesce(jsonb_agg(mealdeck_private.push_campaign_card(c.id) order by c.created_at desc),'[]'::jsonb) into cards
    from (select id,created_at from mealdeck_private.push_campaigns where tenant_id=p_tenant and location_id=p_location
      order by created_at desc limit 50) c;
  return jsonb_build_object('campaigns',cards,'enabled',exists(select 1 from mealdeck_private.customer_features where singleton and push_enabled));
end $$;

create or replace function public.mealdeck_push_campaign_prepare(
  p_tenant uuid,p_location uuid,p_title text,p_body text,p_path text,p_expires_at timestamptz)
returns jsonb language plpgsql security definer set search_path='' as $$
declare cid uuid;eligible integer;
begin
  perform mealdeck_private.push_assert_campaign_staff(p_tenant,p_location);
  if p_title is null or length(btrim(p_title)) not between 1 and 60 or p_title ~ '[[:cntrl:]]'
    or p_body is null or length(btrim(p_body)) not between 1 and 180 or p_body ~ '[[:cntrl:]]'
    or p_path is null or p_path not in ('/offers','/menus') or p_expires_at is null
    or p_expires_at<=clock_timestamp() or p_expires_at>clock_timestamp()+interval '24 hours' then
    raise exception 'mealdeck_push_invalid_campaign';end if;
  select count(*)::integer into eligible from mealdeck_private.customer_push_subscriptions s
    join mealdeck_private.customer_profiles p on p.user_id=s.user_id
    where p.push_marketing and coalesce((mealdeck_private.customer_registration_authority(s.user_id)->>'registered')::boolean,false);
  insert into mealdeck_private.push_campaigns(tenant_id,location_id,title,body,path,expires_at,prepared_by,eligible_devices)
    values(p_tenant,p_location,btrim(p_title),btrim(p_body),p_path,p_expires_at,auth.uid(),eligible) returning id into cid;
  insert into public.mealdeck_ops_audit_log(tenant_id,location_id,actor_id,action,entity_type,entity_id)
    values(p_tenant,p_location,auth.uid(),'notifications.campaign.prepared','notification_campaign',cid);
  return mealdeck_private.push_campaign_card(cid);
end $$;

create or replace function public.mealdeck_push_campaign_confirm(p_tenant uuid,p_location uuid,p_campaign uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare c mealdeck_private.push_campaigns%rowtype;eid uuid;total integer;
begin
  -- Lock grants across the explicit confirmation, including new scoped denies.
  lock table public.mealdeck_ops_staff_access in share mode;
  perform mealdeck_private.push_assert_campaign_staff(p_tenant,p_location);
  select * into c from mealdeck_private.push_campaigns where id=p_campaign and tenant_id=p_tenant and location_id=p_location for update;
  if not found then raise exception 'mealdeck_push_campaign_unavailable';end if;
  if c.status in ('queued','completed') then return mealdeck_private.push_campaign_card(c.id);end if;
  if c.status<>'draft' or c.expires_at<=clock_timestamp() or c.created_at<=clock_timestamp()-interval '15 minutes' then
    raise exception 'mealdeck_push_campaign_expired';end if;
  if not exists(select 1 from mealdeck_private.customer_features where singleton and push_enabled) then
    raise exception 'mealdeck_customer_push_unavailable';end if;
  update mealdeck_private.push_campaigns set status='queued',confirmed_at=clock_timestamp(),confirmed_by=auth.uid() where id=c.id;
  insert into mealdeck_private.push_events(tenant_id,location_id,kind,campaign_id,expires_at)
    values(p_tenant,p_location,'offer',c.id,c.expires_at) returning id into eid;
  insert into mealdeck_private.push_outbox(tenant_id,location_id,event_id,source_type,subscription_id,endpoint_hash)
    select p_tenant,p_location,eid,'account',s.id,mealdeck_private.push_endpoint_hash(s.endpoint)
    from mealdeck_private.customer_push_subscriptions s join mealdeck_private.customer_profiles p on p.user_id=s.user_id
    where p.push_marketing and coalesce((mealdeck_private.customer_registration_authority(s.user_id)->>'registered')::boolean,false)
    on conflict(event_id,endpoint_hash) do nothing;
  get diagnostics total=row_count;
  update mealdeck_private.push_campaigns set eligible_devices=total,status=case when total=0 then 'completed' else 'queued' end where id=c.id;
  insert into public.mealdeck_ops_audit_log(tenant_id,location_id,actor_id,action,entity_type,entity_id,next_value)
    values(p_tenant,p_location,auth.uid(),'notifications.campaign.confirmed','notification_campaign',c.id,jsonb_build_object('queued',total));
  return mealdeck_private.push_campaign_card(c.id);
end $$;

create or replace function public.mealdeck_push_campaign_cancel(p_tenant uuid,p_location uuid,p_campaign uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare c mealdeck_private.push_campaigns%rowtype;
begin
  perform mealdeck_private.push_assert_campaign_staff(p_tenant,p_location);
  select * into c from mealdeck_private.push_campaigns where id=p_campaign and tenant_id=p_tenant and location_id=p_location for update;
  if not found then raise exception 'mealdeck_push_campaign_unavailable';end if;
  if c.status='completed' then return mealdeck_private.push_campaign_card(c.id);end if;
  update mealdeck_private.push_campaigns set status='cancelled' where id=c.id;
  -- A request already in flight cannot be recalled; the UI must state this.
  update mealdeck_private.push_outbox j set status='skipped',lease_token=null,lease_expires_at=null,updated_at=clock_timestamp()
    from mealdeck_private.push_events e where e.id=j.event_id and e.campaign_id=c.id and j.status in ('queued','retry','leased');
  insert into public.mealdeck_ops_audit_log(tenant_id,location_id,actor_id,action,entity_type,entity_id)
    values(p_tenant,p_location,auth.uid(),'notifications.campaign.cancelled','notification_campaign',c.id);
  return mealdeck_private.push_campaign_card(c.id);
end $$;

-- Internal helpers and transport data are never exposed to API roles. The four
-- worker/order RPCs are a narrow server boundary; campaign calls retain the
-- actual authenticated staff JWT and cannot accept a supplied actor identity.
do $acl$ declare f record;begin
  for f in select p.oid::regprocedure signature from pg_proc p join pg_namespace n on n.oid=p.pronamespace
    where n.nspname='mealdeck_private' and p.proname like 'push_%' loop
    execute format('revoke all on function %s from public,anon,authenticated,service_role',f.signature);
  end loop;
end $acl$;
revoke all on function public.mealdeck_push_order_subscription(uuid,uuid,uuid,uuid,text,text,text,text,text),
  public.mealdeck_push_claim(uuid,uuid,integer),public.mealdeck_push_preflight(uuid,uuid,uuid,uuid),
  public.mealdeck_push_finish(uuid,uuid,uuid,uuid,text,integer),
  public.mealdeck_push_campaign_list(uuid,uuid),public.mealdeck_push_campaign_prepare(uuid,uuid,text,text,text,timestamptz),
  public.mealdeck_push_campaign_confirm(uuid,uuid,uuid),public.mealdeck_push_campaign_cancel(uuid,uuid,uuid)
  from public,anon,authenticated,service_role;
grant execute on function public.mealdeck_push_order_subscription(uuid,uuid,uuid,uuid,text,text,text,text,text),
  public.mealdeck_push_claim(uuid,uuid,integer),public.mealdeck_push_preflight(uuid,uuid,uuid,uuid),
  public.mealdeck_push_finish(uuid,uuid,uuid,uuid,text,integer) to service_role;
grant execute on function public.mealdeck_push_campaign_list(uuid,uuid),
  public.mealdeck_push_campaign_prepare(uuid,uuid,text,text,text,timestamptz),
  public.mealdeck_push_campaign_confirm(uuid,uuid,uuid),public.mealdeck_push_campaign_cancel(uuid,uuid,uuid) to authenticated;

commit;
