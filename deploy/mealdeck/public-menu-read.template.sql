-- Template only. Generate a new reviewed migration with public-menu-read.mjs.
-- Public source mapping SHA-256: __SOURCE_SHA256__
-- Browsing only. No checkout, payment, staff, customer or base-table grants.
begin;
set local lock_timeout='5s';
set local statement_timeout='30s';
set local standard_conforming_strings=on;
set local check_function_bodies=on;

do $guard$
begin
  if to_regnamespace('dishbee_private') is not null
    or to_regclass('mealdeck_private.installation') is null then
    raise exception 'mealdeck_public_menu_independent_profile_required'; end if;
  if current_user in ('anon','authenticated','service_role') or not exists(
    select 1 from pg_class c where c.oid='mealdeck_private.installation'::regclass
      and pg_has_role(current_user,c.relowner,'USAGE')) then
    raise exception 'mealdeck_public_menu_database_owner_required'; end if;
  if not exists(select 1 from mealdeck_private.installation where singleton
      and profile='mealdeck-independent-v1' and business_id is not null
      and bootstrap_owner_id is not null and bootstrapped_at is not null)
    or to_regprocedure('mealdeck_private.price_checkout_lines(uuid,uuid,jsonb)') is null then
    raise exception 'mealdeck_public_menu_bootstrapped_catalogue_required'; end if;
  if to_regprocedure('extensions.uuid_generate_v5(uuid,text)') is null then
    raise exception 'mealdeck_public_menu_uuid_extension_required'; end if;
end $guard$;

create or replace function public.mealdeck_public_menu()
returns jsonb language plpgsql stable security definer set search_path='' as $function$
declare
  v_tenant uuid;v_location uuid;v_items jsonb;
  -- Frozen reviewed source identities, not caller input or editable database labels.
  v_source constant jsonb := __SOURCE_MANIFEST__::jsonb;
begin
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

  with source_items as materialized (
    select * from jsonb_to_recordset(v_source->'items')
      as s(sku text,brand text,groups jsonb,replacement jsonb)
  ), source_groups as materialized (
    select g->>'id' source_id,
      extensions.uuid_generate_v5(v_tenant,'mealdeck-launch-v1:group:'||(g->>'id')) group_id,
      g->'options' options
    from jsonb_array_elements(v_source->'groups') g
  ), source_options as materialized (
    select g.group_id,o->>'id' source_id,
      extensions.uuid_generate_v5(v_tenant,'mealdeck-launch-v1:option:'||(o->>'id')) option_id,
      (o->>'allowed')::boolean allowed
    from source_groups g cross join lateral jsonb_array_elements(g.options) o
  )
  select coalesce(jsonb_agg(
    jsonb_build_object(
      'sku',s.sku,'categoryName',c.name,'name',x.name,'description',nullif(x.description,''),
      'pricePence',coalesce(r.price_override_pence,x.price_pence),
      'options',coalesce((
        select jsonb_object_agg(so.source_id,jsonb_build_object(
          'label',o.name,'pricePence',o.price_delta_pence,'available',so.allowed and o.active
        ) order by so.source_id)
        from jsonb_array_elements_text(s.groups) item_group(source_id)
        join source_groups sg on sg.source_id=item_group.source_id
        join public.modifier_groups g on g.id=sg.group_id and g.tenant_id=v_tenant
        join public.menu_item_modifier_groups link on link.group_id=g.id
          and link.tenant_id=g.tenant_id and link.item_id=x.id
        join source_options so on so.group_id=g.id
        join public.modifier_options o on o.id=so.option_id
          and o.group_id=g.id and o.tenant_id=g.tenant_id
        where length(btrim(o.name)) between 1 and 140
          and o.price_delta_pence between 0 and 1000000
      ),'{}'::jsonb),
      'replacementPricePence',case when replacement.active then replacement.price_delta_pence else null end
    ) || case when replacement.id is null then '{}'::jsonb
      else jsonb_build_object('replacementLabel',replacement.name) end
    order by s.sku
  ),'[]'::jsonb) into v_items
  from source_items s
  join public.menu_items x on x.sku=s.sku and x.tenant_id=v_tenant
  join public.tenant_brands b on b.id=x.brand_id and b.tenant_id=x.tenant_id and b.slug=s.brand
  join public.menu_categories c on c.id=x.category_id and c.tenant_id=x.tenant_id and c.brand_id=x.brand_id
  join public.menu_item_channel_rules r on r.menu_item_id=x.id and r.tenant_id=x.tenant_id
    and r.location_id=v_location and r.channel_key='mealdeck'
  left join lateral (
    select o.id,o.name,o.price_delta_pence,o.active
      from source_groups sg join source_options so on so.group_id=sg.group_id
      join public.modifier_groups g on g.id=sg.group_id and g.tenant_id=v_tenant
      join public.modifier_options o on o.id=so.option_id and o.group_id=g.id and o.tenant_id=g.tenant_id
      where sg.source_id=s.replacement->>'group' and so.source_id=s.replacement->>'option'
        and so.allowed and length(btrim(o.name)) between 1 and 140
        and o.price_delta_pence between 0 and 1000000
  ) replacement on true
  where x.active and b.active and c.active and r.visible
    and length(btrim(x.name)) between 1 and 140 and length(btrim(c.name)) between 1 and 140
    and coalesce(length(x.description),0)<=2000
    and coalesce(r.price_override_pence,x.price_pence) between 0 and 1000000
    and (select count(*) from public.menu_items duplicate
      where duplicate.tenant_id=v_tenant and duplicate.sku=x.sku)=1
    and exists(select 1 from public.menu_item_station_routes route
      join public.kitchen_stations station on station.id=route.station_id
        and station.tenant_id=route.tenant_id and station.location_id=route.location_id and station.active
      where route.tenant_id=v_tenant and route.location_id=v_location and route.item_id=x.id)
    -- New required groups cannot silently disappear from the reviewed customer form.
    and not exists(select 1 from public.menu_item_modifier_groups required_link
      join public.modifier_groups required_group on required_group.id=required_link.group_id
        and required_group.tenant_id=required_link.tenant_id
      where required_link.tenant_id=v_tenant and required_link.item_id=x.id and required_group.min_select>0
        and not exists(select 1 from jsonb_array_elements_text(s.groups) known(source_id)
          join source_groups sg on sg.source_id=known.source_id where sg.group_id=required_group.id));

  return jsonb_build_object('available',true,'checkedAt',now(),'items',v_items);
end
$function$;
revoke all on function public.mealdeck_public_menu() from public,anon,authenticated,service_role;
grant execute on function public.mealdeck_public_menu() to anon,authenticated;
comment on function public.mealdeck_public_menu() is
  'Read-only reviewed public menu; installed MealDeck scope only, source keys only, independent of checkout readiness.';
notify pgrst,'reload schema';
commit;
