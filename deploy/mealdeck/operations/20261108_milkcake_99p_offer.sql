-- Owner-approved Sunday 99p milkcake price, inclusive of the 30% opening offer.
-- Exactly one milkcake per order; additional units are £3.99 before ordinary 30%.
-- Run this complete operation atomically in the independent MealDeck database.
-- No base price, kitchen control, existing quote, payment, order or receipt is edited.
begin;
set local lock_timeout='5s';
set local statement_timeout='30s';
set local check_function_bodies=on;

do $guard$
declare expected record; routine record;
begin
  if to_regnamespace('dishbee_private') is not null
    or to_regclass('mealdeck_private.installation') is null then
    raise exception 'mealdeck_milkcake_offer_independent_profile_required'; end if;
  if current_user in ('anon','authenticated','service_role') or not exists(
    select 1 from pg_class where oid='mealdeck_private.installation'::regclass
      and pg_has_role(current_user,relowner,'USAGE')) then
    raise exception 'mealdeck_milkcake_offer_database_owner_required'; end if;
  if not exists(select 1 from mealdeck_private.installation i
      join public.tenants t on t.id=i.business_id
      join public.tenant_locations l on l.tenant_id=t.id
      where i.singleton and i.profile='mealdeck-independent-v1'
        and i.bootstrap_owner_id is not null and i.bootstrapped_at is not null
        and t.slug='mealdeck' and t.legal_name='313 Brands Ltd' and t.currency='GBP'
        and l.slug='shared-kitchen')
    or to_regclass('mealdeck_private.checkout_quotes') is null then
    raise exception 'mealdeck_milkcake_offer_installed_scope_required'; end if;

  -- Exact reviewed existing definitions, including the private-test condition
  -- in the live quote creator. Replacing only the one discount expression keeps
  -- every auth, opening, stock, packing, phone and payment guard in place.
  for expected in select * from (values
    ('mealdeck_private.price_checkout_lines(uuid,uuid,jsonb)',
      array['c867416a25499f372e6bce2c93468831','0b9d405201e774c3ff371334b38dc02e']::text[],true,'v'),
    ('public.mealdeck_public_menu()',
      array['df46e674718f1a86455498298e9f48a1','6e32d60a13413245941887300b65fd2d']::text[],true,'s'),
    ('mealdeck_private.create_checkout_quote_for_actor(uuid,uuid,uuid,uuid,uuid,text,jsonb,jsonb,text,jsonb)',
      array['7614993635874e546b8c65fd7899308a','aae853a38bd262b074525ff3707af461','9be2bfd586de4a9e5f2d64ad3ab7dc58','e910f759b16eed224ec9127433f8fc1a']::text[],true,'v'),
    ('public.mealdeck_create_group_payment_room(uuid,uuid,uuid,text,uuid,text,jsonb,text,boolean)',
      array['e9fd8700c7df065c52f00d328671c70c','5432af9540319483af3c0546356af271','a0a9b29e97881969984c82876dae11a0','ba8f0bf5231ed0d63624fcb055bb9411']::text[],true,'v')
  ) x(signature,hashes,is_definer,volatility) loop
    select p.*,l.lanname into routine from pg_proc p join pg_language l on l.oid=p.prolang
      where p.oid=to_regprocedure(expected.signature);
    if not found or routine.lanname<>'plpgsql' or routine.prosecdef<>expected.is_definer
      or routine.provolatile::text<>expected.volatility or routine.proisstrict or routine.proretset
      or routine.prorettype<>'jsonb'::regtype
      or routine.proconfig is distinct from array['search_path=""']::text[]
      or not(md5(routine.prosrc)=any(expected.hashes)) then
      raise exception 'mealdeck_milkcake_offer_unreviewed_definition: %',expected.signature; end if;
    if expected.signature like 'mealdeck_private.%' and (
      has_function_privilege('anon',routine.oid,'EXECUTE')
      or has_function_privilege('authenticated',routine.oid,'EXECUTE')
      or has_function_privilege('service_role',routine.oid,'EXECUTE')) then
      raise exception 'mealdeck_milkcake_offer_private_helper_required'; end if;
  end loop;

  -- All new private helpers/aliases must be this exact reviewed operation on a rerun.
  for expected in select * from (values
    ('mealdeck_private.price_checkout_lines_before_milkcake(uuid,uuid,jsonb)','c867416a25499f372e6bce2c93468831',true),
    ('mealdeck_private.public_menu_before_milkcake()','df46e674718f1a86455498298e9f48a1',true),
    ('mealdeck_private.milkcake_offer_sku(text)','f2d167f53e51736a689bc4964f86fab4',false),
    ('mealdeck_private.milkcake_offer_at(uuid,uuid,timestamptz)','a6030c718c41b46eb5b709862f70db83',false)
  ) x(signature,body_hash,is_definer) loop
    if to_regprocedure(expected.signature) is not null then
      select * into routine from pg_proc where oid=to_regprocedure(expected.signature);
      if md5(routine.prosrc)<>expected.body_hash or routine.prosecdef<>expected.is_definer
        or routine.proconfig is distinct from array['search_path=""']::text[]
        or has_function_privilege('anon',routine.oid,'EXECUTE')
        or has_function_privilege('authenticated',routine.oid,'EXECUTE')
        or has_function_privilege('service_role',routine.oid,'EXECUTE') then
        raise exception 'mealdeck_milkcake_offer_unreviewed_helper: %',expected.signature; end if;
    end if;
  end loop;
  if (to_regprocedure('mealdeck_private.price_checkout_lines_before_milkcake(uuid,uuid,jsonb)') is null)
    is distinct from (to_regprocedure('mealdeck_private.public_menu_before_milkcake()') is null) then
    raise exception 'mealdeck_milkcake_offer_incomplete_installation'; end if;
  if to_regprocedure('mealdeck_private.price_checkout_lines_before_milkcake(uuid,uuid,jsonb)') is null
    and (not exists(select 1 from pg_proc
      where oid='mealdeck_private.price_checkout_lines(uuid,uuid,jsonb)'::regprocedure
        and md5(prosrc)='c867416a25499f372e6bce2c93468831')
      or not exists(select 1 from pg_proc where oid='public.mealdeck_public_menu()'::regprocedure
        and md5(prosrc)='df46e674718f1a86455498298e9f48a1')) then
    raise exception 'mealdeck_milkcake_offer_incomplete_installation'; end if;
end $guard$;

-- Preserve the complete current validators and public stock projection as
-- inaccessible aliases. The public API signatures and their ACLs stay intact.
do $preserve$
declare definition text;
begin
  if to_regprocedure('mealdeck_private.price_checkout_lines_before_milkcake(uuid,uuid,jsonb)') is null then
    definition:=pg_get_functiondef('mealdeck_private.price_checkout_lines(uuid,uuid,jsonb)'::regprocedure);
    execute replace(definition,'FUNCTION mealdeck_private.price_checkout_lines(',
      'FUNCTION mealdeck_private.price_checkout_lines_before_milkcake(');
    definition:=pg_get_functiondef('public.mealdeck_public_menu()'::regprocedure);
    execute replace(definition,'FUNCTION public.mealdeck_public_menu(',
      'FUNCTION mealdeck_private.public_menu_before_milkcake(');
  end if;
end $preserve$;
revoke all on function mealdeck_private.price_checkout_lines_before_milkcake(uuid,uuid,jsonb),
  mealdeck_private.public_menu_before_milkcake() from public,anon,authenticated,service_role;

create or replace function mealdeck_private.milkcake_offer_sku(p_sku text)
returns boolean language sql immutable set search_path='' as $sku$
  select coalesce(p_sku=any(array[
    'loadd-desserts-biscoff-milkcake','loadd-desserts-oreo-milkcake',
    'moktl-desserts-biscoff-milkcake','moktl-desserts-oreo-milkcake',
    'skorch-burgers-desserts-biscoff-milkcake','skorch-burgers-desserts-oreo-milkcake',
    'souvano-desserts-biscoff-milkcake','souvano-desserts-oreo-milkcake',
    'tavo-chicken-desserts-biscoff-milkcake','tavo-chicken-desserts-oreo-milkcake'
  ]::text[]),false)
$sku$;

-- Private server-clock helper; no request can supply a promotional price or time.
-- Kitchen/payment availability is still checked by the existing checkout entry.
create or replace function mealdeck_private.milkcake_offer_at(p_tenant uuid,p_location uuid,p_at timestamptz)
returns jsonb language sql stable set search_path='' as $offer$
  select case when p_at>=timestamptz '2026-11-08 15:00:00 Europe/London'
    and p_at<timestamptz '2026-11-08 23:00:00 Europe/London'
    and exists(select 1 from mealdeck_private.installation i
      join public.tenants t on t.id=i.business_id
      join public.tenant_locations l on l.tenant_id=t.id
      where i.singleton and i.profile='mealdeck-independent-v1'
        and i.bootstrap_owner_id is not null and i.bootstrapped_at is not null
        and t.id=p_tenant and t.active and t.slug='mealdeck'
        and t.legal_name='313 Brands Ltd' and t.currency='GBP'
        and l.id=p_location and l.slug='shared-kitchen' and l.active
        and exists(select 1 from mealdeck_private.checkout_settings s
          where s.tenant_id=t.id and s.location_id=l.id
            and s.opening_start_date=date '2026-11-06'))
    then jsonb_build_object('id','sunday-milk-cake-20261108','finalUnitPence',99,
      'regularUnitPence',399,'maximumQuantityPerOrder',1,'discountIncluded',true,
      'startsAt','2026-11-08T15:00:00Z','endsAt','2026-11-08T23:00:00Z')
    else null end
$offer$;
revoke all on function mealdeck_private.milkcake_offer_sku(text),
  mealdeck_private.milkcake_offer_at(uuid,uuid,timestamptz) from public,anon,authenticated,service_role;

create or replace function mealdeck_private.price_checkout_lines(p_tenant uuid,p_location uuid,p_selection jsonb)
returns jsonb language plpgsql security definer set search_path='' as $price$
declare priced jsonb;promotion jsonb;line jsonb;lines jsonb:='[]';applied boolean:=false;
  gross integer;
begin
  priced:=mealdeck_private.price_checkout_lines_before_milkcake(p_tenant,p_location,p_selection);
  promotion:=mealdeck_private.milkcake_offer_at(p_tenant,p_location,now());
  if promotion is null then return priced; end if;
  gross:=(priced->>'grossPence')::integer;
  for line in select value from jsonb_array_elements(priced->'lines') loop
    if mealdeck_private.milkcake_offer_sku(line->>'sku') then
      -- Preserve canonical item/quantity/packing arithmetic. The £3.00 reduction
      -- belongs to exactly one unit in the first eligible canonical line, even
      -- when that line contains several units or other brands have milkcakes.
      if (line->>'base_unit_pence')::integer<>399 then
        raise exception 'mealdeck_milkcake_offer_price_changed'; end if;
      if not applied then
        line:=line||jsonb_build_object('promotion',promotion||
          jsonb_build_object('eligibleQuantity',1,'discountPence',300));
        applied:=true;
      end if;
    end if;
    lines:=lines||jsonb_build_array(line);
  end loop;
  -- Every additional cake and approved paid extra remains in the ordinary
  -- once-per-basket 30% base. No second discount applies to the promoted unit.
  return priced||jsonb_build_object('lines',lines,
    'milkCakeDiscountPence',case when applied then 300 else 0 end,
    'openingDiscountEligiblePence',gross-case when applied then 399 else 0 end);
end $price$;

create or replace function public.mealdeck_public_menu()
returns jsonb language plpgsql stable security definer set search_path='' as $menu$
declare snapshot jsonb;promotion jsonb;v_tenant uuid;v_location uuid;items jsonb;
begin
  snapshot:=mealdeck_private.public_menu_before_milkcake();
  select i.business_id,l.id into v_tenant,v_location
    from mealdeck_private.installation i join public.tenant_locations l on l.tenant_id=i.business_id
    where i.singleton and l.slug='shared-kitchen' and l.active;
  promotion:=mealdeck_private.milkcake_offer_at(v_tenant,v_location,now());
  if promotion is null then return snapshot; end if;
  select coalesce(jsonb_agg(case when mealdeck_private.milkcake_offer_sku(item->>'sku')
      and item->'pricePence'='399'::jsonb
      then item||jsonb_build_object('promotion',promotion) else item end
      order by ordinal),'[]'::jsonb) into items
    from jsonb_array_elements(snapshot->'items') with ordinality source(item,ordinal);
  return jsonb_set(snapshot,'{items}',items);
end $menu$;

-- Replace one reviewed arithmetic expression, without rewriting the quote's
-- actor, fulfilment, rate-limit, availability, packing or immutable insert logic.
do $quote$
declare definition text;old_expression constant text:='discount:=(gross::bigint*30+50)/100;';
  new_expression constant text:='discount:=coalesce((priced->>''milkCakeDiscountPence'')::integer,0)+(coalesce((priced->>''openingDiscountEligiblePence'')::bigint,gross::bigint)*30+50)/100;';
  old_guard constant text:='  select collection_estimate_minutes into estimate_minutes from mealdeck_private.checkout_settings';
  new_guard constant text:=$promotion_guard$  if coalesce((priced->>'milkCakeDiscountPence')::integer,0)>0 and (
    d is distinct from date '2026-11-06'
    or discount<>300+((priced->>'openingDiscountEligiblePence')::bigint*30+50)/100) then
    raise exception 'mealdeck_milkcake_offer_unavailable'; end if;
  select collection_estimate_minutes into estimate_minutes from mealdeck_private.checkout_settings$promotion_guard$;
begin
  definition:=pg_get_functiondef('mealdeck_private.create_checkout_quote_for_actor(uuid,uuid,uuid,uuid,uuid,text,jsonb,jsonb,text,jsonb)'::regprocedure);
  if strpos(definition,old_expression)>0 then
    if (length(definition)-length(replace(definition,old_expression,'')))/length(old_expression)<>1 then
      raise exception 'mealdeck_milkcake_offer_quote_patch_mismatch'; end if;
    if (length(definition)-length(replace(definition,old_guard,'')))/length(old_guard)<>1 then
      raise exception 'mealdeck_milkcake_offer_quote_patch_mismatch'; end if;
    execute replace(replace(definition,old_expression,new_expression),old_guard,new_guard);
  elsif strpos(definition,new_expression)=0 then
    raise exception 'mealdeck_milkcake_offer_quote_patch_mismatch';
  end if;
end $quote$;

-- New by-bag shares keep the one promoted unit with the first numbered bag
-- containing that canonical line. Existing shares return before this code;
-- equal splitting and quotes without the promotion retain their prior amounts.
do $group$
declare definition text;
  old_allocation constant text:=$old_allocation$  with weights as (
    select (b->>'number')::integer bag_number,sum((a->>'quantity')::integer*(l->>'unit_pence')::integer)::bigint weight
      from jsonb_array_elements(q.packing_plan->'bags') b cross join jsonb_array_elements(b->'allocations') a
      join jsonb_array_elements(q.priced_lines) l on l->>'lineId'=a->>'lineId' group by b->>'number'
  ), parts as (
    select bag_number,case when p_split_mode='equal' then q.total_pence/bag_count else (q.total_pence::bigint*weight/q.gross_pence)::integer end base,
      case when p_split_mode='equal' then 0 else q.total_pence::bigint*weight%q.gross_pence end remainder from weights
  ), ranked as (
    select *,row_number() over(order by remainder desc,bag_number) rank,q.total_pence-sum(base) over() extra from parts
  ) insert into mealdeck_private.payment_shares(id,order_id,bag_number,token_hash,amount_pence)
    select (t->>'shareId')::uuid,o.id,r.bag_number,t->>'tokenHash',r.base+case when r.rank<=r.extra then 1 else 0 end
      from ranked r join jsonb_array_elements(p_share_tokens) t on (t->>'bagNumber')::integer=r.bag_number;$old_allocation$;
  new_allocation constant text:=$new_allocation$  with promotion_line as (
    select l->>'lineId' line_id
      from jsonb_array_elements(q.priced_lines) with ordinality v(l,n)
      where l->'promotion'=jsonb_build_object(
        'id','sunday-milk-cake-20261108','finalUnitPence',99,
        'regularUnitPence',399,'maximumQuantityPerOrder',1,
        'discountIncluded',true,'eligibleQuantity',1,'discountPence',300,
        'startsAt','2026-11-08T15:00:00Z','endsAt','2026-11-08T23:00:00Z')
      order by n limit 1
  ), promotion_bag as (
    -- A line can be split across bags: only its first bag gets one promoted unit.
    select min((b->>'number')::integer) bag_number
      from jsonb_array_elements(q.packing_plan->'bags') b
      cross join jsonb_array_elements(b->'allocations') a
      join promotion_line chosen_promotion on chosen_promotion.line_id=a->>'lineId'
      where (a->>'quantity')::integer>0
  ), weights as (
    select (b->>'number')::integer bag_number,
      sum((a->>'quantity')::integer*(l->>'unit_pence')::integer)::bigint weight
      from jsonb_array_elements(q.packing_plan->'bags') b
      cross join jsonb_array_elements(b->'allocations') a
      join jsonb_array_elements(q.priced_lines) l on l->>'lineId'=a->>'lineId'
      group by b->>'number'
  ), scoped_weights as (
    select w.*,
      case when w.bag_number=promoted_bag.bag_number then 399 else 0 end::bigint promotion_gross,
      case when w.bag_number=promoted_bag.bag_number then 99 else 0 end::bigint promotion_final
      from weights w cross join promotion_bag promoted_bag
  ), totals as (
    select sum(promotion_gross)::bigint excluded_gross,
      sum(promotion_final)::bigint fixed_total from scoped_weights
  ), parts as (
    select bag_number,
      case when p_split_mode='equal' then q.total_pence/bag_count
        when q.gross_pence=excluded_gross then promotion_final::integer
        else (promotion_final+
          ((q.total_pence::bigint-fixed_total)*(weight-promotion_gross)
            /(q.gross_pence::bigint-excluded_gross)))::integer end base,
      case when p_split_mode='equal' or q.gross_pence=excluded_gross then 0
        else (q.total_pence::bigint-fixed_total)*(weight-promotion_gross)
          %(q.gross_pence::bigint-excluded_gross) end remainder
      from scoped_weights cross join totals
  ), ranked as (
    select *,row_number() over(order by remainder desc,bag_number) rank,
      q.total_pence-sum(base) over() extra from parts
  ) insert into mealdeck_private.payment_shares(id,order_id,bag_number,token_hash,amount_pence)
    select (t->>'shareId')::uuid,o.id,r.bag_number,t->>'tokenHash',
      r.base+case when r.rank<=r.extra then 1 else 0 end
      from ranked r join jsonb_array_elements(p_share_tokens) t
        on (t->>'bagNumber')::integer=r.bag_number;$new_allocation$;
begin
  definition:=pg_get_functiondef('public.mealdeck_create_group_payment_room(uuid,uuid,uuid,text,uuid,text,jsonb,text,boolean)'::regprocedure);
  if strpos(definition,old_allocation)>0 then
    if (length(definition)-length(replace(definition,old_allocation,'')))/length(old_allocation)<>1 then
      raise exception 'mealdeck_milkcake_offer_group_patch_mismatch'; end if;
    execute replace(definition,old_allocation,new_allocation);
  elsif strpos(definition,new_allocation)=0 then
    raise exception 'mealdeck_milkcake_offer_group_patch_mismatch';
  end if;
end $group$;

notify pgrst,'reload schema';
commit;
