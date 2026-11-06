-- Generated with `supabase migration new mealdeck_public_launch_catalogue`.
-- A bounded, read-only projection for the server adapter. This does not enable
-- checkout, publish drafts, change prices or grant public access to menu tables.
begin;
set local lock_timeout='5s';

do $guard$ begin
  if to_regnamespace('dishbee_private') is not null
    or to_regclass('mealdeck_private.installation') is null then
    raise exception 'mealdeck_public_menu_independent_profile_required';
  end if;
  if not exists(select 1 from mealdeck_private.installation where singleton
      and profile='mealdeck-independent-v1')
    or to_regprocedure('mealdeck_private.price_checkout_lines(uuid,uuid,jsonb)') is null then
    raise exception 'mealdeck_public_menu_checkout_catalogue_required';
  end if;
end $guard$;

create or replace function public.mealdeck_public_launch_catalogue(
  p_tenant uuid,p_location uuid,p_skus text[],p_replacement_options uuid[]
) returns jsonb language plpgsql stable security definer set search_path='' as $function$
declare items jsonb; replacements jsonb;
begin
  -- ACLs below admit only service_role. No customer identity or caller-selected
  -- kitchen can override the installed business and sole active launch kitchen.
  if p_tenant is null or p_location is null
    or not exists(select 1 from mealdeck_private.installation i
      join public.tenants t on t.id=i.business_id
      join public.tenant_locations l on l.tenant_id=t.id
      where i.singleton and i.profile='mealdeck-independent-v1'
        and i.business_id=p_tenant and i.bootstrap_owner_id is not null
        and i.bootstrapped_at is not null and t.active
        and t.slug='mealdeck' and t.legal_name='313 Brands Ltd' and t.currency='GBP'
        and l.id=p_location and l.slug='shared-kitchen' and l.active)
    or (select count(*) from public.tenants)<>1
    or (select count(*) from public.tenant_locations where tenant_id=p_tenant and active)<>1 then
    raise exception 'mealdeck_public_menu_scope_unavailable';
  end if;
  if p_skus is null or cardinality(p_skus) not between 1 and 256
    or exists(select 1 from unnest(p_skus) s where s is null or length(s)>180
      or s !~ '^[a-z0-9]+(-[a-z0-9]+)*$')
    or (select count(distinct s) from unnest(p_skus) s)<>cardinality(p_skus)
    or p_replacement_options is null or cardinality(p_replacement_options)>128
    or exists(select 1 from unnest(p_replacement_options) o where o is null)
    or (select count(distinct o) from unnest(p_replacement_options) o)<>cardinality(p_replacement_options) then
    raise exception 'mealdeck_public_menu_invalid_request';
  end if;

  -- Publication and routing match price_checkout_lines. The channel's enabled
  -- switch, opening hours and payment setup intentionally do not gate browsing.
  select coalesce(jsonb_agg(jsonb_build_object(
    'sku',x.sku,'brandSlug',b.slug,'name',x.name,'description',nullif(x.description,''),
    'pricePence',coalesce(r.price_override_pence,x.price_pence),
    'requiredGroupIds',coalesce((select jsonb_agg(g.id order by g.id)
      from public.menu_item_modifier_groups a
      join public.modifier_groups g on g.id=a.group_id and g.tenant_id=a.tenant_id
      where a.tenant_id=p_tenant and a.item_id=x.id and g.min_select>0),'[]'::jsonb),
    'options',coalesce((select jsonb_agg(jsonb_build_object(
        'id',o.id,'groupId',o.group_id,'pricePence',o.price_delta_pence,'available',o.active
      ) order by o.id)
      from public.menu_item_modifier_groups a
      join public.modifier_groups g on g.id=a.group_id and g.tenant_id=a.tenant_id
      join public.modifier_options o on o.group_id=g.id and o.tenant_id=g.tenant_id
      where a.tenant_id=p_tenant and a.item_id=x.id),'[]'::jsonb)
  ) order by x.sku),'[]'::jsonb) into items
  from public.menu_items x
  join public.tenant_brands b on b.id=x.brand_id and b.tenant_id=x.tenant_id
  join public.menu_categories c on c.id=x.category_id and c.tenant_id=x.tenant_id and c.brand_id=x.brand_id
  join public.menu_item_channel_rules r on r.menu_item_id=x.id and r.tenant_id=x.tenant_id
    and r.location_id=p_location and r.channel_key='mealdeck'
  where x.tenant_id=p_tenant and x.sku=any(p_skus) and x.active and b.active and c.active and r.visible
    and b.slug in ('skorch-burgers','loadd','moktl','tavo-chicken','souvano')
    and (select count(*) from public.menu_items duplicate where duplicate.tenant_id=p_tenant and duplicate.sku=x.sku)=1
    and exists(select 1 from public.menu_item_station_routes route
      join public.kitchen_stations station on station.id=route.station_id
        and station.tenant_id=route.tenant_id and station.location_id=route.location_id and station.active
      where route.tenant_id=p_tenant and route.location_id=p_location and route.item_id=x.id);

  -- Cross replacements are not linked to every source main: their canonical
  -- option is charged instead of the selected source upgrade, exactly once.
  select coalesce(jsonb_agg(jsonb_build_object(
    'id',o.id,'groupId',o.group_id,'pricePence',o.price_delta_pence,'available',o.active
  ) order by o.id),'[]'::jsonb) into replacements
  from public.modifier_options o
  join public.modifier_groups g on g.id=o.group_id and g.tenant_id=o.tenant_id
  where o.tenant_id=p_tenant and o.id=any(p_replacement_options);

  return jsonb_build_object('schemaVersion',1,'tenantId',p_tenant,'locationId',p_location,
    'checkedAt',now(),'items',items,'replacementOptions',replacements);
end
$function$;
revoke all on function public.mealdeck_public_launch_catalogue(uuid,uuid,text[],uuid[])
  from public,anon,authenticated,service_role;
grant execute on function public.mealdeck_public_launch_catalogue(uuid,uuid,text[],uuid[]) to service_role;
comment on function public.mealdeck_public_launch_catalogue(uuid,uuid,text[],uuid[]) is
  'Read-only launch catalogue for the MealDeck server adapter. Service role only; no checkout or publication side effects.';
commit;
