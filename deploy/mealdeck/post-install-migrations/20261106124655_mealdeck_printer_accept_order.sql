-- Generated with Supabase CLI: mealdeck_printer_accept_order.
-- Assigned printer users may explicitly accept a verified paid order into the
-- same canonical copy-1 receipt queue as KDS. This never claims or sends a job.
begin;
set local lock_timeout='5s';
set local statement_timeout='30s';
set local check_function_bodies=on;

do $guard$
begin
  if to_regnamespace('dishbee_private') is not null
    or to_regclass('mealdeck_private.installation') is null then
    raise exception 'mealdeck_printer_accept_independent_profile_required'; end if;
  if current_user in ('anon','authenticated','service_role') or not exists(
    select 1 from pg_class c where c.oid='mealdeck_private.installation'::regclass
      and pg_has_role(current_user,c.relowner,'USAGE')) then
    raise exception 'mealdeck_printer_accept_database_owner_required'; end if;
  if not exists(select 1 from mealdeck_private.installation where singleton
      and profile='mealdeck-independent-v1' and business_id is not null)
    or to_regclass('mealdeck_private.receipt_jobs') is null
    or to_regprocedure('mealdeck_ops_private.printer_assert_scope(uuid,uuid)') is null
    or to_regprocedure('mealdeck_ops_private.kitchen_lock_order(uuid,uuid,uuid,boolean)') is null
    or to_regprocedure('mealdeck_ops_private.receipt_snapshot(uuid)') is null
    or to_regprocedure('public.mealdeck_ops_kds_accept_order(uuid,uuid,uuid,text)') is null then
    raise exception 'mealdeck_printer_accept_previous_extensions_required'; end if;
end $guard$;

-- Both authorization wrappers use this identical lock order. The caller must
-- assert its own existing permission before and after waiting for these locks.
-- No API role can execute this helper directly.
create or replace function mealdeck_ops_private.kitchen_lock_order_rows(
  p_tenant uuid,p_location uuid,p_order uuid
) returns void language plpgsql security definer set search_path='' as $$
begin
  perform 1 from auth.users where id=auth.uid() for share;
  perform 1 from public.mealdeck_ops_staff_access where user_id=auth.uid() and tenant_id=p_tenant for share;
  perform 1 from public.tenant_locations where tenant_id=p_tenant and id=p_location for share;
  perform 1 from public.orders where id=p_order and tenant_id=p_tenant and location_id=p_location for update;
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
end $$;

create or replace function mealdeck_ops_private.kitchen_locked_order_evidence(
  p_tenant uuid,p_location uuid,p_order uuid,p_completed boolean default false
) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare o public.orders%rowtype;e jsonb;
begin
  select * into o from public.orders where id=p_order and tenant_id=p_tenant and location_id=p_location;
  if not found then raise exception 'mealdeck_kds_order_unavailable'; end if;
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

-- Retain the existing KDS-only permission boundary for every KDS transition.
create or replace function mealdeck_ops_private.kitchen_lock_order(
  p_tenant uuid,p_location uuid,p_order uuid,p_completed boolean default false
) returns jsonb language plpgsql security definer set search_path='' as $$
begin
  perform mealdeck_ops_private.kds_assert_scope(p_tenant,p_location,'orders.status');
  perform mealdeck_ops_private.kitchen_lock_order_rows(p_tenant,p_location,p_order);
  perform mealdeck_ops_private.kds_assert_scope(p_tenant,p_location,'orders.status');
  return mealdeck_ops_private.kitchen_locked_order_evidence(p_tenant,p_location,p_order,p_completed);
end $$;

-- One acceptance implementation, called only with the master order locked and
-- the wrapper's actual caller reauthorized. Re-read canonical evidence even on
-- replay; an accepted timestamp alone never authorizes a refunded/held order.
create or replace function mealdeck_ops_private.kitchen_accept_locked_order(
  p_tenant uuid,p_location uuid,p_order uuid,p_expected_version text
) returns jsonb language plpgsql security definer set search_path='' as $$
declare e jsonb;o public.orders%rowtype;j uuid;
begin
  e:=mealdeck_ops_private.kitchen_locked_order_evidence(p_tenant,p_location,p_order,false);
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

create or replace function public.mealdeck_ops_kds_accept_order(
  p_tenant uuid,p_location uuid,p_order uuid,p_expected_version text
) returns jsonb language plpgsql security definer set search_path='' set lock_timeout='3s' as $$
begin
  perform mealdeck_ops_private.kitchen_lock_order(p_tenant,p_location,p_order);
  return mealdeck_ops_private.kitchen_accept_locked_order(p_tenant,p_location,p_order,p_expected_version);
end $$;

create or replace function public.mealdeck_printer_acceptance_board(p_tenant uuid,p_location uuid)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare o record;e jsonb;card jsonb;items jsonb;cards jsonb:='[]'::jsonb;remaining integer:=0;
begin
  perform mealdeck_ops_private.printer_assert_scope(p_tenant,p_location);
  if not mealdeck_ops_private.kds_authority_ready() then raise exception 'mealdeck_kds_release_required'; end if;
  for o in select x.id,x.paid_at,x.total_pence from public.orders x
    where x.tenant_id=p_tenant and x.location_id=p_location and x.source='mealdeck'
      and x.status='accepted' and x.accepted_at is null and x.payment_status='paid'
      and x.fulfilment in ('pickup','curbside')
      and x.paid_at is not null and x.paid_at<=now()
      and not exists(select 1 from public.mealdeck_pass_orders p
        where p.order_id=x.id and p.status in ('handed_off','cancelled'))
    order by x.paid_at,x.id
  loop
    e:=mealdeck_ops_private.kds_release_evidence(o.id);
    if e is null or not mealdeck_ops_private.kds_routing_complete(o.id)
      or mealdeck_ops_private.kds_preparation_status(o.id)<>'queued' then continue; end if;
    perform mealdeck_ops_private.kds_assert_instructions(o.id);
    if jsonb_array_length(cards)>=100 then remaining:=remaining+1;continue;end if;
    card:=mealdeck_ops_private.kds_order_card(o.id,e);
    -- Reuse the canonical purchased-line projection, not a pre-accept receipt.
    select coalesce(jsonb_agg(jsonb_build_object(
      'lineId',i->'checkout_line_id','parentLineId',i->'parent_checkout_line_id',
      'name',i->'item_name','brandName',i->'brand_name','quantity',i->'quantity',
      'unitPence',i->'unit_pence','modifiers',i->'modifiers','notes',i->'notes','bags',i->'bags'
    ) order by i->>'checkout_line_id'),'[]'::jsonb) into items from jsonb_array_elements(card->'items') i;
    cards:=cards||jsonb_build_array(jsonb_build_object(
      'orderId',o.id,'version',card->'version','displayCode',card->'display_code',
      'paidAt',o.paid_at,'fulfilment',card->'fulfilment','totalPence',o.total_pence,
      'cutleryRequested',card->'cutlery_requested','notes',card->'notes',
      'packingPlan',card->'packing_plan','items',items));
  end loop;
  return jsonb_build_object('schemaVersion',1,'tenantId',p_tenant,'locationId',p_location,
    'generatedAt',now(),'orders',cards,'remainingOrderCount',remaining);
end $$;

create or replace function public.mealdeck_printer_accept_order(
  p_tenant uuid,p_location uuid,p_order uuid,p_expected_version text
) returns jsonb language plpgsql security definer set search_path='' set lock_timeout='3s' as $$
declare result jsonb;j uuid;
begin
  perform mealdeck_ops_private.printer_assert_scope(p_tenant,p_location);
  -- Keep the same identity/assignment/staff/location/order lock sequence as
  -- existing printer claims, so disabling an account cannot race acceptance.
  perform 1 from auth.users where id=auth.uid() for share;
  perform 1 from mealdeck_private.printer_access where user_id=auth.uid()
    and tenant_id=p_tenant and location_id=p_location for share;
  perform mealdeck_ops_private.kitchen_lock_order_rows(p_tenant,p_location,p_order);
  perform mealdeck_ops_private.printer_assert_scope(p_tenant,p_location);
  result:=mealdeck_ops_private.kitchen_accept_locked_order(p_tenant,p_location,p_order,p_expected_version);
  select id into j from mealdeck_private.receipt_jobs
    where order_id=p_order and tenant_id=p_tenant and location_id=p_location and copy_number=1;
  if j is null then raise exception 'mealdeck_printer_receipt_unavailable'; end if;
  return jsonb_build_object('schemaVersion',1,'orderId',p_order,'accepted',true,
    'replayed',result->'replayed','receiptJobId',j);
end $$;

revoke all on function mealdeck_ops_private.kitchen_lock_order_rows(uuid,uuid,uuid),
  mealdeck_ops_private.kitchen_locked_order_evidence(uuid,uuid,uuid,boolean),
  mealdeck_ops_private.kitchen_accept_locked_order(uuid,uuid,uuid,text)
  from public,anon,authenticated,service_role;
revoke all on function public.mealdeck_printer_acceptance_board(uuid,uuid),
  public.mealdeck_printer_accept_order(uuid,uuid,uuid,text)
  from public,anon,authenticated,service_role;
grant execute on function public.mealdeck_printer_acceptance_board(uuid,uuid),
  public.mealdeck_printer_accept_order(uuid,uuid,uuid,text) to authenticated;
comment on function public.mealdeck_printer_accept_order(uuid,uuid,uuid,text) is
  'Explicit scoped printer acceptance of a verified paid order; queues the same canonical copy-1 receipt as KDS, without sending it.';
notify pgrst,'reload schema';
commit;
