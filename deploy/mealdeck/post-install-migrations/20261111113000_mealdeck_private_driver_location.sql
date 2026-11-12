-- MealDeck private driver location: foreground, per-delivery consent BETA.
-- Database installation does not enable customer maps or GPS capture.
-- No historical route, analytics, marketing, or customer contact is stored.
begin;
set local lock_timeout='5s';
set local statement_timeout='60s';
set local check_function_bodies=on;

do $guard$
begin
  if current_user in ('anon','authenticated','service_role','authenticator')
    or to_regnamespace('dishbee_private') is not null
    or to_regclass('mealdeck_private.installation') is null
    or to_regclass('mealdeck_private.driver_assignments') is null
    or to_regclass('mealdeck_private.driver_roster') is null
    or to_regclass('mealdeck_private.local_driver_orders') is null
    or to_regprocedure('public.mealdeck_driver_portal()') is null
    or to_regprocedure('mealdeck_ops_private.kds_release_evidence(uuid)') is null
    or to_regprocedure('mealdeck_private.customer_registration_authority(uuid)') is null
    or to_regprocedure('cron.schedule(text,text,text)') is null
    or to_regclass('mealdeck_private.driver_location_points') is not null
    or not exists(select 1 from mealdeck_private.installation
       where singleton and profile='mealdeck-independent-v1' and business_id is not null)
  then raise exception 'mealdeck_driver_location_independent_readiness_required';end if;
end $guard$;

-- Independent server-side activation gate, OFF on every fresh installation.
-- No browser or staff RPC can toggle this table. A separate owner-controlled
-- release and physical-device acceptance are required before enabling.
create table mealdeck_private.driver_location_runtime (
  singleton boolean primary key default true check(singleton),
  enabled boolean not null default false,
  updated_at timestamptz not null default clock_timestamp()
);
insert into mealdeck_private.driver_location_runtime(singleton,enabled) values(true,false);
alter table mealdeck_private.driver_location_runtime enable row level security;
revoke all on mealdeck_private.driver_location_runtime from public,anon,authenticated,service_role;

create table mealdeck_private.driver_location_points (
  order_id uuid primary key references mealdeck_private.driver_assignments(order_id) on delete restrict,
  tenant_id uuid not null,
  location_id uuid not null,
  driver_id uuid not null references auth.users(id),
  enabled boolean not null default false,
  consent_at timestamptz not null default clock_timestamp(),
  latitude numeric(9,6),
  longitude numeric(9,6),
  accuracy_metres integer check(accuracy_metres is null or accuracy_metres between 1 and 100),
  fixed_at timestamptz,
  expires_at timestamptz,
  updated_at timestamptz not null default clock_timestamp(),
  check ((latitude is null and longitude is null and accuracy_metres is null
          and fixed_at is null and expires_at is null)
     or (latitude is not null and longitude is not null and accuracy_metres is not null
          and fixed_at is not null and expires_at is not null)),
  check (latitude is null or latitude between 51.8 and 52.0),
  check (longitude is null or longitude between -0.65 and -0.30)
);
create index driver_location_expiry_idx on mealdeck_private.driver_location_points(expires_at)
  where expires_at is not null;
alter table mealdeck_private.driver_location_points enable row level security;
revoke all on mealdeck_private.driver_location_points from public,anon,authenticated,service_role;

-- A driver is active only *after* an app-confirmed pickup and KDS verified handover.
-- Dispatch offer, assigned, at_kitchen, dropoff report, pause and completed order
-- are never eligible for a location update or a customer position.
create function mealdeck_private.driver_location_authorised(p_order uuid,p_driver uuid)
returns boolean language sql security definer set search_path='' as $$
 select exists(
   select 1 from mealdeck_private.driver_assignments a
   join mealdeck_private.driver_roster r on r.user_id=a.driver_id
     and r.tenant_id=a.tenant_id and r.location_id=a.location_id
   join mealdeck_private.local_driver_orders d on d.order_id=a.order_id
     and d.tenant_id=a.tenant_id and d.location_id=a.location_id
   join public.orders o on o.id=a.order_id and o.tenant_id=a.tenant_id
     and o.location_id=a.location_id
   join mealdeck_private.installation i on i.singleton and i.business_id=o.tenant_id
     and i.profile='mealdeck-independent-v1'
   where a.order_id=p_order and a.driver_id=p_driver and p_driver is not null
     and exists(select 1 from mealdeck_private.driver_location_runtime cfg
       where cfg.singleton and cfg.enabled)
     and r.enabled and r.on_shift and a.state in ('collected','at_customer')
     and d.driver_status='with_driver' and d.handed_to_driver_at is not null
     and o.source='mealdeck' and o.fulfilment='delivery'
     and o.payment_status='paid' and o.status='ready'
     and o.created_at>clock_timestamp()-interval '24 hours'
     and mealdeck_ops_private.kds_release_evidence(o.id) is not null
 )
$$;
revoke all on function mealdeck_private.driver_location_authorised(uuid,uuid)
  from public,anon,authenticated,service_role;

-- Stop always works for the owning signed-in driver, even after shift sign-out
-- or delivery completion. Re-enabling requires a current paid delivery.
create function public.mealdeck_driver_location_consent(p_order uuid,p_enabled boolean)
returns jsonb language plpgsql security definer set search_path='' as $$
declare a mealdeck_private.driver_assignments%rowtype;changed integer;
begin
  if auth.uid() is null or p_order is null or p_enabled is null
  then raise exception 'mealdeck_driver_location_forbidden' using errcode='42501';end if;
  if not p_enabled then
    update mealdeck_private.driver_location_points
      set enabled=false,latitude=null,longitude=null,accuracy_metres=null,
          fixed_at=null,expires_at=null,updated_at=clock_timestamp()
      where order_id=p_order and driver_id=auth.uid();
    return jsonb_build_object('sharing',false);
  end if;
  select * into a from mealdeck_private.driver_assignments
    where order_id=p_order and driver_id=auth.uid() for update;
  if not found or not mealdeck_private.driver_location_authorised(p_order,auth.uid())
  then raise exception 'mealdeck_driver_location_ineligible' using errcode='42501';end if;
  insert into mealdeck_private.driver_location_points(
    order_id,tenant_id,location_id,driver_id,enabled,consent_at
  ) values (p_order,a.tenant_id,a.location_id,a.driver_id,true,clock_timestamp())
  on conflict(order_id) do update
    set enabled=true,consent_at=clock_timestamp(),latitude=null,longitude=null,
        accuracy_metres=null,fixed_at=null,expires_at=null,updated_at=clock_timestamp()
    where mealdeck_private.driver_location_points.driver_id=excluded.driver_id
      and mealdeck_private.driver_location_points.tenant_id=excluded.tenant_id
      and mealdeck_private.driver_location_points.location_id=excluded.location_id;
  get diagnostics changed=row_count;
  if changed<>1 then raise exception 'mealdeck_driver_location_ineligible' using errcode='42501';end if;
  return jsonb_build_object('sharing',true);
end $$;

-- Never trust lat/lon, age, speed or customer order scope supplied by browser.
-- Only the latest current fix is kept, no point trail. At most one save/8 sec.
create function public.mealdeck_driver_location_point(
  p_order uuid,p_latitude double precision,p_longitude double precision,
  p_accuracy_metres double precision,p_fixed_at timestamptz
) returns jsonb language plpgsql security definer set search_path='' as $$
declare v mealdeck_private.driver_location_points%rowtype;clock_now timestamptz:=clock_timestamp();
begin
  if auth.uid() is null or p_order is null
    or p_latitude is null or p_latitude not between 51.8 and 52.0
    or p_longitude is null or p_longitude not between -0.65 and -0.30
    or p_accuracy_metres is null or p_accuracy_metres<=0 or p_accuracy_metres>100
    or p_fixed_at is null or p_fixed_at<clock_now-interval '25 seconds'
    or p_fixed_at>clock_now+interval '5 seconds'
  then raise exception 'mealdeck_driver_location_invalid';end if;
  select * into v from mealdeck_private.driver_location_points
    where order_id=p_order and driver_id=auth.uid() and enabled for update;
  if not found or not mealdeck_private.driver_location_authorised(p_order,auth.uid())
  then raise exception 'mealdeck_driver_location_ineligible' using errcode='42501';end if;
  if (v.fixed_at is not null and p_fixed_at<=v.fixed_at)
    or (v.fixed_at is not null and v.updated_at>clock_now-interval '8 seconds')
  then return jsonb_build_object('saved',false,'reason','throttled');end if;
  update mealdeck_private.driver_location_points
    set latitude=round(p_latitude::numeric,6),
        longitude=round(p_longitude::numeric,6),
        accuracy_metres=ceil(p_accuracy_metres)::integer,
        fixed_at=p_fixed_at,
        expires_at=least(p_fixed_at+interval '30 seconds',clock_now+interval '30 seconds'),
        updated_at=clock_now
    where order_id=p_order and driver_id=auth.uid() and enabled;
  return jsonb_build_object('saved',true);
end $$;

-- Only a registered, authenticated member may see their own verified paid
-- order's recent consented point; no guest cookie, 4-digit code or public URL.
create function public.mealdeck_customer_driver_position(p_order uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare viewer uuid:=auth.uid();v mealdeck_private.driver_location_points%rowtype;
begin
  if viewer is null or p_order is null
    or not coalesce((mealdeck_private.customer_registration_authority(viewer)->>'registered')::boolean,false)
  then return jsonb_build_object('available',false);end if;
  select p.* into v from mealdeck_private.driver_location_points p
    join public.orders o on o.id=p.order_id and o.tenant_id=p.tenant_id
      and o.location_id=p.location_id
    where p.order_id=p_order and o.customer_id=viewer and not o.guest_checkout
      and o.source='mealdeck' and o.fulfilment='delivery'
      and o.payment_status='paid' and o.status='ready'
      and p.enabled and p.latitude is not null and p.longitude is not null
      and p.accuracy_metres between 1 and 100
      and p.expires_at>clock_timestamp() and p.fixed_at>clock_timestamp()-interval '30 seconds'
    limit 1;
  if not found or not mealdeck_private.driver_location_authorised(p_order,v.driver_id)
  then return jsonb_build_object('available',false);end if;
  return jsonb_build_object(
    'available',true,'latitude',v.latitude,'longitude',v.longitude,
    'accuracyMetres',v.accuracy_metres,'observedAt',v.fixed_at
  );
end $$;

-- Explicit private 60-second retention sweep, deleting coordinates but leaving
-- a consent marker for the active assignment. No route history survives.
create function mealdeck_private.clear_stale_driver_locations()
returns integer language plpgsql security definer set search_path='' as $$
declare changed integer;
begin
  update mealdeck_private.driver_location_points
    set enabled=case
          when consent_at<=clock_timestamp()-interval '24 hours'
            or not mealdeck_private.driver_location_authorised(order_id,driver_id)
          then false else enabled end,
        latitude=null,longitude=null,accuracy_metres=null,fixed_at=null,
        expires_at=null,updated_at=clock_timestamp()
    where (latitude is not null and (expires_at<=clock_timestamp()
      or not mealdeck_private.driver_location_authorised(order_id,driver_id)))
      or (enabled and (consent_at<=clock_timestamp()-interval '24 hours'
        or not mealdeck_private.driver_location_authorised(order_id,driver_id)));
  get diagnostics changed=row_count;
  -- No expired/ended delivery metadata is kept indefinitely. This is not an
  -- operational receipt or payment record; it contains only GPS consent.
  delete from mealdeck_private.driver_location_points
    where consent_at<=clock_timestamp()-interval '24 hours';
  return changed;
end $$;
revoke all on function mealdeck_private.clear_stale_driver_locations()
  from public,anon,authenticated,service_role;

-- Existing customer/driver APIs remain unaffected. Defaults keep browser
-- capture hidden until approved release and real phone/background tests.
revoke all on function public.mealdeck_driver_location_consent(uuid,boolean),
  public.mealdeck_driver_location_point(uuid,double precision,double precision,double precision,timestamptz),
  public.mealdeck_customer_driver_position(uuid)
  from public,anon,authenticated,service_role;
grant execute on function public.mealdeck_driver_location_consent(uuid,boolean),
  public.mealdeck_driver_location_point(uuid,double precision,double precision,double precision,timestamptz),
  public.mealdeck_customer_driver_position(uuid)
  to authenticated;

select cron.schedule('mealdeck-driver-location-retention','* * * * *',
  'select mealdeck_private.clear_stale_driver_locations()');
commit;
