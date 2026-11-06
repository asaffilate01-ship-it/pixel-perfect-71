-- Generated with Supabase CLI 3.0.0: mealdeck_meal_components.
-- Display only: frozen source identities clarify included food. No order,
-- payment, quote, receipt job, stock or price rows are rewritten.
-- Reviewed source manifest SHA256: __SOURCE_SHA256__
begin;
set local lock_timeout='5s';
set local statement_timeout='30s';
set local check_function_bodies=on;
do $guard$
declare expected record;
begin
  if to_regnamespace('dishbee_private') is not null
    or to_regclass('mealdeck_private.installation') is null then
    raise exception 'mealdeck_meal_components_independent_profile_required'; end if;
  if current_user in ('anon','authenticated','service_role') or not exists(
    select 1 from pg_class where oid='mealdeck_private.installation'::regclass
      and pg_has_role(current_user,relowner,'USAGE')) then
    raise exception 'mealdeck_meal_components_database_owner_required'; end if;
  if not exists(select 1 from mealdeck_private.installation where singleton
      and profile='mealdeck-independent-v1' and business_id is not null)
    or to_regclass('mealdeck_private.order_numbers') is null
    or to_regprocedure('extensions.uuid_generate_v5(uuid,text)') is null then
    raise exception 'mealdeck_meal_components_previous_extensions_required'; end if;
  for expected in select * from (values
    ('mealdeck_private.order_checkout_quote_id(uuid)','ad869575c58ca66ef8e00b23290438fa','ad869575c58ca66ef8e00b23290438fa'),
    ('mealdeck_ops_private.kds_order_card(uuid,jsonb)','82df803179b9a6ba38c629cc80cda25e','__BODY_CARD__'),
    ('mealdeck_ops_private.receipt_snapshot(uuid)','880995efe09dfd02f710ea2a87cfd6a4','__BODY_RECEIPT__'),
    ('public.mealdeck_printer_acceptance_board(uuid,uuid)','ffbf0371323dda3ca7b6d61281f8d83d','__BODY_PENDING__')
  ) x(signature,old_hash,new_hash)
  loop
    if not exists(select 1 from pg_proc where oid=to_regprocedure(expected.signature)
      and prosecdef and proconfig @> array['search_path=""']
      and md5(prosrc) in (expected.old_hash,expected.new_hash)) then
      raise exception 'mealdeck_meal_components_unreviewed_definition: %',expected.signature; end if;
  end loop;
  for expected in select * from (values
    ('mealdeck_private.meal_components(uuid,jsonb)','__BODY_COMPONENTS__'),
    ('mealdeck_ops_private.kds_order_card_before_meal_components(uuid,jsonb)','82df803179b9a6ba38c629cc80cda25e'),
    ('mealdeck_ops_private.receipt_snapshot_before_meal_components(uuid)','880995efe09dfd02f710ea2a87cfd6a4')
  ) x(signature,body_hash)
  loop
    if to_regprocedure(expected.signature) is not null and not exists(
      select 1 from pg_proc where oid=to_regprocedure(expected.signature)
        and prosecdef and proconfig @> array['search_path=""'] and md5(prosrc)=expected.body_hash) then
      raise exception 'mealdeck_meal_components_unreviewed_helper: %',expected.signature; end if;
  end loop;
end $guard$;

create or replace function mealdeck_private.meal_components(p_tenant uuid,p_line jsonb)
returns jsonb language plpgsql immutable security definer set search_path='' as $$
declare manifest constant jsonb:=__SOURCE_MANIFEST__::jsonb;
  item jsonb;selection jsonb;matched jsonb:='[]';sides jsonb;drinks jsonb;components jsonb:='[]';
  name text;character integer;code integer;peri_count integer;meal_count integer;related_count integer;
begin
  if p_tenant is null or jsonb_typeof(p_line) is distinct from 'object'
    or p_line->>'parentLineId' is not null
    or jsonb_typeof(p_line->'modifiers') is distinct from 'array'
    or jsonb_array_length(p_line->'modifiers')>100 then return '[]'::jsonb; end if;
  select value into item from jsonb_array_elements(manifest->'items')
    where value->>'sku'=p_line->>'sku';
  if item is null then return '[]'::jsonb; end if;
  for selection in
    select m||jsonb_build_object('role',b->>'role','replacement',b->'replacement')
    from jsonb_array_elements(p_line->'modifiers') m
    join jsonb_array_elements(manifest->'options') b
      on m->>'id'=extensions.uuid_generate_v5(p_tenant,'mealdeck-launch-v1:option:'||(b->>'option'))::text
      and m->>'group_id'=extensions.uuid_generate_v5(p_tenant,'mealdeck-launch-v1:group:'||(b->>'group'))::text
      and m->>'kind'=b->>'kind'
    where (b->>'kind'='source' and b->>'group' in (
      item->>'mealGroup',item->>'upgradeGroup',item->>'drinkGroup',item->>'sideGroup'))
      or (b->>'kind'='cross' and item->>'kind' in ('adult','kids'))
  loop
    -- These reviewed choices represent one component per parent. Unknown legacy
    -- quantities or unsafe labels are left in the original choices, not guessed.
    if selection->>'quantity_per_parent' is distinct from '1'
      or jsonb_typeof(selection->'name') is distinct from 'string' then return '[]'::jsonb; end if;
    name:=selection->>'name';
    if char_length(name) not between 1 and 1000 or name is distinct from btrim(name,
      U&'\0020\00A0\1680\2000\2001\2002\2003\2004\2005\2006\2007\2008\2009\200A\2028\2029\202F\205F\3000\FEFF') then
      return '[]'::jsonb; end if;
    for character in 1..char_length(name) loop
      code:=ascii(substr(name,character,1));
      if code between 0 and 31 or code between 127 and 159 or code between 55296 and 57343
        or code in (173,1564,1757,1807,2274,6158,65279,69821,69837,917505)
        or code between 1536 and 1541 or code between 2192 and 2193
        or code between 8203 and 8207 or code between 8234 and 8238
        or code between 8288 and 8292 or code between 8294 and 8303
        or code between 65529 and 65531 or code between 78896 and 78911
        or code between 113824 and 113827 or code between 119155 and 119162
        or code between 917536 and 917631 then return '[]'::jsonb; end if;
    end loop;
    matched:=matched||jsonb_build_array(selection);
  end loop;
  -- A newer or malformed replacement must not make the old default reappear.
  -- Unknown fulfilment choices keep their original ticket text without an
  -- inferred component summary until their stable identities are reviewed.
  select count(*) into related_count from jsonb_array_elements(p_line->'modifiers') m
    where m->>'kind'='cross' or m->>'group_id' in (
      extensions.uuid_generate_v5(p_tenant,'mealdeck-launch-v1:group:'||(item->>'mealGroup'))::text,
      extensions.uuid_generate_v5(p_tenant,'mealdeck-launch-v1:group:'||(item->>'upgradeGroup'))::text,
      extensions.uuid_generate_v5(p_tenant,'mealdeck-launch-v1:group:'||(item->>'drinkGroup'))::text,
      extensions.uuid_generate_v5(p_tenant,'mealdeck-launch-v1:group:'||(item->>'sideGroup'))::text,
      extensions.uuid_generate_v5(p_tenant,'mealdeck-launch-v1:group:cross-side-replacement')::text,
      extensions.uuid_generate_v5(p_tenant,'mealdeck-launch-v1:group:cross-drink-replacement')::text);
  if related_count<>jsonb_array_length(matched) then return '[]'::jsonb; end if;
  select count(*) into meal_count from jsonb_array_elements(matched) m where m->>'role'='meal';
  if item->>'kind'='adult' and meal_count<>1 then return '[]'::jsonb; end if;
  select coalesce(jsonb_agg(m),'[]'::jsonb) into sides from jsonb_array_elements(matched) m where m->>'role'='side';
  select coalesce(jsonb_agg(m),'[]'::jsonb) into drinks from jsonb_array_elements(matched) m where m->>'role'='drink';
  select count(*) into peri_count from jsonb_array_elements(matched) m where m->>'role'='peri';
  if jsonb_array_length(sides)>1 or jsonb_array_length(drinks)>1 or peri_count>1
    or (peri_count=1 and jsonb_array_length(sides)>0) then return '[]'::jsonb; end if;
  if item->>'kind'='side' then
    if jsonb_array_length(sides)<>1 then return '[]'::jsonb; end if;
    return jsonb_build_array(jsonb_build_object('slot','side','name',sides->0->>'name',
      'quantityPerParent',1,'replacement',false));
  end if;
  if item->>'kind'='kids' then
    components:=jsonb_build_array(jsonb_build_object('slot','main','name','6 nuggets',
      'quantityPerParent',1,'replacement',false));
  end if;
  components:=components||jsonb_build_array(jsonb_build_object('slot','side',
    'name',case when jsonb_array_length(sides)=1 then sides->0->>'name'
      when peri_count=1 then 'Fries with peri salt' else 'Fries' end,
    'quantityPerParent',1,'replacement',jsonb_array_length(sides)=1));
  if jsonb_array_length(drinks)=1 then
    components:=components||jsonb_build_array(jsonb_build_object('slot','drink','name',drinks->0->>'name',
      'quantityPerParent',1,'replacement',drinks->0->'replacement'));
  end if;
  return components;
end $$;

do $preserve$
begin
  if to_regprocedure('mealdeck_ops_private.kds_order_card_before_meal_components(uuid,jsonb)') is null then
    alter function mealdeck_ops_private.kds_order_card(uuid,jsonb) rename to kds_order_card_before_meal_components;
  end if;
  if to_regprocedure('mealdeck_ops_private.receipt_snapshot_before_meal_components(uuid)') is null then
    alter function mealdeck_ops_private.receipt_snapshot(uuid) rename to receipt_snapshot_before_meal_components;
  end if;
end $preserve$;

create or replace function mealdeck_ops_private.kds_order_card(p_order uuid,p_evidence jsonb)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare card jsonb;tenant uuid;lines jsonb;items jsonb;
begin
  card:=mealdeck_ops_private.kds_order_card_before_meal_components(p_order,p_evidence);
  select o.tenant_id,q.priced_lines into tenant,lines from public.orders o
    join mealdeck_private.checkout_quotes q on q.id=mealdeck_private.order_checkout_quote_id(o.id)
      and q.tenant_id=o.tenant_id and q.location_id=o.location_id where o.id=p_order;
  if card is null or lines is null then return card; end if;
  select coalesce(jsonb_agg(i||jsonb_build_object('mealComponents',
      coalesce((select mealdeck_private.meal_components(tenant,l) from jsonb_array_elements(lines) l
        where l->>'lineId'=i->>'checkout_line_id'),'[]'::jsonb)) order by ordinal),'[]'::jsonb)
    into items from jsonb_array_elements(card->'items') with ordinality x(i,ordinal);
  return card||jsonb_build_object('items',items,'tickets',coalesce((
    select jsonb_agg(t||jsonb_build_object('items',coalesce((
      select jsonb_agg(ti||jsonb_build_object('mealComponents',ci->'mealComponents') order by item_ordinal)
      from jsonb_array_elements(t->'items') with ordinality x(ti,item_ordinal)
      join jsonb_array_elements(items) ci on ci->>'order_item_id'=ti->>'order_item_id'
    ),'[]'::jsonb)) order by ticket_ordinal)
    from jsonb_array_elements(card->'tickets') with ordinality x(t,ticket_ordinal)
  ),'[]'::jsonb));
end $$;

create or replace function mealdeck_ops_private.receipt_snapshot(p_order uuid)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare receipt jsonb;tenant uuid;lines jsonb;items jsonb;
begin
  receipt:=mealdeck_ops_private.receipt_snapshot_before_meal_components(p_order);
  select o.tenant_id,q.priced_lines into tenant,lines from public.orders o
    join mealdeck_private.checkout_quotes q on q.id=mealdeck_private.order_checkout_quote_id(o.id)
      and q.tenant_id=o.tenant_id and q.location_id=o.location_id where o.id=p_order;
  if receipt is null or lines is null then return receipt; end if;
  select jsonb_agg(i||jsonb_build_object('mealComponents',
      coalesce((select mealdeck_private.meal_components(tenant,l) from jsonb_array_elements(lines) l
        where l->>'lineId'=i->>'lineId'),'[]'::jsonb)) order by ordinal)
    into items from jsonb_array_elements(receipt->'items') with ordinality x(i,ordinal);
  return receipt||jsonb_build_object('items',items);
end $$;

create or replace function public.mealdeck_printer_acceptance_board(p_tenant uuid,p_location uuid)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare o record;e jsonb;card jsonb;items jsonb;cards jsonb:='[]'::jsonb;remaining integer:=0;
begin
  perform mealdeck_ops_private.printer_assert_scope(p_tenant,p_location);
  if not mealdeck_ops_private.kds_authority_ready() then raise exception 'mealdeck_kds_release_required'; end if;
  for o in select x.id,x.paid_at,x.total_pence from public.orders x
    where x.tenant_id=p_tenant and x.location_id=p_location and x.source='mealdeck'
      and x.status='accepted' and x.accepted_at is null and x.payment_status='paid'
      and x.fulfilment in ('pickup','curbside')
      and x.paid_at is not null and x.paid_at<=now()
      and not exists(select 1 from public.mealdeck_pass_orders p
        where p.order_id=x.id and p.status in ('handed_off','cancelled'))
    order by x.paid_at,x.id
  loop
    e:=mealdeck_ops_private.kds_release_evidence(o.id);
    if e is null or not mealdeck_ops_private.kds_routing_complete(o.id)
      or mealdeck_ops_private.kds_preparation_status(o.id)<>'queued' then continue; end if;
    perform mealdeck_ops_private.kds_assert_instructions(o.id);
    if jsonb_array_length(cards)>=100 then remaining:=remaining+1;continue;end if;
    card:=mealdeck_ops_private.kds_order_card(o.id,e);
    select coalesce(jsonb_agg(jsonb_build_object(
      'lineId',i->'checkout_line_id','parentLineId',i->'parent_checkout_line_id',
      'name',i->'item_name','brandName',i->'brand_name','quantity',i->'quantity',
      'unitPence',i->'unit_pence','modifiers',i->'modifiers','notes',i->'notes','bags',i->'bags',
      'mealComponents',i->'mealComponents'
    ) order by i->>'checkout_line_id'),'[]'::jsonb) into items from jsonb_array_elements(card->'items') i;
    cards:=cards||jsonb_build_array(jsonb_build_object(
      'orderNumber',card->'order_number','orderId',o.id,'version',card->'version','displayCode',card->'display_code',
      'paidAt',o.paid_at,'fulfilment',card->'fulfilment','totalPence',o.total_pence,
      'cutleryRequested',card->'cutlery_requested','notes',card->'notes',
      'packingPlan',card->'packing_plan','items',items));
  end loop;
  return jsonb_build_object('schemaVersion',1,'tenantId',p_tenant,'locationId',p_location,
    'generatedAt',now(),'orders',cards,'remainingOrderCount',remaining);
end $$;

revoke all on function mealdeck_private.meal_components(uuid,jsonb) from public,anon,authenticated,service_role;
revoke all on function mealdeck_ops_private.kds_order_card_before_meal_components(uuid,jsonb) from public,anon,authenticated,service_role;
revoke all on function mealdeck_ops_private.receipt_snapshot_before_meal_components(uuid) from public,anon,authenticated,service_role;
revoke all on function mealdeck_ops_private.kds_order_card(uuid,jsonb) from public,anon,authenticated,service_role;
revoke all on function mealdeck_ops_private.receipt_snapshot(uuid) from public,anon,authenticated,service_role;
revoke all on function public.mealdeck_printer_acceptance_board(uuid,uuid) from public,anon,authenticated,service_role;
grant execute on function public.mealdeck_printer_acceptance_board(uuid,uuid) to authenticated;
notify pgrst,'reload schema';
commit;
