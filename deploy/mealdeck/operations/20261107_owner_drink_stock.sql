-- Owner-confirmed kitchen stock, 7 November 2026:
-- Coke, Pepsi Max, Tango Apple and Water Bottle in the existing cans/drinks menus.
-- Add new Coke identities; preserve every old item, option, price and order.
-- Apply after 20261107_coke_public_manifest.sql. Atomic, audited, and once-only.
do $owner_drink_stock$
declare
  scope_tenant constant uuid := '94f97f02-70ec-445a-87a4-b51c0956d193';
  scope_location constant uuid := 'a0ba64ac-e268-44d3-8345-fce8d24999b6';
  template_item public.menu_items%rowtype;
  template_route public.menu_item_station_routes%rowtype;
  brand_row record; stock_row record; group_row record;
  new_item uuid; new_option uuid; new_sku text; desired_visible boolean;
  drink_count integer; available_count integer;
begin
  perform set_config('lock_timeout','5s',true);
  perform set_config('statement_timeout','15s',true);
  if to_regnamespace('dishbee_private') is not null or not exists(
    select 1 from mealdeck_private.installation
      where singleton and profile='mealdeck-independent-v1' and business_id=scope_tenant
  ) then raise exception 'mealdeck_drink_stock_wrong_database'; end if;
  if current_user in ('anon','authenticated','service_role') or not exists(
    select 1 from pg_class where oid='mealdeck_private.installation'::regclass
      and pg_has_role(current_user,relowner,'USAGE')
  ) then raise exception 'mealdeck_drink_stock_database_owner_required'; end if;
  if not exists(select 1 from pg_proc
      where oid=to_regprocedure('mealdeck_private.public_menu_before_included_stock()')
        and md5(prosrc)='29ca45226d72512c1f21c38be46ee8f2'
        and prosecdef and proconfig @> array['search_path=""'])
    or not exists(select 1 from pg_proc
      where oid=to_regprocedure('mealdeck_private.included_drink_stock_bindings(uuid)')
        and md5(prosrc)='24f016f9c04e02c1db294147e2af6a79'
        and prosecdef and proconfig @> array['search_path=""'])
  then raise exception 'mealdeck_drink_stock_manifest_required'; end if;

  -- Serialize this one-time catalogue operation, and do not undo later staff stock edits.
  perform pg_advisory_xact_lock(hashtextextended('mealdeck-owner-drinks-20261107:'||scope_tenant::text,0));
  if exists(select 1 from public.mealdeck_ops_audit_log
    where tenant_id=scope_tenant and location_id=scope_location
      and action='menu.owner_drink_stock_20261107' and entity_id=scope_tenant)
  then return; end if;
  lock table public.menu_items,public.modifier_options,
    public.menu_item_station_routes,public.menu_item_channel_rules in share row exclusive mode;

  if (select count(*) from public.menu_items i
    join public.tenant_brands b on b.id=i.brand_id and b.tenant_id=i.tenant_id
    join public.menu_categories c on c.id=i.category_id and c.tenant_id=i.tenant_id
      and c.brand_id=i.brand_id
    where i.tenant_id=scope_tenant and b.slug in ('tavo-chicken','loadd','skorch-burgers')
      and c.slug='cans-drinks')<>24
  then raise exception 'mealdeck_drink_stock_catalogue_changed_review_required'; end if;
  if (select count(*) from public.tenant_brands b
    join public.menu_categories c on c.brand_id=b.id and c.tenant_id=b.tenant_id
    where b.tenant_id=scope_tenant and b.slug in ('tavo-chicken','loadd','skorch-burgers')
      and b.active and c.slug='cans-drinks' and c.active)<>3
  then raise exception 'mealdeck_drink_stock_brand_category_review_required'; end if;

  select * into strict template_item from public.menu_items
    where tenant_id=scope_tenant and sku='tavo-chicken-cans-drinks-coke' for share;
  if template_item.name<>'Coke' or template_item.price_pence<>100 or not template_item.active
    or not exists(select 1 from public.tenant_brands
      where id=template_item.brand_id and tenant_id=scope_tenant and slug='tavo-chicken' and active)
  then raise exception 'mealdeck_drink_stock_coke_template_changed'; end if;
  select r.* into strict template_route from public.menu_item_station_routes r
    join public.kitchen_stations s on s.id=r.station_id and s.tenant_id=r.tenant_id
      and s.location_id=r.location_id
    where r.tenant_id=scope_tenant and r.location_id=scope_location
      and r.item_id=template_item.id and s.code='SHARED' and s.active for share of r,s;
  if exists(select 1 from public.menu_items where tenant_id=scope_tenant
    and sku in ('loadd-cans-drinks-coke','skorch-burgers-cans-drinks-coke'))
  then raise exception 'mealdeck_drink_stock_new_coke_already_exists_review_required'; end if;

  for brand_row in
    select b.id,b.slug,c.id as category_id from public.tenant_brands b
    join public.menu_categories c on c.tenant_id=b.tenant_id and c.brand_id=b.id
    where b.tenant_id=scope_tenant and b.slug in ('loadd','skorch-burgers')
      and b.active and c.slug='cans-drinks' and c.active order by b.slug for share of b,c
  loop
    new_sku:=brand_row.slug||'-cans-drinks-coke';
    insert into public.menu_items(
      tenant_id,brand_id,category_id,name,description,price_pence,image_url,sku,active,dietary,allergens
    ) values(
      scope_tenant,brand_row.id,brand_row.category_id,template_item.name,
      template_item.description,template_item.price_pence,template_item.image_url,new_sku,true,
      template_item.dietary,template_item.allergens
    ) returning id into new_item;
    insert into public.menu_item_station_routes(
      tenant_id,location_id,item_id,station_id,prep_kind,prep_seconds
    ) values(
      scope_tenant,scope_location,new_item,template_route.station_id,
      template_route.prep_kind,template_route.prep_seconds
    );
    insert into public.menu_item_channel_rules(
      tenant_id,location_id,channel_key,menu_item_id,visible,price_override_pence
    ) values(scope_tenant,scope_location,'mealdeck',new_item,true,null);
    insert into public.mealdeck_ops_audit_log(
      tenant_id,location_id,actor_id,action,entity_type,entity_id,previous_value,next_value
    ) values(
      scope_tenant,scope_location,null,'menu.owner_drink_added','menu_item',new_item,null,
      jsonb_build_object('sku',new_sku,'name','Coke','pricePence',100,'visible',true,
        'templateSku',template_item.sku,'reason','Owner confirmed Coke in stock on 7 November 2026.')
    );
  end loop;

  for group_row in
    select source_id,extensions.uuid_generate_v5(scope_tenant,'mealdeck-launch-v1:group:'||source_id) as id
    from (values ('skorch-burgers-included-meal-drink'),('skorch-burgers-kids-included-drink')) g(source_id)
  loop
    if not exists(select 1 from public.modifier_groups
      where tenant_id=scope_tenant and id=group_row.id
        and name in ('Skorch · Included meal drink','Skorch · Included meal drink (kids meals)')
        and max_select=1)
    then raise exception 'mealdeck_drink_stock_included_group_changed'; end if;
    new_option:=extensions.uuid_generate_v5(
      scope_tenant,'mealdeck-launch-v1:option:'||group_row.source_id||'-coke');
    if exists(select 1 from public.modifier_options where id=new_option)
    then raise exception 'mealdeck_drink_stock_coke_option_already_exists_review_required'; end if;
    insert into public.modifier_options(id,tenant_id,group_id,name,price_delta_pence,active)
      values(new_option,scope_tenant,group_row.id,'Coke',0,true);
    insert into public.mealdeck_ops_audit_log(
      tenant_id,location_id,actor_id,action,entity_type,entity_id,previous_value,next_value
    ) values(
      scope_tenant,scope_location,null,'menu.owner_drink_added','modifier_option',new_option,null,
      jsonb_build_object('sourceId',group_row.source_id||'-coke','name','Coke',
        'priceDeltaPence',0,'active',true,
        'reason','Included Coke follows its exact Skorch standalone stock SKU.')
    );
  end loop;

  -- Change only per-kitchen visibility; keep unavailable drinks and prices for restocking/history.
  drink_count:=0;
  for stock_row in
    select i.id,i.sku,i.name,i.active,b.slug as brand_slug,r.visible
    from public.menu_items i
    join public.tenant_brands b on b.id=i.brand_id and b.tenant_id=i.tenant_id
    join public.menu_categories c on c.id=i.category_id and c.tenant_id=i.tenant_id
      and c.brand_id=i.brand_id
    join public.menu_item_channel_rules r on r.tenant_id=i.tenant_id and r.menu_item_id=i.id
      and r.location_id=scope_location and r.channel_key='mealdeck'
    where i.tenant_id=scope_tenant and b.slug in ('tavo-chicken','loadd','skorch-burgers')
      and c.slug='cans-drinks'
    order by i.sku for update of r
  loop
    desired_visible:=stock_row.sku=any(array[
      stock_row.brand_slug||'-cans-drinks-coke',
      stock_row.brand_slug||'-cans-drinks-pepsi-max',
      stock_row.brand_slug||'-cans-drinks-tango-apple',
      stock_row.brand_slug||'-cans-drinks-water-bottle'
    ]);
    if desired_visible and not stock_row.active then
      raise exception 'mealdeck_drink_stock_product_globally_inactive_review_required';
    end if;
    if stock_row.visible is distinct from desired_visible then
      update public.menu_item_channel_rules set visible=desired_visible,updated_at=now()
        where tenant_id=scope_tenant and location_id=scope_location
          and channel_key='mealdeck' and menu_item_id=stock_row.id;
      insert into public.mealdeck_ops_audit_log(
        tenant_id,location_id,actor_id,action,entity_type,entity_id,previous_value,next_value
      ) values(
        scope_tenant,scope_location,null,'menu.owner_drink_stock','menu_item',stock_row.id,
        jsonb_build_object('sku',stock_row.sku,'visible',stock_row.visible),
        jsonb_build_object('sku',stock_row.sku,'visible',desired_visible,
          'reason','Owner stock list: Coke, Pepsi Max, Tango Apple and Water; other cans unavailable.')
      );
    end if;
    drink_count:=drink_count+1;
  end loop;
  if drink_count<>26 then raise exception 'mealdeck_drink_stock_expected_twenty_six_rules'; end if;

  select count(*) into available_count
    from jsonb_array_elements(public.mealdeck_public_menu()->'items') item
    where item->>'sku' like '%-cans-drinks-%';
  if available_count<>12 then raise exception 'mealdeck_drink_stock_expected_twelve_available_products'; end if;
  if (select count(*) from mealdeck_private.included_drink_stock_bindings(scope_tenant) b
    where mealdeck_private.included_drink_stock_available(scope_tenant,scope_location,b.option_id))<>16
  then raise exception 'mealdeck_drink_stock_expected_sixteen_included_choices'; end if;
  if (select count(distinct option.key)
    from jsonb_array_elements(public.mealdeck_public_menu()->'items') item
    cross join lateral jsonb_each(item->'options') option
    where (option.key like '%-included-meal-drink-%' or option.key like '%-kids-included-drink-%')
      and option.value->'available'='true'::jsonb)<>16
  then raise exception 'mealdeck_drink_stock_expected_sixteen_public_included_choices'; end if;

  insert into public.mealdeck_ops_audit_log(
    tenant_id,location_id,actor_id,action,entity_type,entity_id,previous_value,next_value
  ) values(
    scope_tenant,scope_location,null,'menu.owner_drink_stock_20261107','catalogue',scope_tenant,null,
    jsonb_build_object(
      'brands',jsonb_build_array('tavo-chicken','loadd','skorch-burgers'),
      'inStock',jsonb_build_array('Coke','Pepsi Max','Tango Apple','Water Bottle'),
      'availableProducts',12,'includedChoices',16,'preservedExistingPrices',true,
      'reason','Owner instruction on 7 November 2026; later staff stock edits remain authoritative.')
  );
end $owner_drink_stock$;

