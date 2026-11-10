-- Independent MealDeck Luton courier switchboard. Source migrations are
-- additive and do not grant provider credentials or auto-book courier jobs.
begin;
set local lock_timeout='5s';
set local statement_timeout='30s';
set local check_function_bodies=on;

do $guard$ begin
  if current_user in ('anon','authenticated','service_role','authenticator')
     or to_regnamespace('dishbee_private') is not null
     or to_regclass('mealdeck_private.installation') is null
     or to_regclass('mealdeck_private.driver_roster') is null
     or to_regclass('mealdeck_private.driver_assignments') is null
     or to_regprocedure('mealdeck_ops_private.kds_assert_scope(uuid,uuid,text)') is null
     or not exists (select 1 from mealdeck_private.installation i
       where i.singleton and i.profile='mealdeck-independent-v1'
         and i.business_id is not null)
  then raise exception 'mealdeck_courier_wrong_installation_or_actor'; end if;
end $guard$;

create table if not exists mealdeck_private.courier_provider_switches (
  tenant_id uuid not null,
  location_id uuid not null,
  provider text not null check (provider in
    ('own_fleet','uber_direct','deliveroo_express','just_eat_go','stuart')),
  enabled boolean not null default false,
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id),
  primary key (tenant_id,location_id,provider),
  foreign key(tenant_id,location_id) references public.tenant_locations(tenant_id,id)
);
alter table mealdeck_private.courier_provider_switches enable row level security;
revoke all on mealdeck_private.courier_provider_switches
  from public,anon,authenticated,service_role;

create or replace function mealdeck_private.courier_provider_enabled(
  p_tenant uuid,p_location uuid,p_provider text
) returns boolean language sql stable security definer set search_path='' as $$
  select case
    when p_provider not in ('own_fleet','uber_direct','deliveroo_express','just_eat_go','stuart')
      then false
    else coalesce((
      select enabled from mealdeck_private.courier_provider_switches
      where tenant_id=p_tenant and location_id=p_location and provider=p_provider
    ),p_provider='own_fleet')
  end;
$$;
revoke all on function mealdeck_private.courier_provider_enabled(uuid,uuid,text)
  from public,anon,authenticated,service_role;

-- Keep the existing owned-driver manual dispatch available unless the manager
-- explicitly switches OWN FLEET off. Disabling it also prevents a new offer,
-- without changing any in-progress accepted driver assignment.
create or replace function mealdeck_private.courier_own_fleet_insert_guard()
returns trigger language plpgsql security definer set search_path='' as $$
begin
  if not mealdeck_private.courier_provider_enabled(new.tenant_id,new.location_id,'own_fleet')
  then raise exception 'mealdeck_own_fleet_disabled' using errcode='42501'; end if;
  return new;
end;
$$;
revoke all on function mealdeck_private.courier_own_fleet_insert_guard()
  from public,anon,authenticated,service_role;
drop trigger if exists courier_own_fleet_enabled on mealdeck_private.driver_assignments;
create trigger courier_own_fleet_enabled before insert on mealdeck_private.driver_assignments
  for each row execute function mealdeck_private.courier_own_fleet_insert_guard();

create or replace function public.mealdeck_ops_courier_switchboard(
  p_tenant uuid,p_location uuid
) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare v jsonb;
begin
  perform mealdeck_ops_private.kds_assert_scope(p_tenant,p_location,'orders.status');
  if not exists(select 1 from mealdeck_private.installation i
       where i.singleton and i.business_id=p_tenant)
    or not exists(select 1 from public.tenant_locations l
       where l.id=p_location and l.tenant_id=p_tenant
       and l.slug='shared-kitchen' and l.active)
  then raise exception 'mealdeck_courier_forbidden' using errcode='42501'; end if;
  select jsonb_agg(jsonb_build_object(
      'provider',p.provider,'enabled',
      mealdeck_private.courier_provider_enabled(p_tenant,p_location,p.provider),
      'connected',case when p.provider='own_fleet' then exists(
        select 1 from mealdeck_private.driver_roster r
        where r.tenant_id=p_tenant and r.location_id=p_location
          and r.enabled and r.on_shift
      ) else false end,
      'setupRequired',p.provider<>'own_fleet',
      'availability','not_quoted'
    ) order by p.idx) into v
  from (values (1,'own_fleet'),(2,'uber_direct'),(3,'deliveroo_express'),
         (4,'just_eat_go'),(5,'stuart')) p(idx,provider);
  return jsonb_build_object('providers',v,'automatedDispatchReady',false);
end $$;
revoke all on function public.mealdeck_ops_courier_switchboard(uuid,uuid)
  from public,anon,authenticated,service_role;
grant execute on function public.mealdeck_ops_courier_switchboard(uuid,uuid) to authenticated;

create or replace function public.mealdeck_ops_courier_set_enabled(
  p_tenant uuid,p_location uuid,p_provider text,p_enabled boolean
) returns jsonb language plpgsql security definer set search_path='' as $$
begin
  perform mealdeck_ops_private.kds_assert_scope(p_tenant,p_location,'staff.manage');
  if p_provider not in ('own_fleet','uber_direct','deliveroo_express','just_eat_go','stuart')
     or p_enabled is null
  then raise exception 'mealdeck_courier_invalid_switch'; end if;
  if not exists(select 1 from mealdeck_private.installation i
       where i.singleton and i.business_id=p_tenant)
    or not exists(select 1 from public.tenant_locations l
       where l.id=p_location and l.tenant_id=p_tenant
       and l.slug='shared-kitchen' and l.active)
  then raise exception 'mealdeck_courier_forbidden' using errcode='42501'; end if;
  insert into mealdeck_private.courier_provider_switches
    (tenant_id,location_id,provider,enabled,updated_by)
    values(p_tenant,p_location,p_provider,p_enabled,auth.uid())
    on conflict(tenant_id,location_id,provider)
    do update set enabled=excluded.enabled,updated_at=now(),updated_by=auth.uid();
  insert into public.mealdeck_ops_audit_log
    (tenant_id,location_id,actor_id,action,entity_type,entity_id,next_value)
    values(p_tenant,p_location,auth.uid(),'courier.provider.toggle',
      'courier_provider',p_tenant,
      jsonb_build_object('provider',p_provider,'enabled',p_enabled));
  return public.mealdeck_ops_courier_switchboard(p_tenant,p_location);
end $$;
revoke all on function public.mealdeck_ops_courier_set_enabled(uuid,uuid,text,boolean)
  from public,anon,authenticated,service_role;
grant execute on function public.mealdeck_ops_courier_set_enabled(uuid,uuid,text,boolean)
  to authenticated;
commit;
