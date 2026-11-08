-- MealDeck Driver Phase 2: invitation-only owned-driver dispatch for the Luton kitchen.
-- Source-only post-install migration. Apply to the verified standalone MealDeck backend
-- only, AFTER 20261107230000_mealdeck_local_driver_delivery.sql.
-- No public direct table access and no implicit delivery activation.
begin;
set local lock_timeout='5s';
set local statement_timeout='60s';
set local check_function_bodies=on;

do $guard$
begin
  if to_regnamespace('dishbee_private') is not null
    or to_regclass('mealdeck_private.installation') is null
    or to_regclass('mealdeck_private.local_driver_orders') is null
    or to_regclass('mealdeck_private.local_driver_quotes') is null
    or to_regprocedure('mealdeck_ops_private.kds_assert_scope(uuid,uuid,text)') is null
    or to_regprocedure('mealdeck_ops_private.kds_release_evidence(uuid)') is null
    or current_user in ('anon','authenticated','service_role')
    or not exists(select 1 from mealdeck_private.installation
      where singleton and profile='mealdeck-independent-v1' and business_id is not null)
  then raise exception 'mealdeck_driver_app_not_installed'; end if;
end $guard$;

create table if not exists mealdeck_private.driver_roster (
  user_id uuid primary key references auth.users(id) on delete restrict,
  tenant_id uuid not null,
  location_id uuid not null,
  display_name text not null check (length(btrim(display_name)) between 2 and 100),
  enabled boolean not null default true,
  on_shift boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (tenant_id,location_id) references public.tenant_locations(tenant_id,id),
  unique (tenant_id,location_id,user_id)
);
alter table mealdeck_private.driver_roster enable row level security;
revoke all on mealdeck_private.driver_roster from public,anon,authenticated,service_role;

create table if not exists mealdeck_private.driver_assignments (
  order_id uuid primary key references mealdeck_private.local_driver_orders(order_id) on delete restrict,
  tenant_id uuid not null,
  location_id uuid not null,
  driver_id uuid not null,
  state text not null check (state in
    ('offered','assigned','at_kitchen','collected','at_customer','dropoff_reported','declined')),
  version integer not null default 1 check(version>=1),
  offered_until timestamptz not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (tenant_id,location_id,driver_id)
    references mealdeck_private.driver_roster(tenant_id,location_id,user_id)
);
create index if not exists driver_assignments_active_idx
  on mealdeck_private.driver_assignments(driver_id,updated_at desc);
alter table mealdeck_private.driver_assignments enable row level security;
revoke all on mealdeck_private.driver_assignments from public,anon,authenticated,service_role;

create table if not exists mealdeck_private.driver_action_receipts (
  request_id uuid primary key,
  actor_id uuid not null references auth.users(id),
  order_id uuid not null references mealdeck_private.driver_assignments(order_id),
  action text not null,
  response jsonb not null,
  created_at timestamptz not null default now()
);
alter table mealdeck_private.driver_action_receipts enable row level security;
revoke all on mealdeck_private.driver_action_receipts from public,anon,authenticated,service_role;

-- The operations manager must first create the Auth user in the MealDeck project.
-- This RPC only binds an existing user after a staff.manage permission check.
create or replace function public.mealdeck_ops_driver_enrol(
  p_tenant uuid,p_location uuid,p_user uuid,p_name text
) returns jsonb language plpgsql security definer set search_path='' as $$
declare r mealdeck_private.driver_roster%rowtype;
begin
  perform mealdeck_ops_private.kds_assert_scope(p_tenant,p_location,'staff.manage');
  if p_user is null or p_name is null or length(btrim(p_name)) not between 2 and 100
    or p_name ~ '[[:cntrl:]]'
    or not exists(select 1 from auth.users where id=p_user)
  then raise exception 'mealdeck_driver_enrol_invalid'; end if;
  if not exists(select 1 from mealdeck_private.installation
    where singleton and business_id=p_tenant)
    or not exists(select 1 from public.tenant_locations
      where tenant_id=p_tenant and id=p_location and slug='shared-kitchen' and active)
  then raise exception 'mealdeck_driver_forbidden' using errcode='42501'; end if;
  select * into r from mealdeck_private.driver_roster where user_id=p_user for update;
  if found and (r.tenant_id<>p_tenant or r.location_id<>p_location)
  then raise exception 'mealdeck_driver_forbidden' using errcode='42501'; end if;
  insert into mealdeck_private.driver_roster
    (user_id,tenant_id,location_id,display_name,enabled,on_shift)
    values(p_user,p_tenant,p_location,btrim(p_name),true,false)
    on conflict(user_id) do update set display_name=excluded.display_name,
      updated_at=now();
  insert into public.mealdeck_ops_audit_log
    (tenant_id,location_id,actor_id,action,entity_type,entity_id,next_value)
    values(p_tenant,p_location,auth.uid(),'driver.enrol','driver',p_user,
      jsonb_build_object('displayName',btrim(p_name)));
  return jsonb_build_object('ok',true,'driverId',p_user);
end $$;

create or replace function public.mealdeck_ops_driver_set_enabled(
  p_tenant uuid,p_location uuid,p_user uuid,p_enabled boolean
) returns jsonb language plpgsql security definer set search_path='' as $$
declare r mealdeck_private.driver_roster%rowtype;
begin
  perform mealdeck_ops_private.kds_assert_scope(p_tenant,p_location,'staff.manage');
  if p_enabled is null then raise exception 'mealdeck_driver_enrol_invalid'; end if;
  select * into r from mealdeck_private.driver_roster
    where user_id=p_user and tenant_id=p_tenant and location_id=p_location for update;
  if not found then raise exception 'mealdeck_driver_forbidden' using errcode='42501'; end if;
  if not p_enabled and exists (
    select 1 from mealdeck_private.driver_assignments a
    join mealdeck_private.local_driver_orders d on d.order_id=a.order_id
    where a.driver_id=p_user and a.state in
      ('assigned','at_kitchen','collected','at_customer','dropoff_reported')
      and d.driver_status<>'delivered'
  ) then raise exception 'mealdeck_driver_active_job'; end if;
  update mealdeck_private.driver_roster set enabled=p_enabled,
    on_shift=case when p_enabled then on_shift else false end,updated_at=now()
    where user_id=p_user;
  insert into public.mealdeck_ops_audit_log
    (tenant_id,location_id,actor_id,action,entity_type,entity_id,next_value)
    values(p_tenant,p_location,auth.uid(),'driver.enable','driver',p_user,
      jsonb_build_object('enabled',p_enabled));
  return jsonb_build_object('ok',true,'enabled',p_enabled);
end $$;

-- A manager sees only the Luton scope. This read never returns private customer
-- addresses; only accepted on-shift drivers can receive them in their own portal.
create or replace function public.mealdeck_ops_driver_dispatch_board(
  p_tenant uuid,p_location uuid
) returns jsonb language plpgsql stable security definer set search_path='' as $$
begin
  perform mealdeck_ops_private.kds_assert_scope(p_tenant,p_location,'orders.status');
  return jsonb_build_object(
    'drivers',coalesce((
      select jsonb_agg(jsonb_build_object('driverId',user_id,'name',display_name,
        'onShift',on_shift,'enabled',enabled) order by display_name)
      from mealdeck_private.driver_roster
      where tenant_id=p_tenant and location_id=p_location), '[]'::jsonb),
    'orders',coalesce((
      select jsonb_agg(q.data order by q.created_at)
      from (
        select o.created_at,
          jsonb_build_object('jobId',o.id,'postcode',d.address->>'postcode',
            'assignment',a.state,'assignedDriver',a.driver_id,
            'driverStatus',l.driver_status,'createdAt',o.created_at) as data
        from public.orders o
        join mealdeck_private.local_driver_orders l on l.order_id=o.id
        join mealdeck_private.local_driver_quotes d on d.quote_id=l.quote_id
        join public.mealdeck_pass_orders p on p.order_id=o.id
        left join mealdeck_private.driver_assignments a on a.order_id=o.id
        where o.tenant_id=p_tenant and o.location_id=p_location
          and o.source='mealdeck' and o.fulfilment='delivery'
          and o.payment_status='paid' and o.status='ready'
          and l.driver_status='awaiting_driver'
          and p.status in ('sealed','ready_for_handoff')
          and mealdeck_ops_private.kds_release_evidence(o.id) is not null
          and o.created_at > now()-interval '24 hours'
        order by o.created_at asc limit 25
      ) q), '[]'::jsonb)
  );
end $$;

-- Exactly one outstanding offer per paid order. Underlying kitchen state stays
-- authoritative; an offer never changes payment, packing or checkout.
create or replace function public.mealdeck_ops_driver_offer(
  p_tenant uuid,p_location uuid,p_order uuid,p_driver uuid
) returns jsonb language plpgsql security definer set search_path='' set lock_timeout='3s' as $$
declare r mealdeck_private.driver_roster%rowtype;
  o public.orders%rowtype; d mealdeck_private.local_driver_orders%rowtype;
  p public.mealdeck_pass_orders%rowtype; a mealdeck_private.driver_assignments%rowtype;
  new_version integer;
begin
  perform mealdeck_ops_private.kds_assert_scope(p_tenant,p_location,'orders.status');
  select * into r from mealdeck_private.driver_roster where user_id=p_driver
    and tenant_id=p_tenant and location_id=p_location for update;
  if not found or not r.enabled or not r.on_shift
    then raise exception 'mealdeck_driver_unavailable'; end if;
  if exists(select 1 from mealdeck_private.driver_assignments a2
      join mealdeck_private.local_driver_orders d2 on d2.order_id=a2.order_id
      where a2.driver_id=p_driver
        and a2.state in ('offered','assigned','at_kitchen','collected','at_customer','dropoff_reported')
        and (a2.state<>'offered' or a2.offered_until>now())
        and d2.driver_status<>'delivered')
  then raise exception 'mealdeck_driver_busy'; end if;
  select * into o from public.orders where id=p_order and tenant_id=p_tenant
    and location_id=p_location and source='mealdeck' and fulfilment='delivery' for update;
  select * into d from mealdeck_private.local_driver_orders where order_id=p_order for update;
  select * into p from public.mealdeck_pass_orders where order_id=p_order for update;
  if o.id is null or d.order_id is null or p.order_id is null
    or d.tenant_id<>p_tenant or d.location_id<>p_location
    or d.driver_status<>'awaiting_driver' or o.payment_status<>'paid'
    or o.status<>'ready' or p.status not in ('sealed','ready_for_handoff')
    or mealdeck_ops_private.kds_release_evidence(p_order) is null
  then raise exception 'mealdeck_driver_kitchen_not_ready'; end if;
  select * into a from mealdeck_private.driver_assignments where order_id=p_order for update;
  if found and a.state not in ('declined','offered')
    then raise exception 'mealdeck_driver_busy'; end if;
  if found and a.state='offered' and a.offered_until>now()
    then raise exception 'mealdeck_driver_busy'; end if;
  new_version:=coalesce(a.version,0)+1;
  insert into mealdeck_private.driver_assignments
    (order_id,tenant_id,location_id,driver_id,state,version,offered_until)
    values(p_order,p_tenant,p_location,p_driver,'offered',new_version,now()+interval '2 minutes')
    on conflict(order_id) do update set driver_id=excluded.driver_id,
      state='offered',version=excluded.version,offered_until=excluded.offered_until,
      updated_at=now();
  insert into public.mealdeck_ops_audit_log
    (tenant_id,location_id,actor_id,action,entity_type,entity_id,next_value)
    values(p_tenant,p_location,auth.uid(),'driver.offer','order',p_order,
      jsonb_build_object('driverId',p_driver,'version',new_version));
  return jsonb_build_object('ok',true,'jobId',p_order,'version',new_version);
end $$;

create or replace function public.mealdeck_driver_shift(p_on_shift boolean)
returns jsonb language plpgsql security definer set search_path='' as $$
declare r mealdeck_private.driver_roster%rowtype;
begin
  if auth.uid() is null or p_on_shift is null
    then raise exception 'mealdeck_driver_forbidden' using errcode='42501'; end if;
  select * into r from mealdeck_private.driver_roster where user_id=auth.uid() for update;
  if not found or not r.enabled then raise exception 'mealdeck_driver_forbidden' using errcode='42501'; end if;
  if not p_on_shift and exists(
    select 1 from mealdeck_private.driver_assignments a
    join mealdeck_private.local_driver_orders l on l.order_id=a.order_id
    where a.driver_id=r.user_id and a.state in
      ('assigned','at_kitchen','collected','at_customer','dropoff_reported')
      and l.driver_status<>'delivered'
  ) then raise exception 'mealdeck_driver_active_job'; end if;
  update mealdeck_private.driver_roster set on_shift=p_on_shift,updated_at=now()
    where user_id=r.user_id;
  return jsonb_build_object('ok',true,'onShift',p_on_shift);
end $$;

create or replace function public.mealdeck_driver_portal()
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare r mealdeck_private.driver_roster%rowtype;
begin
  if auth.uid() is null then raise exception 'mealdeck_driver_forbidden' using errcode='42501'; end if;
  select * into r from mealdeck_private.driver_roster where user_id=auth.uid();
  if not found or not r.enabled or not exists (
    select 1 from mealdeck_private.installation i where i.singleton and i.business_id=r.tenant_id
  ) then raise exception 'mealdeck_driver_forbidden' using errcode='42501'; end if;
  return jsonb_build_object('displayName',r.display_name,'onShift',r.on_shift,
    'jobs',coalesce((
      select jsonb_agg(j.card order by j.created_at)
      from (
        select o.created_at,
          jsonb_build_object(
            'jobId',a.order_id,'status',
              case when l.driver_status='delivered' then 'delivered' else a.state end,
            'version',a.version,'offeredUntil',a.offered_until,
            'driverStatus',l.driver_status,'postcode',q.address->>'postcode',
            'address',case when r.on_shift and a.state not in ('offered','declined')
              then q.address else null end,
            'customerName',case when r.on_shift and a.state not in ('offered','declined')
              then o.customer_name else null end,
            'customerPhone',case when r.on_shift and a.state not in ('offered','declined')
              then o.customer_phone else null end,
            'createdAt',o.created_at
          ) as card
        from mealdeck_private.driver_assignments a
        join mealdeck_private.local_driver_orders l on l.order_id=a.order_id
        join mealdeck_private.local_driver_quotes q on q.quote_id=l.quote_id
        join public.orders o on o.id=a.order_id
        where a.driver_id=r.user_id and a.tenant_id=r.tenant_id and a.location_id=r.location_id
          and o.tenant_id=r.tenant_id and o.location_id=r.location_id
          and o.source='mealdeck' and o.fulfilment='delivery'
          and a.state<>'declined' and o.created_at>now()-interval '24 hours'
          and o.payment_status='paid' and o.status in ('ready','fulfilled')
        order by o.created_at desc limit 15
      ) j), '[]'::jsonb));
end $$;

-- Driver commands never mark a MealDeck order delivered: the existing protected
-- KDS staff confirmation remains the only final authority for that transition.
create or replace function public.mealdeck_driver_action(
  p_order uuid,p_version integer,p_action text,p_request_id uuid
) returns jsonb language plpgsql security definer set search_path='' set lock_timeout='3s' as $$
declare r mealdeck_private.driver_roster%rowtype; a mealdeck_private.driver_assignments%rowtype;
  o public.orders%rowtype; d mealdeck_private.local_driver_orders%rowtype;
  old_request mealdeck_private.driver_action_receipts%rowtype;
  response jsonb; next_state text;
begin
  if auth.uid() is null or p_order is null or p_request_id is null or p_version is null
    or p_action not in ('accept','decline','arrive_kitchen','pickup','arrive_customer','report_dropoff')
  then raise exception 'mealdeck_driver_forbidden' using errcode='42501'; end if;
  select * into r from mealdeck_private.driver_roster where user_id=auth.uid() for update;
  if not found or not r.enabled or not r.on_shift
    then raise exception 'mealdeck_driver_forbidden' using errcode='42501'; end if;
  select * into old_request from mealdeck_private.driver_action_receipts where request_id=p_request_id;
  if found then
    if old_request.actor_id=r.user_id and old_request.order_id=p_order
      and old_request.action=p_action then return old_request.response; end if;
    raise exception 'mealdeck_driver_conflict';
  end if;
  select * into a from mealdeck_private.driver_assignments
    where order_id=p_order and driver_id=r.user_id
      and tenant_id=r.tenant_id and location_id=r.location_id for update;
  select * into o from public.orders
    where id=p_order and tenant_id=r.tenant_id and location_id=r.location_id;
  select * into d from mealdeck_private.local_driver_orders
    where order_id=p_order and tenant_id=r.tenant_id and location_id=r.location_id;
  if a.order_id is null or o.id is null or d.order_id is null
    or o.source<>'mealdeck' or o.fulfilment<>'delivery'
    or o.payment_status<>'paid' or o.status<>'ready'
    or d.driver_status='delivered'
    or mealdeck_ops_private.kds_release_evidence(p_order) is null
  then raise exception 'mealdeck_driver_kitchen_not_ready'; end if;
  if a.version<>p_version then raise exception 'mealdeck_driver_conflict'; end if;
  next_state:=case
    when a.state='offered' and p_action='accept' and a.offered_until>now() then 'assigned'
    when a.state='offered' and p_action='decline' and a.offered_until>now() then 'declined'
    when a.state='assigned' and p_action='arrive_kitchen' then 'at_kitchen'
    when a.state='at_kitchen' and p_action='pickup' and d.driver_status='with_driver' then 'collected'
    when a.state='collected' and p_action='arrive_customer' then 'at_customer'
    when a.state='at_customer' and p_action='report_dropoff'
      and d.driver_status='with_driver' then 'dropoff_reported'
    else null end;
  if next_state is null then
    if a.state='offered' and a.offered_until<=now()
      then raise exception 'mealdeck_driver_offer_expired'; end if;
    if p_action='pickup' and d.driver_status<>'with_driver'
      then raise exception 'mealdeck_driver_handover_pending'; end if;
    raise exception 'mealdeck_driver_conflict';
  end if;
  if p_action='pickup' and (
    not exists(select 1 from public.mealdeck_pass_orders p
      where p.order_id=p_order and p.status in ('sealed','ready_for_handoff'))
    or not mealdeck_ops_private.kds_routing_complete(p_order)
  ) then raise exception 'mealdeck_driver_kitchen_not_ready'; end if;
  update mealdeck_private.driver_assignments set state=next_state,
    version=version+1,updated_at=now() where order_id=p_order;
  response:=jsonb_build_object('ok',true,'jobId',p_order,'status',next_state,'version',p_version+1);
  insert into mealdeck_private.driver_action_receipts
    (request_id,actor_id,order_id,action,response)
    values(p_request_id,r.user_id,p_order,p_action,response);
  insert into public.mealdeck_ops_audit_log
    (tenant_id,location_id,actor_id,action,entity_type,entity_id,previous_value,next_value)
    values(r.tenant_id,r.location_id,r.user_id,'driver.'||p_action,'order',p_order,
      jsonb_build_object('status',a.state,'version',a.version),response);
  return response;
end $$;

revoke all on function public.mealdeck_ops_driver_enrol(uuid,uuid,uuid,text),
  public.mealdeck_ops_driver_set_enabled(uuid,uuid,uuid,boolean),
  public.mealdeck_ops_driver_dispatch_board(uuid,uuid),
  public.mealdeck_ops_driver_offer(uuid,uuid,uuid,uuid),
  public.mealdeck_driver_shift(boolean),public.mealdeck_driver_portal(),
  public.mealdeck_driver_action(uuid,integer,text,uuid)
  from public,anon,authenticated,service_role;
grant execute on function public.mealdeck_ops_driver_enrol(uuid,uuid,uuid,text),
  public.mealdeck_ops_driver_set_enabled(uuid,uuid,uuid,boolean),
  public.mealdeck_ops_driver_dispatch_board(uuid,uuid),
  public.mealdeck_ops_driver_offer(uuid,uuid,uuid,uuid),
  public.mealdeck_driver_shift(boolean),public.mealdeck_driver_portal(),
  public.mealdeck_driver_action(uuid,integer,text,uuid)
  to authenticated;
commit;
