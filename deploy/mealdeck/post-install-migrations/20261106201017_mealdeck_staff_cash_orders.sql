-- Generated with Supabase CLI 3.0.0: mealdeck_staff_cash_orders.
-- Explicit, scoped staff attestation of received cash. No Stripe object, event,
-- account, collection or native device is fabricated. Existing payments remain intact.
begin;
set local lock_timeout='5s';
set local statement_timeout='30s';
set local check_function_bodies=on;

do $guard$
declare expected record;
begin
  if to_regnamespace('dishbee_private') is not null or to_regclass('mealdeck_private.installation') is null then
    raise exception 'mealdeck_cash_independent_profile_required'; end if;
  if current_user in ('anon','authenticated','service_role') or not exists(
    select 1 from pg_class where oid='mealdeck_private.installation'::regclass
      and pg_has_role(current_user,relowner,'USAGE')) then
    raise exception 'mealdeck_cash_database_owner_required'; end if;
  if not exists(select 1 from mealdeck_private.installation where singleton and profile='mealdeck-independent-v1'
    and business_id is not null) or to_regclass('mealdeck_private.order_numbers') is null
    or to_regclass('mealdeck_private.checkout_quote_notes') is null then
    raise exception 'mealdeck_cash_previous_extensions_required'; end if;
  if (to_regclass('mealdeck_private.cash_orders') is null) is distinct from
    (to_regclass('mealdeck_private.cash_checkout_quotes') is null)
    or (to_regclass('mealdeck_private.cash_orders') is null) is distinct from
    (to_regclass('mealdeck_private.cash_closed_quotes') is null) then
    raise exception 'mealdeck_cash_incomplete_installation'; end if;
  -- Every existing financial definition is an exact reviewed dependency.
  for expected in select * from (values
    ('mealdeck_private.release_paid_order(uuid,text)','89b7ca882734b3a56d8badf62b3e81cc','89b7ca882734b3a56d8badf62b3e81cc'),
    ('mealdeck_private.payment_order_financial_ready(uuid)','4563f2c3c6997cdc1d034afbe2f88733','4563f2c3c6997cdc1d034afbe2f88733'),
    ('mealdeck_private.materialize_payment_order(uuid,uuid,uuid,uuid,uuid)','d170220fc74064fa3c575f55347e16bb','d170220fc74064fa3c575f55347e16bb'),
    ('mealdeck_private.price_checkout_lines(uuid,uuid,jsonb)','c867416a25499f372e6bce2c93468831','c867416a25499f372e6bce2c93468831'),
    ('mealdeck_private.assign_paid_order_number(uuid)','e002536d8ab39ed9dbde863de106c8da','e002536d8ab39ed9dbde863de106c8da'),
    ('public.mealdeck_terminal_authorize(uuid,uuid,uuid)','c3cee0970b093edc8e54a63ec03e9e9f','c3cee0970b093edc8e54a63ec03e9e9f'),
    ('public.mealdeck_create_terminal_quote(uuid,uuid,uuid,text,jsonb,jsonb,jsonb,text)','33365ca69f1e65c8dda387177db80ff2','33365ca69f1e65c8dda387177db80ff2'),
    ('mealdeck_private.create_checkout_quote_for_actor(uuid,uuid,uuid,uuid,uuid,text,jsonb,jsonb,text,jsonb)','7614993635874e546b8c65fd7899308a','aae853a38bd262b074525ff3707af461'),
    ('mealdeck_private.kds_release_authority(uuid)','e687944dc60d19e877f5b486a9882748','0d19656f9e94ce24743fbe9dec5b0ee1'),
    ('mealdeck_ops_private.receipt_snapshot(uuid)','bcadd0b804e9378cd75a9c4fa388ee9a','880995efe09dfd02f710ea2a87cfd6a4')
  ) x(signature,old_hash,new_hash) loop
    if not exists(select 1 from pg_proc where oid=to_regprocedure(expected.signature)
      and prosecdef and proconfig @> array['search_path=""'] and md5(prosrc) in (expected.old_hash,expected.new_hash)) then
      raise exception 'mealdeck_cash_unreviewed_definition: %',expected.signature; end if;
  end loop;
  if not exists(select 1 from pg_proc where oid=to_regprocedure('mealdeck_private.normalise_checkout_notes(text)')
    and not prosecdef and proconfig @> array['search_path=""'] and md5(prosrc)='aa0cd608ee89054c0a5fb69354d6eb30') then
    raise exception 'mealdeck_cash_notes_validator_required'; end if;
  for expected in select * from (values
    ('mealdeck_private.cash_customer_name(text)','c91f340df334c0a7e6d7c73ba75ce38d',false),
    ('mealdeck_private.cash_record_immutable()','af6cd99201f49c78feb83af0709832d7',false),
    ('mealdeck_private.cash_authorize_locked(uuid,uuid,uuid)','df6b27fb06325bd241738e11b4359f7d',true),
    ('mealdeck_private.guard_cash_quote_owner()','48602c34d0f90c8c79e4a719cca3d486',true),
    ('mealdeck_private.order_checkout_quote_id(uuid)','ad869575c58ca66ef8e00b23290438fa',true),
    ('mealdeck_private.cash_order_financial_ready(uuid)','b4c5bd5b94f1184fe2f6d01951d59408',true),
    ('mealdeck_private.kds_release_authority_before_cash(uuid)','e687944dc60d19e877f5b486a9882748',true),
    ('mealdeck_private.cash_order_snapshot(uuid)','6ff46e2814643d89c310fc7ac3698096',true),
    ('public.mealdeck_create_cash_quote(uuid,uuid,uuid,jsonb,jsonb,text,text,text,text)','1845e4c8dc4a89ed86111ee1f8ebc11b',true),
    ('public.mealdeck_cash_order_status(uuid,uuid,uuid,uuid,uuid)','e3c77d2b7a390e4e452d27fd752fb4c9',true),
    ('public.mealdeck_cancel_cash_order_attempt(uuid,uuid,uuid,uuid,uuid)','3dcc7184e92e5a435a47d116d6b60fa7',true),
    ('public.mealdeck_confirm_cash_order(uuid,uuid,uuid,uuid,uuid,boolean)','76e38e5a85d2c4a04b7e5911f0022321',true)
  ) x(signature,body_hash,is_definer) loop
    if to_regprocedure(expected.signature) is not null and not exists(select 1 from pg_proc
      where oid=to_regprocedure(expected.signature) and md5(prosrc)=expected.body_hash
        and prosecdef=expected.is_definer and proconfig @> array['search_path=""']) then
      raise exception 'mealdeck_cash_unreviewed_helper: %',expected.signature; end if;
  end loop;
end $guard$;

create or replace function mealdeck_private.cash_customer_name(p_name text)
returns text language plpgsql immutable set search_path='' as $$
declare clean text;
begin
  if p_name ~ '[[:cntrl:]]' then raise exception 'mealdeck_cash_contact_required'; end if;
  clean:=mealdeck_private.normalise_checkout_notes(p_name);
  if clean is null or char_length(clean)>120 or clean ~ '[[:cntrl:]]' then
    raise exception 'mealdeck_cash_contact_required'; end if;
  return regexp_replace(clean,'[[:space:]]+',' ','g');
end $$;

create table if not exists mealdeck_private.cash_checkout_quotes(
  quote_id uuid primary key references mealdeck_private.checkout_quotes(id) on delete restrict,
  tenant_id uuid not null,location_id uuid not null,
  staff_id uuid not null references auth.users(id) on delete restrict,
  customer_name text not null check(customer_name=mealdeck_private.cash_customer_name(customer_name)),
  customer_phone text not null check(customer_phone ~ '^\+[1-9][0-9]{7,14}$'),
  created_at timestamptz not null default now(),
  foreign key(tenant_id,location_id) references public.tenant_locations(tenant_id,id)
);
create table if not exists mealdeck_private.cash_orders(
  order_id uuid primary key,quote_id uuid not null unique references mealdeck_private.cash_checkout_quotes(quote_id) on delete restrict,
  tenant_id uuid not null,location_id uuid not null,
  collector_id uuid not null references auth.users(id) on delete restrict,
  attempt_id uuid not null,release_id uuid not null unique default gen_random_uuid(),
  amount_pence integer not null check(amount_pence>0),
  currency text not null check(currency='GBP'),cash_received boolean not null check(cash_received),
  received_at timestamptz not null default now(),
  audit_id bigint not null unique references public.mealdeck_ops_audit_log(id) on delete restrict,
  unique(collector_id,attempt_id),
  foreign key(tenant_id,location_id,order_id) references public.orders(tenant_id,location_id,id)
);
create table if not exists mealdeck_private.cash_closed_quotes(
  quote_id uuid primary key references mealdeck_private.cash_checkout_quotes(quote_id) on delete restrict,
  tenant_id uuid not null,location_id uuid not null,
  staff_id uuid not null references auth.users(id) on delete restrict,
  attempt_id uuid not null,closed_at timestamptz not null default now(),
  unique(staff_id,attempt_id),
  foreign key(tenant_id,location_id) references public.tenant_locations(tenant_id,id)
);
alter table mealdeck_private.cash_checkout_quotes enable row level security;
alter table mealdeck_private.cash_orders enable row level security;
alter table mealdeck_private.cash_closed_quotes enable row level security;
revoke all on mealdeck_private.cash_checkout_quotes,mealdeck_private.cash_orders,mealdeck_private.cash_closed_quotes from public,anon,authenticated,service_role;

create or replace function mealdeck_private.cash_record_immutable()
returns trigger language plpgsql set search_path='' as $$
begin raise exception 'mealdeck_cash_record_immutable'; end $$;
drop trigger if exists cash_quote_immutable on mealdeck_private.cash_checkout_quotes;
create trigger cash_quote_immutable before update or delete on mealdeck_private.cash_checkout_quotes
  for each row execute function mealdeck_private.cash_record_immutable();
drop trigger if exists cash_order_immutable on mealdeck_private.cash_orders;
create trigger cash_order_immutable before update or delete on mealdeck_private.cash_orders
  for each row execute function mealdeck_private.cash_record_immutable();
drop trigger if exists cash_closed_quote_immutable on mealdeck_private.cash_closed_quotes;
create trigger cash_closed_quote_immutable before update or delete on mealdeck_private.cash_closed_quotes
  for each row execute function mealdeck_private.cash_record_immutable();

create or replace function mealdeck_private.cash_authorize_locked(p_actor uuid,p_tenant uuid,p_location uuid)
returns void language plpgsql security definer set search_path='' as $$
declare u auth.users%rowtype;
begin
  -- A short shared table lock also fences newly inserted scoped denial rows;
  -- merely locking an existing grant would not cover that revocation race.
  lock table public.mealdeck_ops_staff_access in share mode;
  select * into u from auth.users where id=p_actor for share;
  if not found or u.email_confirmed_at is null or coalesce(u.is_anonymous,false)
    or u.deleted_at is not null or (u.banned_until is not null and u.banned_until>now()) then
    raise exception 'mealdeck_payment_staff_forbidden'; end if;
  perform 1 from public.tenant_locations where id=p_location and tenant_id=p_tenant for share;
  if not found then raise exception 'mealdeck_payment_staff_forbidden'; end if;
  perform public.mealdeck_terminal_authorize(p_actor,p_tenant,p_location);
end $$;

create or replace function mealdeck_private.guard_cash_quote_owner()
returns trigger language plpgsql security definer set search_path='' as $$
begin
  perform 1 from mealdeck_private.checkout_quotes where id=new.quote_id for update;
  if tg_table_name='cash_orders' then
    if exists(select 1 from mealdeck_private.cash_closed_quotes where quote_id=new.quote_id
      or (staff_id=new.collector_id and attempt_id=new.attempt_id)) then
      raise exception 'mealdeck_cash_attempt_closed'; end if;
    if exists(select 1 from mealdeck_private.stripe_orders where quote_id=new.quote_id or order_id=new.order_id)
      or exists(select 1 from mealdeck_private.payment_orders where quote_id=new.quote_id or order_id=new.order_id)
      or not exists(select 1 from mealdeck_private.cash_checkout_quotes q where q.quote_id=new.quote_id
        and q.tenant_id=new.tenant_id and q.location_id=new.location_id and q.staff_id=new.collector_id) then
      raise exception 'mealdeck_payment_cash_overlap'; end if;
  elsif exists(select 1 from mealdeck_private.cash_checkout_quotes where quote_id=new.quote_id)
    or exists(select 1 from mealdeck_private.cash_orders where order_id=new.order_id) then
    raise exception 'mealdeck_payment_cash_overlap';
  end if;
  return new;
end $$;
drop trigger if exists cash_quote_owner on mealdeck_private.cash_orders;
create trigger cash_quote_owner before insert on mealdeck_private.cash_orders
  for each row execute function mealdeck_private.guard_cash_quote_owner();
drop trigger if exists cash_quote_owner on mealdeck_private.stripe_orders;
create trigger cash_quote_owner before insert on mealdeck_private.stripe_orders
  for each row execute function mealdeck_private.guard_cash_quote_owner();
drop trigger if exists cash_quote_owner on mealdeck_private.payment_orders;
create trigger cash_quote_owner before insert on mealdeck_private.payment_orders
  for each row execute function mealdeck_private.guard_cash_quote_owner();

create or replace function mealdeck_private.order_checkout_quote_id(p_order uuid)
returns uuid language sql stable security definer set search_path='' as $$
  select case when count(*)=1 then min(quote_id::text)::uuid else null end from (
    select quote_id from mealdeck_private.stripe_orders where order_id=p_order
    union all select quote_id from mealdeck_private.payment_orders where order_id=p_order
    union all select quote_id from mealdeck_private.cash_orders where order_id=p_order
  ) sources
$$;

create or replace function mealdeck_private.cash_order_financial_ready(p_order uuid)
returns boolean language sql stable security definer set search_path='' as $$
  select exists(select 1 from mealdeck_private.cash_orders c
    join public.orders o on o.id=c.order_id and o.tenant_id=c.tenant_id and o.location_id=c.location_id
    join mealdeck_private.cash_checkout_quotes cq on cq.quote_id=c.quote_id
      and cq.tenant_id=c.tenant_id and cq.location_id=c.location_id and cq.staff_id=c.collector_id
    join mealdeck_private.checkout_quotes q on q.id=c.quote_id and q.tenant_id=c.tenant_id
      and q.location_id=c.location_id and q.staff_id=c.collector_id
    join public.mealdeck_ops_audit_log a on a.id=c.audit_id and a.entity_id=c.order_id
    left join mealdeck_private.checkout_quote_notes n on n.quote_id=q.id
    where c.order_id=p_order and c.cash_received and c.currency='GBP' and c.received_at<=now()
      and c.amount_pence=o.total_pence and c.amount_pence=q.total_pence
      and o.source='mealdeck' and o.currency='GBP' and o.fulfilment='pickup'
      and o.customer_id is null and not o.guest_checkout and o.group_order_room_id is null
      and o.customer_name=cq.customer_name and o.customer_phone=cq.customer_phone
      and o.notes is not distinct from n.notes
      and q.customer_id is null and q.guest_id is null and q.fulfilment='pickup' and q.vehicle is null
      and o.payment_status='paid' and o.paid_at=c.received_at
      and o.status not in ('cancelled','refunded') and o.payment_reference='md_cash_'||c.release_id::text
      and a.tenant_id=c.tenant_id and a.location_id=c.location_id and a.actor_id=c.collector_id
      and a.action='cash.received' and a.entity_type='order' and a.created_at=c.received_at
      and a.previous_value is null and a.next_value=jsonb_build_object('paymentMethod','cash','cashReceived',true,
        'quoteId',c.quote_id,'attemptId',c.attempt_id,'releaseId',c.release_id,
        'amountPence',c.amount_pence,'currency','GBP','receivedAt',c.received_at)
      and not exists(select 1 from mealdeck_private.stripe_orders where order_id=c.order_id or quote_id=c.quote_id)
      and not exists(select 1 from mealdeck_private.payment_orders where order_id=c.order_id or quote_id=c.quote_id))
$$;

-- Existing Stripe authority is preserved byte-for-byte under a private alias.
create or replace function mealdeck_private.kds_release_authority_before_cash(p_order uuid)
returns jsonb language sql stable security definer set search_path='' as $$
  select jsonb_build_object('schema_version',1,'eligible',true,'order_id',o.id,'tenant_id',o.tenant_id,
    'location_id',o.location_id,'source','mealdeck','release_id',s.release_id,
    'verified_at',to_char(s.verified_at at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"'))
  from public.orders o join mealdeck_private.stripe_orders s on s.order_id=o.id
  where o.id=p_order and o.source='mealdeck' and o.group_order_room_id is null
    and s.verified_at is not null and s.verified_at<=now() and s.payment_intent_id=o.payment_reference
    and s.captured_pence=o.total_pence and s.refunded_pence=0 and s.void_reason is null
    and o.payment_status='paid' and o.paid_at is not null
    and exists(select 1 from mealdeck_private.stripe_events e where e.order_id=o.id)
  union all
  select jsonb_build_object('schema_version',1,'eligible',true,'order_id',p.order_id,'tenant_id',p.tenant_id,
    'location_id',p.location_id,'source','mealdeck','release_id',p.release_id,
    'verified_at',to_char(p.verified_at at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"'))
    from mealdeck_private.payment_orders p where p.order_id=p_order and mealdeck_private.payment_order_financial_ready(p_order)
      and (p.room_id is null or mealdeck_private.group_payment_authority(p.room_id))
$$;

create or replace function mealdeck_private.kds_release_authority(p_order uuid)
returns jsonb language sql stable security definer set search_path='' as $$
  select coalesce(mealdeck_private.kds_release_authority_before_cash(p_order),(
    select jsonb_build_object('schema_version',1,'eligible',true,'order_id',c.order_id,
      'tenant_id',c.tenant_id,'location_id',c.location_id,'source','mealdeck','release_id',c.release_id,
      'verified_at',to_char(c.received_at at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"'))
    from mealdeck_private.cash_orders c where c.order_id=p_order
      and mealdeck_private.cash_order_financial_ready(p_order)))
$$;

create or replace function mealdeck_private.cash_order_snapshot(p_order uuid)
returns jsonb language sql stable security definer set search_path='' as $$
  select jsonb_build_object('orderId',o.id,'quoteId',c.quote_id,
    'orderNumber',mealdeck_private.paid_order_number(o.id),'handoffCode',o.handoff_code,
    'fulfilment',o.fulfilment,'currency','GBP','paymentMethod','cash','cashReceived',true,
    'paymentStatus',o.payment_status,'verifiedPaid',mealdeck_private.cash_order_financial_ready(o.id),
    'status',o.status,'totalPence',c.amount_pence,'receivedAt',c.received_at,'acceptedAt',o.accepted_at,
    'customerName',cq.customer_name,'customerPhone',cq.customer_phone,'notes',n.notes)
  from mealdeck_private.cash_orders c
    join public.orders o on o.id=c.order_id and o.tenant_id=c.tenant_id and o.location_id=c.location_id
    join mealdeck_private.cash_checkout_quotes cq on cq.quote_id=c.quote_id
    left join mealdeck_private.checkout_quote_notes n on n.quote_id=c.quote_id
  where c.order_id=p_order
$$;

create or replace function public.mealdeck_create_cash_quote(
  p_actor uuid,p_tenant uuid,p_location uuid,p_selection jsonb,p_packing jsonb,
  p_request_hash text,p_customer_name text,p_customer_phone text,p_notes text
) returns jsonb language plpgsql security definer set search_path='' as $$
declare result jsonb;q mealdeck_private.checkout_quotes%rowtype;customer_name text;notes text;
begin
  perform mealdeck_private.cash_authorize_locked(p_actor,p_tenant,p_location);
  customer_name:=mealdeck_private.cash_customer_name(p_customer_name);
  if p_customer_phone is null or p_customer_phone !~ '^\+[1-9][0-9]{7,14}$' then
    raise exception 'mealdeck_cash_contact_required'; end if;
  notes:=mealdeck_private.normalise_checkout_notes(p_notes);
  -- The current staff quote implementation owns admission, canonical pricing,
  -- stock, offer, packing, routing, expiry and the existing per-staff rate limit.
  result:=public.mealdeck_create_terminal_quote(p_actor,p_tenant,p_location,'pickup',null,
    p_selection,p_packing,p_request_hash);
  select * into q from mealdeck_private.checkout_quotes where id=(result->>'quoteId')::uuid
    and tenant_id=p_tenant and location_id=p_location and staff_id=p_actor
    and customer_id is null and guest_id is null and fulfilment='pickup' and vehicle is null
    and request_hash=p_request_hash and created_at=now() and expires_at>now() for update;
  if not found or exists(select 1 from mealdeck_private.stripe_orders where quote_id=q.id)
    or exists(select 1 from mealdeck_private.payment_orders where quote_id=q.id)
    or exists(select 1 from mealdeck_private.checkout_quote_notes where quote_id=q.id) then
    raise exception 'mealdeck_cash_quote_unavailable'; end if;
  insert into mealdeck_private.cash_checkout_quotes(quote_id,tenant_id,location_id,staff_id,customer_name,customer_phone)
    values(q.id,p_tenant,p_location,p_actor,customer_name,p_customer_phone);
  if notes is not null then insert into mealdeck_private.checkout_quote_notes(quote_id,notes) values(q.id,notes); end if;
  return result||jsonb_build_object('customerName',customer_name,'customerPhone',p_customer_phone,'notes',notes);
end $$;

create or replace function public.mealdeck_cash_order_status(
  p_actor uuid,p_tenant uuid,p_location uuid,p_quote uuid,p_attempt uuid
) returns jsonb language plpgsql security definer set search_path='' as $$
declare q mealdeck_private.cash_checkout_quotes%rowtype;c mealdeck_private.cash_orders%rowtype;
begin
  perform mealdeck_private.cash_authorize_locked(p_actor,p_tenant,p_location);
  if p_quote is null or p_attempt is null then raise exception 'mealdeck_cash_invalid_request'; end if;
  perform pg_advisory_xact_lock(hashtextextended('mealdeck-cash-attempt:'||p_actor::text||':'||p_attempt::text,0));
  -- Same lock order as confirmation. A response-loss check cannot return null
  -- while that attempt is still committing in another database session.
  perform 1 from mealdeck_private.checkout_quotes where id=p_quote for update;
  select * into q from mealdeck_private.cash_checkout_quotes where quote_id=p_quote
    and staff_id=p_actor and tenant_id=p_tenant and location_id=p_location;
  if not found then raise exception 'mealdeck_cash_quote_unavailable'; end if;
  if exists(select 1 from mealdeck_private.cash_closed_quotes where staff_id=p_actor and attempt_id=p_attempt
    and (quote_id<>p_quote or tenant_id<>p_tenant or location_id<>p_location)) then
    raise exception 'mealdeck_payment_attempt_conflict'; end if;
  select * into c from mealdeck_private.cash_orders where collector_id=p_actor and attempt_id=p_attempt;
  if found and (c.quote_id<>p_quote or c.tenant_id<>p_tenant or c.location_id<>p_location) then
    raise exception 'mealdeck_payment_attempt_conflict'; end if;
  if c.order_id is null then select * into c from mealdeck_private.cash_orders where quote_id=p_quote; end if;
  return jsonb_build_object('order',case when c.order_id is null then null else mealdeck_private.cash_order_snapshot(c.order_id) end,
    'replayed',c.order_id is not null,'cancelled',c.order_id is null and exists(
      select 1 from mealdeck_private.cash_closed_quotes where quote_id=p_quote));
end $$;

create or replace function public.mealdeck_cancel_cash_order_attempt(
  p_actor uuid,p_tenant uuid,p_location uuid,p_quote uuid,p_attempt uuid
) returns jsonb language plpgsql security definer set search_path='' as $$
declare existing jsonb;
begin
  existing:=public.mealdeck_cash_order_status(p_actor,p_tenant,p_location,p_quote,p_attempt);
  if existing->'order' is distinct from 'null'::jsonb or existing->'cancelled'='true'::jsonb then
    return existing; end if;
  -- This closes an unused quote only. It cannot cancel/refund a saved tender.
  -- Holding the same attempt and quote locks makes a delayed confirmation either
  -- win first and be returned above, or observe this immutable closure marker.
  insert into mealdeck_private.cash_closed_quotes(quote_id,tenant_id,location_id,staff_id,attempt_id)
    values(p_quote,p_tenant,p_location,p_actor,p_attempt);
  insert into public.mealdeck_ops_audit_log(tenant_id,location_id,actor_id,action,entity_type,entity_id,next_value)
    values(p_tenant,p_location,p_actor,'cash.quote_closed','checkout_quote',p_quote,
      jsonb_build_object('attemptId',p_attempt,'cashOrderExists',false));
  return jsonb_build_object('order',null,'replayed',false,'cancelled',true);
end $$;

create or replace function public.mealdeck_confirm_cash_order(
  p_actor uuid,p_tenant uuid,p_location uuid,p_quote uuid,p_attempt uuid,p_cash_received boolean
) returns jsonb language plpgsql security definer set search_path='' as $$
declare existing jsonb;q mealdeck_private.checkout_quotes%rowtype;cq mealdeck_private.cash_checkout_quotes%rowtype;
  o public.orders%rowtype;release uuid:=gen_random_uuid();audit bigint;label text;
begin
  if p_cash_received is distinct from true then raise exception 'mealdeck_cash_attestation_required'; end if;
  -- Auth/scope and attempt/quote locks are shared with status. Recovery remains
  -- available after close/expiry, but never after the collector loses access.
  existing:=public.mealdeck_cash_order_status(p_actor,p_tenant,p_location,p_quote,p_attempt);
  if existing->'cancelled'='true'::jsonb then raise exception 'mealdeck_cash_attempt_closed'; end if;
  if existing->'order' is distinct from 'null'::jsonb then return existing; end if;
  select * into cq from mealdeck_private.cash_checkout_quotes where quote_id=p_quote;
  select * into q from mealdeck_private.checkout_quotes where id=p_quote;
  if exists(select 1 from mealdeck_private.stripe_orders where quote_id=p_quote)
    or exists(select 1 from mealdeck_private.payment_orders where quote_id=p_quote) then
    raise exception 'mealdeck_payment_cash_overlap'; end if;
  -- The unchanged materializer rechecks admission, expiry, current canonical
  -- stock/prices and offer before creating any order or tender record.
  o:=mealdeck_private.materialize_payment_order(p_quote,null,null,p_actor,null);
  update public.orders set customer_name=cq.customer_name,customer_phone=cq.customer_phone where id=o.id;
  insert into public.mealdeck_ops_audit_log(tenant_id,location_id,actor_id,action,entity_type,entity_id,next_value)
    values(p_tenant,p_location,p_actor,'cash.received','order',o.id,
      jsonb_build_object('paymentMethod','cash','cashReceived',true,'quoteId',p_quote,'attemptId',p_attempt,
        'releaseId',release,'amountPence',q.total_pence,'currency','GBP','receivedAt',now())) returning id into audit;
  insert into mealdeck_private.cash_orders(order_id,quote_id,tenant_id,location_id,collector_id,
    attempt_id,release_id,amount_pence,currency,cash_received,audit_id)
    values(o.id,q.id,p_tenant,p_location,p_actor,p_attempt,release,q.total_pence,'GBP',true,audit);
  perform mealdeck_private.release_paid_order(o.id,'md_cash_'||release::text);
  if not mealdeck_private.cash_order_financial_ready(o.id) then raise exception 'mealdeck_cash_evidence_invalid'; end if;
  -- Allocate after every payment/routing lock. The existing deferred trigger is
  -- idempotent and observes this same immutable mapping at commit.
  label:=mealdeck_private.assign_paid_order_number(o.id);
  if label is null then raise exception 'mealdeck_cash_release_unavailable'; end if;
  return jsonb_build_object('order',mealdeck_private.cash_order_snapshot(o.id),'replayed',false);
end $$;

-- Only future acceptance snapshots gain the cash label. Stored receipts are untouched.
create or replace function mealdeck_ops_private.receipt_snapshot(p_order uuid)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare o public.orders%rowtype;q mealdeck_private.checkout_quotes%rowtype;items jsonb;loc text;
begin
  select * into o from public.orders where id=p_order;
  select cq.* into q from mealdeck_private.checkout_quotes cq
    where cq.id=mealdeck_private.order_checkout_quote_id(p_order);
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
    'currency','GBP','orderNotes',o.notes)
    ||case when exists(select 1 from mealdeck_private.cash_orders where order_id=p_order)
      then jsonb_build_object('paymentMethod','cash') else '{}'::jsonb end;
end $$;

do $permissions$
declare item record;
begin
  for item in select p.oid::regprocedure signature from pg_proc p join pg_namespace n on n.oid=p.pronamespace
    where (n.nspname='mealdeck_private' and p.proname in ('cash_customer_name','cash_record_immutable',
      'cash_authorize_locked','guard_cash_quote_owner','order_checkout_quote_id','cash_order_financial_ready',
      'kds_release_authority_before_cash','kds_release_authority','cash_order_snapshot'))
      or (n.nspname='mealdeck_ops_private' and p.proname='receipt_snapshot')
      or (n.nspname='public' and p.proname in ('mealdeck_create_cash_quote','mealdeck_cash_order_status','mealdeck_confirm_cash_order','mealdeck_cancel_cash_order_attempt'))
  loop
    execute format('revoke all on function %s from public,anon,authenticated,service_role',item.signature);
  end loop;
end $permissions$;
grant execute on function public.mealdeck_create_cash_quote(uuid,uuid,uuid,jsonb,jsonb,text,text,text,text),
  public.mealdeck_cash_order_status(uuid,uuid,uuid,uuid,uuid),
  public.mealdeck_cancel_cash_order_attempt(uuid,uuid,uuid,uuid,uuid),
  public.mealdeck_confirm_cash_order(uuid,uuid,uuid,uuid,uuid,boolean) to service_role;
notify pgrst,'reload schema';
commit;
