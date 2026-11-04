-- MealDeck shared-kitchen workspace. Additive APIs over canonical Dishbee
-- orders/tickets/pass; this does NOT create, release, pay, refund or dispatch an
-- order. Apply after Dishbee's canonical migration chain and MealDeck ops core.
--
-- The paid flag in the current Dishbee source is insufficient proof of an
-- immutable verified release. This workspace is therefore BLOCKED until the
-- approved Dishbee backend implements the owner-only STABLE jsonb adapter:
--   dishbee_private.mealdeck_kds_release_authority(uuid)
-- Expected response (all identities must match the canonical order):
-- {"schema_version":1,"order_id":"uuid","tenant_id":"uuid",
--  "location_id":"uuid","source":"mealdeck","release_id":"uuid",
--  "verified_at":"ISO timestamp","eligible":true}
-- The adapter must read canonical immutable payment/release evidence, account
-- for refunds/revocation and every required group share, and perform no writes.
-- It MUST NOT infer eligibility from paid_at, a browser flag or this KDS audit.
-- This migration deliberately does not supply a pretend adapter or grant a
-- browser/service role permission to execute it. A disposable test adapter is
-- not production implementation. No hosted schema change has been made here.

begin;

create function mealdeck_ops_private.kds_assert_scope(
  p_tenant uuid,p_location uuid,p_permission text
) returns void language plpgsql stable security definer set search_path='' as $$
begin
  if auth.uid() is null
    or not mealdeck_ops_private.can(p_tenant,p_location,p_permission)
    or (p_permission='orders.status'
      and not mealdeck_ops_private.can(p_tenant,p_location,'orders.read'))
    or not exists(select 1 from public.tenant_locations l
      where l.id=p_location and l.tenant_id=p_tenant and l.active) then
    raise exception using errcode='42501',message='mealdeck_ops_forbidden';
  end if;
end $$;

create function mealdeck_ops_private.kds_authority_ready()
returns boolean language sql stable security definer set search_path='' as $$
  select coalesce(exists(
    select 1 from pg_catalog.pg_proc p
    where p.oid=pg_catalog.to_regprocedure(
      'dishbee_private.mealdeck_kds_release_authority(uuid)')
      and p.prorettype='jsonb'::pg_catalog.regtype
      and p.provolatile='s'
      and not pg_catalog.has_function_privilege('anon',p.oid,'EXECUTE')
      and not pg_catalog.has_function_privilege('authenticated',p.oid,'EXECUTE')
      and not pg_catalog.has_function_privilege('service_role',p.oid,'EXECUTE')
  ),false)
$$;

create function mealdeck_ops_private.kds_release_evidence(p_order uuid)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare o public.orders%rowtype; e jsonb; verified timestamptz;
begin
  if not mealdeck_ops_private.kds_authority_ready() then return null; end if;
  select * into o from public.orders where id=p_order;
  if not found or o.source is distinct from 'mealdeck'
    or o.status not in ('accepted','preparing','ready')
    or o.payment_status is distinct from 'paid' or o.paid_at is null
    or o.paid_at>now() then return null; end if;
  if o.group_order_room_id is not null and (
    not exists(select 1 from public.group_order_rooms r
      where r.id=o.group_order_room_id and r.tenant_id=o.tenant_id
        and r.location_id=o.location_id and r.master_order_id=o.id
        and r.status='submitted')
    or public.group_order_financial_ready(o.group_order_room_id) is not true
  ) then return null; end if;

  -- The identifier is a literal, never caller input or a search_path lookup.
  execute 'select dishbee_private.mealdeck_kds_release_authority($1)'
    into e using p_order;
  if jsonb_typeof(e) is distinct from 'object'
    or e->'schema_version' is distinct from '1'::jsonb
    or e->'eligible' is distinct from 'true'::jsonb
    or e->'order_id' is distinct from to_jsonb(o.id::text)
    or e->'tenant_id' is distinct from to_jsonb(o.tenant_id::text)
    or e->'location_id' is distinct from to_jsonb(o.location_id::text)
    or e->'source' is distinct from '"mealdeck"'::jsonb
    or jsonb_typeof(e->'release_id') is distinct from 'string'
    or coalesce(e->>'release_id','') !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    or jsonb_typeof(e->'verified_at') is distinct from 'string'
    or coalesce(e->>'verified_at','') !~ '^\d{4}-\d{2}-\d{2}T' then return null; end if;
  verified:=(e->>'verified_at')::timestamptz;
  if not isfinite(verified) or verified<o.created_at or verified>now() then return null; end if;
  return jsonb_build_object('release_id',e->>'release_id','verified_at',verified);
exception when others then
  -- An unavailable/corrupt authority must never turn into a kitchen approval.
  return null;
end $$;

create function mealdeck_ops_private.kds_routing_complete(p_order uuid)
returns boolean language sql stable security definer set search_path='' as $$
  select coalesce(exists(
    select 1 from public.orders o where o.id=p_order
    and exists(select 1 from public.order_items i where i.order_id=o.id)
    and exists(select 1 from public.kds_tickets t where t.order_id=o.id)
    -- Every purchased line must have at least one valid configured route.
    and not exists(
      select 1 from public.order_items i where i.order_id=o.id and (
        i.tenant_id<>o.tenant_id or i.quantity<=0
        or not exists(select 1 from public.menu_items m
          where m.id=i.menu_item_id and m.tenant_id=o.tenant_id)
        or (i.brand_id is not null and not exists(select 1 from public.tenant_brands b
          where b.id=i.brand_id and b.tenant_id=o.tenant_id))
        or not exists(select 1 from public.menu_item_station_routes r
          join public.kitchen_stations s on s.id=r.station_id
          where r.item_id=i.menu_item_id and r.location_id=o.location_id
            and r.tenant_id=o.tenant_id and s.tenant_id=o.tenant_id
            and s.location_id=o.location_id and s.active)
      )
    )
    -- Every required route needs a canonical released ticket and full quantity.
    and not exists(
      select 1 from public.order_items i
      join public.menu_item_station_routes r
        on r.item_id=i.menu_item_id and r.location_id=o.location_id
      where i.order_id=o.id and (
        r.tenant_id<>o.tenant_id or not exists(
          select 1 from public.kds_tickets t
          join public.kitchen_stations s on s.id=t.station_id
          join public.kds_ticket_items ti on ti.ticket_id=t.id
          where t.order_id=o.id and t.station_id=r.station_id
            and t.tenant_id=o.tenant_id and s.tenant_id=o.tenant_id
            and s.location_id=o.location_id and s.active
            and ti.order_item_id=i.id and ti.station_id=t.station_id
            and ti.tenant_id=o.tenant_id and ti.quantity=i.quantity
        )
      )
    )
    -- No empty, foreign, inactive or malformed ticket can count as ready.
    and not exists(
      select 1 from public.kds_tickets t where t.order_id=o.id and (
        t.tenant_id<>o.tenant_id or t.status not in ('queued','preparing','ready')
        or not exists(select 1 from public.kitchen_stations s
          where s.id=t.station_id and s.tenant_id=o.tenant_id
            and s.location_id=o.location_id and s.active)
        or not exists(select 1 from public.kds_ticket_items ti where ti.ticket_id=t.id)
      )
    )
    and not exists(
      select 1 from public.kds_tickets t
      join public.kds_ticket_items ti on ti.ticket_id=t.id
      where t.order_id=o.id and (
        ti.tenant_id<>o.tenant_id or ti.station_id<>t.station_id
        or ti.status not in ('queued','preparing','ready')
        or not exists(select 1 from public.order_items i
          join public.menu_item_station_routes r
            on r.item_id=i.menu_item_id and r.location_id=o.location_id
          where i.id=ti.order_item_id and i.order_id=o.id
            and i.tenant_id=o.tenant_id and i.quantity=ti.quantity
            and r.station_id=t.station_id and r.tenant_id=o.tenant_id)
      )
    )
  ),false)
$$;

create function mealdeck_ops_private.kds_preparation_status(p_order uuid)
returns text language sql stable security definer set search_path='' as $$
  select case
    when mealdeck_ops_private.kds_routing_complete(p_order)
      and not exists(select 1 from public.kds_tickets t
        where t.order_id=p_order and t.status<>'ready')
      and not exists(select 1 from public.kds_ticket_items ti
        join public.kds_tickets t on t.id=ti.ticket_id
        where t.order_id=p_order and ti.status<>'ready') then 'ready'
    when exists(select 1 from public.kds_tickets t where t.order_id=p_order
      and (t.status in ('preparing','ready') or exists(
        select 1 from public.kds_ticket_items ti where ti.ticket_id=t.id
          and ti.status in ('preparing','ready')))) then 'preparing'
    else 'queued' end
$$;

-- Food instructions are never silently truncated or discarded. Normal long
-- notes are returned in full. Corrupt/excessive instructions stop the read and
-- write path so an operator must review the canonical record before cooking.
create function mealdeck_ops_private.kds_assert_instructions(p_order uuid)
returns void language plpgsql stable security definer set search_path='' as $$
begin
  if exists(select 1 from public.orders o where o.id=p_order and length(o.notes)>20000)
    or exists(select 1 from public.order_items i
      left join public.tenant_brands b on b.id=i.brand_id and b.tenant_id=i.tenant_id
      where i.order_id=p_order and (
        length(i.notes)>20000 or length(i.item_name)>1000 or length(trim(i.item_name))=0
        or length(b.name)>1000 or length(i.group_participant_name)>1000
        or jsonb_typeof(i.modifiers) is distinct from 'array'
        or jsonb_array_length(case when jsonb_typeof(i.modifiers)='array'
          then i.modifiers else '[]'::jsonb end)>100
        or exists(select 1 from jsonb_array_elements(case when jsonb_typeof(i.modifiers)='array'
          then i.modifiers else '[]'::jsonb end) m(value)
          where jsonb_typeof(m.value) is distinct from 'object'
            or (case when m.value->>'name' is not null then jsonb_typeof(m.value->'name')
              else jsonb_typeof(m.value->'label') end) is distinct from 'string'
            or length(trim(coalesce(m.value->>'name',m.value->>'label','')))=0
            or length(coalesce(m.value->>'name',m.value->>'label'))>1000)
      )) then raise exception 'mealdeck_kds_instructions_unavailable'; end if;
end $$;

-- This is a concurrency token, not a payment signature. Include notes,
-- modifiers, quantities, routes, tickets and pass changes so stale displays
-- cannot acknowledge changed food instructions.
create function mealdeck_ops_private.kds_order_version(p_order uuid,p_release text)
returns text language sql stable security definer set search_path='' as $$
  select md5(jsonb_build_object(
    'order',jsonb_build_array(o.id,o.tenant_id,o.location_id,o.status,o.payment_status,
      o.paid_at,o.notes,o.group_order_room_id),'release',p_release,
    'items',(select jsonb_agg(jsonb_build_array(i.id,i.tenant_id,i.brand_id,i.menu_item_id,
      i.item_name,i.quantity,i.modifiers,i.notes,i.group_participant_name) order by i.id)
      from public.order_items i where i.order_id=o.id),
    'tickets',(select jsonb_agg(jsonb_build_array(t.id,t.tenant_id,t.station_id,
      t.status,t.started_at,t.ready_at) order by t.id)
      from public.kds_tickets t where t.order_id=o.id),
    'ticket_items',(select jsonb_agg(jsonb_build_array(ti.id,ti.tenant_id,ti.ticket_id,
      ti.order_item_id,ti.station_id,ti.quantity,ti.status,ti.started_at,ti.ready_at) order by ti.id)
      from public.kds_ticket_items ti join public.kds_tickets t on t.id=ti.ticket_id
      where t.order_id=o.id),
    'routes',(select jsonb_agg(jsonb_build_array(r.item_id,r.station_id,r.tenant_id,
      s.tenant_id,s.location_id,s.active) order by r.item_id,r.station_id)
      from public.menu_item_station_routes r
      left join public.kitchen_stations s on s.id=r.station_id
      where r.location_id=o.location_id and exists(select 1 from public.order_items i
        where i.order_id=o.id and i.menu_item_id=r.item_id)),
    'pass',(select jsonb_build_array(p.tenant_id,p.location_id,p.status,p.updated_at)
      from public.mealdeck_pass_orders p where p.order_id=o.id)
  )::text) from public.orders o where o.id=p_order
$$;

create function mealdeck_ops_private.kds_order_card(p_order uuid,p_evidence jsonb)
returns jsonb language sql stable security definer set search_path='' as $$
  select jsonb_build_object(
    'order_id',o.id,
    'version',mealdeck_ops_private.kds_order_version(o.id,p_evidence->>'release_id'),
    'preparation_status',mealdeck_ops_private.kds_preparation_status(o.id),
    'display_code',case when o.handoff_code ~ '^\d{4}$' then o.handoff_code
      else upper(left(o.id::text,8)) end,
    'created_at',o.created_at,'released_at',p_evidence->'verified_at',
    'order_status',o.status,'fulfilment',o.fulfilment,'notes',o.notes,
    'group_order',o.group_order_room_id is not null,
    'routing_complete',mealdeck_ops_private.kds_routing_complete(o.id),
    'blocked_reason',case when mealdeck_ops_private.kds_routing_complete(o.id)
      then null else 'routing_incomplete' end,
    -- Purchased lines are projected independently of station tickets. An
    -- unrouted item remains visible on the blocked master card, exactly once.
    'items',coalesce((select jsonb_agg(jsonb_build_object(
      'order_item_id',i.id,'brand_id',i.brand_id,
      'brand_name',coalesce(b.name,'Kitchen'),'item_name',i.item_name,
      'quantity',i.quantity,
      'modifiers',coalesce((select jsonb_agg(coalesce(m.value->>'name',m.value->>'label')
        order by m.ordinality)
        from jsonb_array_elements(case when jsonb_typeof(i.modifiers)='array'
          then i.modifiers else '[]'::jsonb end) with ordinality m(value,ordinality)
        where jsonb_typeof(m.value)='object'
          and coalesce(m.value->>'name',m.value->>'label','')<>''),'[]'::jsonb),
      'notes',i.notes,'participant_name',i.group_participant_name,
      'status',case
        when mealdeck_ops_private.kds_routing_complete(o.id)
          and exists(select 1 from public.kds_ticket_items ti where ti.order_item_id=i.id)
          and not exists(select 1 from public.kds_ticket_items ti
            where ti.order_item_id=i.id and ti.status<>'ready') then 'ready'
        when exists(select 1 from public.kds_ticket_items ti where ti.order_item_id=i.id
          and ti.status in ('preparing','ready')) then 'preparing' else 'queued' end
      ) order by i.id)
      from public.order_items i
      left join public.tenant_brands b on b.id=i.brand_id and b.tenant_id=o.tenant_id
      where i.order_id=o.id and i.tenant_id=o.tenant_id),'[]'::jsonb),
    'tickets',coalesce((select jsonb_agg(jsonb_build_object(
      'ticket_id',t.id,'station_id',t.station_id,'station_name',left(s.name,200),
      'status',t.status,
      'version',md5(jsonb_build_array(t.id,t.status,t.started_at,t.ready_at,
        mealdeck_ops_private.kds_order_version(o.id,p_evidence->>'release_id'))::text),
      'created_at',t.created_at,'started_at',t.started_at,'ready_at',t.ready_at,
      'items',coalesce((select jsonb_agg(jsonb_build_object(
        'ticket_item_id',ti.id,'order_item_id',i.id,'brand_id',i.brand_id,
        'brand_name',coalesce(b.name,'Kitchen'),
        'item_name',i.item_name,'quantity',i.quantity,
        'modifiers',coalesce((select jsonb_agg(coalesce(m.value->>'name',m.value->>'label')
          order by m.ordinality)
          from jsonb_array_elements(case when jsonb_typeof(i.modifiers)='array'
            then i.modifiers else '[]'::jsonb end) with ordinality m(value,ordinality)
          where jsonb_typeof(m.value)='object'
            and coalesce(m.value->>'name',m.value->>'label','')<>''),'[]'::jsonb),
        'notes',i.notes,'participant_name',i.group_participant_name,
        'status',ti.status) order by i.id,ti.id)
        from public.kds_ticket_items ti
        join public.order_items i on i.id=ti.order_item_id and i.order_id=o.id
          and i.tenant_id=o.tenant_id
        left join public.tenant_brands b on b.id=i.brand_id and b.tenant_id=o.tenant_id
        where ti.ticket_id=t.id and ti.tenant_id=o.tenant_id
          and ti.station_id=t.station_id),'[]'::jsonb)
    ) order by s.sort_order,s.name,t.id)
      from public.kds_tickets t
      join public.kitchen_stations s on s.id=t.station_id
        and s.tenant_id=o.tenant_id and s.location_id=o.location_id
      where t.order_id=o.id and t.tenant_id=o.tenant_id),'[]'::jsonb),
    'pass',(select jsonb_build_object('status',p.status,
      'version',md5(jsonb_build_array(p.order_id,p.status,p.updated_at,
        mealdeck_ops_private.kds_order_version(o.id,p_evidence->>'release_id'))::text),
      'updated_at',p.updated_at)
      from public.mealdeck_pass_orders p where p.order_id=o.id
        and p.tenant_id=o.tenant_id and p.location_id=o.location_id
        and p.status in ('waiting_for_kitchen','ready_to_pack','packing','sealed','ready_for_handoff'))
  ) from public.orders o where o.id=p_order
$$;

create function public.mealdeck_ops_kds_board(p_tenant uuid,p_location uuid)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare o record; evidence jsonb; cards jsonb:='[]'; stations jsonb;
  held integer:=0; remaining integer:=0; ready boolean;
begin
  perform mealdeck_ops_private.kds_assert_scope(p_tenant,p_location,'orders.read');
  ready:=mealdeck_ops_private.kds_authority_ready();
  select coalesce(jsonb_agg(jsonb_build_object('station_id',s.id,'name',left(s.name,200),
    'code',left(s.code,100),'active',s.active) order by s.sort_order,s.name,s.id),'[]'::jsonb)
  into stations from public.kitchen_stations s
  where s.tenant_id=p_tenant and s.location_id=p_location;
  for o in select x.id from public.orders x
    where x.tenant_id=p_tenant and x.location_id=p_location and x.source='mealdeck'
      and x.status in ('accepted','preparing','ready')
      and not exists(select 1 from public.mealdeck_pass_orders p
        where p.order_id=x.id and p.status in ('handed_off','cancelled'))
    order by x.created_at,x.id
  loop
    evidence:=case when ready then mealdeck_ops_private.kds_release_evidence(o.id) else null end;
    if evidence is null then held:=held+1;
    elsif jsonb_array_length(cards)>=250 then remaining:=remaining+1;
    else
      perform mealdeck_ops_private.kds_assert_instructions(o.id);
      cards:=cards||jsonb_build_array(mealdeck_ops_private.kds_order_card(o.id,evidence));
    end if;
  end loop;
  return jsonb_build_object('schema_version',1,'tenant_id',p_tenant,'location_id',p_location,
    'generated_at',now(),'readiness',case when ready then 'ready' else 'setup_required' end,
    'held_order_count',held,'remaining_order_count',remaining,'stations',stations,'orders',cards);
end $$;

-- Lock the whole master order before any child rows, in stable UUID order.
-- A failure rolls back all brands and the audit, never half of a shared card.
create function public.mealdeck_ops_kds_transition_order(
  p_tenant uuid,p_location uuid,p_order uuid,p_expected_version text,p_status text
) returns jsonb language plpgsql security definer set search_path='' set lock_timeout='3s' as $$
declare o public.orders%rowtype; evidence jsonb; current_state text; current_version text;
begin
  perform mealdeck_ops_private.kds_assert_scope(p_tenant,p_location,'orders.status');
  if p_status is null or p_status not in ('preparing','ready')
    or p_expected_version is null or p_expected_version !~ '^[0-9a-f]{32}$' then
    raise exception 'mealdeck_kds_invalid_transition';
  end if;
  select * into o from public.orders where id=p_order and tenant_id=p_tenant
    and location_id=p_location and source='mealdeck' for update;
  if not found then raise exception 'mealdeck_kds_order_unavailable'; end if;
  if not mealdeck_ops_private.kds_authority_ready() then raise exception 'mealdeck_kds_setup_required'; end if;
  evidence:=mealdeck_ops_private.kds_release_evidence(p_order);
  if evidence is null then raise exception 'mealdeck_kds_release_required'; end if;
  perform 1 from public.order_items where order_id=p_order order by id for share;
  -- Existing route rows are share-locked below. Lock their menu parents too:
  -- an inserted route must take a foreign-key KEY SHARE lock on this parent,
  -- preventing a new required route appearing after the completeness check.
  perform 1 from public.menu_items m where exists(select 1 from public.order_items i
    where i.order_id=p_order and i.menu_item_id=m.id) order by m.id for update;
  perform 1 from public.menu_item_station_routes r where r.location_id=p_location
    and exists(select 1 from public.order_items i
      where i.order_id=p_order and i.menu_item_id=r.item_id)
    order by r.item_id,r.station_id for share;
  perform 1 from public.kitchen_stations s where s.location_id=p_location
    and exists(select 1 from public.kds_tickets t
      where t.order_id=p_order and t.station_id=s.id)
    order by s.id for share;
  perform 1 from public.kds_tickets where order_id=p_order order by id for update;
  perform 1 from public.kds_ticket_items ti where exists(
    select 1 from public.kds_tickets t where t.id=ti.ticket_id and t.order_id=p_order)
    order by ti.id for update;
  perform 1 from public.mealdeck_pass_orders where order_id=p_order for update;
  -- Recheck after lock waits: access or canonical eligibility may have changed
  -- while another operator was completing this order.
  perform mealdeck_ops_private.kds_assert_scope(p_tenant,p_location,'orders.status');
  evidence:=mealdeck_ops_private.kds_release_evidence(p_order);
  if evidence is null then raise exception 'mealdeck_kds_release_required'; end if;
  if not mealdeck_ops_private.kds_routing_complete(p_order) then raise exception 'mealdeck_kds_routing_incomplete'; end if;
  perform mealdeck_ops_private.kds_assert_instructions(p_order);
  if exists(select 1 from public.mealdeck_pass_orders p where p.order_id=p_order
    and (p.tenant_id<>p_tenant or p.location_id<>p_location
      or p.status in ('handed_off','cancelled'))) then raise exception 'mealdeck_kds_order_unavailable'; end if;
  current_state:=mealdeck_ops_private.kds_preparation_status(p_order);
  current_version:=mealdeck_ops_private.kds_order_version(p_order,evidence->>'release_id');
  if current_state=p_status then
    return jsonb_build_object('ok',true,'replayed',true,'order_id',p_order,'status',p_status);
  end if;
  if current_version is distinct from p_expected_version then raise exception 'mealdeck_kds_conflict'; end if;
  if not ((current_state='queued' and p_status='preparing' and o.status='accepted')
    or (current_state='preparing' and p_status='ready' and o.status in ('accepted','preparing'))) then
    raise exception 'mealdeck_kds_invalid_transition';
  end if;

  update public.kds_ticket_items ti set status=p_status,
    started_at=coalesce(ti.started_at,now()),
    ready_at=case when p_status='ready' then coalesce(ti.ready_at,now()) else ti.ready_at end
  where exists(select 1 from public.kds_tickets t
    where t.id=ti.ticket_id and t.order_id=p_order and t.tenant_id=p_tenant)
    and ti.tenant_id=p_tenant and ti.status<>'ready';
  update public.kds_tickets set status=p_status,started_at=coalesce(started_at,now()),
    ready_at=case when p_status='ready' then coalesce(ready_at,now()) else ready_at end
  where order_id=p_order and tenant_id=p_tenant and status<>'ready';
  update public.orders set status=p_status::public.order_status
    where id=p_order and tenant_id=p_tenant and location_id=p_location;
  if p_status='ready' then
    if mealdeck_ops_private.kds_preparation_status(p_order)<>'ready' then raise exception 'mealdeck_kds_not_ready'; end if;
    insert into public.mealdeck_pass_orders(order_id,tenant_id,location_id,status,ready_to_pack_at,updated_by)
      values(p_order,p_tenant,p_location,'ready_to_pack',now(),auth.uid())
    on conflict(order_id) do update set status='ready_to_pack',
      ready_to_pack_at=coalesce(public.mealdeck_pass_orders.ready_to_pack_at,now()),
      updated_by=auth.uid(),updated_at=now()
      where public.mealdeck_pass_orders.tenant_id=p_tenant
        and public.mealdeck_pass_orders.location_id=p_location
        and public.mealdeck_pass_orders.status='waiting_for_kitchen';
  end if;
  insert into public.mealdeck_ops_audit_log(
    tenant_id,location_id,actor_id,action,entity_type,entity_id,previous_value,next_value
  ) values(p_tenant,p_location,auth.uid(),'kds.order.'||p_status,'order',p_order,
    jsonb_build_object('status',current_state,'version',current_version),
    jsonb_build_object('status',p_status,'releaseId',evidence->>'release_id',
      'version',mealdeck_ops_private.kds_order_version(p_order,evidence->>'release_id')));
  return jsonb_build_object('ok',true,'replayed',false,'order_id',p_order,'status',p_status);
end $$;

create function public.mealdeck_ops_kds_transition_pass(
  p_tenant uuid,p_location uuid,p_order uuid,p_expected_version text,p_status text
) returns jsonb language plpgsql security definer set search_path='' set lock_timeout='3s' as $$
declare o public.orders%rowtype; p public.mealdeck_pass_orders%rowtype;
  evidence jsonb; current_version text;
begin
  perform mealdeck_ops_private.kds_assert_scope(p_tenant,p_location,'orders.status');
  if p_status is null or p_status not in ('packing','sealed')
    or p_expected_version is null or p_expected_version !~ '^[0-9a-f]{32}$' then
    raise exception 'mealdeck_kds_invalid_transition';
  end if;
  select * into o from public.orders where id=p_order and tenant_id=p_tenant
    and location_id=p_location and source='mealdeck' for update;
  if not found then raise exception 'mealdeck_kds_order_unavailable'; end if;
  if not mealdeck_ops_private.kds_authority_ready() then raise exception 'mealdeck_kds_setup_required'; end if;
  evidence:=mealdeck_ops_private.kds_release_evidence(p_order);
  if evidence is null then raise exception 'mealdeck_kds_release_required'; end if;
  perform 1 from public.order_items where order_id=p_order order by id for share;
  perform 1 from public.menu_items m where exists(select 1 from public.order_items i
    where i.order_id=p_order and i.menu_item_id=m.id) order by m.id for update;
  perform 1 from public.menu_item_station_routes r where r.location_id=p_location
    and exists(select 1 from public.order_items i
      where i.order_id=p_order and i.menu_item_id=r.item_id)
    order by r.item_id,r.station_id for share;
  perform 1 from public.kitchen_stations s where s.location_id=p_location
    and exists(select 1 from public.kds_tickets t
      where t.order_id=p_order and t.station_id=s.id)
    order by s.id for share;
  perform 1 from public.kds_tickets where order_id=p_order order by id for update;
  perform 1 from public.kds_ticket_items ti where exists(
    select 1 from public.kds_tickets t where t.id=ti.ticket_id and t.order_id=p_order)
    order by ti.id for update;
  select * into p from public.mealdeck_pass_orders where order_id=p_order
    and tenant_id=p_tenant and location_id=p_location for update;
  if not found then raise exception 'mealdeck_kds_not_ready'; end if;
  perform mealdeck_ops_private.kds_assert_scope(p_tenant,p_location,'orders.status');
  evidence:=mealdeck_ops_private.kds_release_evidence(p_order);
  if evidence is null then raise exception 'mealdeck_kds_release_required'; end if;
  if not mealdeck_ops_private.kds_routing_complete(p_order) then raise exception 'mealdeck_kds_routing_incomplete'; end if;
  perform mealdeck_ops_private.kds_assert_instructions(p_order);
  if o.status<>'ready' or mealdeck_ops_private.kds_preparation_status(p_order)<>'ready' then
    raise exception 'mealdeck_kds_not_ready';
  end if;
  current_version:=md5(jsonb_build_array(p.order_id,p.status,p.updated_at,
    mealdeck_ops_private.kds_order_version(p_order,evidence->>'release_id'))::text);
  if p.status=p_status then
    return jsonb_build_object('ok',true,'replayed',true,'order_id',p_order,'status',p_status);
  end if;
  if current_version is distinct from p_expected_version then raise exception 'mealdeck_kds_conflict'; end if;
  if not ((p.status='ready_to_pack' and p_status='packing')
    or (p.status='packing' and p_status='sealed')) then raise exception 'mealdeck_kds_invalid_transition'; end if;

  -- Stop at sealed. The canonical dispatch/handoff process owns collection,
  -- provider bookings and delivered/fulfilled status; no delivery RPC is called.
  update public.mealdeck_pass_orders set status=p_status,
    packing_started_at=case when p_status='packing' then coalesce(packing_started_at,now()) else packing_started_at end,
    sealed_at=case when p_status='sealed' then coalesce(sealed_at,now()) else sealed_at end,
    updated_by=auth.uid(),updated_at=now()
  where order_id=p_order and tenant_id=p_tenant and location_id=p_location;
  insert into public.mealdeck_ops_audit_log(
    tenant_id,location_id,actor_id,action,entity_type,entity_id,previous_value,next_value
  ) values(p_tenant,p_location,auth.uid(),'kds.pass.'||p_status,'order',p_order,
    jsonb_build_object('status',p.status,'version',current_version),
    jsonb_build_object('status',p_status,'releaseId',evidence->>'release_id'));
  return jsonb_build_object('ok',true,'replayed',false,'order_id',p_order,'status',p_status);
end $$;

-- No direct table grants, new role bypasses, or changes to the broad legacy
-- Dishbee/Cafe1 APIs. These private helpers are never direct browser endpoints.
revoke all on function mealdeck_ops_private.kds_assert_scope(uuid,uuid,text),
  mealdeck_ops_private.kds_authority_ready(),
  mealdeck_ops_private.kds_release_evidence(uuid),
  mealdeck_ops_private.kds_routing_complete(uuid),
  mealdeck_ops_private.kds_preparation_status(uuid),
  mealdeck_ops_private.kds_assert_instructions(uuid),
  mealdeck_ops_private.kds_order_version(uuid,text),
  mealdeck_ops_private.kds_order_card(uuid,jsonb)
  from public,anon,authenticated,service_role;
revoke all on function public.mealdeck_ops_kds_board(uuid,uuid),
  public.mealdeck_ops_kds_transition_order(uuid,uuid,uuid,text,text),
  public.mealdeck_ops_kds_transition_pass(uuid,uuid,uuid,text,text)
  from public,anon,authenticated,service_role;
grant execute on function public.mealdeck_ops_kds_board(uuid,uuid),
  public.mealdeck_ops_kds_transition_order(uuid,uuid,uuid,text,text),
  public.mealdeck_ops_kds_transition_pass(uuid,uuid,uuid,text,text) to authenticated;

commit;
