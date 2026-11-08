-- TEST FIXTURE ONLY. Exact independent MealDeck group payment creator read
-- on 8 November 2026. Contains no production customer IDs or credentials.
CREATE OR REPLACE FUNCTION public.mealdeck_create_group_payment_room(p_room uuid, p_quote uuid, p_customer uuid, p_guest_token_hash text, p_attempt uuid, p_split_mode text, p_share_tokens jsonb, p_stripe_account text, p_livemode boolean)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare q mealdeck_private.checkout_quotes%rowtype;p mealdeck_private.payment_orders%rowtype;
 o public.orders%rowtype;actor_data jsonb;g uuid;bag_count integer;tokens jsonb;
begin
  perform mealdeck_private.begin_launch_test_context(p_customer);
  if p_room is null or p_attempt is null or p_split_mode is null or p_split_mode not in ('by_bag','equal')
    or p_stripe_account is null or p_stripe_account !~ '^acct_[A-Za-z0-9]+$' or p_livemode is null
    or jsonb_typeof(p_share_tokens) is distinct from 'array' then raise exception 'mealdeck_payment_room_invalid'; end if;
  select * into q from mealdeck_private.checkout_quotes where id=p_quote;
  if not found then raise exception 'mealdeck_checkout_quote_unavailable'; end if;
  actor_data:=mealdeck_private.payment_actor(q.tenant_id,q.location_id,p_customer,p_guest_token_hash);g:=(actor_data->>'guestId')::uuid;
  if q.customer_id is distinct from p_customer or q.guest_id is distinct from g or q.staff_id is not null then
    raise exception 'mealdeck_checkout_quote_unavailable'; end if;
  perform pg_advisory_xact_lock(hashtextextended('mealdeck-payment-create:'||coalesce(p_customer,g)::text||':'||p_attempt::text,0));
  select * into q from mealdeck_private.checkout_quotes where id=p_quote for update;
  bag_count:=jsonb_array_length(q.packing_plan->'bags');
  -- A one-person survivor is valid only through the locked ordering-room freeze.
  if exists(select 1 from mealdeck_private.ordering_rooms r where r.id=p_room and
    (r.phase not in ('finalizing','payment') or r.quote_id is distinct from p_quote
      or r.owner_customer_id is distinct from p_customer or r.owner_guest_id is distinct from g)) then
    raise exception 'mealdeck_ordering_freeze_required'; end if;
  if bag_count not between 1 and 10
    or (bag_count=1 and not exists(select 1 from mealdeck_private.ordering_rooms r
      where r.id=p_room and r.quote_id=p_quote and r.phase in ('finalizing','payment'))) or q.packing_plan->'separateBags' is distinct from 'true'::jsonb
    or jsonb_array_length(p_share_tokens)<>bag_count or exists(
      select 1 from jsonb_array_elements(p_share_tokens) t where jsonb_typeof(t) is distinct from 'object'
      or t-array['shareId','bagNumber','tokenHash']::text[]<>'{}'::jsonb
      or jsonb_typeof(t->'shareId') is distinct from 'string' or jsonb_typeof(t->'tokenHash') is distinct from 'string'
      or jsonb_typeof(t->'bagNumber') is distinct from 'number'
      or coalesce(t->>'shareId','') !~ '^[a-f0-9]{8}-[a-f0-9]{4}-[1-5][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$'
      or coalesce(t->>'bagNumber','') !~ '^(10|[1-9])$' or coalesce(t->>'tokenHash','') !~ '^[a-f0-9]{64}$') then
    raise exception 'mealdeck_payment_shares_invalid'; end if;
  if (select count(distinct t->>'shareId') from jsonb_array_elements(p_share_tokens) t)<>bag_count
    or (select count(distinct t->>'tokenHash') from jsonb_array_elements(p_share_tokens) t)<>bag_count
    or (select count(distinct t->>'bagNumber') from jsonb_array_elements(p_share_tokens) t)<>bag_count
    or exists(select 1 from jsonb_array_elements(p_share_tokens) t where not exists(
      select 1 from jsonb_array_elements(q.packing_plan->'bags') b where (b->>'number')::integer=(t->>'bagNumber')::integer)) then
    raise exception 'mealdeck_payment_shares_invalid'; end if;
  select * into p from mealdeck_private.payment_orders where quote_id=p_quote or room_id=p_room
    or (attempt_id=p_attempt and customer_id is not distinct from p_customer and guest_id is not distinct from g);
  if found then
    select jsonb_agg(jsonb_build_object('shareId',s.id,'bagNumber',s.bag_number,'tokenHash',s.token_hash) order by s.bag_number)
      into tokens from mealdeck_private.payment_shares s where s.order_id=p.order_id;
    if p.room_id is distinct from p_room or p.quote_id<>p_quote or p.attempt_id<>p_attempt
      or p.customer_id is distinct from p_customer or p.guest_id is distinct from g
      or p.split_mode<>p_split_mode or p.stripe_account<>p_stripe_account or p.livemode<>p_livemode
      or tokens is distinct from (select jsonb_agg(t order by (t->>'bagNumber')::integer) from jsonb_array_elements(p_share_tokens) t) then
      raise exception 'mealdeck_payment_attempt_conflict'; end if;
    return mealdeck_private.group_payment_snapshot(p.order_id,true,null);
  end if;
  if exists(select 1 from mealdeck_private.stripe_orders where quote_id=p_quote) then raise exception 'mealdeck_payment_online_overlap'; end if;
  perform mealdeck_private.assert_payment_open(q.tenant_id,q.location_id,g is not null);
  insert into public.group_order_rooms(id,tenant_id,location_id,status,payment_mode)
    values(p_room,q.tenant_id,q.location_id,'collecting','separate_host_balance');
  o:=mealdeck_private.materialize_payment_order(p_quote,p_customer,g,null,p_room);
  insert into mealdeck_private.payment_orders(order_id,quote_id,tenant_id,location_id,room_id,channel,
    customer_id,guest_id,attempt_id,split_mode,stripe_account,livemode,total_pence)
    values(o.id,q.id,q.tenant_id,q.location_id,p_room,'group',p_customer,g,p_attempt,p_split_mode,p_stripe_account,p_livemode,q.total_pence);
  update public.group_order_rooms set master_order_id=o.id where id=p_room;
  -- Allocate exact integer pennies. By-bag discounts use largest remainder;
  -- equal contributions allocate any remaining pennies to earlier bag numbers.
  with weights as (
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
      from ranked r join jsonb_array_elements(p_share_tokens) t on (t->>'bagNumber')::integer=r.bag_number;
  if (select sum(amount_pence) from mealdeck_private.payment_shares where order_id=o.id)<>q.total_pence then
    raise exception 'mealdeck_payment_allocation_invalid'; end if;
  insert into public.mealdeck_ops_audit_log(tenant_id,location_id,actor_id,action,entity_type,entity_id,next_value)
    values(q.tenant_id,q.location_id,p_customer,'payment.group_created','order',o.id,
      jsonb_build_object('roomId',p_room,'splitMode',p_split_mode,'shareCount',bag_count,'totalPence',q.total_pence));
  return mealdeck_private.group_payment_snapshot(o.id,true,null);
end $function$
;
