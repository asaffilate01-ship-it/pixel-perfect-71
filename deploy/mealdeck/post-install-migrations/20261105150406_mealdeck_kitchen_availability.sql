-- Explicit kitchen availability controls. Additive after opening guest checkout.
-- Changing a state never configures payments, publishes a menu or overrides hours.
begin;
set local lock_timeout='5s';

do $guard$ begin
  if to_regclass('mealdeck_private.installation') is null
    or to_regclass('mealdeck_private.guest_sessions') is null
    or to_regprocedure('mealdeck_private.launch_window()') is null
    or to_regprocedure('mealdeck_ops_private.kitchen_active_identity()') is null
    or to_regnamespace('dishbee_private') is not null
    or not exists(select 1 from mealdeck_private.installation where singleton
      and profile='mealdeck-independent-v1') then
    raise exception 'mealdeck_availability_independent_guest_checkout_required';
  end if;
end $guard$;

alter table mealdeck_private.checkout_settings add column availability_state text not null default 'closed';
update mealdeck_private.checkout_settings set availability_state=case when checkout_enabled then 'online' else 'closed' end;
alter table mealdeck_private.checkout_settings add constraint checkout_availability_state
  check(availability_state in ('online','busy','paused','closed'));
alter table mealdeck_private.checkout_settings add constraint checkout_availability_enabled_consistency
  check(checkout_enabled=(availability_state in ('online','busy')));
create index checkout_quotes_location_expiry
  on mealdeck_private.checkout_quotes(tenant_id,location_id,expires_at);

create function mealdeck_private.assert_checkout_availability_manager(p_tenant uuid,p_location uuid)
returns void language plpgsql security definer set search_path='' as $$
begin
  if auth.uid() is null or not mealdeck_ops_private.kitchen_active_identity()
    or not mealdeck_ops_private.can(p_tenant,p_location,'finance.manage')
    or not exists(select 1 from public.mealdeck_ops_staff_access a
      where a.tenant_id=p_tenant and a.user_id=auth.uid() and a.enabled
        and a.role in ('owner','admin') and (a.location_id is null or a.location_id=p_location)) then
    raise exception 'mealdeck_ops_forbidden';
  end if;
  if not exists(select 1 from mealdeck_private.installation i
    join public.tenant_locations l on l.tenant_id=i.business_id
    where i.singleton and i.business_id=p_tenant and l.id=p_location
      and l.slug='shared-kitchen' and l.active) then
    raise exception 'mealdeck_checkout_location_unavailable';
  end if;
end $$;
revoke all on function mealdeck_private.assert_checkout_availability_manager(uuid,uuid)
  from public,anon,authenticated,service_role;

create or replace function public.mealdeck_ops_checkout_settings(p_tenant uuid,p_location uuid)
returns jsonb language plpgsql stable security definer set search_path='' as $$
begin
  if not mealdeck_ops_private.kitchen_active_identity()
    or not mealdeck_ops_private.can(p_tenant,p_location,'finance.manage') then
    raise exception 'mealdeck_ops_forbidden';
  end if;
  return coalesce((select jsonb_build_object('enabled',s.checkout_enabled,
    'availabilityState',s.availability_state,'openingStartDate',s.opening_start_date,
    'collectionEstimateMinutes',s.collection_estimate_minutes,
    'openingOffer',mealdeck_private.opening_offer(p_tenant,p_location))
    from mealdeck_private.checkout_settings s where s.tenant_id=p_tenant and s.location_id=p_location),
    jsonb_build_object('enabled',false,'availabilityState','closed','openingStartDate',date '2026-11-06',
      'collectionEstimateMinutes',null,'openingOffer',mealdeck_private.opening_offer(p_tenant,p_location)));
end $$;
revoke all on function public.mealdeck_ops_checkout_settings(uuid,uuid) from public,anon,authenticated,service_role;
grant execute on function public.mealdeck_ops_checkout_settings(uuid,uuid) to authenticated;

create function mealdeck_private.update_checkout_availability(
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
      order by q.id for update of q loop
      -- Preparation owns the same quote lock. Recheck after waiting with a new
      -- command snapshot so a session prepared concurrently stays untouched.
      update mealdeck_private.checkout_quotes q set expires_at=least(q.expires_at,now())
        where q.id=candidate
          and not exists(select 1 from mealdeck_private.stripe_orders s where s.quote_id=q.id);
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
revoke all on function mealdeck_private.update_checkout_availability(uuid,uuid,text,integer,text)
  from public,anon,authenticated,service_role;

create function public.mealdeck_ops_update_checkout_availability(
  p_tenant uuid,p_location uuid,p_state text,p_collection_estimate_minutes integer
) returns jsonb language sql security definer set search_path='' as $$
  select mealdeck_private.update_checkout_availability(p_tenant,p_location,p_state,p_collection_estimate_minutes,'checkout.availability')
$$;
revoke all on function public.mealdeck_ops_update_checkout_availability(uuid,uuid,text,integer)
  from public,anon,authenticated,service_role;
grant execute on function public.mealdeck_ops_update_checkout_availability(uuid,uuid,text,integer) to authenticated;

-- Saving an estimate from an older browser tab must never reopen a kitchen
-- another staff member has paused. The state comes from the locked database row.
create function public.mealdeck_ops_update_collection_estimate(
  p_tenant uuid,p_location uuid,p_collection_estimate_minutes integer
) returns jsonb language plpgsql security definer set search_path='' as $$
declare current_state text;
begin
  perform mealdeck_private.assert_checkout_availability_manager(p_tenant,p_location);
  if p_collection_estimate_minutes is null or p_collection_estimate_minutes not between 5 and 180 then
    raise exception 'mealdeck_checkout_collection_estimate_required';
  end if;
  perform pg_advisory_xact_lock(hashtextextended('mealdeck-checkout-settings:'||p_tenant::text||':'||p_location::text,0));
  select availability_state into current_state from mealdeck_private.checkout_settings
    where tenant_id=p_tenant and location_id=p_location for update;
  return mealdeck_private.update_checkout_availability(p_tenant,p_location,
    coalesce(current_state,'closed'),p_collection_estimate_minutes,'checkout.estimate');
end $$;
revoke all on function public.mealdeck_ops_update_collection_estimate(uuid,uuid,integer)
  from public,anon,authenticated,service_role;
grant execute on function public.mealdeck_ops_update_collection_estimate(uuid,uuid,integer) to authenticated;

-- Existing callers continue to work and cannot put the bool and state at odds.
create or replace function public.mealdeck_ops_update_checkout_settings(
  p_tenant uuid,p_location uuid,p_enabled boolean,p_opening_start_date date,p_collection_estimate_minutes integer
) returns jsonb language plpgsql security definer set search_path='' as $$
begin
  perform mealdeck_private.assert_checkout_availability_manager(p_tenant,p_location);
  if p_opening_start_date is not null and p_opening_start_date<>date '2026-11-06' then
    raise exception 'mealdeck_checkout_opening_date_fixed';
  end if;
  if p_enabled is null then raise exception 'mealdeck_checkout_availability_invalid'; end if;
  return mealdeck_private.update_checkout_availability(p_tenant,p_location,
    case when p_enabled then 'online' else 'closed' end,p_collection_estimate_minutes,'checkout.settings');
end $$;
revoke all on function public.mealdeck_ops_update_checkout_settings(uuid,uuid,boolean,date,integer)
  from public,anon,authenticated,service_role;
grant execute on function public.mealdeck_ops_update_checkout_settings(uuid,uuid,boolean,date,integer) to authenticated;

create or replace function public.mealdeck_online_checkout_status(p_tenant uuid,p_location uuid)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare ready boolean;launch jsonb:=mealdeck_private.launch_window();kitchen jsonb;
begin
  select s.checkout_enabled and c.enabled
      and array['pickup','curbside']::text[] <@ c.fulfilment_modes
      and s.collection_estimate_minutes is not null
      and exists(select 1 from public.mealdeck_ops_audit_log a where a.tenant_id=p_tenant
        and a.action='catalogue.menu_revision' and a.next_value->>'priceRevision'='owner-menu-20261105-v2'),
    jsonb_build_object('state',s.availability_state,'collectionEstimateMinutes',s.collection_estimate_minutes)
    into ready,kitchen
    from mealdeck_private.checkout_settings s
    join mealdeck_private.installation i on i.business_id=s.tenant_id and i.singleton
    join public.tenants t on t.id=s.tenant_id and t.active and t.currency='GBP'
    join public.tenant_locations l on l.tenant_id=s.tenant_id and l.id=s.location_id
      and l.active and l.slug='shared-kitchen'
    join public.ordering_channels c on c.tenant_id=s.tenant_id and c.location_id=s.location_id
      and c.channel_key='mealdeck'
    where s.tenant_id=p_tenant and s.location_id=p_location;
  return jsonb_build_object('channelOpen',coalesce(ready,false) and launch->'orderingOpen'='true'::jsonb,
    'guestCheckoutEligible',coalesce(ready,false) and launch->'guestEligible'='true'::jsonb,
    'openingOffer',mealdeck_private.opening_offer(p_tenant,p_location),'kitchen',kitchen);
end $$;
revoke all on function public.mealdeck_online_checkout_status(uuid,uuid) from public,anon,authenticated,service_role;
grant execute on function public.mealdeck_online_checkout_status(uuid,uuid) to anon,authenticated,service_role;

-- Small admission guards cover a quote racing an ETA/state change without
-- altering the shared pricing, identity or payment routines. No extra locks on
-- quote/settings pairs: state updates also expire unpaid quotes, so inverse
-- locks here would deadlock. Admission reads the current committed setting;
-- a prepare already admitted before a pause commits can finish normally.
create function mealdeck_private.guard_quote_availability()
returns trigger language plpgsql security definer set search_path='' as $$
declare settings mealdeck_private.checkout_settings%rowtype;
begin
  select * into settings from mealdeck_private.checkout_settings
    where tenant_id=new.tenant_id and location_id=new.location_id;
  if not found or not settings.checkout_enabled or settings.availability_state not in ('online','busy') then
    raise exception 'mealdeck_checkout_unavailable';
  end if;
  if new.collection_estimate_minutes is distinct from settings.collection_estimate_minutes then
    raise exception 'mealdeck_checkout_quote_expired';
  end if;
  return new;
end $$;
revoke all on function mealdeck_private.guard_quote_availability() from public,anon,authenticated,service_role;
create trigger mealdeck_quote_availability_admission before insert on mealdeck_private.checkout_quotes
  for each row execute function mealdeck_private.guard_quote_availability();

create function mealdeck_private.guard_payment_preparation_availability()
returns trigger language plpgsql security definer set search_path='' as $$
declare quote mealdeck_private.checkout_quotes%rowtype;settings mealdeck_private.checkout_settings%rowtype;
begin
  select * into quote from mealdeck_private.checkout_quotes where id=new.quote_id;
  if not found then raise exception 'mealdeck_checkout_quote_unavailable'; end if;
  select * into settings from mealdeck_private.checkout_settings
    where tenant_id=quote.tenant_id and location_id=quote.location_id;
  if not found or not settings.checkout_enabled or settings.availability_state not in ('online','busy') then
    raise exception 'mealdeck_checkout_unavailable';
  end if;
  if quote.collection_estimate_minutes is distinct from settings.collection_estimate_minutes
    or quote.expires_at<=now() then raise exception 'mealdeck_checkout_quote_expired'; end if;
  return new;
end $$;
revoke all on function mealdeck_private.guard_payment_preparation_availability() from public,anon,authenticated,service_role;
create trigger mealdeck_payment_availability_admission before insert on mealdeck_private.stripe_orders
  for each row execute function mealdeck_private.guard_payment_preparation_availability();

commit;
