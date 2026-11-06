-- Generated with Supabase CLI 3.0.0: mealdeck_kerbside_pickup_contact.
-- Extend only the private KDS card projection with the saved kerbside contact.
-- Existing staff scope, verified payment gates, receipts and history stay intact.
begin;
set local lock_timeout='5s';
set local statement_timeout='30s';
set local check_function_bodies=on;

do $guard$
begin
  if to_regnamespace('dishbee_private') is not null
    or to_regclass('mealdeck_private.installation') is null then
    raise exception 'mealdeck_kerbside_contact_independent_profile_required'; end if;
  if current_user in ('anon','authenticated','service_role') or not exists(
    select 1 from pg_class c where c.oid='mealdeck_private.installation'::regclass
      and pg_has_role(current_user,c.relowner,'USAGE')) then
    raise exception 'mealdeck_kerbside_contact_database_owner_required'; end if;
  if not exists(select 1 from mealdeck_private.installation where singleton
      and profile='mealdeck-independent-v1' and business_id is not null)
    or to_regprocedure('public.mealdeck_ops_kds_board(uuid,uuid)') is null
    or to_regprocedure('mealdeck_ops_private.kds_order_card_before_item_readiness(uuid,jsonb)') is null
    or to_regprocedure('mealdeck_ops_private.kds_order_card(uuid,jsonb)') is null then
    raise exception 'mealdeck_kerbside_contact_previous_extensions_required'; end if;
  -- Fail closed if a newer/custom projection is installed; repeat application
  -- of this exact extension is safe and never edits saved order/contact data.
  if (select md5(prosrc) from pg_proc
      where oid='mealdeck_ops_private.kds_order_card(uuid,jsonb)'::regprocedure)
      not in ('9c49af35d81442f4e3d4a98d14f0e14a','6d9892c16035d610539ee0239953031f') then
    raise exception 'mealdeck_kerbside_contact_unexpected_definition'; end if;
end $guard$;

create or replace function mealdeck_ops_private.kds_order_card(p_order uuid,p_evidence jsonb)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare card jsonb;o public.orders%rowtype;lines jsonb;items jsonb;pickup_name text;
begin
  select * into o from public.orders where id=p_order;
  card:=mealdeck_ops_private.kds_order_card_before_item_readiness(p_order,p_evidence);
  select q.priced_lines into lines from mealdeck_private.stripe_orders s
    join mealdeck_private.checkout_quotes q on q.id=s.quote_id where s.order_id=p_order;
  select coalesce(jsonb_agg(x.value||jsonb_build_object(
    'checkout_line_id',i.checkout_line_id,'parent_checkout_line_id',i.parent_checkout_line_id,
    'base_unit_pence',i.base_unit_price_pence,'unit_pence',i.unit_price_pence,
    'brand_name',coalesce((select l->>'brand_name' from jsonb_array_elements(lines) l where l->>'lineId'=i.checkout_line_id),x.value->>'brand_name'),
    'modifier_details',i.modifiers,
    'bags',coalesce((select jsonb_agg(jsonb_build_object('number',b->'number','quantity',a->'quantity')
        ||case when b ? 'name' then jsonb_build_object('name',b->>'name') else '{}'::jsonb end order by (b->>'number')::integer)
      from jsonb_array_elements(o.packing_plan->'bags') b,jsonb_array_elements(b->'allocations') a
      where a->>'lineId'=i.checkout_line_id),'[]'::jsonb)) order by i.checkout_line_id,i.id),'[]'::jsonb)
    into items from jsonb_array_elements(card->'items') x(value)
      join public.order_items i on i.id=(x.value->>'order_item_id')::uuid and i.order_id=p_order;
  -- Match the staff DTO's harmless Unicode whitespace trimming. Unsafe controls
  -- are rejected separately, before any trimming can hide a legacy bad value.
  pickup_name:=btrim(o.customer_name,U&'\0020\00A0\1680\2000\2001\2002\2003\2004\2005\2006\2007\2008\2009\200A\202F\205F\3000\FEFF');
  -- Each routed copy carries the same immutable bag/name allocation as its
  -- canonical master item, so packing and participant labels cannot diverge.
  return card||jsonb_build_object('items',items,'tickets',coalesce((select jsonb_agg(t||jsonb_build_object('items',
      coalesce((select jsonb_agg(ti||jsonb_build_object('brand_name',ci->>'brand_name','bags',ci->'bags') order by ti->>'order_item_id')
      from jsonb_array_elements(t->'items') ti join jsonb_array_elements(items) ci
        on ci->>'order_item_id'=ti->>'order_item_id'),'[]'::jsonb)) order by t->>'ticket_id')
      from jsonb_array_elements(card->'tickets') t),'[]'::jsonb),'accepted_at',o.accepted_at,
    'cutlery_requested',o.cutlery_requested,'packing_plan',o.packing_plan,
    'vehicle',case when o.fulfilment='curbside' then o.vehicle else null end,
    'pickupContact',case when o.fulfilment='curbside'
      and length(pickup_name) between 1 and 120
      and o.customer_name !~ U&'[\0001-\001F\007F-\009F\061C\200E\200F\2028-\202E\2066-\2069]'
      and o.customer_phone ~ '^\+[1-9][0-9]{7,14}$'
      then jsonb_build_object('name',pickup_name,'phone',o.customer_phone)
      else null end);
end $$;

-- The scoped public KDS wrappers remain the only client entry points.
revoke all on function mealdeck_ops_private.kds_order_card(uuid,jsonb)
  from public,anon,authenticated,service_role;
commit;
