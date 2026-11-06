-- Replace only the two audited temporary modifier blocks with linked stock.
-- The Rubicon products remain out of stock. Apply after the included-drink
-- extension, following a fresh read of these exact option/audit identities.
do $rubicon_linked_stock$
declare option_row record; latest_audit public.mealdeck_ops_audit_log%rowtype;
  product_count integer;
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
  if not exists(select 1 from pg_proc
    where oid=to_regprocedure('mealdeck_private.price_checkout_lines(uuid,uuid,jsonb)')
      and prosecdef and proconfig @> array['search_path=""']
      and md5(prosrc)='c867416a25499f372e6bce2c93468831')
    or not exists(select 1 from pg_proc
      where oid=to_regprocedure('public.mealdeck_public_menu()')
        and prosecdef and proconfig @> array['search_path=""']
        and md5(prosrc)='df46e674718f1a86455498298e9f48a1')
    or not exists(select 1 from pg_proc
      where oid=to_regprocedure('mealdeck_private.included_drink_stock_available(uuid,uuid,uuid)')
        and prosecdef and proconfig @> array['search_path=""']
        and md5(prosrc)='07147a0bfd0e85e7b3e219dcd60127cc')
    or not exists(select 1 from pg_proc
      where oid=to_regprocedure('mealdeck_private.included_drink_stock_bindings(uuid)')
        and prosecdef and proconfig @> array['search_path=""']
        and md5(prosrc)='c0609f8515dcba6c8dde23e2f6e697cd') then
    raise exception 'mealdeck_rubicon_linked_stock_not_installed'; end if;

  -- Hold the actual product visibility rows through the transition. Never
  -- replace a concurrent operator decision about current kitchen stock.
  perform 1 from public.menu_items i
    join public.menu_item_channel_rules r on r.tenant_id=i.tenant_id and r.menu_item_id=i.id
    where i.tenant_id='94f97f02-70ec-445a-87a4-b51c0956d193'
      and r.location_id='a0ba64ac-e268-44d3-8345-fce8d24999b6' and r.channel_key='mealdeck'
      and i.sku in ('skorch-burgers-cans-drinks-rubicon-mango','loadd-cans-drinks-rubicon-mango')
    order by i.id for share of i,r;
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
      and name='Rubicon Mango' and price_delta_pence=0 and not active)<>2 then
    raise exception 'mealdeck_rubicon_option_changed_review_required'; end if;
  for option_row in select * from public.modifier_options
    where tenant_id='94f97f02-70ec-445a-87a4-b51c0956d193'
      and id in ('1efdbb3e-5af4-5698-978c-515d36b3d073','28e6f80b-76b1-552a-a4bf-69a00889f7d8')
    order by id for update
  loop
    select * into latest_audit from public.mealdeck_ops_audit_log
      where tenant_id=option_row.tenant_id and entity_id=option_row.id
      -- An older transaction can insert a newer audit with an earlier now().
      -- The immutable identity sequence must detect that later staff decision.
      order by id desc limit 1;
    if option_row.active or option_row.name<>'Rubicon Mango' or option_row.price_delta_pence<>0
      or latest_audit.id is distinct from (case option_row.id
        when '1efdbb3e-5af4-5698-978c-515d36b3d073'::uuid then 91::bigint else 92::bigint end)
      or latest_audit.action is distinct from 'menu.stock_containment'
      or latest_audit.next_value->'active' is distinct from 'false'::jsonb
      or mealdeck_private.included_drink_stock_available(option_row.tenant_id,
        'a0ba64ac-e268-44d3-8345-fce8d24999b6',option_row.id) is distinct from false then
      raise exception 'mealdeck_rubicon_containment_changed_review_required'; end if;
    update public.modifier_options set active=true where id=option_row.id and tenant_id=option_row.tenant_id;
    insert into public.mealdeck_ops_audit_log(tenant_id,location_id,actor_id,action,entity_type,entity_id,previous_value,next_value)
      values(option_row.tenant_id,'a0ba64ac-e268-44d3-8345-fce8d24999b6',null,
        'menu.stock_binding_enabled','modifier_option',option_row.id,
        jsonb_build_object('active',false,'containmentAuditId',latest_audit.id),
        jsonb_build_object('active',true,'available',false,'priceDeltaPence',0,
          'reason','Included drink now follows its standalone product stock; Rubicon Mango remains unavailable.'));
  end loop;
end $rubicon_linked_stock$;
