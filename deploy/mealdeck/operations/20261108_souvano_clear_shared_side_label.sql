-- Owner report, 8 November 2026: Souvano KDS displayed "Doner / Lamb Chops"
-- in the shared side group and staff could not tell which main was ordered.
--
-- One-time metadata correction for the independent MealDeck database ONLY.
-- Do not execute against Dishbee, do not rewrite canonical purchased lines,
-- modifier options, prices, historical orders, receipts or KDS stages.
-- Live KDS separately normalises old frozen group labels for historical tickets.
do $souvano_shared_side_label$
declare
  scope_tenant constant uuid := '94f97f02-70ec-445a-87a4-b51c0956d193';
  scope_location constant uuid := 'a0ba64ac-e268-44d3-8345-fce8d24999b6';
  legacy_name constant text := 'Souvano · Included side (Doner / Lamb Chops)';
  clear_name constant text := 'Souvano · Included side';
  souvano_brand uuid;
  current_group public.modifier_groups%rowtype;
  linked_skus text[];
  option_names text[];
begin
  perform set_config('lock_timeout','5s',true);
  perform set_config('statement_timeout','15s',true);

  if to_regnamespace('dishbee_private') is not null
    or to_regclass('mealdeck_private.installation') is null
    or not exists(
      select 1 from mealdeck_private.installation
      where singleton and profile='mealdeck-independent-v1' and business_id=scope_tenant
    )
  then raise exception 'mealdeck_souvano_wrong_database'; end if;
  if current_user in ('anon','authenticated','service_role') or not exists(
    select 1 from pg_class where oid='mealdeck_private.installation'::regclass
      and pg_has_role(current_user,relowner,'USAGE')
  ) then raise exception 'mealdeck_souvano_owner_required'; end if;

  select b.id into strict souvano_brand from public.tenant_brands b
    where b.tenant_id=scope_tenant and b.slug='souvano';

  -- This one shared side is attached to the two DIFFERENT mains; its name must
  -- not imply that a customer chose both.
  select * into strict current_group from public.modifier_groups g
    where g.tenant_id=scope_tenant and g.name in (legacy_name,clear_name)
    for update;
  if current_group.min_select<>1 or current_group.max_select<>1 then
    raise exception 'mealdeck_souvano_side_cardinality_changed';
  end if;

  select array_agg(i.sku order by i.sku) into linked_skus
    from public.menu_item_modifier_groups link
    join public.menu_items i on i.id=link.item_id and i.tenant_id=link.tenant_id
    where link.tenant_id=scope_tenant and link.group_id=current_group.id
      and i.brand_id=souvano_brand;
  if linked_skus is distinct from array[
    'souvano-lamb-chops-lamb-chops',
    'souvano-stir-fry-donner-stir-fry-donner'
  ]::text[] then raise exception 'mealdeck_souvano_side_links_changed'; end if;

  select array_agg(o.name order by o.name) into option_names
    from public.modifier_options o
    where o.tenant_id=scope_tenant and o.group_id=current_group.id;
  if option_names is distinct from array['Fries','Naan','Rice']::text[] then
    raise exception 'mealdeck_souvano_side_options_changed'; end if;
  if exists(
    select 1 from public.modifier_groups g where g.tenant_id=scope_tenant
      and g.name=clear_name and g.id<>current_group.id
  ) then raise exception 'mealdeck_souvano_side_name_collision'; end if;

  -- Do not override later staff edits or repeat an already-applied correction.
  if current_group.name=clear_name then return; end if;
  update public.modifier_groups set name=clear_name
    where id=current_group.id and tenant_id=scope_tenant and name=legacy_name;
  insert into public.mealdeck_ops_audit_log(
    tenant_id,location_id,actor_id,action,entity_type,entity_id,previous_value,next_value
  ) values(
    scope_tenant,scope_location,null,'menu.souvano_shared_side_label_20261108',
    'modifier_group',current_group.id,
    jsonb_build_object('name',legacy_name),
    jsonb_build_object('name',clear_name,
      'reason','Remove misleading shared side caption; each original main remains an individual SKU.')
  );
end $souvano_shared_side_label$;
