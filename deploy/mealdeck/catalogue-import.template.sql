-- Template only. Generate with catalogue-import.mjs; never submit this file.
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
  v_install record;
  v_brand jsonb; v_section jsonb; v_item jsonb; v_group jsonb; v_option jsonb;
  v_brand_id uuid; v_category_id uuid; v_item_id uuid; v_group_id uuid;
  v_option_id uuid; v_existing_tenant uuid; v_existing_brand uuid;
  v_existing_category uuid; v_existing_group uuid;
  v_skus text[]; v_sku text; v_group_source_id text;
  v_sort integer; v_link_sort integer; v_changed integer;
  v_categories_created integer := 0; v_items_created integer := 0;
  v_groups_created integer := 0; v_options_created integer := 0;
  v_routes_created integer := 0; v_rules_created integer := 0;
  v_links_created integer := 0;
begin
  if pg_catalog.to_regclass('mealdeck_private.installation') is null
    or pg_catalog.to_regnamespace('dishbee_private') is not null then
    raise exception 'mealdeck_launch_import_independent_profile_required';
  end if;
  if current_user in ('anon','authenticated','service_role') or not exists(
    select 1 from pg_catalog.pg_class c
    where c.oid='mealdeck_private.installation'::pg_catalog.regclass
      and pg_catalog.pg_has_role(current_user,c.relowner,'USAGE')
  ) then
    raise exception 'mealdeck_launch_import_database_owner_required';
  end if;
  select * into v_install from mealdeck_private.installation where singleton for update;
  if not found or v_install.profile is distinct from 'mealdeck-independent-v1'
    or v_install.business_id is null or v_install.bootstrap_owner_id is null
    or v_install.bootstrapped_at is null then
    raise exception 'mealdeck_launch_import_bootstrap_required';
  end if;
  if v_install.business_id is distinct from v_tenant then
    raise exception 'mealdeck_launch_import_business_mismatch';
  end if;

  -- There is no unique SKU constraint in the existing profile. Serialize this
  -- bounded maintenance import with all ordinary writes to these catalogue
  -- tables, so a duplicate SKU cannot appear between its check and insert.
  -- The short lock timeout aborts instead of waiting behind active staff work.
  lock table public.tenants,public.tenant_locations,public.tenant_brands,
    public.menu_categories,public.kitchen_stations,public.ordering_channels,
    public.modifier_groups,public.modifier_options,public.menu_items,
    public.menu_item_modifier_groups,public.menu_item_station_routes,
    public.menu_item_channel_rules in share row exclusive mode;

  if not exists(select 1 from public.tenants t where t.id=v_tenant
      and t.slug='mealdeck' and t.legal_name='313 Brands Ltd' and t.currency='GBP' and t.active)
    or not exists(select 1 from public.tenant_locations l where l.id=v_location
      and l.tenant_id=v_tenant and l.slug='shared-kitchen' and l.active) then
    raise exception 'mealdeck_launch_import_business_or_kitchen_mismatch';
  end if;
  -- Products and modifier associations are tenant-wide. This first-launch
  -- importer must not change the catalogue of a second operating kitchen.
  if exists(select 1 from public.tenant_locations l where l.tenant_id=v_tenant
      and l.active and l.id<>v_location) then
    raise exception 'mealdeck_launch_import_single_active_kitchen_required';
  end if;
  if not exists(select 1 from public.kitchen_stations s where s.id=v_station
      and s.tenant_id=v_tenant and s.location_id=v_location and s.code='SHARED' and s.active)
    or (select count(*) from public.kitchen_stations s where s.tenant_id=v_tenant
      and s.location_id=v_location and s.active)<>1 then
    raise exception 'mealdeck_launch_import_single_shared_station_required';
  end if;
  if not exists(select 1 from public.ordering_channels c where c.tenant_id=v_tenant
      and c.location_id=v_location and c.channel_key='mealdeck' and c.enabled=false)
    or exists(select 1 from public.ordering_channels c where c.tenant_id=v_tenant
      and c.channel_key='mealdeck' and c.enabled) then
    raise exception 'mealdeck_launch_import_closed_channel_required';
  end if;
  if v_source->>'profile'<>'mealdeck-independent-v1' or v_source->>'currency'<>'GBP'
    or v_source->>'publication'<>'draft' then
    raise exception 'mealdeck_launch_import_invalid_source';
  end if;

  select array_agg(i.value->>'id') into v_skus
    from jsonb_array_elements(v_source->'brands') b
    cross join lateral jsonb_array_elements(b.value->'sections') s
    cross join lateral jsonb_array_elements(s.value->'items') i;
  if exists(select sku from public.menu_items where tenant_id=v_tenant and sku=any(v_skus)
      group by sku having count(*)>1) then
    raise exception 'mealdeck_launch_import_duplicate_sku';
  end if;

  for v_group in select value from jsonb_array_elements(v_source->'modifierGroups') loop
    v_group_id:=(v_group->>'databaseId')::uuid;
    select tenant_id into v_existing_tenant from public.modifier_groups where id=v_group_id;
    if found then
      if v_existing_tenant<>v_tenant then
        raise exception 'mealdeck_launch_import_modifier_group_scope_collision';
      end if;
    else
      if exists(select 1 from public.modifier_groups where tenant_id=v_tenant
          and name=v_group->>'name') then
        raise exception 'mealdeck_launch_import_modifier_group_name_collision';
      end if;
      insert into public.modifier_groups(id,tenant_id,name,min_select,max_select)
        values(v_group_id,v_tenant,v_group->>'name',(v_group->>'minSelect')::integer,
          (v_group->>'maxSelect')::integer);
      v_groups_created:=v_groups_created+1;
    end if;
    for v_option in select value from jsonb_array_elements(v_group->'options') loop
      v_option_id:=(v_option->>'databaseId')::uuid;
      select tenant_id,group_id into v_existing_tenant,v_existing_group
        from public.modifier_options where id=v_option_id;
      if found then
        if v_existing_tenant<>v_tenant or v_existing_group<>v_group_id then
          raise exception 'mealdeck_launch_import_modifier_option_scope_collision';
        end if;
      else
        if exists(select 1 from public.modifier_options where tenant_id=v_tenant
            and group_id=v_group_id and name=v_option->>'label') then
          raise exception 'mealdeck_launch_import_modifier_option_name_collision';
        end if;
        insert into public.modifier_options(id,tenant_id,group_id,name,price_delta_pence,active)
          values(v_option_id,v_tenant,v_group_id,v_option->>'label',
            (v_option->>'pricePence')::integer,false);
        v_options_created:=v_options_created+1;
      end if;
    end loop;
  end loop;

  for v_brand in select value from jsonb_array_elements(v_source->'brands') loop
    select id into v_brand_id from public.tenant_brands
      where tenant_id=v_tenant and slug=v_brand->>'id';
    if not found then raise exception 'mealdeck_launch_import_launch_brand_required'; end if;
    v_sort:=0;
    for v_section in select value from jsonb_array_elements(v_brand->'sections') loop
      select id into v_category_id from public.menu_categories where tenant_id=v_tenant
        and brand_id=v_brand_id and slug=v_section->>'id';
      if not found then
        insert into public.menu_categories(tenant_id,brand_id,name,slug,sort_order,active)
          values(v_tenant,v_brand_id,v_section->>'title',v_section->>'id',v_sort,false)
          returning id into v_category_id;
        v_categories_created:=v_categories_created+1;
      end if;
      v_sort:=v_sort+1;
      for v_item in select value from jsonb_array_elements(v_section->'items') loop
        v_sku:=v_item->>'id';
        select id,brand_id,category_id into v_item_id,v_existing_brand,v_existing_category
          from public.menu_items where tenant_id=v_tenant and sku=v_sku;
        if found then
          if v_existing_brand<>v_brand_id or v_existing_category<>v_category_id then
            raise exception 'mealdeck_launch_import_sku_scope_collision';
          end if;
        else
          insert into public.menu_items(tenant_id,brand_id,category_id,name,description,
              price_pence,sku,active,dietary,allergens)
            values(v_tenant,v_brand_id,v_category_id,v_item->>'name',v_item->>'importDescription',
              (v_item->>'pricePence')::integer,v_sku,false,'{}'::jsonb,'{}'::text[])
            returning id into v_item_id;
          v_items_created:=v_items_created+1;
        end if;

        -- Never replace an administrator's routing or add a second kitchen route.
        if exists(select 1 from public.menu_item_station_routes where tenant_id=v_tenant
            and location_id=v_location and item_id=v_item_id and station_id<>v_station) then
          raise exception 'mealdeck_launch_import_existing_route_conflict';
        end if;
        insert into public.menu_item_station_routes(tenant_id,location_id,item_id,station_id,prep_kind)
          values(v_tenant,v_location,v_item_id,v_station,v_item->>'prepKind')
          on conflict(location_id,item_id,station_id) do nothing;
        get diagnostics v_changed=row_count;
        v_routes_created:=v_routes_created+v_changed;
        insert into public.menu_item_channel_rules(tenant_id,location_id,channel_key,menu_item_id,visible)
          values(v_tenant,v_location,'mealdeck',v_item_id,false)
          on conflict(tenant_id,location_id,channel_key,menu_item_id) do nothing;
        get diagnostics v_changed=row_count;
        v_rules_created:=v_rules_created+v_changed;
        v_link_sort:=0;
        for v_group_source_id in select jsonb_array_elements_text(v_item->'optionGroupIds') loop
          select (g.value->>'databaseId')::uuid into v_group_id
            from jsonb_array_elements(v_source->'modifierGroups') g
            where g.value->>'id'=v_group_source_id and g.value->>'importKind'='source';
          if not found then raise exception 'mealdeck_launch_import_modifier_link_missing'; end if;
          insert into public.menu_item_modifier_groups(tenant_id,item_id,group_id,sort_order)
            values(v_tenant,v_item_id,v_group_id,v_link_sort)
            on conflict(item_id,group_id) do nothing;
          get diagnostics v_changed=row_count;
          v_links_created:=v_links_created+v_changed;
          v_link_sort:=v_link_sort+1;
        end loop;
      end loop;
    end loop;
  end loop;

  if v_categories_created+v_items_created+v_groups_created+v_options_created
      +v_routes_created+v_rules_created+v_links_created>0 then
    insert into public.mealdeck_ops_audit_log(
      tenant_id,location_id,actor_id,action,entity_type,entity_id,next_value
    ) values(v_tenant,v_location,null,'catalogue.launch_import','catalogue',v_tenant,
      jsonb_build_object('operator','database_owner','sourceSha256',v_source_hash,
        'approvedOn',v_source->>'approvedOn','initialItemPricePence',v_source->'initialItemPricePence',
        'optionalUpgradePricePence',v_source->'optionalUpgradePricePence',
        'categoriesCreated',v_categories_created,'itemsCreated',v_items_created,
        'groupsCreated',v_groups_created,'optionsCreated',v_options_created,
        'routesCreated',v_routes_created,'rulesCreated',v_rules_created,
        'itemGroupLinksCreated',v_links_created,'orderingEnabled',false,
        'existingRecordsOverwritten',false,'crossReplacementLinksImported',false));
  end if;
  raise notice 'MealDeck draft catalogue: % new items, % new options; existing records preserved; ordering remains closed.',
    v_items_created,v_options_created;
end __BLOCK_TAG__;
