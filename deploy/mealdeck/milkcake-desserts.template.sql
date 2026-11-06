-- Template only. Generate with milkcake-desserts.mjs; never submit this file.
set local lock_timeout='5s';
set local statement_timeout='30s';
set local standard_conforming_strings=on;
set local search_path=pg_catalog,pg_temp;

do __BLOCK_TAG__
declare
  v_tenant constant uuid := __TARGET_TENANT_UUID__::uuid;
  v_location constant uuid := __TARGET_KITCHEN_UUID__::uuid;
  v_station constant uuid := __TARGET_STATION_UUID__::uuid;
  v_source constant jsonb := __SOURCE_JSON_SQL_LITERAL__::jsonb;
  v_source_hash constant text := __SOURCE_SHA256_SQL_LITERAL__;
  v_install record;v_brand jsonb;v_item jsonb;
  v_brand_id uuid;v_category_id uuid;v_item_id uuid;
  v_existing_brand uuid;v_existing_category uuid;
  v_skus text[];v_sku text;v_sort integer;
  v_categories_created integer:=0;v_items_created integer:=0;
begin
  if to_regclass('mealdeck_private.installation') is null
    or to_regnamespace('dishbee_private') is not null then
    raise exception 'mealdeck_milkcakes_independent_profile_required';
  end if;
  if current_user in ('anon','authenticated','service_role') or not exists(
    select 1 from pg_class c where c.oid='mealdeck_private.installation'::regclass
      and pg_has_role(current_user,c.relowner,'USAGE')) then
    raise exception 'mealdeck_milkcakes_database_owner_required';
  end if;
  select * into v_install from mealdeck_private.installation where singleton for update;
  if not found or v_install.profile is distinct from 'mealdeck-independent-v1'
    or v_install.business_id is null or v_install.bootstrap_owner_id is null
    or v_install.bootstrapped_at is null then
    raise exception 'mealdeck_milkcakes_bootstrap_required';
  end if;
  if v_install.business_id is distinct from v_tenant then
    raise exception 'mealdeck_milkcakes_business_mismatch';
  end if;

  -- Serialize the ten SKU checks and inserts with catalogue edits. Reads remain
  -- available; the short timeout aborts rather than waiting behind staff work.
  -- No existing product, kitchen switch or ordering channel is updated.
  lock table public.tenants,public.tenant_locations,public.tenant_brands,
    public.menu_categories,public.kitchen_stations,public.ordering_channels,
    public.menu_items,public.menu_item_station_routes,public.menu_item_channel_rules
    in share row exclusive mode;
  if not exists(select 1 from public.tenants t where t.id=v_tenant
      and t.slug='mealdeck' and t.legal_name='313 Brands Ltd' and t.currency='GBP' and t.active)
    or not exists(select 1 from public.tenant_locations l where l.id=v_location
      and l.tenant_id=v_tenant and l.slug='shared-kitchen' and l.active) then
    raise exception 'mealdeck_milkcakes_business_or_kitchen_mismatch';
  end if;
  if exists(select 1 from public.tenant_locations l where l.tenant_id=v_tenant
      and l.active and l.id<>v_location) then
    raise exception 'mealdeck_milkcakes_single_active_kitchen_required';
  end if;
  if not exists(select 1 from public.kitchen_stations s where s.id=v_station
      and s.tenant_id=v_tenant and s.location_id=v_location and s.code='SHARED' and s.active)
    or (select count(*) from public.kitchen_stations s where s.tenant_id=v_tenant
      and s.location_id=v_location and s.active)<>1 then
    raise exception 'mealdeck_milkcakes_single_shared_station_required';
  end if;
  if not exists(select 1 from public.ordering_channels c where c.tenant_id=v_tenant
      and c.location_id=v_location and c.channel_key='mealdeck') then
    raise exception 'mealdeck_milkcakes_ordering_channel_required';
  end if;
  if v_source->>'profile'<>'mealdeck-independent-v1' or v_source->>'currency'<>'GBP'
    or v_source->>'revision'<>'owner-desserts-20261106'
    or jsonb_array_length(v_source->'brands')<>5 then
    raise exception 'mealdeck_milkcakes_invalid_source';
  end if;
  select array_agg(i->>'sku') into v_skus from jsonb_array_elements(v_source->'brands') b
    cross join lateral jsonb_array_elements(b->'items') i;
  if cardinality(v_skus)<>10 or exists(
    select sku from public.menu_items where tenant_id=v_tenant and sku=any(v_skus)
      group by sku having count(*)>1) then
    raise exception 'mealdeck_milkcakes_duplicate_or_invalid_sku';
  end if;

  for v_brand in select value from jsonb_array_elements(v_source->'brands') loop
    select id into v_brand_id from public.tenant_brands
      where tenant_id=v_tenant and slug=v_brand->>'id' and active;
    if not found then raise exception 'mealdeck_milkcakes_active_launch_brand_required'; end if;
    select id into v_category_id from public.menu_categories where tenant_id=v_tenant
      and brand_id=v_brand_id and slug=v_brand->'category'->>'slug';
    if not found then
      select coalesce(max(sort_order)+1,0) into v_sort from public.menu_categories
        where tenant_id=v_tenant and brand_id=v_brand_id;
      insert into public.menu_categories(tenant_id,brand_id,name,slug,sort_order,active)
        values(v_tenant,v_brand_id,v_brand->'category'->>'name',v_brand->'category'->>'slug',v_sort,true)
        returning id into v_category_id;
      v_categories_created:=v_categories_created+1;
    end if;
    for v_item in select value from jsonb_array_elements(v_brand->'items') loop
      v_sku:=v_item->>'sku';
      select id,brand_id,category_id into v_item_id,v_existing_brand,v_existing_category
        from public.menu_items where tenant_id=v_tenant and sku=v_sku;
      if found then
        if v_existing_brand is distinct from v_brand_id
          or v_existing_category is distinct from v_category_id then
          raise exception 'mealdeck_milkcakes_sku_scope_collision';
        end if;
        -- An existing dessert and all staff choices remain untouched, including
        -- price overrides, out-of-stock flags, allergens and removed routes.
        continue;
      end if;
      insert into public.menu_items(tenant_id,brand_id,category_id,name,description,
          price_pence,sku,active,dietary,allergens)
        values(v_tenant,v_brand_id,v_category_id,v_item->>'name',v_item->>'description',
          (v_item->>'pricePence')::integer,v_sku,true,'{}'::jsonb,'{}'::text[])
        returning id into v_item_id;
      insert into public.menu_item_station_routes(tenant_id,location_id,item_id,station_id,prep_kind)
        values(v_tenant,v_location,v_item_id,v_station,'prep');
      insert into public.menu_item_channel_rules(tenant_id,location_id,channel_key,menu_item_id,visible)
        values(v_tenant,v_location,'mealdeck',v_item_id,true);
      v_items_created:=v_items_created+1;
    end loop;
  end loop;
  if v_categories_created+v_items_created>0 then
    insert into public.mealdeck_ops_audit_log(
      tenant_id,location_id,actor_id,action,entity_type,entity_id,next_value
    ) values(v_tenant,v_location,null,'catalogue.milkcake_desserts','catalogue',v_tenant,
      jsonb_build_object('operator','database_owner','sourceSha256',v_source_hash,
        'approvedOn',v_source->>'approvedOn','priceRevision',v_source->>'revision',
        'categoriesCreated',v_categories_created,'itemsCreated',v_items_created,
        'routesCreated',v_items_created,'rulesCreated',v_items_created,
        'existingRecordsOverwritten',false,'orderingSettingsChanged',false,
        'allergenDataProvided',false));
  end if;
  raise notice 'MealDeck desserts: % categories and % milkcakes added; existing records and ordering settings preserved.',
    v_categories_created,v_items_created;
end __BLOCK_TAG__;
