-- Generated with Supabase CLI 3.0.0: mealdeck_push_hosted_dispatch.
-- Hosted independent MealDeck extension. Installs a dormant Vault-backed
-- dispatcher, without credentials, activation, campaigns or customer sends.
begin;
set local lock_timeout='5s';
set local statement_timeout='30s';
set local check_function_bodies=on;

do $guard$
begin
  if to_regnamespace('dishbee_private') is not null
    or to_regclass('mealdeck_private.installation') is null
    or to_regclass('mealdeck_private.push_outbox') is null then
    raise exception 'mealdeck_push_independent_extension_required';
  end if;
  if current_user in ('anon','authenticated','service_role') or not exists(
    select 1 from pg_class where oid='mealdeck_private.installation'::regclass
      and pg_has_role(current_user,relowner,'USAGE')) then
    raise exception 'mealdeck_push_database_owner_required';
  end if;
  if not exists(select 1 from mealdeck_private.installation where singleton
    and profile='mealdeck-independent-v1' and business_id is not null)
    or not exists(select 1 from pg_extension where extname='supabase_vault') then
    raise exception 'mealdeck_push_hosted_vault_required';
  end if;
end $guard$;

create extension if not exists pg_cron;
create extension if not exists pg_net;

create table if not exists mealdeck_private.push_runtime_configuration(
  singleton boolean primary key default true check(singleton),
  tenant_id uuid not null,location_id uuid not null,
  vault_secret_id uuid not null references vault.secrets(id),
  enabled boolean not null default false,
  created_at timestamptz not null default clock_timestamp(),
  last_worker_at timestamptz,
  last_dispatch_at timestamptz,
  last_dispatch_request bigint,
  foreign key(tenant_id,location_id) references public.tenant_locations(tenant_id,id)
);
alter table mealdeck_private.push_runtime_configuration enable row level security;
revoke all on mealdeck_private.push_runtime_configuration from public,anon,authenticated,service_role;

create or replace function public.mealdeck_push_runtime_config(p_tenant uuid,p_location uuid)
returns jsonb language plpgsql stable security definer set search_path=''
as $$
declare config mealdeck_private.push_runtime_configuration%rowtype; bundle jsonb;
begin
  select * into config from mealdeck_private.push_runtime_configuration
    where singleton and enabled and tenant_id=p_tenant and location_id=p_location;
  if not found or not mealdeck_private.push_scope(p_tenant,p_location) then
    return jsonb_build_object('enabled',false);
  end if;
  select decrypted_secret::jsonb into bundle from vault.decrypted_secrets where id=config.vault_secret_id;
  if bundle is null then return jsonb_build_object('enabled',false); end if;
  return jsonb_build_object('enabled',true,'publicKey',bundle->>'publicKey',
    'privateKey',bundle->>'privateKey','subject',bundle->>'subject','workerSecret',bundle->>'workerSecret');
end;
$$;
revoke all on function public.mealdeck_push_runtime_config(uuid,uuid) from public,anon,authenticated,service_role;
grant execute on function public.mealdeck_push_runtime_config(uuid,uuid) to service_role;

create or replace function public.mealdeck_push_worker_seen(p_tenant uuid,p_location uuid)
returns jsonb language plpgsql security definer set search_path=''
as $$
begin
  update mealdeck_private.push_runtime_configuration set last_worker_at=clock_timestamp()
    where singleton and enabled and tenant_id=p_tenant and location_id=p_location;
  return jsonb_build_object('recorded',found);
end;
$$;
revoke all on function public.mealdeck_push_worker_seen(uuid,uuid) from public,anon,authenticated,service_role;
grant execute on function public.mealdeck_push_worker_seen(uuid,uuid) to service_role;

-- Keep secret values out of cron.job, logs and public HTTP parameters. Only a
-- fixed same-product endpoint can be invoked, with an empty JSON body.
create or replace function mealdeck_private.dispatch_customer_push()
returns bigint language plpgsql security definer set search_path=''
as $$
declare config mealdeck_private.push_runtime_configuration%rowtype; token text; request_id bigint;
begin
  select * into config from mealdeck_private.push_runtime_configuration where singleton and enabled;
  if not found or not exists(select 1 from mealdeck_private.customer_features where singleton and push_enabled)
    or not mealdeck_private.push_scope(config.tenant_id,config.location_id) then return null; end if;
  -- An advisory lock and short throttle coalesce statement triggers with cron.
  if not pg_try_advisory_xact_lock(hashtextextended('mealdeck.customer.push.dispatch',0)) then return null; end if;
  select * into config from mealdeck_private.push_runtime_configuration where singleton and enabled;
  if not found or not mealdeck_private.push_scope(config.tenant_id,config.location_id)
    or not exists(select 1 from mealdeck_private.customer_features where singleton and push_enabled) then return null; end if;
  if config.last_dispatch_at>clock_timestamp()-interval '3 seconds' then return null; end if;
  -- An idle heartbeat once a minute proves the worker is reachable without
  -- generating an HTTP request on every idle cron tick.
  if config.last_worker_at>clock_timestamp()-interval '1 minute' and not exists(
    select 1 from mealdeck_private.push_outbox where tenant_id=config.tenant_id and location_id=config.location_id
      and ((status in ('queued','retry') and next_attempt_at<=clock_timestamp())
        or (status in ('leased','sending') and lease_expires_at<=clock_timestamp()))
  ) then return null; end if;
  select decrypted_secret::jsonb->>'workerSecret' into token from vault.decrypted_secrets where id=config.vault_secret_id;
  if token is null or length(token) not between 32 and 256
    or token!~'^[A-Za-z0-9_-]+$' then return null; end if;
  request_id:=net.http_post(url:='https://mealdeck.co.uk/api/notifications/worker',
    body:='{}'::jsonb,headers:=jsonb_build_object('Content-Type','application/json','Authorization','Bearer '||token),
    timeout_milliseconds:=30000);
  update mealdeck_private.push_runtime_configuration set last_dispatch_at=clock_timestamp(),last_dispatch_request=request_id
    where singleton;
  return request_id;
exception when others then
  -- An optional alert transport cannot roll back a paid kitchen transition.
  -- The durable outbox survives and cron retries it independently.
  return null;
end;
$$;
revoke all on function mealdeck_private.dispatch_customer_push() from public,anon,authenticated,service_role;

create or replace function mealdeck_private.wake_customer_push()
returns trigger language plpgsql security definer set search_path=''
as $$ begin perform mealdeck_private.dispatch_customer_push(); return null; end; $$;
revoke all on function mealdeck_private.wake_customer_push() from public,anon,authenticated,service_role;
drop trigger if exists mealdeck_customer_push_wake on mealdeck_private.push_outbox;
create trigger mealdeck_customer_push_wake after insert on mealdeck_private.push_outbox
  for each statement execute function mealdeck_private.wake_customer_push();

-- The queue briefly holds its Authorization header; API roles have no access.
revoke all on net.http_request_queue,net._http_response from public,anon,authenticated,service_role;
select cron.schedule('mealdeck-customer-push','30 seconds','select mealdeck_private.dispatch_customer_push()');
comment on table mealdeck_private.push_runtime_configuration is
  'Dedicated web-push Vault reference and health only. Private credentials never in public runtime responses.';
commit;
