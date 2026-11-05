-- Independent MealDeck: staff acceptance, item readiness and one-copy receipts.
-- Apply only after the customer membership and Stripe checkout extensions.
begin;
set local lock_timeout='5s';
do $guard$ begin
  if to_regclass('mealdeck_private.stripe_orders') is null
    or to_regprocedure('mealdeck_private.kds_release_authority(uuid)') is null
    or to_regnamespace('dishbee_private') is not null
    or not exists(select 1 from mealdeck_private.installation where singleton and profile='mealdeck-independent-v1') then
    raise exception 'mealdeck_kitchen_independent_checkout_required';
  end if;
end $guard$;

create table mealdeck_private.printer_access(
  tenant_id uuid not null,location_id uuid not null,user_id uuid not null references auth.users(id),
  enabled boolean not null default true,created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),updated_at timestamptz not null default now(),
  primary key(tenant_id,location_id,user_id),
  foreign key(tenant_id,location_id) references public.tenant_locations(tenant_id,id)
);
create table mealdeck_private.receipt_jobs(
  id uuid primary key default gen_random_uuid(),order_id uuid not null references public.orders(id),
  tenant_id uuid not null,location_id uuid not null,copy_number integer not null check(copy_number between 1 and 100),
  reprint_of uuid references mealdeck_private.receipt_jobs(id),reprint_reason text,
  receipt jsonb not null check(jsonb_typeof(receipt)='object'),
  status text not null default 'queued' check(status in ('queued','claimed','sending','sent_unconfirmed','printed','held','failed')),
  created_at timestamptz not null default now(),updated_at timestamptz not null default now(),
  claimed_by uuid references auth.users(id),terminal_id uuid,claim_token uuid,claim_expires_at timestamptz,
  send_started_at timestamptz,confirmed_at timestamptz,resolved_by uuid references auth.users(id),resolution text,
  unique(order_id,copy_number),
  foreign key(tenant_id,location_id,order_id) references public.orders(tenant_id,location_id,id),
  check((copy_number=1 and reprint_of is null and reprint_reason is null)
    or (copy_number>1 and reprint_of is not null and length(trim(reprint_reason)) between 5 and 300))
);
create index receipt_jobs_kitchen_queue on mealdeck_private.receipt_jobs(tenant_id,location_id,created_at,id)
  where status<>'printed';
create table mealdeck_private.receipt_events(
  id uuid primary key default gen_random_uuid(),job_id uuid not null references mealdeck_private.receipt_jobs(id),
  actor_id uuid not null references auth.users(id),action text not null,detail jsonb not null default '{}',
  created_at timestamptz not null default now()
);
do $security$ declare t text; begin
  foreach t in array array['printer_access','receipt_jobs','receipt_events'] loop
    execute format('alter table mealdeck_private.%I enable row level security',t);
    execute format('revoke all on mealdeck_private.%I from public,anon,authenticated,service_role',t);
  end loop;
end $security$;

create function mealdeck_ops_private.kitchen_active_identity()
returns boolean language sql stable security definer set search_path='' as $$
  select exists(select 1 from auth.users u where u.id=auth.uid() and u.email_confirmed_at is not null
    and not coalesce(u.is_anonymous,false) and u.deleted_at is null
    and (u.banned_until is null or u.banned_until<=now()))
$$;
-- Also protects read-only KDS board calls after a staff account is disabled.
create or replace function mealdeck_ops_private.kds_assert_scope(p_tenant uuid,p_location uuid,p_permission text)
returns void language plpgsql stable security definer set search_path='' as $$
begin
  if auth.uid() is null then raise exception 'mealdeck_ops_unauthenticated'; end if;
  if not mealdeck_ops_private.kitchen_active_identity()
    or not mealdeck_ops_private.can(p_tenant,p_location,p_permission)
    or (p_permission='orders.status' and not mealdeck_ops_private.can(p_tenant,p_location,'orders.read'))
    or not exists(select 1 from public.tenant_locations l where l.id=p_location and l.tenant_id=p_tenant and l.active) then
    raise exception 'mealdeck_ops_forbidden';
  end if;
end $$;

-- Preserve the frozen projection and extend its version with the immutable
-- checkout/packing snapshot plus explicit acceptance. No published file changes.
alter function mealdeck_ops_private.kds_order_version(uuid,text) rename to kds_order_version_before_item_readiness;
alter function mealdeck_ops_private.kds_order_card(uuid,jsonb) rename to kds_order_card_before_item_readiness;
create function mealdeck_ops_private.kds_order_version(p_order uuid,p_release text)
returns text language sql stable security definer set search_path='' as $$
  select md5(jsonb_build_array(mealdeck_ops_private.kds_order_version_before_item_readiness(p_order,p_release),
    o.accepted_at,o.packing_plan,o.cutlery_requested,
    (select jsonb_agg(jsonb_build_array(i.id,i.checkout_line_id,i.parent_checkout_line_id,i.unit_price_pence,
      i.base_unit_price_pence) order by i.id) from public.order_items i where i.order_id=o.id))::text)
  from public.orders o where o.id=p_order
$$;
create function mealdeck_ops_private.kds_order_card(p_order uuid,p_evidence jsonb)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare card jsonb;o public.orders%rowtype;lines jsonb;items jsonb;
begin
  select * into o from public.orders where id=p_order;
  card:=mealdeck_ops_private.kds_order_card_before_item_readiness(p_order,p_evidence);
  select q.priced_lines into lines from mealdeck_private.stripe_orders s
    join mealdeck_private.checkout_quotes q on q.id=s.quote_id where s.order_id=p_order;
  select coalesce(jsonb_agg(x.value||jsonb_build_object(
    'checkout_line_id',i.checkout_line_id,'parent_checkout_line_id',i.parent_checkout_line_id,
    'base_unit_pence',i.base_unit_price_pence,'unit_pence',i.unit_price_pence,
    'brand_name',coalesce((select l->>'brand_name' from jsonb_array_elements(lines) l where l->>'lineId'=i.checkout_line_id),x.value->>'brand_name'),
    'modifier_details',i.modifiers,
    'bags',coalesce((select jsonb_agg(jsonb_build_object('number',b->'number','quantity',a->'quantity') order by (b->>'number')::integer)
      from jsonb_array_elements(o.packing_plan->'bags') b,jsonb_array_elements(b->'allocations') a
      where a->>'lineId'=i.checkout_line_id),'[]'::jsonb)) order by i.checkout_line_id,i.id),'[]'::jsonb)
    into items from jsonb_array_elements(card->'items') x(value)
      join public.order_items i on i.id=(x.value->>'order_item_id')::uuid and i.order_id=p_order;
  -- Canonical card items carry prices/bags; routed copies remain minimal and
  -- preserve the existing strict routing consistency contract.
  return card||jsonb_build_object('items',items,'tickets',coalesce((select jsonb_agg(t||jsonb_build_object('items',
      coalesce((select jsonb_agg(ti||jsonb_build_object('brand_name',ci->>'brand_name') order by ti->>'order_item_id')
      from jsonb_array_elements(t->'items') ti join jsonb_array_elements(items) ci
        on ci->>'order_item_id'=ti->>'order_item_id'),'[]'::jsonb)) order by t->>'ticket_id')
      from jsonb_array_elements(card->'tickets') t),'[]'::jsonb),'accepted_at',o.accepted_at,
    'cutlery_requested',o.cutlery_requested,'packing_plan',o.packing_plan,
    'vehicle',case when o.fulfilment='curbside' then o.vehicle else null end);
end $$;

create function mealdeck_ops_private.kitchen_lock_order(p_tenant uuid,p_location uuid,p_order uuid,p_completed boolean default false)
returns jsonb language plpgsql security definer set search_path='' as $$
declare o public.orders%rowtype;e jsonb;
begin
  perform mealdeck_ops_private.kds_assert_scope(p_tenant,p_location,'orders.status');
  perform 1 from auth.users where id=auth.uid() for share;
  perform 1 from public.mealdeck_ops_staff_access where user_id=auth.uid() and tenant_id=p_tenant for share;
  perform 1 from public.tenant_locations where tenant_id=p_tenant and id=p_location for share;
  select * into o from public.orders where id=p_order and tenant_id=p_tenant and location_id=p_location for update;
  if not found then raise exception 'mealdeck_kds_order_unavailable'; end if;
  perform 1 from mealdeck_private.stripe_orders where order_id=p_order for share;
  perform 1 from public.order_items where order_id=p_order order by id for share;
  perform 1 from public.menu_items m where exists(select 1 from public.order_items i
    where i.order_id=p_order and i.menu_item_id=m.id) order by m.id for update;
  perform 1 from public.menu_item_station_routes r where r.location_id=p_location and exists(
    select 1 from public.order_items i where i.order_id=p_order and i.menu_item_id=r.item_id)
    order by r.item_id,r.station_id for share;
  perform 1 from public.kitchen_stations s where s.location_id=p_location and exists(
    select 1 from public.kds_tickets t where t.order_id=p_order and t.station_id=s.id) order by s.id for share;
  perform 1 from public.kds_tickets where order_id=p_order order by id for update;
  perform 1 from public.kds_ticket_items where order_id=p_order order by id for update;
  perform 1 from public.mealdeck_pass_orders where order_id=p_order for update;
  perform mealdeck_ops_private.kds_assert_scope(p_tenant,p_location,'orders.status');
  e:=case when p_completed and o.status='fulfilled' then mealdeck_private.kds_release_authority(p_order)
    else mealdeck_ops_private.kds_release_evidence(p_order) end;
  if e is null or (p_completed and o.status='fulfilled' and e->'eligible' is distinct from 'true'::jsonb) then
    raise exception 'mealdeck_kds_release_required'; end if;
  if not mealdeck_ops_private.kds_routing_complete(p_order) then raise exception 'mealdeck_kds_routing_incomplete'; end if;
  perform mealdeck_ops_private.kds_assert_instructions(p_order);
  if exists(select 1 from public.mealdeck_pass_orders where order_id=p_order and
    (tenant_id<>p_tenant or location_id<>p_location or status='cancelled'
      or (status='handed_off' and not p_completed))) then raise exception 'mealdeck_kds_order_unavailable'; end if;
  return e;
end $$;

create function mealdeck_ops_private.receipt_snapshot(p_order uuid)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare o public.orders%rowtype;q mealdeck_private.checkout_quotes%rowtype;items jsonb;loc text;
begin
  select * into o from public.orders where id=p_order;
  select cq.* into q from mealdeck_private.checkout_quotes cq join mealdeck_private.stripe_orders s
    on s.quote_id=cq.id where s.order_id=p_order;
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

create function public.mealdeck_ops_kds_accept_order(p_tenant uuid,p_location uuid,p_order uuid,p_expected_version text)
returns jsonb language plpgsql security definer set search_path='' set lock_timeout='3s' as $$
declare e jsonb;o public.orders%rowtype;j uuid;
begin
  e:=mealdeck_ops_private.kitchen_lock_order(p_tenant,p_location,p_order);
  select * into o from public.orders where id=p_order;
  if o.accepted_at is not null then
    return jsonb_build_object('ok',true,'replayed',true,'order_id',p_order,'status','accepted'); end if;
  if mealdeck_ops_private.kds_order_version(p_order,e->>'release_id') is distinct from p_expected_version then
    raise exception 'mealdeck_kds_conflict'; end if;
  if o.status<>'accepted' or mealdeck_ops_private.kds_preparation_status(p_order)<>'queued' then
    raise exception 'mealdeck_kds_invalid_transition'; end if;
  update public.orders set accepted_at=now() where id=p_order;
  insert into mealdeck_private.receipt_jobs(order_id,tenant_id,location_id,copy_number,receipt)
    values(p_order,p_tenant,p_location,1,mealdeck_ops_private.receipt_snapshot(p_order))
    on conflict(order_id,copy_number) do nothing returning id into j;
  insert into public.mealdeck_ops_audit_log(tenant_id,location_id,actor_id,action,entity_type,entity_id,next_value)
    values(p_tenant,p_location,auth.uid(),'kds.order.accepted','order',p_order,jsonb_build_object('receiptJobId',j));
  return jsonb_build_object('ok',true,'replayed',false,'order_id',p_order,'status','accepted');
end $$;

create or replace function public.mealdeck_ops_kds_transition_order(
  p_tenant uuid,p_location uuid,p_order uuid,p_expected_version text,p_status text)
returns jsonb language plpgsql security definer set search_path='' set lock_timeout='3s' as $$
declare e jsonb;s text;a timestamptz;
begin
  e:=mealdeck_ops_private.kitchen_lock_order(p_tenant,p_location,p_order);
  select accepted_at into a from public.orders where id=p_order;
  if a is null then raise exception 'mealdeck_kds_accept_required'; end if;
  s:=mealdeck_ops_private.kds_preparation_status(p_order);
  if p_status='ready' then
    if s<>'ready' then raise exception 'mealdeck_kds_all_items_required'; end if;
    return jsonb_build_object('ok',true,'replayed',true,'order_id',p_order,'status','ready');
  end if;
  if p_status is distinct from 'preparing' then raise exception 'mealdeck_kds_invalid_transition'; end if;
  if s='preparing' then return jsonb_build_object('ok',true,'replayed',true,'order_id',p_order,'status','preparing'); end if;
  if s<>'queued' then raise exception 'mealdeck_kds_invalid_transition'; end if;
  if mealdeck_ops_private.kds_order_version(p_order,e->>'release_id') is distinct from p_expected_version then
    raise exception 'mealdeck_kds_conflict'; end if;
  update public.kds_ticket_items set status='preparing',started_at=coalesce(started_at,now()) where order_id=p_order;
  update public.kds_tickets set status='preparing',started_at=coalesce(started_at,now()) where order_id=p_order;
  update public.orders set status='preparing' where id=p_order;
  insert into public.mealdeck_ops_audit_log(tenant_id,location_id,actor_id,action,entity_type,entity_id)
    values(p_tenant,p_location,auth.uid(),'kds.order.preparing','order',p_order);
  return jsonb_build_object('ok',true,'replayed',false,'order_id',p_order,'status','preparing');
end $$;

create function public.mealdeck_ops_kds_set_item_ready(p_tenant uuid,p_location uuid,p_order uuid,
  p_item uuid,p_expected_version text,p_ready boolean)
returns jsonb language plpgsql security definer set search_path='' set lock_timeout='3s' as $$
declare e jsonb;previous boolean;s text;
begin
  e:=mealdeck_ops_private.kitchen_lock_order(p_tenant,p_location,p_order);
  if p_ready is null or not exists(select 1 from public.order_items where id=p_item and order_id=p_order) then
    raise exception 'mealdeck_kds_invalid_transition'; end if;
  if not exists(select 1 from public.orders where id=p_order and accepted_at is not null and status in ('preparing','ready')) then
    raise exception 'mealdeck_kds_start_required'; end if;
  if exists(select 1 from public.mealdeck_pass_orders where order_id=p_order
    and status not in ('waiting_for_kitchen','ready_to_pack')) then raise exception 'mealdeck_kds_packing_locked'; end if;
  select bool_and(status='ready') into previous from public.kds_ticket_items where order_id=p_order and order_item_id=p_item;
  if previous is not distinct from p_ready then
    return jsonb_build_object('ok',true,'replayed',true,'order_id',p_order,'status',mealdeck_ops_private.kds_preparation_status(p_order)); end if;
  if mealdeck_ops_private.kds_order_version(p_order,e->>'release_id') is distinct from p_expected_version then
    raise exception 'mealdeck_kds_conflict'; end if;
  update public.kds_ticket_items set status=case when p_ready then 'ready' else 'preparing' end,
    started_at=coalesce(started_at,now()),ready_at=case when p_ready then now() else null end
    where order_id=p_order and order_item_id=p_item;
  update public.kds_tickets t set status=case when not exists(select 1 from public.kds_ticket_items i
    where i.ticket_id=t.id and i.status<>'ready') then 'ready' else 'preparing' end,
    ready_at=case when not exists(select 1 from public.kds_ticket_items i
      where i.ticket_id=t.id and i.status<>'ready') then now() else null end where t.order_id=p_order;
  s:=mealdeck_ops_private.kds_preparation_status(p_order);
  update public.orders set status=s::public.order_status where id=p_order;
  insert into public.mealdeck_pass_orders(order_id,tenant_id,location_id,status,ready_to_pack_at,updated_by)
    values(p_order,p_tenant,p_location,case when s='ready' then 'ready_to_pack' else 'waiting_for_kitchen' end,
      case when s='ready' then now() else null end,auth.uid())
    on conflict(order_id) do update set status=excluded.status,ready_to_pack_at=excluded.ready_to_pack_at,
      updated_by=auth.uid(),updated_at=now();
  insert into public.mealdeck_ops_audit_log(tenant_id,location_id,actor_id,action,entity_type,entity_id,next_value)
    values(p_tenant,p_location,auth.uid(),'kds.item.readiness','order',p_order,jsonb_build_object('itemId',p_item,'ready',p_ready));
  return jsonb_build_object('ok',true,'replayed',false,'order_id',p_order,'status',s);
end $$;

create or replace function public.mealdeck_ops_kds_transition_pass(
  p_tenant uuid,p_location uuid,p_order uuid,p_expected_version text,p_status text)
returns jsonb language plpgsql security definer set search_path='' set lock_timeout='3s' as $$
declare e jsonb;p public.mealdeck_pass_orders%rowtype;v text;
begin
  e:=mealdeck_ops_private.kitchen_lock_order(p_tenant,p_location,p_order);
  if p_status is null or p_status not in ('packing','sealed') then raise exception 'mealdeck_kds_invalid_transition'; end if;
  if not exists(select 1 from public.orders where id=p_order and accepted_at is not null and status='ready')
    or mealdeck_ops_private.kds_preparation_status(p_order)<>'ready' then raise exception 'mealdeck_kds_all_items_required'; end if;
  select * into p from public.mealdeck_pass_orders where order_id=p_order;
  if p.status=p_status or (p.status='ready_for_handoff' and p_status='sealed') then
    return jsonb_build_object('ok',true,'replayed',true,'order_id',p_order,'status',p_status); end if;
  v:=md5(jsonb_build_array(p.order_id,p.status,p.updated_at,mealdeck_ops_private.kds_order_version(p_order,e->>'release_id'))::text);
  if v is distinct from p_expected_version then raise exception 'mealdeck_kds_conflict'; end if;
  if not ((p.status='ready_to_pack' and p_status='packing') or (p.status='packing' and p_status='sealed')) then
    raise exception 'mealdeck_kds_invalid_transition'; end if;
  update public.mealdeck_pass_orders set status=case when p_status='sealed' then 'ready_for_handoff' else 'packing' end,
    packing_started_at=coalesce(packing_started_at,now()),
    sealed_at=case when p_status='sealed' then now() else sealed_at end,
    ready_for_handoff_at=case when p_status='sealed' then now() else ready_for_handoff_at end,
    updated_by=auth.uid(),updated_at=now() where order_id=p_order;
  insert into public.mealdeck_ops_audit_log(tenant_id,location_id,actor_id,action,entity_type,entity_id)
    values(p_tenant,p_location,auth.uid(),'kds.pass.'||p_status,'order',p_order);
  return jsonb_build_object('ok',true,'replayed',false,'order_id',p_order,'status',p_status);
end $$;

create function public.mealdeck_ops_kds_complete_handoff(p_tenant uuid,p_location uuid,p_order uuid,
  p_expected_version text,p_code text)
returns jsonb language plpgsql security definer set search_path='' set lock_timeout='3s' as $$
declare e jsonb;o public.orders%rowtype;p public.mealdeck_pass_orders%rowtype;v text;
begin
  e:=mealdeck_ops_private.kitchen_lock_order(p_tenant,p_location,p_order,true);
  select * into o from public.orders where id=p_order;
  select * into p from public.mealdeck_pass_orders where order_id=p_order;
  if p_code is null or p_code !~ '^\d{4}$' or p_code is distinct from o.handoff_code then
    raise exception 'mealdeck_kds_handoff_code_required'; end if;
  if o.fulfilment not in ('pickup','curbside') or o.accepted_at is null
    or mealdeck_ops_private.kds_preparation_status(p_order)<>'ready' then raise exception 'mealdeck_kds_not_ready'; end if;
  if o.status='fulfilled' and p.status='handed_off' then
    return jsonb_build_object('ok',true,'replayed',true,'order_id',p_order,'status','completed'); end if;
  if p.status is distinct from 'ready_for_handoff' or o.status<>'ready' then raise exception 'mealdeck_kds_not_ready'; end if;
  v:=mealdeck_ops_private.kds_order_version(p_order,e->>'release_id');
  if v is distinct from p_expected_version then raise exception 'mealdeck_kds_conflict'; end if;
  update public.mealdeck_pass_orders set status='handed_off',handed_off_at=now(),updated_at=now(),updated_by=auth.uid() where order_id=p_order;
  update public.orders set status='fulfilled',handoff_code_reserved=false where id=p_order;
  insert into public.mealdeck_ops_audit_log(tenant_id,location_id,actor_id,action,entity_type,entity_id)
    values(p_tenant,p_location,auth.uid(),'kds.order.completed','order',p_order);
  return jsonb_build_object('ok',true,'replayed',false,'order_id',p_order,'status','completed');
end $$;

create function mealdeck_ops_private.printer_can_manage(p_tenant uuid,p_location uuid)
returns boolean language sql stable security definer set search_path='' as $$
  select mealdeck_ops_private.kitchen_active_identity()
    and mealdeck_ops_private.can(p_tenant,null,'staff.manage')
    and exists(select 1 from public.mealdeck_ops_staff_access a where a.user_id=auth.uid()
      and a.tenant_id=p_tenant and a.enabled and a.role in ('owner','admin') and a.location_id is null)
    and exists(select 1 from public.tenant_locations l where l.tenant_id=p_tenant and l.id=p_location and l.active)
$$;
create function mealdeck_ops_private.printer_assert_scope(p_tenant uuid,p_location uuid)
returns void language plpgsql stable security definer set search_path='' as $$
begin
  if auth.uid() is null then raise exception 'mealdeck_ops_unauthenticated'; end if;
  if not mealdeck_ops_private.kitchen_active_identity()
    or not exists(select 1 from public.tenant_locations l where l.tenant_id=p_tenant and l.id=p_location and l.active)
    or not (mealdeck_ops_private.printer_can_manage(p_tenant,p_location) or exists(
      select 1 from mealdeck_private.printer_access a where a.tenant_id=p_tenant and a.location_id=p_location
        and a.user_id=auth.uid() and a.enabled)) then raise exception 'mealdeck_ops_forbidden'; end if;
end $$;
create function public.mealdeck_printer_my_access()
returns jsonb language plpgsql stable security definer set search_path='' as $$
begin
  if auth.uid() is null then raise exception 'mealdeck_ops_unauthenticated'; end if;
  if not mealdeck_ops_private.kitchen_active_identity() then raise exception 'mealdeck_ops_forbidden'; end if;
  return jsonb_build_object('schemaVersion',1,'scopes',coalesce((select jsonb_agg(jsonb_build_object(
    'tenantId',l.tenant_id,'locationId',l.id,'locationName',l.name,'tenantName',t.name,
    'canManage',mealdeck_ops_private.printer_can_manage(l.tenant_id,l.id)) order by t.name,l.name)
    from public.tenant_locations l join public.tenants t on t.id=l.tenant_id where l.active and (
      mealdeck_ops_private.printer_can_manage(l.tenant_id,l.id) or exists(select 1 from mealdeck_private.printer_access a
        where a.user_id=auth.uid() and a.tenant_id=l.tenant_id and a.location_id=l.id and a.enabled))),'[]'::jsonb));
end $$;
create function public.mealdeck_printer_assign_access(p_tenant uuid,p_location uuid,p_email text,p_enabled boolean)
returns jsonb language plpgsql security definer set search_path='' set lock_timeout='3s' as $$
declare u uuid;
begin
  if not mealdeck_ops_private.printer_can_manage(p_tenant,p_location) then raise exception 'mealdeck_ops_forbidden'; end if;
  if p_email is null or length(p_email)>254 or p_enabled is null then raise exception 'mealdeck_printer_invalid_request'; end if;
  select id into u from auth.users where lower(email)=lower(trim(p_email)) and email_confirmed_at is not null
    and not coalesce(is_anonymous,false) and deleted_at is null and (banned_until is null or banned_until<=now()) for share;
  if u is null then raise exception 'mealdeck_printer_verified_account_required'; end if;
  if u=auth.uid() then raise exception 'mealdeck_printer_self_assignment'; end if;
  insert into mealdeck_private.printer_access(tenant_id,location_id,user_id,enabled,created_by)
    values(p_tenant,p_location,u,p_enabled,auth.uid()) on conflict(tenant_id,location_id,user_id)
    do update set enabled=excluded.enabled,updated_at=now();
  insert into public.mealdeck_ops_audit_log(tenant_id,location_id,actor_id,action,entity_type,entity_id,next_value)
    values(p_tenant,p_location,auth.uid(),'printer.access','staff',u,jsonb_build_object('enabled',p_enabled));
  return jsonb_build_object('ok',true,'userId',u,'enabled',p_enabled);
end $$;
create function public.mealdeck_printer_access_list(p_tenant uuid,p_location uuid)
returns jsonb language plpgsql stable security definer set search_path='' as $$
begin
  if not mealdeck_ops_private.printer_can_manage(p_tenant,p_location) then raise exception 'mealdeck_ops_forbidden'; end if;
  return coalesce((select jsonb_agg(jsonb_build_object('userId',a.user_id,'email',u.email,'enabled',a.enabled)
    order by u.email) from mealdeck_private.printer_access a join auth.users u on u.id=a.user_id
    where a.tenant_id=p_tenant and a.location_id=p_location),'[]'::jsonb);
end $$;

create function mealdeck_ops_private.printer_lock_job(p_tenant uuid,p_location uuid,p_job uuid)
returns mealdeck_private.receipt_jobs language plpgsql security definer set search_path='' as $$
declare j mealdeck_private.receipt_jobs;o uuid;e jsonb;
begin
  perform mealdeck_ops_private.printer_assert_scope(p_tenant,p_location);
  perform 1 from auth.users where id=auth.uid() for share;
  perform 1 from mealdeck_private.printer_access where user_id=auth.uid() and tenant_id=p_tenant and location_id=p_location for share;
  perform 1 from public.mealdeck_ops_staff_access where user_id=auth.uid() and tenant_id=p_tenant for share;
  perform 1 from public.tenant_locations where tenant_id=p_tenant and id=p_location for share;
  select order_id into o from mealdeck_private.receipt_jobs where id=p_job and tenant_id=p_tenant and location_id=p_location;
  if o is null then raise exception 'mealdeck_printer_job_unavailable'; end if;
  perform 1 from public.orders where id=o for update;
  perform 1 from mealdeck_private.stripe_orders where order_id=o for share;
  select * into j from mealdeck_private.receipt_jobs where id=p_job for update;
  perform mealdeck_ops_private.printer_assert_scope(p_tenant,p_location);
  e:=mealdeck_private.kds_release_authority(o);
  if e is null or e->'eligible' is distinct from 'true'::jsonb
    or not exists(select 1 from public.orders where id=o and accepted_at is not null
      and tenant_id=p_tenant and location_id=p_location and status in ('accepted','preparing','ready','fulfilled')) then
    raise exception 'mealdeck_printer_verified_acceptance_required'; end if;
  return j;
end $$;
create function mealdeck_ops_private.printer_job_card(p_job uuid)
returns jsonb language sql stable security definer set search_path='' as $$
  select jsonb_build_object('jobId',j.id,'orderId',j.order_id,'copyNumber',j.copy_number,
    'status',j.status,'createdAt',j.created_at,'updatedAt',j.updated_at,'resolution',j.resolution,
    'receipt',j.receipt) from mealdeck_private.receipt_jobs j where j.id=p_job
$$;

create function public.mealdeck_printer_board(p_tenant uuid,p_location uuid)
returns jsonb language plpgsql security definer set search_path='' set lock_timeout='3s' as $$
begin
  perform mealdeck_ops_private.printer_assert_scope(p_tenant,p_location);
  -- A lost or expired terminal claim is never automatically sent again. The
  -- operator must inspect paper/bridge status and resolve it explicitly.
  update mealdeck_private.receipt_jobs set status='held',updated_at=now(),resolution='Terminal interrupted; inspect printer before another copy.'
    where tenant_id=p_tenant and location_id=p_location and status in ('claimed','sending') and claim_expires_at<=now();
  return jsonb_build_object('schemaVersion',1,'tenantId',p_tenant,'locationId',p_location,'generatedAt',now(),
    'jobs',coalesce((select jsonb_agg(mealdeck_ops_private.printer_job_card(q.id) order by q.priority,q.created_at,q.id)
      from (select j.id,j.created_at,case j.status when 'queued' then 0 when 'claimed' then 1 when 'sending' then 1
          when 'held' then 2 when 'sent_unconfirmed' then 3 when 'failed' then 4 else 5 end as priority
        from mealdeck_private.receipt_jobs j join public.orders o on o.id=j.order_id
        where j.tenant_id=p_tenant and j.location_id=p_location and o.accepted_at is not null
          and o.status in ('accepted','preparing','ready','fulfilled')
          and mealdeck_private.kds_release_authority(o.id)->'eligible'='true'::jsonb
          and (j.status<>'printed' or j.updated_at>now()-interval '12 hours')
          and not exists(select 1 from mealdeck_private.receipt_jobs newer where newer.order_id=j.order_id and newer.copy_number>j.copy_number)
        order by priority,j.created_at,j.id limit 100) q),'[]'::jsonb));
end $$;
create function public.mealdeck_printer_claim_job(p_tenant uuid,p_location uuid,p_job uuid,p_terminal uuid)
returns jsonb language plpgsql security definer set search_path='' set lock_timeout='3s' as $$
declare j mealdeck_private.receipt_jobs;token uuid;
begin
  if p_terminal is null then raise exception 'mealdeck_printer_invalid_request'; end if;
  j:=mealdeck_ops_private.printer_lock_job(p_tenant,p_location,p_job);
  if j.status='claimed' and j.claimed_by=auth.uid() and j.terminal_id=p_terminal and j.claim_expires_at>now() then
    return mealdeck_ops_private.printer_job_card(j.id)||jsonb_build_object('claimToken',j.claim_token,'replayed',true); end if;
  if j.status<>'queued' then raise exception 'mealdeck_printer_job_claimed'; end if;
  token:=gen_random_uuid();
  update mealdeck_private.receipt_jobs set status='claimed',claimed_by=auth.uid(),terminal_id=p_terminal,
    claim_token=token,claim_expires_at=now()+interval '2 minutes',updated_at=now() where id=p_job;
  insert into mealdeck_private.receipt_events(job_id,actor_id,action) values(p_job,auth.uid(),'claimed');
  return mealdeck_ops_private.printer_job_card(p_job)||jsonb_build_object('claimToken',token,'replayed',false);
end $$;
create function public.mealdeck_printer_begin_send(p_tenant uuid,p_location uuid,p_job uuid,p_claim uuid)
returns jsonb language plpgsql security definer set search_path='' set lock_timeout='3s' as $$
declare j mealdeck_private.receipt_jobs;
begin
  j:=mealdeck_ops_private.printer_lock_job(p_tenant,p_location,p_job);
  if j.claim_token is distinct from p_claim or p_claim is null or j.claimed_by<>auth.uid()
    or j.claim_expires_at<=now() then raise exception 'mealdeck_printer_claim_expired'; end if;
  if j.status in ('sending','sent_unconfirmed') then
    return jsonb_build_object('ok',true,'replayed',true,'status',j.status); end if;
  if j.status<>'claimed' then raise exception 'mealdeck_printer_invalid_transition'; end if;
  update mealdeck_private.receipt_jobs set status='sending',send_started_at=now(),updated_at=now() where id=p_job;
  insert into mealdeck_private.receipt_events(job_id,actor_id,action) values(p_job,auth.uid(),'sending');
  return jsonb_build_object('ok',true,'replayed',false,'status','sending');
end $$;
create function public.mealdeck_printer_send_result(p_tenant uuid,p_location uuid,p_job uuid,p_claim uuid,p_outcome text)
returns jsonb language plpgsql security definer set search_path='' set lock_timeout='3s' as $$
declare j mealdeck_private.receipt_jobs;s text;
begin
  j:=mealdeck_ops_private.printer_lock_job(p_tenant,p_location,p_job);
  if p_claim is null or j.claim_token is distinct from p_claim or j.claimed_by<>auth.uid()
    or p_outcome is null or p_outcome not in ('sent_unconfirmed','held') then raise exception 'mealdeck_printer_invalid_request'; end if;
  if j.status=p_outcome then return jsonb_build_object('ok',true,'replayed',true,'status',j.status); end if;
  if j.status not in ('sending','claimed') then raise exception 'mealdeck_printer_invalid_transition'; end if;
  s:=case when p_outcome='sent_unconfirmed' and j.status='sending' then 'sent_unconfirmed' else 'held' end;
  update mealdeck_private.receipt_jobs set status=s,updated_at=now(),resolution=case when s='held'
    then 'Delivery uncertain; inspect the printer. This job will not resend.' else 'Check the paper receipt and confirm.' end where id=p_job;
  insert into mealdeck_private.receipt_events(job_id,actor_id,action) values(p_job,auth.uid(),s);
  return jsonb_build_object('ok',true,'replayed',false,'status',s);
end $$;
create function public.mealdeck_printer_confirm_paper(p_tenant uuid,p_location uuid,p_job uuid,p_outcome text,p_reason text)
returns jsonb language plpgsql security definer set search_path='' set lock_timeout='3s' as $$
declare j mealdeck_private.receipt_jobs;s text;
begin
  j:=mealdeck_ops_private.printer_lock_job(p_tenant,p_location,p_job);
  if p_outcome is null or p_outcome not in ('printed','not_printed') or p_reason is null
    or length(trim(p_reason)) not between 5 and 300 then raise exception 'mealdeck_printer_inspection_required'; end if;
  s:=case when p_outcome='printed' then 'printed' else 'failed' end;
  if j.status=s then return jsonb_build_object('ok',true,'replayed',true,'status',s); end if;
  if j.status not in ('sending','sent_unconfirmed','held') then raise exception 'mealdeck_printer_invalid_transition'; end if;
  update mealdeck_private.receipt_jobs set status=s,updated_at=now(),confirmed_at=now(),resolved_by=auth.uid(),resolution=trim(p_reason) where id=p_job;
  insert into mealdeck_private.receipt_events(job_id,actor_id,action,detail)
    values(p_job,auth.uid(),'paper.'||p_outcome,jsonb_build_object('reason',trim(p_reason)));
  return jsonb_build_object('ok',true,'replayed',false,'status',s);
end $$;
alter table mealdeck_private.receipt_jobs add column request_id uuid unique;
create function public.mealdeck_printer_reprint(p_tenant uuid,p_location uuid,p_job uuid,p_reason text,p_request uuid)
returns jsonb language plpgsql security definer set search_path='' set lock_timeout='3s' as $$
declare j mealdeck_private.receipt_jobs;n integer;next_id uuid;receipt jsonb;
begin
  j:=mealdeck_ops_private.printer_lock_job(p_tenant,p_location,p_job);
  if p_request is null or p_reason is null or length(trim(p_reason)) not between 5 and 300 then
    raise exception 'mealdeck_printer_inspection_required'; end if;
  select id into next_id from mealdeck_private.receipt_jobs where request_id=p_request and order_id=j.order_id
    and tenant_id=p_tenant and location_id=p_location;
  if next_id is not null then return mealdeck_ops_private.printer_job_card(next_id); end if;
  if j.status not in ('printed','failed') or exists(select 1 from mealdeck_private.receipt_jobs x
    where x.order_id=j.order_id and x.copy_number>j.copy_number) then raise exception 'mealdeck_printer_inspection_required'; end if;
  n:=j.copy_number+1;
  if n>100 then raise exception 'mealdeck_printer_copy_limit'; end if;
  receipt:=j.receipt||jsonb_build_object('copyNumber',n,'reprintOf',j.id,'reprintReason',trim(p_reason));
  insert into mealdeck_private.receipt_jobs(order_id,tenant_id,location_id,copy_number,reprint_of,reprint_reason,receipt,request_id)
    values(j.order_id,p_tenant,p_location,n,j.id,trim(p_reason),receipt,p_request) returning id into next_id;
  insert into mealdeck_private.receipt_events(job_id,actor_id,action,detail)
    values(next_id,auth.uid(),'copy.requested',jsonb_build_object('previousJobId',j.id,'reason',trim(p_reason)));
  return mealdeck_ops_private.printer_job_card(next_id);
end $$;

-- The local hardware adapter verifies this endpoint using the current printer
-- user's JWT. It prints this canonical snapshot, never a browser-edited payload.
create function public.mealdeck_printer_claim_receipt(p_job uuid,p_claim uuid)
returns jsonb language plpgsql security definer set search_path='' set lock_timeout='3s' as $$
declare tenant uuid;location uuid;j mealdeck_private.receipt_jobs;
begin
  select tenant_id,location_id into tenant,location from mealdeck_private.receipt_jobs where id=p_job;
  if tenant is null then raise exception 'mealdeck_printer_job_unavailable'; end if;
  j:=mealdeck_ops_private.printer_lock_job(tenant,location,p_job);
  if p_claim is null or j.claim_token is distinct from p_claim or j.claimed_by is distinct from auth.uid()
    or j.status<>'sending' or j.claim_expires_at<=now() then raise exception 'mealdeck_printer_claim_expired'; end if;
  return jsonb_build_object('jobId',j.id,'receipt',j.receipt);
end $$;

-- Named RPCs only. Printer assignments grant no staff row, KDS capability,
-- catalogue authority, customer lookup, payment mutation or finance permission.
do $acl$ declare p record; begin
  for p in select n.nspname,pr.proname,pg_get_function_identity_arguments(pr.oid) as args
    from pg_proc pr join pg_namespace n on n.oid=pr.pronamespace
    where (n.nspname='mealdeck_ops_private' and (pr.proname like 'printer_%' or pr.proname like 'kitchen_%'
      or pr.proname like 'receipt_%' or pr.proname like 'kds_%'))
      or (n.nspname='public' and (pr.proname like 'mealdeck_printer_%' or pr.proname like 'mealdeck_ops_kds_%')) loop
    execute format('revoke all on function %I.%I(%s) from public,anon,authenticated,service_role',p.nspname,p.proname,p.args);
    if p.nspname='public' then execute format('grant execute on function %I.%I(%s) to authenticated',p.nspname,p.proname,p.args); end if;
  end loop;
end $acl$;
commit;
