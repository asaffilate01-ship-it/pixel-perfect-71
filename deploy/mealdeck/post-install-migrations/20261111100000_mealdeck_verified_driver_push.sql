-- Independent MealDeck: verified, consent-based delivery stage notifications.
-- Does not activate any device, send automatically without existing opt-in,
-- change an order, assign a driver, or publish location/ETA information.
begin;
set local lock_timeout='5s';
set local statement_timeout='30s';
set local check_function_bodies=on;

do $guard$
begin
  if current_user in ('anon','authenticated','service_role','authenticator')
    or to_regnamespace('dishbee_private') is not null
    or to_regclass('mealdeck_private.installation') is null
    or to_regclass('mealdeck_private.driver_assignments') is null
    or to_regclass('mealdeck_private.local_driver_orders') is null
    or to_regclass('mealdeck_private.order_push_subscriptions') is null
    or to_regclass('mealdeck_private.push_outbox') is null
    or to_regprocedure('mealdeck_private.push_current_order_stage(uuid)') is null
    or (select md5(prosrc) from pg_proc where oid=
       to_regprocedure('mealdeck_private.push_current_order_stage(uuid)'))
       <> '430986ee742a413f4fb3d0aa24a76946'
    or exists (select 1 from pg_trigger where tgrelid='mealdeck_private.driver_assignments'::regclass
       and tgname='mealdeck_driver_verified_pickup_push')
    or not exists (select 1 from mealdeck_private.installation
       where singleton and profile='mealdeck-independent-v1' and business_id is not null)
  then raise exception 'mealdeck_driver_push_unexpected_backend_or_definition'; end if;
end $guard$;

-- Keep the existing pickup and kerbside projector behaviour. Extend delivery
-- only when payment and kitchen proof exist; never infer driver collection from
-- a dispatch offer, an accepted job, or KDS handover alone.
create or replace function mealdeck_private.push_current_order_stage(p_order uuid)
returns text language plpgsql stable security definer set search_path='' as $$
declare o public.orders%rowtype; p public.mealdeck_pass_orders%rowtype;
  d mealdeck_private.local_driver_orders%rowtype;
begin
  select * into o from public.orders where id=p_order and source='mealdeck';
  if not found or o.accepted_at is null or o.accepted_at>now()
    or o.fulfilment not in ('pickup','curbside','delivery')
    or not coalesce((mealdeck_private.kds_release_authority(p_order)->>'eligible')::boolean,false)
  then return null; end if;
  select * into p from public.mealdeck_pass_orders where order_id=p_order;

  if o.fulfilment='delivery' then
    select * into d from mealdeck_private.local_driver_orders
      where order_id=p_order and tenant_id=o.tenant_id and location_id=o.location_id;
    if not found or o.payment_status<>'paid' then return null; end if;

    -- Only protected KDS staff confirmation is final delivery authority.
    if o.status='fulfilled' and d.driver_status='delivered'
      and d.delivered_at is not null and d.delivered_at<=now()
    then return 'completed'; end if;

    -- A driver must also confirm pickup in their own authenticated PWA.
    -- Staff marking with_driver by itself never emits "driver has collected".
    if o.status='ready' and d.driver_status='with_driver'
      and d.handed_to_driver_at is not null
      and exists(
        select 1 from mealdeck_private.driver_assignments a
        where a.order_id=o.id and a.tenant_id=o.tenant_id
          and a.location_id=o.location_id
          and a.state in ('collected','at_customer','dropoff_reported')
      )
    then return 'with_driver'; end if;

    if o.status='ready' and p.status in ('sealed','ready_for_handoff')
      and p.sealed_at is not null
      and mealdeck_ops_private.kds_preparation_status(p_order)='ready'
    then return 'ready_for_handover'; end if;
    if o.status in ('preparing','ready')
      and coalesce(p.status,'waiting_for_kitchen') not in ('sealed','ready_for_handoff','handed_off')
    then return 'preparing'; end if;
    if o.status='accepted' then return 'accepted'; end if;
    return null;
  end if;

  if o.status='fulfilled' and p.status='handed_off'
    and p.handed_off_at is not null and p.handed_off_at<=now()
  then return 'completed'; end if;
  if o.status='ready' and p.status='ready_for_handoff'
    and p.sealed_at is not null and p.ready_for_handoff_at is not null
    and mealdeck_ops_private.kds_preparation_status(p_order)='ready'
  then return 'ready_for_handover'; end if;
  if o.status in ('preparing','ready')
    and coalesce(p.status,'waiting_for_kitchen') not in ('ready_for_handoff','handed_off')
  then return 'preparing'; end if;
  if o.status='accepted' then return 'accepted'; end if;
  return null;
end $$;

-- The only new delivery push event is a driver's *verified* pickup.
-- The existing consent-scoped recipient selector, unique event/outbox indexes,
-- expiry and provider preflight still decide if a notification can be sent.
create function mealdeck_private.push_capture_verified_driver_pickup()
returns trigger language plpgsql security definer set search_path='' as $$
declare o public.orders%rowtype; event_id uuid;
begin
  if old.state is not distinct from new.state or new.state<>'collected'
    or old.driver_id is distinct from new.driver_id
    or not exists(select 1 from mealdeck_private.customer_features
      where singleton and push_enabled)
  then return new; end if;
  select * into o from public.orders where id=new.order_id
    and tenant_id=new.tenant_id and location_id=new.location_id
    and source='mealdeck' and fulfilment='delivery' and payment_status='paid';
  if not found or o.status<>'ready'
    or mealdeck_private.push_current_order_stage(new.order_id)<>'with_driver'
    or not mealdeck_private.push_scope(o.tenant_id,o.location_id)
  then return new; end if;

  insert into mealdeck_private.push_events(
    tenant_id,location_id,kind,order_id,stage,expires_at
  ) values (
    o.tenant_id,o.location_id,'order_update',o.id,'with_driver',
    clock_timestamp()+interval '20 minutes'
  ) on conflict(order_id,stage) do nothing returning id into event_id;
  if event_id is not null then
    insert into mealdeck_private.push_outbox(
      tenant_id,location_id,event_id,source_type,subscription_id,endpoint_hash
    ) select o.tenant_id,o.location_id,event_id,r.source_type,r.subscription_id,r.endpoint_hash
      from mealdeck_private.push_order_recipients(o.id) r
      on conflict(event_id,endpoint_hash) do nothing;
  end if;
  return new;
end $$;
revoke all on function mealdeck_private.push_capture_verified_driver_pickup()
  from public,anon,authenticated,service_role;

create trigger mealdeck_driver_verified_pickup_push
after update of state on mealdeck_private.driver_assignments
for each row execute function mealdeck_private.push_capture_verified_driver_pickup();
commit;
