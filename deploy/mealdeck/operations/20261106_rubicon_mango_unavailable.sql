-- Owner-reported Rubicon Mango stock containment, 6 November 2026.
-- Run this single owner statement only in the independent MealDeck database.
-- It closes the two currently unlinked meal choices; it changes no paid order.
do $rubicon_stock$
declare option_row record; product_count integer;
begin
  perform set_config('lock_timeout','5s',true);
  perform set_config('statement_timeout','15s',true);
  if to_regnamespace('dishbee_private') is not null or not exists(
    select 1 from mealdeck_private.installation where singleton and profile='mealdeck-independent-v1'
      and business_id='94f97f02-70ec-445a-87a4-b51c0956d193') then
    raise exception 'mealdeck_rubicon_wrong_database'; end if;
  if current_user in ('anon','authenticated','service_role') or not exists(
    select 1 from pg_class where oid='mealdeck_private.installation'::regclass
      and pg_has_role(current_user,relowner,'USAGE')) then
    raise exception 'mealdeck_rubicon_database_owner_required'; end if;
  select count(*) into product_count from public.menu_items i
    join public.menu_item_channel_rules r on r.tenant_id=i.tenant_id and r.menu_item_id=i.id
    where i.tenant_id='94f97f02-70ec-445a-87a4-b51c0956d193'
      and r.location_id='a0ba64ac-e268-44d3-8345-fce8d24999b6' and r.channel_key='mealdeck'
      and i.sku in ('skorch-burgers-cans-drinks-rubicon-mango','loadd-cans-drinks-rubicon-mango')
      and i.name='Rubicon Mango' and not r.visible;
  if product_count<>2 then raise exception 'mealdeck_rubicon_stock_changed_review_required'; end if;
  if (select count(*) from public.modifier_options
    where tenant_id='94f97f02-70ec-445a-87a4-b51c0956d193'
      and id in ('1efdbb3e-5af4-5698-978c-515d36b3d073','28e6f80b-76b1-552a-a4bf-69a00889f7d8')
      and name='Rubicon Mango' and price_delta_pence=0)<>2 then
    raise exception 'mealdeck_rubicon_option_changed_review_required'; end if;
  for option_row in select * from public.modifier_options
    where tenant_id='94f97f02-70ec-445a-87a4-b51c0956d193'
      and id in ('1efdbb3e-5af4-5698-978c-515d36b3d073','28e6f80b-76b1-552a-a4bf-69a00889f7d8')
    order by id for update
  loop
    if option_row.active then
      update public.modifier_options set active=false where id=option_row.id and tenant_id=option_row.tenant_id;
      insert into public.mealdeck_ops_audit_log(tenant_id,location_id,actor_id,action,entity_type,entity_id,previous_value,next_value)
      values(option_row.tenant_id,'a0ba64ac-e268-44d3-8345-fce8d24999b6',null,
        'menu.stock_containment','modifier_option',option_row.id,
        jsonb_build_object('active',true,'priceDeltaPence',option_row.price_delta_pence),
        jsonb_build_object('active',false,'priceDeltaPence',option_row.price_delta_pence,
          'reason','Owner reported Rubicon Mango out of stock; standalone cans already unavailable; included meal choices require stock binding.'));
    end if;
  end loop;
end $rubicon_stock$;
