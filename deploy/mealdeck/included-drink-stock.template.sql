-- Generated with Supabase CLI 3.0.0: mealdeck_included_drink_stock.
-- Included meal drinks follow their reviewed standalone product's kitchen stock.
-- Manifest SHA256: __SOURCE_SHA256__
begin;
set local lock_timeout='5s';
set local statement_timeout='30s';
set local check_function_bodies=on;

do $guard$
declare expected record; original_oid oid; saved_oid oid;
begin
  if to_regnamespace('dishbee_private') is not null
    or to_regclass('mealdeck_private.installation') is null
    or to_regprocedure('extensions.uuid_generate_v5(uuid,text)') is null then
    raise exception 'mealdeck_included_drink_stock_independent_profile_required'; end if;
  if current_user in ('anon','authenticated','service_role') or not exists(
    select 1 from pg_class where oid='mealdeck_private.installation'::regclass
      and pg_has_role(current_user,relowner,'USAGE')) then
    raise exception 'mealdeck_included_drink_stock_database_owner_required'; end if;
  if not exists(select 1 from mealdeck_private.installation where singleton
    and profile='mealdeck-independent-v1' and business_id is not null) then
    raise exception 'mealdeck_included_drink_stock_independent_profile_required'; end if;
  for expected in select * from (values
    ('mealdeck_private.price_checkout_lines(uuid,uuid,jsonb)',
      'mealdeck_private.price_checkout_lines_before_included_stock(uuid,uuid,jsonb)',
      '8c3a031a5ae04ecfba2c027e022af830','__BODY_PRICE__'),
    ('public.mealdeck_public_menu()',
      'mealdeck_private.public_menu_before_included_stock()',
      'dcc595a4592398e0a5949ca5aeb3354c','__BODY_PUBLIC__')
  ) x(current_signature,saved_signature,old_hash,new_hash)
  loop
    original_oid:=to_regprocedure(expected.current_signature);
    saved_oid:=to_regprocedure(expected.saved_signature);
    if original_oid is null or not exists(select 1 from pg_proc where oid=original_oid
      and prosecdef and proconfig @> array['search_path=""']
      and md5(prosrc)=case when saved_oid is null then expected.old_hash else expected.new_hash end)
      or (saved_oid is not null and not exists(select 1 from pg_proc where oid=saved_oid
        and prosecdef and proconfig @> array['search_path=""'] and md5(prosrc)=expected.old_hash)) then
      raise exception 'mealdeck_included_drink_stock_unreviewed_definition: %',expected.current_signature;
    end if;
  end loop;
  for expected in select * from (values
    ('mealdeck_private.included_drink_stock_bindings(uuid)','__BODY_BINDINGS__'),
    ('mealdeck_private.included_drink_stock_available(uuid,uuid,uuid)','__BODY_AVAILABLE__')
  ) x(signature,body_hash)
  loop
    if to_regprocedure(expected.signature) is not null and not exists(
      select 1 from pg_proc where oid=to_regprocedure(expected.signature)
        and prosecdef and proconfig @> array['search_path=""'] and md5(prosrc)=expected.body_hash) then
      raise exception 'mealdeck_included_drink_stock_unreviewed_definition: %',expected.signature;
    end if;
  end loop;
end $guard$;

create or replace function mealdeck_private.included_drink_stock_bindings(p_tenant uuid)
returns table(option_id uuid,group_id uuid,source_option_id text,brand_slug text,target_sku text)
language sql immutable security definer set search_path='' as $$
  select extensions.uuid_generate_v5(p_tenant,'mealdeck-launch-v1:option:'||(b->>'option')),
    extensions.uuid_generate_v5(p_tenant,'mealdeck-launch-v1:group:'||(b->>'group')),
    b->>'option',b->>'brand',b->>'sku'
  from jsonb_array_elements((__SOURCE_MANIFEST__::jsonb)->'bindings') b
$$;

create or replace function mealdeck_private.included_drink_stock_available(
  p_tenant uuid,p_location uuid,p_option uuid
) returns boolean language sql stable security definer set search_path='' as $$
  select coalesce((select exists(
    select 1 from public.menu_items i
    join public.tenant_brands b on b.id=i.brand_id and b.tenant_id=i.tenant_id
    join public.menu_categories c on c.id=i.category_id and c.tenant_id=i.tenant_id and c.brand_id=i.brand_id
    join public.menu_item_channel_rules r on r.menu_item_id=i.id and r.tenant_id=i.tenant_id
      and r.location_id=p_location and r.channel_key='mealdeck'
    where i.tenant_id=p_tenant and i.sku=link.target_sku and b.slug=link.brand_slug
      and i.active and b.active and c.active and r.visible
      and (select count(*) from public.menu_items duplicate
        where duplicate.tenant_id=p_tenant and duplicate.sku=link.target_sku)=1
      and exists(select 1 from public.menu_item_station_routes route
        join public.kitchen_stations station on station.id=route.station_id
          and station.tenant_id=route.tenant_id and station.location_id=route.location_id and station.active
        where route.item_id=i.id and route.tenant_id=p_tenant and route.location_id=p_location)
    ) from mealdeck_private.included_drink_stock_bindings(p_tenant) link
      where link.option_id=p_option),true)
$$;

do $preserve$
begin
  if to_regprocedure('mealdeck_private.price_checkout_lines_before_included_stock(uuid,uuid,jsonb)') is null then
    alter function mealdeck_private.price_checkout_lines(uuid,uuid,jsonb)
      rename to price_checkout_lines_before_included_stock;
  end if;
  if to_regprocedure('mealdeck_private.public_menu_before_included_stock()') is null then
    alter function public.mealdeck_public_menu() set schema mealdeck_private;
    alter function mealdeck_private.mealdeck_public_menu() rename to public_menu_before_included_stock;
  end if;
end $preserve$;

create or replace function mealdeck_private.price_checkout_lines(p_tenant uuid,p_location uuid,p_selection jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare priced jsonb; link record; target uuid;
begin
  -- Keep every existing price, selection, group and route check unchanged.
  priced:=mealdeck_private.price_checkout_lines_before_included_stock(p_tenant,p_location,p_selection);
  for link in select distinct binding.option_id,binding.brand_slug,binding.target_sku
    from jsonb_array_elements(priced->'lines') line,
      jsonb_array_elements(line->'modifiers') modifier,
      mealdeck_private.included_drink_stock_bindings(p_tenant) binding
    where binding.option_id=(modifier->>'id')::uuid
    order by binding.target_sku,binding.option_id
  loop
    -- Lock the actual stock rows until this quote/materialization transaction ends.
    -- A concurrent Out of stock write cannot pass between validation and preparation.
    select i.id into target from public.menu_items i
      join public.tenant_brands b on b.id=i.brand_id and b.tenant_id=i.tenant_id
      join public.menu_categories c on c.id=i.category_id and c.tenant_id=i.tenant_id and c.brand_id=i.brand_id
      join public.menu_item_channel_rules r on r.menu_item_id=i.id and r.tenant_id=i.tenant_id
        and r.location_id=p_location and r.channel_key='mealdeck'
      where i.tenant_id=p_tenant and i.sku=link.target_sku and b.slug=link.brand_slug
        and i.active and b.active and c.active and r.visible
      for share of i,b,c,r;
    if not found or not mealdeck_private.included_drink_stock_available(p_tenant,p_location,link.option_id) then
      raise exception 'mealdeck_checkout_modifier_unavailable'; end if;
    perform 1 from public.menu_item_station_routes route
      join public.kitchen_stations station on station.id=route.station_id
        and station.tenant_id=route.tenant_id and station.location_id=route.location_id and station.active
      where route.item_id=target and route.tenant_id=p_tenant and route.location_id=p_location
      order by route.station_id for share of route,station;
    if not found then raise exception 'mealdeck_checkout_modifier_unavailable'; end if;
  end loop;
  return priced;
end $$;

create or replace function public.mealdeck_public_menu()
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare snapshot jsonb; v_tenant uuid;v_location uuid;items jsonb;
begin
  snapshot:=mealdeck_private.public_menu_before_included_stock();
  -- The original no-argument allowlist and exact installed scope stay authoritative.
  select t.id,l.id into v_tenant,v_location
    from mealdeck_private.installation i
    join public.tenants t on t.id=i.business_id
    join public.tenant_locations l on l.tenant_id=t.id
    where i.singleton and i.profile='mealdeck-independent-v1'
      and i.bootstrap_owner_id is not null and i.bootstrapped_at is not null
      and t.active and t.slug='mealdeck' and t.legal_name='313 Brands Ltd' and t.currency='GBP'
      and l.slug='shared-kitchen' and l.active
      and (select count(*) from public.tenants)=1
      and (select count(*) from public.tenant_locations only_location
        where only_location.tenant_id=t.id and only_location.active)=1;
  if not found then raise exception 'mealdeck_public_menu_scope_unavailable'; end if;
  with stock as materialized (
    select binding.source_option_id,
      mealdeck_private.included_drink_stock_available(v_tenant,v_location,binding.option_id) available
    from mealdeck_private.included_drink_stock_bindings(v_tenant) binding
  )
  select coalesce(jsonb_agg(item||jsonb_build_object('options',coalesce((
    select jsonb_object_agg(option.key,option.value||jsonb_build_object('available',
      (option.value->'available'='true'::jsonb) and coalesce((
        select stock.available from stock where stock.source_option_id=option.key
      ),true))) from jsonb_each(item->'options') option
    ),'{}'::jsonb)) order by ordinal),'[]'::jsonb) into items
    from jsonb_array_elements(snapshot->'items') with ordinality source(item,ordinal);
  return jsonb_set(snapshot,'{items}',items);
end $$;

revoke all on function mealdeck_private.included_drink_stock_bindings(uuid) from public,anon,authenticated,service_role;
revoke all on function mealdeck_private.included_drink_stock_available(uuid,uuid,uuid) from public,anon,authenticated,service_role;
revoke all on function mealdeck_private.price_checkout_lines_before_included_stock(uuid,uuid,jsonb) from public,anon,authenticated,service_role;
revoke all on function mealdeck_private.public_menu_before_included_stock() from public,anon,authenticated,service_role;
revoke all on function mealdeck_private.price_checkout_lines(uuid,uuid,jsonb) from public,anon,authenticated,service_role;
revoke all on function public.mealdeck_public_menu() from public,anon,authenticated,service_role;
grant execute on function public.mealdeck_public_menu() to anon,authenticated;
notify pgrst,'reload schema';
commit;
