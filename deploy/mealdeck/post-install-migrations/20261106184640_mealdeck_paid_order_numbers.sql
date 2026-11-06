-- Generated with Supabase CLI 3.0.0: mealdeck_paid_order_numbers.
-- Add a separate, immutable visible paid-order number. UUIDs, collection codes,
-- finance/release routines and existing receipt payloads are not rewritten.
begin;
set local lock_timeout='5s';
set local statement_timeout='30s';
set local check_function_bodies=on;

do $guard$
declare expected record;
begin
  if to_regnamespace('dishbee_private') is not null
    or to_regclass('mealdeck_private.installation') is null then
    raise exception 'mealdeck_order_numbers_independent_profile_required'; end if;
  if current_user in ('anon','authenticated','service_role') or not exists(
    select 1 from pg_class c where c.oid='mealdeck_private.installation'::regclass
      and pg_has_role(current_user,c.relowner,'USAGE')) then
    raise exception 'mealdeck_order_numbers_database_owner_required'; end if;
  if not exists(select 1 from mealdeck_private.installation where singleton
      and profile='mealdeck-independent-v1' and business_id is not null)
    or to_regclass('mealdeck_private.receipt_jobs') is null
    or to_regclass('mealdeck_private.receipt_events') is null then
    raise exception 'mealdeck_order_numbers_previous_extensions_required'; end if;
  -- Exact reviewed definitions only; second hashes permit this revision's rerun.
  for expected in select * from (values
    ('mealdeck_ops_private.kds_order_card(uuid,jsonb)','6d9892c16035d610539ee0239953031f','82df803179b9a6ba38c629cc80cda25e'),
    ('mealdeck_ops_private.receipt_snapshot(uuid)','2ccea1a51ba47c71d9f7681e9a7d032a','bcadd0b804e9378cd75a9c4fa388ee9a'),
    ('mealdeck_private.checkout_receipt_for_identity(uuid,uuid,uuid)','3dab37688d56bf309e0740c0062cd49f','9c3e21cb2f030b88d005bbbff4975102'),
    ('mealdeck_private.group_payment_snapshot(uuid,boolean,uuid)','7f580848b6e28265e6561b48b0ac5867','7dfa0f61ef7c62bd403d3855eef97e8e'),
    ('public.mealdeck_customer_orders()','8c561d7b60cc16a44db499eb6909a12a','ebd446c090b6d7b21fc4256b28a1a31f'),
    ('public.mealdeck_printer_acceptance_board(uuid,uuid)','b2dd0cae7f57de758767f8ecbe02f242','ffbf0371323dda3ca7b6d61281f8d83d'),
    ('public.mealdeck_terminal_order_status(uuid,uuid,uuid,text)','2d614f93057b695c6c2caa04fec74142','5695d3ce0dc3ace8ea4a1cd5160ec2c2'),
    ('public.mealdeck_ops_kds_workflow_board(uuid,uuid)','3d5304c13406a3ac3a5efcaaf9eaefdb','ea32c882fcb966a568d53b5396e9aae1'),
    ('public.mealdeck_ops_order_history(uuid,uuid,date,date)','8b1dedf82b067e6264156d8e3aa80ec7','c1ea5733c24bcaa78a5e60f1936ab82e'),
    ('mealdeck_private.release_paid_order(uuid,text)','89b7ca882734b3a56d8badf62b3e81cc','89b7ca882734b3a56d8badf62b3e81cc'),
    ('mealdeck_private.kds_release_authority(uuid)','e687944dc60d19e877f5b486a9882748','e687944dc60d19e877f5b486a9882748'),
    ('mealdeck_private.payment_order_financial_ready(uuid)','4563f2c3c6997cdc1d034afbe2f88733','4563f2c3c6997cdc1d034afbe2f88733')
  ) x(signature,old_hash,new_hash)
  loop
    if not exists(select 1 from pg_proc p where p.oid=to_regprocedure(expected.signature)
      and p.prosecdef and p.proconfig @> array['search_path=""']
      and md5(p.prosrc) in (expected.old_hash,expected.new_hash)) then
      raise exception 'mealdeck_order_numbers_unreviewed_definition: %',expected.signature;
    end if;
  end loop;
  if (to_regclass('mealdeck_private.order_number_counters') is null)
    is distinct from (to_regclass('mealdeck_private.order_numbers') is null) then
    raise exception 'mealdeck_order_numbers_incomplete_installation'; end if;
  for expected in select * from (values
    ('mealdeck_private.order_number_record_immutable()','04dbbd6babb8f832e84947fd5a7e6c44',false),
    ('mealdeck_private.order_number_counter_monotonic()','3f22ef460e0b053f393e5e0be34efb95',false),
    ('mealdeck_private.paid_order_number(uuid)','9baf0add34045b36558c6de2bed1da0b',true),
    ('mealdeck_private.assign_paid_order_number(uuid)','e002536d8ab39ed9dbde863de106c8da',true),
    ('mealdeck_private.number_verified_paid_order()','48a19b0be6ff2d91f3a358dadf07d943',true),
    ('mealdeck_private.add_order_number_to_unsent_receipt(uuid,uuid,text)','1b64699223ac1fcd499e59964d67e423',false)
  ) x(signature,body_hash,is_definer)
  loop
    if to_regprocedure(expected.signature) is not null and not exists(
      select 1 from pg_proc p where p.oid=to_regprocedure(expected.signature)
        and md5(p.prosrc)=expected.body_hash and p.prosecdef=expected.is_definer
        and p.proconfig @> array['search_path=""']) then
      raise exception 'mealdeck_order_numbers_unreviewed_helper: %',expected.signature;
    end if;
  end loop;
end $guard$;

-- Fence live payment/order transactions before the chronological backfill. A
-- weaker table lock followed by row locks would invert reconciliation's locks.
-- Readers/writers resume together when this short atomic migration commits.
lock table public.orders in access exclusive mode;

-- now() is transaction-start time. If a live payment committed after this
-- migration began but before its table lock, retry in a fresh transaction;
-- never weaken the canonical clock check or silently omit that paid order.
do $clock_guard$
begin
  if exists(select 1 from public.orders o
    left join mealdeck_private.stripe_orders s on s.order_id=o.id
    left join mealdeck_private.payment_orders p on p.order_id=o.id
    where o.source='mealdeck' and o.payment_status='paid'
      and (o.paid_at>now() or s.verified_at>now() or p.verified_at>now())) then
    raise exception 'mealdeck_order_numbers_retry_new_transaction';
  end if;
end $clock_guard$;

create table if not exists mealdeck_private.order_number_counters(
  tenant_id uuid not null,location_id uuid not null,
  last_number bigint not null default 0 check(last_number>=0),
  primary key(tenant_id,location_id),
  foreign key(tenant_id,location_id) references public.tenant_locations(tenant_id,id)
);
create table if not exists mealdeck_private.order_numbers(
  order_id uuid primary key,tenant_id uuid not null,location_id uuid not null,
  number bigint not null check(number>0),
  paid_at timestamptz not null,assigned_at timestamptz not null default now(),
  unique(tenant_id,location_id,number),
  foreign key(tenant_id,location_id,order_id) references public.orders(tenant_id,location_id,id),
  foreign key(tenant_id,location_id) references mealdeck_private.order_number_counters(tenant_id,location_id)
);
alter table mealdeck_private.order_number_counters enable row level security;
alter table mealdeck_private.order_numbers enable row level security;
revoke all on mealdeck_private.order_number_counters,mealdeck_private.order_numbers
  from public,anon,authenticated,service_role;

create or replace function mealdeck_private.order_number_record_immutable()
returns trigger language plpgsql security invoker set search_path='' as $$
begin
  raise exception 'mealdeck_order_number_immutable';
end $$;

create or replace function mealdeck_private.order_number_counter_monotonic()
returns trigger language plpgsql security invoker set search_path='' as $$
begin
  if tg_op='DELETE' then raise exception 'mealdeck_order_number_counter_immutable'; end if;
  if new.tenant_id is distinct from old.tenant_id or new.location_id is distinct from old.location_id
    or new.last_number<old.last_number then
    raise exception 'mealdeck_order_number_counter_immutable'; end if;
  return new;
end $$;

drop trigger if exists mealdeck_order_number_record_immutable on mealdeck_private.order_numbers;
create trigger mealdeck_order_number_record_immutable before update or delete on mealdeck_private.order_numbers
  for each row execute function mealdeck_private.order_number_record_immutable();
drop trigger if exists mealdeck_order_number_counter_monotonic on mealdeck_private.order_number_counters;
create trigger mealdeck_order_number_counter_monotonic before update or delete on mealdeck_private.order_number_counters
  for each row execute function mealdeck_private.order_number_counter_monotonic();

create or replace function mealdeck_private.paid_order_number(p_order uuid)
returns text language sql stable security definer set search_path='' as $$
  select lpad(n.number::text,greatest(4,length(n.number::text)),'0')
    from mealdeck_private.order_numbers n where n.order_id=p_order
$$;

create or replace function mealdeck_private.assign_paid_order_number(p_order uuid)
returns text language plpgsql security definer set search_path='' as $$
declare o public.orders%rowtype;e jsonb;assigned bigint;label text;
begin
  -- Canonical mutations already hold this master-order lock. The scope counter
  -- is acquired last, after the payment/routing transaction's existing locks.
  select * into o from public.orders where id=p_order for update;
  if not found then return null; end if;
  label:=mealdeck_private.paid_order_number(p_order);
  if label is not null then return label; end if;
  if o.source<>'mealdeck' or o.payment_status<>'paid' or o.paid_at is null or o.paid_at>now()
    or o.status in ('cancelled','refunded') then return null; end if;
  e:=mealdeck_private.kds_release_authority(p_order);
  if e->'eligible' is distinct from 'true'::jsonb
    or e->'schema_version' is distinct from '1'::jsonb
    or e->>'order_id' is distinct from o.id::text
    or e->>'tenant_id' is distinct from o.tenant_id::text
    or e->>'location_id' is distinct from o.location_id::text
    or e->>'source' is distinct from 'mealdeck'
    or not mealdeck_ops_private.kds_routing_complete(o.id) then return null; end if;
  insert into mealdeck_private.order_number_counters(tenant_id,location_id,last_number)
    values(o.tenant_id,o.location_id,0) on conflict(tenant_id,location_id) do nothing;
  update mealdeck_private.order_number_counters set last_number=last_number+1
    where tenant_id=o.tenant_id and location_id=o.location_id and last_number<9223372036854775807
    returning last_number into assigned;
  if assigned is null then raise exception 'mealdeck_order_number_exhausted'; end if;
  insert into mealdeck_private.order_numbers(order_id,tenant_id,location_id,number,paid_at)
    values(o.id,o.tenant_id,o.location_id,assigned,o.paid_at);
  label:=lpad(assigned::text,greatest(4,length(assigned::text)),'0');
  insert into public.mealdeck_ops_audit_log(tenant_id,location_id,actor_id,action,entity_type,entity_id,next_value)
    values(o.tenant_id,o.location_id,null,'order.number_assigned','order',o.id,
      jsonb_build_object('orderNumber',label,'paidAt',o.paid_at,'source','20261106184640_mealdeck_paid_order_numbers'));
  return label;
end $$;

create or replace function mealdeck_private.number_verified_paid_order()
returns trigger language plpgsql security definer set search_path='' as $$
begin
  -- Evaluate final authority here, not in WHEN: shared room submission follows
  -- the paid-order write. A deferred invocation sees the entire transaction.
  perform mealdeck_private.assign_paid_order_number(new.id);
  return null;
end $$;

drop trigger if exists mealdeck_verified_paid_order_number on public.orders;
create constraint trigger mealdeck_verified_paid_order_number
  after insert or update on public.orders deferrable initially deferred
  for each row when(new.source='mealdeck' and new.payment_status='paid' and new.paid_at is not null)
  execute function mealdeck_private.number_verified_paid_order();

-- Never seed a special UUID. Include every committed eligible paid order that
-- arrived before the lock, oldest paid first; existing assignments never move.
do $backfill$
declare candidate record;
begin
  for candidate in select o.id from public.orders o
    where o.source='mealdeck' and o.payment_status='paid' and o.paid_at is not null
      and o.status not in ('cancelled','refunded')
    order by o.paid_at,o.id
  loop
    perform mealdeck_private.assign_paid_order_number(candidate.id);
  end loop;
end $backfill$;

-- Explicit owner-only maintenance, not an automatic migration step. It can add
-- this one presentation field to a wholly untouched queued original, never
-- regenerate a receipt, create a copy, claim a job or mark physical output.
create or replace function mealdeck_private.add_order_number_to_unsent_receipt(
  p_job uuid,p_order uuid,p_expected_payload_md5 text
) returns jsonb language plpgsql security invoker set search_path='' as $$
declare j mealdeck_private.receipt_jobs%rowtype;label text;before_hash text;after_hash text;
begin
  if current_user in ('anon','authenticated','service_role') or not exists(
    select 1 from pg_class c where c.oid='mealdeck_private.installation'::regclass
      and pg_has_role(current_user,c.relowner,'USAGE')) then
    raise exception 'mealdeck_order_numbers_database_owner_required'; end if;
  if p_job is null or p_order is null or p_expected_payload_md5 is null
    or p_expected_payload_md5 !~ '^[a-f0-9]{32}$' then
    raise exception 'mealdeck_order_number_receipt_guard'; end if;
  perform 1 from public.orders where id=p_order for update;
  select * into j from mealdeck_private.receipt_jobs where id=p_job and order_id=p_order for update;
  if not found or j.status<>'queued' or j.copy_number<>1 or j.reprint_of is not null or j.reprint_reason is not null
    or j.claimed_by is not null or j.terminal_id is not null or j.claim_token is not null or j.claim_expires_at is not null
    or j.send_started_at is not null or j.confirmed_at is not null or j.resolved_by is not null or j.resolution is not null
    or (select count(*) from mealdeck_private.receipt_jobs where order_id=p_order)<>1
    or exists(select 1 from mealdeck_private.receipt_events where job_id=p_job)
    or md5((j.receipt-'orderNumber')::text) is distinct from p_expected_payload_md5
    or j.receipt->>'orderId' is distinct from p_order::text
    or j.receipt->'copyNumber' is distinct from '1'::jsonb then
    raise exception 'mealdeck_order_number_receipt_guard'; end if;
  label:=mealdeck_private.paid_order_number(p_order);
  if label is null or mealdeck_private.kds_release_authority(p_order)->'eligible' is distinct from 'true'::jsonb then
    raise exception 'mealdeck_order_number_receipt_guard'; end if;
  if j.receipt ? 'orderNumber' and j.receipt->'orderNumber'<>'null'::jsonb then
    if j.receipt->>'orderNumber' is distinct from label then
      raise exception 'mealdeck_order_number_receipt_guard'; end if;
    return jsonb_build_object('jobId',p_job,'orderId',p_order,'orderNumber',label,'updated',false);
  end if;
  before_hash:=md5(j.receipt::text);
  update mealdeck_private.receipt_jobs set receipt=receipt||jsonb_build_object('orderNumber',label),updated_at=now()
    where id=p_job returning md5(receipt::text) into after_hash;
  if (select receipt-'orderNumber' from mealdeck_private.receipt_jobs where id=p_job)
      is distinct from j.receipt-'orderNumber' then
    raise exception 'mealdeck_order_number_receipt_guard'; end if;
  insert into public.mealdeck_ops_audit_log(tenant_id,location_id,actor_id,action,entity_type,entity_id,previous_value,next_value)
    values(j.tenant_id,j.location_id,null,'printer.order_number_added','receipt_job',p_job,
      jsonb_build_object('receiptMd5',before_hash),
      jsonb_build_object('receiptMd5',after_hash,'unchangedPayloadMd5',p_expected_payload_md5,'orderNumber',label));
  return jsonb_build_object('jobId',p_job,'orderId',p_order,'orderNumber',label,'updated',true,
    'previousReceiptMd5',before_hash,'receiptMd5',after_hash);
end $$;

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
  return card||jsonb_build_object('order_number',mealdeck_private.paid_order_number(p_order),'items',items,'tickets',coalesce((select jsonb_agg(t||jsonb_build_object('items',
      coalesce((select jsonb_agg(ti||jsonb_build_object('brand_name',ci->>'brand_name','bags',ci->'bags') order by ti->>'order_item_id')
      from jsonb_array_elements(t->'items') ti join jsonb_array_elements(items) ci
        on ci->>'order_item_id'=ti->>'order_item_id'),'[]'::jsonb)) order by t->>'ticket_id')
      from jsonb_array_elements(card->'tickets') t),'[]'::jsonb),'accepted_at',o.accepted_at,
    'cutlery_requested',o.cutlery_requested,'packing_plan',o.packing_plan,
    'vehicle',case when o.fulfilment='curbside' then o.vehicle else null end,
    'pickupContact',case when o.fulfilment in ('pickup','curbside')
      and length(pickup_name) between 1 and 120
      and o.customer_name !~ U&'[\0001-\001F\007F-\009F\061C\200E\200F\2028-\202E\2066-\2069]'
      and o.customer_phone ~ '^\+[1-9][0-9]{7,14}$'
      then jsonb_build_object('name',pickup_name,'phone',o.customer_phone)
      else null end);
end $$;

create or replace function mealdeck_ops_private.receipt_snapshot(p_order uuid)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare o public.orders%rowtype;q mealdeck_private.checkout_quotes%rowtype;items jsonb;loc text;
begin
  select * into o from public.orders where id=p_order;
  select cq.* into q from mealdeck_private.checkout_quotes cq where cq.id=(
    select s.quote_id from mealdeck_private.stripe_orders s where s.order_id=p_order
    union all select p.quote_id from mealdeck_private.payment_orders p where p.order_id=p_order);
  if not found or o.accepted_at is null or o.fulfilment not in ('pickup','curbside') or o.handoff_code !~ '^\d{4}$'
    or o.packing_plan is distinct from q.packing_plan then raise exception 'mealdeck_printer_snapshot_unavailable'; end if;
  select name into loc from public.tenant_locations where id=o.location_id and tenant_id=o.tenant_id;
  select jsonb_agg(jsonb_build_object('lineId',l->>'lineId','parentLineId',l->>'parentLineId',
    'brandName',coalesce(l->>'brand_name','MealDeck'),'name',l->>'name','quantity',l->'quantity',
    'baseUnitPence',l->'base_unit_pence','unitPence',l->'unit_pence','linePence',l->'line_pence','notes',i.notes,
    'modifiers',coalesce((select jsonb_agg(jsonb_build_object('name',m->>'name','groupName',m->>'group_name',
      'quantityPerParent',m->'quantity_per_parent','priceDeltaPence',m->'price_delta_pence') order by n)
      from jsonb_array_elements(l->'modifiers') with ordinality v(m,n)),'[]'::jsonb)) order by n)
    into items from jsonb_array_elements(q.priced_lines) with ordinality v(l,n)
    join public.order_items i on i.order_id=p_order and i.checkout_line_id=l->>'lineId';
  if jsonb_array_length(items) is distinct from jsonb_array_length(q.priced_lines) then
    raise exception 'mealdeck_printer_snapshot_unavailable'; end if;
  return jsonb_build_object('schemaVersion',1,'orderId',o.id,'copyNumber',1,'reprintOf',null,'reprintReason',null,
    'orderNumber',mealdeck_private.paid_order_number(p_order),'displayCode',o.handoff_code,'brand','MealDeck','tradingName','313 Brands Ltd','locationName',loc,
    'createdAt',o.created_at,'paidAt',o.paid_at,'acceptedAt',o.accepted_at,'fulfilment',o.fulfilment,
    'customerName',coalesce(o.customer_name,'Customer'),'car',case when o.fulfilment='curbside' then o.vehicle else null end,
    'cutleryRequested',o.cutlery_requested,'packingPlan',o.packing_plan,'items',items,
    'subtotalPence',q.gross_pence,'discountPence',q.discount_pence,'totalPence',q.total_pence,
    'currency','GBP','orderNotes',o.notes);
end $$;

create or replace function mealdeck_private.checkout_receipt_for_identity(p_order uuid,p_customer uuid,p_guest uuid)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare o public.orders%rowtype;q mealdeck_private.checkout_quotes%rowtype;s mealdeck_private.stripe_orders%rowtype;funding mealdeck_private.payment_orders%rowtype;
begin
  select * into o from public.orders where id=p_order and customer_id is not distinct from p_customer and source='mealdeck'
    and guest_checkout=(p_guest is not null);
  select * into s from mealdeck_private.stripe_orders where order_id=o.id and customer_id is not distinct from p_customer and guest_id is not distinct from p_guest;
  if s.order_id is null then
    select * into funding from mealdeck_private.payment_orders where order_id=o.id and customer_id is not distinct from p_customer
      and guest_id is not distinct from p_guest and staff_id is null;
    if found then
      s.order_id:=funding.order_id;s.quote_id:=funding.quote_id;s.verified_at:=funding.verified_at;s.void_reason:=funding.hold_reason;s.expires_at:=funding.expires_at;
      select coalesce(sum(captured_pence),0),coalesce(sum(refunded_pence),0) into s.captured_pence,s.refunded_pence
        from mealdeck_private.payment_collections where order_id=funding.order_id;
    end if;
  end if;
  if o.id is null or s.order_id is null then raise exception 'mealdeck_checkout_order_unavailable'; end if;
  perform mealdeck_private.checkout_identity(o.tenant_id,o.location_id,p_customer,p_guest);
  select * into q from mealdeck_private.checkout_quotes where id=s.quote_id and tenant_id=o.tenant_id
    and location_id=o.location_id and customer_id is not distinct from p_customer and guest_id is not distinct from p_guest;
  if not found then raise exception 'mealdeck_checkout_order_unavailable'; end if;
  return jsonb_build_object('orderNumber',mealdeck_private.paid_order_number(p_order),'orderId',o.id,'quoteId',q.id,'guestOrder',o.guest_checkout,'status',o.status,'paymentStatus',o.payment_status,
    'verifiedPaid',s.captured_pence=o.total_pence and s.verified_at is not null and s.refunded_pence=0
      and s.void_reason is null and o.payment_status='paid',
    'handoffCode',case when s.verified_at is not null then o.handoff_code else null end,
    'fulfilment',o.fulfilment,'createdAt',o.created_at,'paidAt',o.paid_at,'acceptedAt',o.accepted_at,'serverNow',now(),
    'collectionEstimateMinutes',q.collection_estimate_minutes,
    'estimatedReadyAt',case when o.paid_at is not null then o.paid_at+make_interval(mins=>q.collection_estimate_minutes) else null end,
    'grossPence',q.gross_pence,'discountPence',q.discount_pence,'totalPence',o.total_pence,'lines',q.priced_lines,
    'packingPlan',o.packing_plan,'cutleryRequested',o.cutlery_requested,
    'passStatus',(select p.status from public.mealdeck_pass_orders p where p.order_id=o.id),
    'preparingAt',(select min(t.started_at) from public.kds_tickets t where t.order_id=o.id),
    'readyAt',(select max(t.ready_at) from public.kds_tickets t where t.order_id=o.id),
    'readyForCollectionAt',(select p.ready_for_handoff_at from public.mealdeck_pass_orders p where p.order_id=o.id),
    'completedAt',(select p.handed_off_at from public.mealdeck_pass_orders p where p.order_id=o.id),
    'paymentSessionExpired',s.captured_pence=0 and s.expires_at<=now(),
    'held',s.void_reason is not null)
    ||case when p_guest is not null then jsonb_build_object('loyaltyEligible',false) else '{}'::jsonb end;
end $$;

create or replace function mealdeck_private.group_payment_snapshot(p_order uuid,p_owner boolean,p_share uuid)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare p mealdeck_private.payment_orders%rowtype;q mealdeck_private.checkout_quotes%rowtype;
  o public.orders%rowtype;captured integer;refunded integer;available integer;shares jsonb;lines jsonb;packing jsonb;
begin
  select * into p from mealdeck_private.payment_orders where order_id=p_order;
  select * into q from mealdeck_private.checkout_quotes where id=p.quote_id;
  select * into o from public.orders where id=p_order;
  select coalesce(sum(captured_pence),0),coalesce(sum(refunded_pence),0) into captured,refunded
    from mealdeck_private.payment_collections where order_id=p_order;
  select coalesce(sum(s.amount_pence),0) into available from mealdeck_private.payment_shares s
    where s.order_id=p_order and not exists(select 1 from mealdeck_private.payment_collection_shares cs where cs.share_id=s.id and cs.active);
  select jsonb_agg(jsonb_build_object('shareId',s.id,'bagNumber',s.bag_number,'amountPence',s.amount_pence,
    'paidPence',case when c.captured_pence=c.amount_pence then s.amount_pence else 0 end,
    'status',case when c.hold_reason is not null or (p.hold_reason is not null and c.captured_pence>0) then 'refund_review'
      when c.captured_pence=c.amount_pence then 'paid' when c.id is not null then 'pending' else 'unclaimed' end)
    order by s.bag_number) into shares
    from mealdeck_private.payment_shares s
      left join mealdeck_private.payment_collection_shares cs on cs.share_id=s.id and cs.active
      left join mealdeck_private.payment_collections c on c.id=cs.collection_id where s.order_id=p_order and (p_owner or s.id=p_share);
  if p_owner then lines:=q.priced_lines;packing:=q.packing_plan;
  else
    select q.packing_plan || jsonb_build_object('bags',jsonb_build_array(b)) into packing
      from jsonb_array_elements(q.packing_plan->'bags') b join mealdeck_private.payment_shares s
        on s.bag_number=(b->>'number')::integer where s.id=p_share and s.order_id=p_order;
    select coalesce(jsonb_agg(l || jsonb_build_object('quantity',(a->>'quantity')::integer,
      'line_pence',(a->>'quantity')::integer*(l->>'unit_pence')::integer) order by n),'[]'::jsonb) into lines
      from jsonb_array_elements(q.priced_lines) with ordinality x(l,n)
      join jsonb_array_elements(packing->'bags'->0->'allocations') a on a->>'lineId'=l->>'lineId';
  end if;
  return jsonb_build_object('orderNumber',mealdeck_private.paid_order_number(p_order),'roomId',p.room_id,'orderId',p.order_id,'version',1,'splitMode',p.split_mode,
    'currency','GBP','status',case when p.hold_reason is not null and captured>0 then 'refund_review'
      when p.cancel_requested_at is not null then 'cancelled' when p.hold_reason is not null then 'refund_review'
      when p.verified_at is not null then 'paid' else 'collecting' end,
    'totalPence',p.total_pence,'capturedPence',captured,'paidPence',greatest(0,captured-refunded),
    'refundedPence',refunded,'remainingPence',greatest(0,p.total_pence-captured+refunded),
    'unclaimedPence',available,'expiresAt',p.expires_at,'fundingExpired',p.expires_at<=now(),
    'holdReason',p.hold_reason,'ownerAccess',p_owner,'ownShareId',p_share,
    'viewer',jsonb_build_object('role',case when p_owner then 'organiser' else 'participant' end,'shareId',p_share),'shares',shares,
    'lines',lines,'packingPlan',packing,'collectionEstimateMinutes',q.collection_estimate_minutes,
    'fulfilment',o.fulfilment,'createdAt',o.created_at,'paidAt',o.paid_at,'acceptedAt',o.accepted_at,
    'handoffCode',case when p.verified_at is not null and p.hold_reason is null then o.handoff_code else null end,
    'serverNow',now()) || case when p_owner then jsonb_build_object('quoteId',q.id) else '{}'::jsonb end;
end $$;

create or replace function public.mealdeck_customer_orders()
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare customer uuid:=auth.uid();authority jsonb;row record;receipt jsonb;orders jsonb:='[]'::jsonb;
begin
  authority:=mealdeck_private.customer_registration_authority(customer);
  if customer is null or authority is null or authority->'registered' is distinct from 'true'::jsonb then
    raise exception 'mealdeck_checkout_registration_required'; end if;
  for row in
    select o.id from public.orders o
    join mealdeck_private.stripe_orders s on s.order_id=o.id and s.customer_id=customer
    where o.customer_id=customer and o.source='mealdeck'
    order by o.created_at desc,o.id desc limit 20
  loop
    receipt:=public.mealdeck_customer_order_receipt(row.id,customer);
    orders:=orders||jsonb_build_array(jsonb_build_object(
      'orderNumber',receipt->'orderNumber','orderId',receipt->'orderId','handoffCode',receipt->'handoffCode',
      'verifiedPaid',receipt->'verifiedPaid','held',receipt->'held',
      'paymentSessionExpired',receipt->'paymentSessionExpired','fulfilment',receipt->'fulfilment',
      'totalPence',receipt->'totalPence','createdAt',receipt->'createdAt','paidAt',receipt->'paidAt',
      'acceptedAt',receipt->'acceptedAt','preparingAt',receipt->'preparingAt',
      'readyForCollectionAt',receipt->'readyForCollectionAt','completedAt',receipt->'completedAt'));
  end loop;
  return jsonb_build_object('orders',orders);
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
    -- Reuse the canonical purchased-line projection, not a pre-accept receipt.
    select coalesce(jsonb_agg(jsonb_build_object(
      'lineId',i->'checkout_line_id','parentLineId',i->'parent_checkout_line_id',
      'name',i->'item_name','brandName',i->'brand_name','quantity',i->'quantity',
      'unitPence',i->'unit_pence','modifiers',i->'modifiers','notes',i->'notes','bags',i->'bags'
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

create or replace function public.mealdeck_terminal_order_status(p_actor uuid,p_tenant uuid,p_location uuid,p_reference text)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare o public.orders%rowtype;p mealdeck_private.payment_orders%rowtype;q mealdeck_private.checkout_quotes%rowtype;
  legacy mealdeck_private.stripe_orders%rowtype;captured integer;refunded integer;available integer;active jsonb;
begin
  perform public.mealdeck_terminal_authorize(p_actor,p_tenant,p_location);
  select * into o from public.orders where tenant_id=p_tenant and location_id=p_location and source='mealdeck'
    and (id::text=p_reference or (p_reference ~ '^[0-9]{4}$' and handoff_code=p_reference and handoff_code_reserved));
  if not found then raise exception 'mealdeck_payment_order_unavailable'; end if;
  select * into p from mealdeck_private.payment_orders where order_id=o.id;
  if found then
    select * into q from mealdeck_private.checkout_quotes where id=p.quote_id;
    select coalesce(sum(captured_pence),0),coalesce(sum(refunded_pence),0) into captured,refunded
      from mealdeck_private.payment_collections where order_id=o.id;
    select coalesce(sum(s.amount_pence),0) into available from mealdeck_private.payment_shares s where s.order_id=o.id
      and not exists(select 1 from mealdeck_private.payment_collection_shares cs where cs.share_id=s.id and cs.active);
    select mealdeck_private.payment_collection_json(c.id) into active from mealdeck_private.payment_collections c
      where c.order_id=o.id and c.staff_id=p_actor and c.method='terminal' and c.provider_cancelled_at is null
      order by c.created_at desc limit 1;
  else
    select * into legacy from mealdeck_private.stripe_orders where order_id=o.id;
    if not found then raise exception 'mealdeck_payment_order_unavailable'; end if;
    select * into q from mealdeck_private.checkout_quotes where id=legacy.quote_id;
    captured:=legacy.captured_pence;refunded:=legacy.refunded_pence;available:=0;
  end if;
  return jsonb_build_object('orderId',o.id,'quoteId',q.id,'roomId',p.room_id,'currency','GBP',
    'orderNumber',mealdeck_private.paid_order_number(o.id),'displayCode',o.handoff_code,'status',o.status,'paymentStatus',o.payment_status,
    'verifiedPaid',mealdeck_private.kds_release_authority(o.id) is not null,
    'totalPence',o.total_pence,'capturedPence',captured,'paidPence',greatest(0,captured-refunded),
    'refundedPence',refunded,'remainingPence',greatest(0,o.total_pence-captured+refunded),
    'collectiblePence',case when p.hold_reason is null and p.cancel_requested_at is null and p.expires_at>=now()+interval '30 minutes'
      and not exists(select 1 from mealdeck_private.payment_collections where order_id=o.id and captured_pence=0 and provider_cancelled_at is null)
      then available else 0 end,
    'held',p.hold_reason is not null or legacy.void_reason is not null,'activeCollection',active,
    'onlinePaymentActive',legacy.order_id is not null or exists(select 1 from mealdeck_private.payment_collections
      where order_id=o.id and method='checkout' and captured_pence=0 and provider_cancelled_at is null),
    'lines',q.priced_lines,'packingPlan',o.packing_plan,'collectionEstimateMinutes',q.collection_estimate_minutes,
    'fulfilment',o.fulfilment,'vehicle',o.vehicle,'serverNow',now());
end $$;

create or replace function public.mealdeck_ops_kds_workflow_board(p_tenant uuid,p_location uuid)
returns jsonb language plpgsql stable security definer set search_path='' as $function$
declare board jsonb; completed jsonb:='[]'::jsonb; extra integer:=0;
  candidate record; evidence jsonb; card jsonb;
begin
  -- Retain the existing live identity, location permission and paid-release
  -- checks. This read does not create receipts or perform any transition.
  board:=public.mealdeck_ops_kds_board(p_tenant,p_location);
  if board->>'readiness'='ready' then
    for candidate in
      select o.id,p.handed_off_at from public.orders o
      join public.mealdeck_pass_orders p on p.order_id=o.id
        and p.tenant_id=o.tenant_id and p.location_id=o.location_id
      where o.tenant_id=p_tenant and o.location_id=p_location
        and o.source='mealdeck' and o.status='fulfilled'
        and o.payment_status='paid' and o.paid_at is not null
        and o.accepted_at is not null and p.status='handed_off'
        and p.handed_off_at>=now()-interval '12 hours' and p.handed_off_at<=now()
        and p.handed_off_at>=o.accepted_at
      order by p.handed_off_at desc,o.id
    loop
      -- A completed status alone is not evidence of a verified payment. Holds,
      -- refunds and disputes remain governed by the canonical payment ledger.
      evidence:=mealdeck_private.kds_release_authority(candidate.id);
      if evidence->'eligible' is distinct from 'true'::jsonb
        or evidence->'schema_version' is distinct from '1'::jsonb
        or evidence->>'order_id' is distinct from candidate.id::text
        or evidence->>'tenant_id' is distinct from p_tenant::text
        or evidence->>'location_id' is distinct from p_location::text
        or evidence->>'source' is distinct from 'mealdeck' then continue; end if;
      if jsonb_array_length(completed)>=100 then extra:=extra+1; continue; end if;
      perform mealdeck_ops_private.kds_assert_instructions(candidate.id);
      card:=mealdeck_ops_private.kds_order_card(candidate.id,evidence);
      completed:=completed||jsonb_build_array(jsonb_build_object(
        'order_number',card->'order_number','order_id',card->'order_id','display_code',card->'display_code',
        'order_status','fulfilled','handoff_status','handed_off',
        'accepted_at',card->'accepted_at','completed_at',candidate.handed_off_at,
        'fulfilment',card->'fulfilment','group_order',card->'group_order','pickupContact',card->'pickupContact',
        'cutlery_requested',coalesce(card->'cutlery_requested','false'::jsonb),
        'notes',card->'notes','items',card->'items'));
    end loop;
  end if;
  return board||jsonb_build_object('completed_orders',completed,
    'completed_remaining_order_count',extra,'completed_window_hours',12);
end
$function$;

-- PostgreSQL cannot append an OUT column with CREATE OR REPLACE. Keep the
-- reviewed authorised implementation private, then expose its additive wrapper.
do $history$
begin
  if to_regprocedure('mealdeck_ops_private.order_history_before_paid_numbers(uuid,uuid,date,date)') is null then
    alter function public.mealdeck_ops_order_history(uuid,uuid,date,date) set schema mealdeck_ops_private;
    alter function mealdeck_ops_private.mealdeck_ops_order_history(uuid,uuid,date,date)
      rename to order_history_before_paid_numbers;
  end if;
  if not exists(select 1 from pg_proc where oid=
      'mealdeck_ops_private.order_history_before_paid_numbers(uuid,uuid,date,date)'::regprocedure
    and md5(prosrc)='8b1dedf82b067e6264156d8e3aa80ec7' and prosecdef and proconfig @> array['search_path=""']) then
    raise exception 'mealdeck_order_numbers_unreviewed_history'; end if;
end $history$;
revoke all on function mealdeck_ops_private.order_history_before_paid_numbers(uuid,uuid,date,date)
  from public,anon,authenticated,service_role;
create or replace function public.mealdeck_ops_order_history(
  p_tenant uuid,p_location uuid,p_from date,p_to date
) returns table(
  order_id uuid,source text,status text,fulfilment text,
  created_at timestamptz,paid_at timestamptz,
  total_pence integer,item_count bigint,order_number text
) language plpgsql stable security definer set search_path='' as $$
begin
  -- Preserve the original current-auth/scope/period checks without widening them.
  return query select h.*,mealdeck_private.paid_order_number(h.order_id)
    from mealdeck_ops_private.order_history_before_paid_numbers(p_tenant,p_location,p_from,p_to) h;
end $$;
revoke all on function public.mealdeck_ops_order_history(uuid,uuid,date,date) from public,anon,authenticated,service_role;
grant execute on function public.mealdeck_ops_order_history(uuid,uuid,date,date) to authenticated;


revoke all on function mealdeck_private.order_number_record_immutable() from public,anon,authenticated,service_role;
revoke all on function mealdeck_private.order_number_counter_monotonic() from public,anon,authenticated,service_role;
revoke all on function mealdeck_private.paid_order_number(uuid) from public,anon,authenticated,service_role;
revoke all on function mealdeck_private.assign_paid_order_number(uuid) from public,anon,authenticated,service_role;
revoke all on function mealdeck_private.number_verified_paid_order() from public,anon,authenticated,service_role;
revoke all on function mealdeck_private.add_order_number_to_unsent_receipt(uuid,uuid,text) from public,anon,authenticated,service_role;

-- The public history RPC retains its name with one additive OUT field.
notify pgrst, 'reload schema';

commit;
