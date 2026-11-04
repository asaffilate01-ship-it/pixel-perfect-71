-- Standalone runtime overlay. Applied only after the hash-pinned historical
-- operations/KDS migrations inside the atomic fresh-project installer.
-- No historical migration is rewritten and no external Dishbee database is used.

-- Harden historical single-column relationships for the independent schema.
-- Nullable global staff/audit scopes remain valid; a supplied location must
-- belong to the same tenant even when a future trusted server writes the row.
do $scope$
declare t record;
begin
  for t in select c.relname from pg_class c join pg_namespace n on n.oid=c.relnamespace
    where n.nspname='public' and c.relkind='r' and c.relname like 'mealdeck_ops_%'
      and exists(select 1 from pg_attribute a where a.attrelid=c.oid and a.attname='tenant_id' and not a.attisdropped)
      and exists(select 1 from pg_attribute a where a.attrelid=c.oid and a.attname='location_id' and not a.attisdropped)
  loop
    execute format('alter table public.%I add constraint %I foreign key(tenant_id,location_id) references public.tenant_locations(tenant_id,id)',
      t.relname,'standalone_scope_'||left(md5(t.relname),16));
  end loop;
end $scope$;
alter table public.mealdeck_ops_recipes add constraint standalone_recipe_menu_scope
  foreign key(tenant_id,menu_item_id) references public.menu_items(tenant_id,id);
alter table public.mealdeck_ops_recipe_history add constraint standalone_recipe_history_scope
  foreign key(tenant_id,recipe_id) references public.mealdeck_ops_recipes(tenant_id,id);
alter table public.mealdeck_checkout_groups add constraint standalone_checkout_group_scope
  foreign key(tenant_id,location_id,order_id) references public.orders(tenant_id,location_id,id);
alter table public.mealdeck_fulfilment_outbox add constraint standalone_fulfilment_order_scope
  foreign key(tenant_id,location_id,order_id) references public.orders(tenant_id,location_id,id);
alter table public.mealdeck_handoff_proofs add constraint standalone_handoff_order_scope
  foreign key(tenant_id,location_id,order_id) references public.orders(tenant_id,location_id,id);

-- Explicit DBA bootstrap, never an API signup trigger. The caller must have
-- database-owner privileges already; this SECURITY INVOKER routine cannot
-- elevate a browser, service token or an arbitrary existing customer account.
create function mealdeck_private.bootstrap_business(p_owner uuid,p_kitchen_name text)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare v_install mealdeck_private.installation%rowtype;
  v_tenant uuid;v_location uuid;v_station uuid;v_brand uuid;b record;
begin
  if p_owner is null or not exists(select 1 from auth.users u
      where u.id=p_owner and nullif(trim(u.email),'') is not null
        and u.email_confirmed_at is not null
        and coalesce(u.is_anonymous,false)=false and u.deleted_at is null
        and (u.banned_until is null or u.banned_until<=now())) then
    raise exception 'mealdeck_bootstrap_confirmed_owner_required';
  end if;
  if p_kitchen_name is null or length(trim(p_kitchen_name)) not between 2 and 140 then
    raise exception 'mealdeck_bootstrap_kitchen_name_required';
  end if;
  select * into v_install from mealdeck_private.installation where singleton for update;
  if not found or v_install.profile<>'mealdeck-independent-v1' then
    raise exception 'mealdeck_bootstrap_profile_required';
  end if;
  if v_install.business_id is not null or exists(select 1 from public.tenants)
    or exists(select 1 from public.mealdeck_ops_staff_access) then
    raise exception 'mealdeck_business_already_bootstrapped';
  end if;

  insert into public.tenants(name,slug,legal_name)
    values('MealDeck','mealdeck','313 Brands Ltd') returning id into v_tenant;
  insert into public.tenant_locations(tenant_id,name,slug)
    values(v_tenant,trim(p_kitchen_name),'shared-kitchen') returning id into v_location;
  insert into public.kitchen_stations(tenant_id,location_id,name,code)
    values(v_tenant,v_location,'Shared kitchen','SHARED') returning id into v_station;
  for b in select * from (values
    ('skorch-burgers','Skorch'),('souvano','Souvano'),('loadd','Load’d'),
    ('moktl','Moktl'),('tavo-chicken','Tavo Chicken')
  ) as brands(slug,name) loop
    insert into public.tenant_brands(tenant_id,slug,name,active)
      values(v_tenant,b.slug,b.name,false) returning id into v_brand;
    insert into public.menu_categories(tenant_id,brand_id,name,slug,active)
      values(v_tenant,v_brand,'Menu','menu',false);
  end loop;
  insert into public.ordering_channels(tenant_id,location_id,channel_key,enabled)
    values(v_tenant,v_location,'mealdeck',false);
  insert into public.mealdeck_ops_staff_access(tenant_id,user_id,role,enabled)
    values(v_tenant,p_owner,'owner',true);
  update mealdeck_private.installation set business_id=v_tenant,
    bootstrap_owner_id=p_owner,bootstrapped_at=now() where singleton;
  insert into public.mealdeck_ops_audit_log(
    tenant_id,location_id,actor_id,action,entity_type,entity_id,next_value
  ) values(v_tenant,v_location,null,'business.bootstrap','tenant',v_tenant,
    jsonb_build_object('operator','database_owner','ownerUserId',p_owner,
      'locationId',v_location,'stationId',v_station,'brandCount',5,'orderingEnabled',false));
  return jsonb_build_object('tenant_id',v_tenant,'location_id',v_location,
    'station_id',v_station,'owner_user_id',p_owner,'brand_count',5,'ordering_enabled',false);
end $$;
revoke all on function mealdeck_private.bootstrap_business(uuid,text)
  from public,anon,authenticated,service_role;

-- A scoped configuration API for approved routing. It does not publish a
-- channel or create tickets. Menu identity is locked so in-flight KDS updates
-- cannot acknowledge a concurrently changed route.
create function public.mealdeck_ops_kitchen_stations(p_tenant uuid,p_location uuid)
returns table(station_id uuid,station_name text,station_code text)
language plpgsql stable security definer set search_path='' as $$
begin
  if not mealdeck_ops_private.can(p_tenant,p_location,'menu.read') then
    raise exception 'mealdeck_ops_forbidden';
  end if;
  if not exists(select 1 from public.tenant_locations l
    where l.id=p_location and l.tenant_id=p_tenant and l.active) then
    raise exception 'mealdeck_ops_location_or_item_mismatch';
  end if;
  return query select s.id,s.name,s.code from public.kitchen_stations s
    where s.tenant_id=p_tenant and s.location_id=p_location and s.active
    order by s.sort_order,s.name,s.id;
end $$;
revoke all on function public.mealdeck_ops_kitchen_stations(uuid,uuid)
  from public,anon,authenticated,service_role;
grant execute on function public.mealdeck_ops_kitchen_stations(uuid,uuid) to authenticated;

create function public.mealdeck_ops_set_station_route(
  p_tenant uuid,p_location uuid,p_item uuid,p_station uuid,p_enabled boolean
) returns boolean language plpgsql security definer set search_path='' as $$
declare item public.menu_items%rowtype;
begin
  if not mealdeck_ops_private.can(p_tenant,p_location,'menu.write') then
    raise exception 'mealdeck_ops_forbidden';
  end if;
  select * into item from public.menu_items where id=p_item and tenant_id=p_tenant for update;
  if not found or p_enabled is null
    or not exists(select 1 from public.tenant_locations l
      where l.id=p_location and l.tenant_id=p_tenant and l.active)
    or not exists(select 1 from public.kitchen_stations s
      where s.id=p_station and s.tenant_id=p_tenant and s.location_id=p_location and s.active) then
    raise exception 'mealdeck_ops_location_or_item_mismatch';
  end if;
  if exists(select 1 from public.order_items i join public.orders o on o.id=i.order_id
    where i.menu_item_id=p_item and o.tenant_id=p_tenant and o.location_id=p_location
      and o.status in ('accepted','preparing','ready')) then
    raise exception 'mealdeck_ops_route_has_active_orders';
  end if;
  if p_enabled then
    insert into public.menu_item_station_routes(tenant_id,location_id,item_id,station_id)
      values(p_tenant,p_location,p_item,p_station)
      on conflict(location_id,item_id,station_id) do nothing;
  else
    if item.active and not exists(select 1 from public.menu_item_station_routes r
      join public.kitchen_stations s on s.id=r.station_id
        and s.tenant_id=r.tenant_id and s.location_id=r.location_id and s.active
      where r.tenant_id=p_tenant and r.location_id=p_location and r.item_id=p_item
        and r.station_id<>p_station) then
      raise exception 'mealdeck_ops_station_route_required_before_activation';
    end if;
    delete from public.menu_item_station_routes where tenant_id=p_tenant
      and location_id=p_location and item_id=p_item and station_id=p_station;
  end if;
  insert into public.mealdeck_ops_audit_log(
    tenant_id,location_id,actor_id,action,entity_type,entity_id,next_value
  ) values(p_tenant,p_location,auth.uid(),'menu.station_route','menu_item',p_item,
    jsonb_build_object('stationId',p_station,'enabled',p_enabled));
  return true;
end $$;
revoke all on function public.mealdeck_ops_set_station_route(uuid,uuid,uuid,uuid,boolean)
  from public,anon,authenticated,service_role;
grant execute on function public.mealdeck_ops_set_station_route(uuid,uuid,uuid,uuid,boolean) to authenticated;

-- The following two replacement helpers retain the existing KDS contract but
-- use ONLY MealDeck's own private release-authority adapter. That adapter is
-- intentionally not supplied: verified provider capture/group/refund evidence
-- must be implemented and accepted before it can approve any kitchen release.

create or replace function mealdeck_ops_private.kds_authority_ready()
returns boolean language sql stable security definer set search_path='' as $$
  select coalesce(exists(
    select 1 from pg_catalog.pg_proc p
    where p.oid=pg_catalog.to_regprocedure(
      'mealdeck_private.kds_release_authority(uuid)')
      and p.prorettype='jsonb'::pg_catalog.regtype
      and p.provolatile='s'
      and not pg_catalog.has_function_privilege('anon',p.oid,'EXECUTE')
      and not pg_catalog.has_function_privilege('authenticated',p.oid,'EXECUTE')
      and not pg_catalog.has_function_privilege('service_role',p.oid,'EXECUTE')
  ),false)
$$;

create or replace function mealdeck_ops_private.kds_release_evidence(p_order uuid)
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
  execute 'select mealdeck_private.kds_release_authority($1)'
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

-- Append-only correction: the historical recipe validator required an extra
-- four-character UUID group and rejected every real ingredient UUID. All
-- authorization, validation, version history and transaction behavior is kept.
create or replace function public.mealdeck_ops_save_recipe(
  p_tenant uuid,p_item uuid,p_yield numeric,p_prep integer,
  p_instructions text,p_ingredients jsonb
) returns uuid
language plpgsql security definer set search_path=''
as $$
declare
  v_existing public.mealdeck_ops_recipes%rowtype;
  v_id uuid;
  v_line jsonb;
  v_ingredient uuid;
  v_quantity numeric;
  v_waste numeric;
  v_count integer:=0;
begin
  if not mealdeck_ops_private.can(p_tenant,null,'recipes.write') then
    raise exception 'mealdeck_ops_global_recipes_permission_required';
  end if;
  if not exists(select 1 from public.menu_items m
    where m.id=p_item and m.tenant_id=p_tenant) then
    raise exception 'mealdeck_ops_menu_item_not_found';
  end if;
  if p_yield is null or p_yield<=0 or p_yield>100000
    or p_prep is null or p_prep<0 or p_prep>1440
    or length(coalesce(p_instructions,''))>12000
    or p_ingredients is null or jsonb_typeof(p_ingredients)<>'array'
    or jsonb_array_length(p_ingredients)>60 then
    raise exception 'mealdeck_ops_recipe_invalid';
  end if;

  select * into v_existing from public.mealdeck_ops_recipes r
    where r.tenant_id=p_tenant and r.menu_item_id=p_item for update;
  if found then
    insert into public.mealdeck_ops_recipe_history(
      tenant_id,recipe_id,version,snapshot,archived_by
    )
    select p_tenant,v_existing.id,v_existing.version,jsonb_build_object(
      'yield',v_existing.yield_units,'prepMinutes',v_existing.prep_minutes,
      'instructions',v_existing.instructions,
      'ingredients',coalesce((
        select jsonb_agg(jsonb_build_object(
          'ingredientId',l.ingredient_id,
          'quantity',l.quantity,'wastePercent',l.waste_pct
        ) order by l.ingredient_id)
        from public.mealdeck_ops_recipe_lines l
        where l.tenant_id=p_tenant and l.recipe_id=v_existing.id
      ),'[]'::jsonb)
    ),(select auth.uid());
    update public.mealdeck_ops_recipes r
      set yield_units=p_yield,prep_minutes=p_prep,
        instructions=coalesce(p_instructions,''),version=r.version+1,
        updated_by=(select auth.uid()),updated_at=now()
      where r.id=v_existing.id and r.tenant_id=p_tenant
      returning id into v_id;
    delete from public.mealdeck_ops_recipe_lines l
      where l.tenant_id=p_tenant and l.recipe_id=v_id;
  else
    insert into public.mealdeck_ops_recipes(
      tenant_id,menu_item_id,yield_units,prep_minutes,instructions,updated_by
    ) values (
      p_tenant,p_item,p_yield,p_prep,coalesce(p_instructions,''),(select auth.uid())
    ) returning id into v_id;
  end if;

  for v_line in select value from jsonb_array_elements(p_ingredients)
    as e(value)
  loop
    if jsonb_typeof(v_line)<>'object'
      or coalesce(v_line->>'ingredientId','') !~
        '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'
      or coalesce(v_line->>'quantity','') !~ '^[0-9]+([.][0-9]{1,3})?$'
      or coalesce(v_line->>'wastePercent','') !~ '^[0-9]+([.][0-9]{1,2})?$' then
      raise exception 'mealdeck_ops_recipe_line_invalid';
    end if;
    v_ingredient=(v_line->>'ingredientId')::uuid;
    v_quantity=(v_line->>'quantity')::numeric;
    v_waste=(v_line->>'wastePercent')::numeric;
    if v_quantity<=0 or v_quantity>1000000 or v_waste<0 or v_waste>100
      or not exists(select 1 from public.mealdeck_ops_ingredients i
        where i.id=v_ingredient and i.tenant_id=p_tenant and i.active) then
      raise exception 'mealdeck_ops_recipe_ingredient_invalid';
    end if;
    insert into public.mealdeck_ops_recipe_lines(
      tenant_id,recipe_id,ingredient_id,quantity,waste_pct
    ) values (p_tenant,v_id,v_ingredient,v_quantity,v_waste);
    v_count=v_count+1;
  end loop;
  return v_id;
end;
$$;
-- This profile must not inherit broad Supabase default table or sequence
-- grants. Staff use the purpose-specific, auth-checked operations RPCs only.
-- No public table policies are added; direct browser CRUD remains denied.
do $standalone_acl$
declare obj record;
begin
  for obj in select c.relname,c.relkind from pg_class c
    join pg_namespace n on n.oid=c.relnamespace
    where n.nspname='public' and c.relname like 'mealdeck_%'
      and c.relkind in ('r','p','S')
  loop
    if obj.relkind='S' then
      execute format('revoke all on sequence public.%I from public,anon,authenticated,service_role',obj.relname);
    else
      execute format('alter table public.%I enable row level security',obj.relname);
      execute format('revoke all on table public.%I from public,anon,authenticated,service_role',obj.relname);
    end if;
  end loop;
  for obj in select p.oid::regprocedure as signature from pg_proc p
    join pg_namespace n on n.oid=p.pronamespace
    where n.nspname='public' and p.proname like 'mealdeck_ops_%'
  loop
    execute format('revoke all on function %s from public,anon,service_role',obj.signature);
  end loop;
end $standalone_acl$;
revoke all on schema mealdeck_private,mealdeck_ops_private from public,anon,authenticated,service_role;
revoke all on all functions in schema mealdeck_private,mealdeck_ops_private
  from public,anon,authenticated,service_role;
