-- Explicit opt-in operation; not a generic migration. Only the verified independent
-- MealDeck project owner may install this reviewed operation atomically.
-- No existing order, payment, quote, price, or staff assignment is rewritten.
begin;
set local lock_timeout='5s';
set local statement_timeout='30s';
set local check_function_bodies=on;

do $guard$
begin
  if to_regnamespace('dishbee_private') is not null
    or to_regclass('mealdeck_private.installation') is null
    or current_user in ('anon','authenticated','service_role')
    or not exists(select 1 from pg_class where oid=to_regclass('mealdeck_private.installation')
      and pg_has_role(current_user,relowner,'USAGE')) then
    raise exception 'mealdeck_voucher_independent_owner_required';
  end if;
  if not exists(select 1 from mealdeck_private.installation where singleton
      and profile='mealdeck-independent-v1' and business_id is not null)
    or to_regclass('mealdeck_private.checkout_quote_notes') is null
    or to_regclass('mealdeck_private.staff_vouchers') is not null
    or to_regprocedure('public.mealdeck_create_checkout_quote_with_notes(uuid,uuid,uuid,text,jsonb,jsonb,text,jsonb,text)') is null
    or not exists(select 1 from pg_proc where oid=to_regprocedure('mealdeck_private.materialize_payment_order(uuid,uuid,uuid,uuid,uuid)')
      and prosecdef and proconfig @> array['search_path=""']
      and md5(prosrc)='d170220fc74064fa3c575f55347e16bb'
      and not has_function_privilege('anon',oid,'EXECUTE')
      and not has_function_privilege('authenticated',oid,'EXECUTE')
      and not has_function_privilege('service_role',oid,'EXECUTE'))
  then raise exception 'mealdeck_voucher_unreviewed_installation'; end if;
end $guard$;

create table mealdeck_private.staff_voucher_settings (
  singleton boolean primary key default true check(singleton),
  enabled boolean not null default false
);
insert into mealdeck_private.staff_voucher_settings(singleton) values(true);
create table mealdeck_private.staff_vouchers (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id),
  location_id uuid not null,
  staff_user_id uuid not null references auth.users(id),
  code_hash text not null unique check(code_hash ~ '^[a-f0-9]{64}$'),
  issued_by uuid not null references auth.users(id),
  issued_at timestamptz not null default clock_timestamp(),
  expires_at timestamptz not null,
  revoked_by uuid references auth.users(id),
  revoked_at timestamptz,
  consumed_quote_id uuid unique references mealdeck_private.checkout_quotes(id),
  consumed_at timestamptz,
  foreign key(tenant_id,location_id) references public.tenant_locations(tenant_id,id),
  check(expires_at>issued_at and expires_at<=issued_at+interval '31 days'),
  check((revoked_at is null)=(revoked_by is null)),
  check((consumed_quote_id is null)=(consumed_at is null)),
  check(revoked_at is null or consumed_at is null)
);
create index staff_vouchers_scope_idx on mealdeck_private.staff_vouchers(tenant_id,location_id,issued_at desc);
create index staff_vouchers_actor_idx on mealdeck_private.staff_vouchers(issued_by,issued_at desc);
create table mealdeck_private.staff_voucher_quotes (
  quote_id uuid primary key references mealdeck_private.checkout_quotes(id),
  voucher_id uuid not null references mealdeck_private.staff_vouchers(id),
  created_at timestamptz not null default clock_timestamp()
);
create table mealdeck_private.staff_voucher_attempts (
  staff_user_id uuid not null references auth.users(id),
  tenant_id uuid not null references public.tenants(id),
  location_id uuid not null,
  window_start timestamptz not null,
  attempts integer not null check(attempts between 1 and 10),
  primary key(staff_user_id,tenant_id,location_id),
  foreign key(tenant_id,location_id) references public.tenant_locations(tenant_id,id)
);
alter table mealdeck_private.staff_voucher_settings enable row level security;
alter table mealdeck_private.staff_vouchers enable row level security;
alter table mealdeck_private.staff_voucher_quotes enable row level security;
alter table mealdeck_private.staff_voucher_attempts enable row level security;
revoke all on mealdeck_private.staff_voucher_settings,mealdeck_private.staff_vouchers,
  mealdeck_private.staff_voucher_quotes,mealdeck_private.staff_voucher_attempts
  from public,anon,authenticated,service_role;

create function mealdeck_private.staff_voucher_scope(p_tenant uuid,p_location uuid)
returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from mealdeck_private.installation i
   join public.tenants t on t.id=i.business_id and t.active and t.currency='GBP'
   join public.tenant_locations l on l.tenant_id=t.id and l.active and l.slug='shared-kitchen'
   where i.singleton and i.profile='mealdeck-independent-v1'
     and t.id=p_tenant and l.id=p_location)
$$;
create function mealdeck_private.staff_voucher_enabled()
returns boolean language sql stable security definer set search_path='' as $$
 select coalesce((select enabled from mealdeck_private.staff_voucher_settings where singleton),false)
$$;
create function mealdeck_private.staff_voucher_member(p_tenant uuid,p_location uuid,p_customer uuid)
returns boolean language sql stable security definer set search_path='' as $$
 select coalesce(p_customer is not null
   and mealdeck_private.staff_voucher_scope(p_tenant,p_location)
   and mealdeck_private.customer_registration_authority(p_customer)->'registered'='true'::jsonb
   and exists(select 1 from public.mealdeck_ops_staff_access a where a.tenant_id=p_tenant
     and a.user_id=p_customer and a.enabled and (a.location_id is null or a.location_id=p_location)),false)
$$;
create function mealdeck_private.assert_staff_voucher_manager(p_tenant uuid,p_location uuid)
returns void language plpgsql stable security definer set search_path='' as $$
begin
 if auth.uid() is null or not mealdeck_private.staff_voucher_scope(p_tenant,p_location)
   or not exists(select 1 from auth.users u where u.id=auth.uid() and u.email_confirmed_at is not null
      and u.deleted_at is null and not coalesce(u.is_anonymous,false)
      and (u.banned_until is null or u.banned_until<=now()))
   or not exists(select 1 from public.mealdeck_ops_staff_access a where a.user_id=auth.uid()
      and a.tenant_id=p_tenant and a.enabled and a.role in ('owner','admin')
      and (a.location_id is null or a.location_id=p_location))
   or not mealdeck_ops_private.can(p_tenant,p_location,'staff.manage')
   or not mealdeck_ops_private.can(p_tenant,p_location,'finance.manage')
 then raise exception 'mealdeck_voucher_forbidden'; end if;
end $$;

-- Return the random code once, only to the authorised issuer; store a digest.
-- The UUID generator supplies 122 random bits, not a sequential or guessable code.
create function public.mealdeck_ops_issue_staff_voucher(p_tenant uuid,p_location uuid,p_staff uuid,p_days integer)
returns jsonb language plpgsql security definer set search_path='' as $$
declare code text; v mealdeck_private.staff_vouchers%rowtype; issued timestamptz:=clock_timestamp();
begin
 perform mealdeck_private.assert_staff_voucher_manager(p_tenant,p_location);
 if not mealdeck_private.staff_voucher_enabled()
   or not mealdeck_private.staff_voucher_member(p_tenant,p_location,p_staff)
   or p_days is null or p_days not between 1 and 30 then raise exception 'mealdeck_voucher_unavailable'; end if;
 perform pg_advisory_xact_lock(hashtextextended('staff-voucher-issuer:'||auth.uid()::text,0));
 if (select count(*) from mealdeck_private.staff_vouchers where issued_by=auth.uid()
      and issued_at>issued-interval '24 hours')>=50 then raise exception 'mealdeck_checkout_retry_later'; end if;
 code:='MD-'||upper(replace(gen_random_uuid()::text,'-',''));
 insert into mealdeck_private.staff_vouchers(tenant_id,location_id,staff_user_id,code_hash,issued_by,issued_at,expires_at)
 values(p_tenant,p_location,p_staff,encode(sha256(convert_to(code,'UTF8')),'hex'),auth.uid(),issued,issued+make_interval(days=>p_days))
 returning * into v;
 return jsonb_build_object('id',v.id,'code',code,'expiresAt',v.expires_at);
end $$;

create function public.mealdeck_ops_staff_vouchers(p_tenant uuid,p_location uuid)
returns jsonb language plpgsql stable security definer set search_path='' as $$
begin
 perform mealdeck_private.assert_staff_voucher_manager(p_tenant,p_location);
 return jsonb_build_object('enabled',mealdeck_private.staff_voucher_enabled(),'vouchers',
   coalesce((select jsonb_agg(jsonb_build_object('id',v.id,'staffUserId',v.staff_user_id,
      'issuedAt',v.issued_at,'expiresAt',v.expires_at,'consumedAt',v.consumed_at,
      'revokedAt',v.revoked_at,'orderId',s.order_id,'paymentStatus',o.payment_status,
      'status',case when v.consumed_at is not null then 'used' when v.revoked_at is not null then 'revoked'
        when v.expires_at<=now() then 'expired' else 'available' end) order by v.issued_at desc,v.id)
    from (select * from mealdeck_private.staff_vouchers where tenant_id=p_tenant and location_id=p_location
      order by issued_at desc,id limit 100) v
    left join mealdeck_private.stripe_orders s on s.quote_id=v.consumed_quote_id
    left join public.orders o on o.id=s.order_id),'[]'::jsonb));
end $$;
create function public.mealdeck_ops_revoke_staff_voucher(p_tenant uuid,p_location uuid,p_voucher uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
begin
 perform mealdeck_private.assert_staff_voucher_manager(p_tenant,p_location);
 update mealdeck_private.staff_vouchers set revoked_at=clock_timestamp(),revoked_by=auth.uid()
 where id=p_voucher and tenant_id=p_tenant and location_id=p_location and revoked_at is null and consumed_at is null;
 if not found then raise exception 'mealdeck_voucher_unavailable'; end if;
 return jsonb_build_object('revoked',true);
end $$;

create function public.mealdeck_staff_voucher_status(p_tenant uuid,p_location uuid,p_customer uuid)
returns jsonb language sql stable security definer set search_path='' as $$
 select jsonb_build_object('eligible',mealdeck_private.staff_voucher_enabled()
   and mealdeck_private.staff_voucher_member(p_tenant,p_location,p_customer))
$$;

-- Return a generic refusal instead of throwing for an invalid code, so failed
-- attempts really commit to the rate-limit row. No raw code enters SQL.
create function public.mealdeck_create_staff_voucher_quote(
 p_tenant uuid,p_location uuid,p_customer uuid,p_fulfilment text,p_vehicle jsonb,
 p_selection jsonb,p_request_hash text,p_packing jsonb,p_notes text,p_code_hash text
) returns jsonb language plpgsql security definer set search_path='' as $$
declare v mealdeck_private.staff_vouchers%rowtype; q mealdeck_private.checkout_quotes%rowtype;
 quote jsonb; current_at timestamptz:=clock_timestamp(); count_now integer; discount integer;
begin
 if not mealdeck_private.staff_voucher_enabled()
    or not mealdeck_private.staff_voucher_member(p_tenant,p_location,p_customer)
    or p_fulfilment not in ('pickup','curbside') then return jsonb_build_object('staffVoucherRejected',true); end if;
 insert into mealdeck_private.staff_voucher_attempts(staff_user_id,tenant_id,location_id,window_start,attempts)
 values(p_customer,p_tenant,p_location,current_at,1)
 on conflict(staff_user_id,tenant_id,location_id) do update
 set window_start=case when staff_voucher_attempts.window_start<=current_at-interval '10 minutes' then current_at else staff_voucher_attempts.window_start end,
 attempts=case when staff_voucher_attempts.window_start<=current_at-interval '10 minutes' then 1 else least(10,staff_voucher_attempts.attempts+1) end
 where staff_voucher_attempts.window_start<=current_at-interval '10 minutes' or staff_voucher_attempts.attempts<10
 returning attempts into count_now;
 if count_now is null then return jsonb_build_object('staffVoucherRateLimited',true); end if;
 select * into v from mealdeck_private.staff_vouchers
 where code_hash=p_code_hash and p_code_hash ~ '^[a-f0-9]{64}$'
   and tenant_id=p_tenant and location_id=p_location and staff_user_id=p_customer
   and revoked_at is null and consumed_at is null and expires_at>clock_timestamp();
 if not found then return jsonb_build_object('staffVoucherRejected',true); end if;
 -- Use exactly the existing member quote pipeline: catalogue, availability,
 -- identity, packing, special requests and live price validations.
 quote:=public.mealdeck_create_checkout_quote_with_notes(p_tenant,p_location,p_customer,
   p_fulfilment,p_vehicle,p_selection,p_request_hash,p_packing,p_notes);
 select * into q from mealdeck_private.checkout_quotes where id=(quote->>'quoteId')::uuid
   and tenant_id=p_tenant and location_id=p_location and customer_id=p_customer
   and guest_id is null and staff_id is null for update;
 if not found or q.discount_pence<>0 or q.opening_start_date is not null
   or quote->'openingOffer'->>'status'='active'
   or q.gross_pence<60 or q.total_pence<>q.gross_pence then
   return jsonb_build_object('staffVoucherRejected',true); end if;
 discount:=q.gross_pence/2;
 update mealdeck_private.checkout_quotes set discount_pence=discount,total_pence=q.gross_pence-discount,
   expires_at=least(q.expires_at,v.expires_at) where id=q.id returning * into q;
 insert into mealdeck_private.staff_voucher_quotes(quote_id,voucher_id) values(q.id,v.id);
 return quote||jsonb_build_object('discountPence',q.discount_pence,'totalPence',q.total_pence,
   'expiresAt',q.expires_at,'staffVoucherApplied',true);
end $$;

-- Called unconditionally on new materialization, before any order is inserted.
-- Lock voucher row across competing quotes; an error rolls back both the
-- consumption and the order. Recovery of an already prepared Stripe attempt
-- does not rematerialize and must not consume the voucher again.
create function mealdeck_private.consume_staff_voucher(
 p_quote uuid,p_customer uuid,p_guest uuid,p_staff uuid,p_room uuid
) returns boolean language plpgsql security definer set search_path='' as $$
declare link mealdeck_private.staff_voucher_quotes%rowtype;
 v mealdeck_private.staff_vouchers%rowtype; q mealdeck_private.checkout_quotes%rowtype;
begin
 select * into link from mealdeck_private.staff_voucher_quotes where quote_id=p_quote;
 if not found then return false; end if;
 select * into q from mealdeck_private.checkout_quotes where id=p_quote;
 select * into v from mealdeck_private.staff_vouchers where id=link.voucher_id for update;
 if not found or p_guest is not null or p_staff is not null or p_room is not null
   or p_customer is null or q.customer_id is distinct from p_customer
   or q.guest_id is not null or q.staff_id is not null
   or q.tenant_id is distinct from v.tenant_id or q.location_id is distinct from v.location_id
   or p_customer is distinct from v.staff_user_id or v.revoked_at is not null
   or v.consumed_at is not null or v.expires_at<=clock_timestamp()
   or not mealdeck_private.staff_voucher_enabled()
   or not mealdeck_private.staff_voucher_member(q.tenant_id,q.location_id,p_customer)
   or q.discount_pence<>q.gross_pence/2 or q.gross_pence<60
   or q.total_pence<>q.gross_pence-q.discount_pence or q.opening_start_date is not null
   or mealdeck_private.opening_offer(q.tenant_id,q.location_id)->>'status'='active'
 then raise exception 'mealdeck_staff_voucher_unavailable'; end if;
 update mealdeck_private.staff_vouchers set consumed_quote_id=p_quote,consumed_at=clock_timestamp() where id=v.id;
 return true;
end $$;

-- Only the actual paid-order owner can receive this non-secret display marker.
create function public.mealdeck_staff_voucher_order(p_order uuid,p_customer uuid)
returns jsonb language sql stable security definer set search_path='' as $$
 select jsonb_build_object('applied',exists(select 1 from mealdeck_private.staff_vouchers v
   join mealdeck_private.stripe_orders s on s.quote_id=v.consumed_quote_id
   join public.orders o on o.id=s.order_id
   where o.id=p_order and o.customer_id=p_customer and v.staff_user_id=p_customer
     and o.tenant_id=v.tenant_id and o.location_id=v.location_id))
$$;

revoke all on function mealdeck_private.staff_voucher_scope(uuid,uuid),
 mealdeck_private.staff_voucher_enabled(),mealdeck_private.staff_voucher_member(uuid,uuid,uuid),
 mealdeck_private.assert_staff_voucher_manager(uuid,uuid),
 mealdeck_private.consume_staff_voucher(uuid,uuid,uuid,uuid,uuid)
 from public,anon,authenticated,service_role;
revoke all on function public.mealdeck_ops_issue_staff_voucher(uuid,uuid,uuid,integer),
 public.mealdeck_ops_staff_vouchers(uuid,uuid),public.mealdeck_ops_revoke_staff_voucher(uuid,uuid,uuid),
 public.mealdeck_staff_voucher_status(uuid,uuid,uuid),
 public.mealdeck_create_staff_voucher_quote(uuid,uuid,uuid,text,jsonb,jsonb,text,jsonb,text,text),
 public.mealdeck_staff_voucher_order(uuid,uuid)
 from public,anon,authenticated,service_role;
grant execute on function public.mealdeck_ops_issue_staff_voucher(uuid,uuid,uuid,integer),
 public.mealdeck_ops_staff_vouchers(uuid,uuid),public.mealdeck_ops_revoke_staff_voucher(uuid,uuid,uuid)
 to authenticated;
grant execute on function public.mealdeck_staff_voucher_status(uuid,uuid,uuid),
 public.mealdeck_create_staff_voucher_quote(uuid,uuid,uuid,text,jsonb,jsonb,text,jsonb,text,text),
 public.mealdeck_staff_voucher_order(uuid,uuid) to service_role;

-- Preserve the audited materializer exactly except for its discount gate.
do $patch$
declare definition text; marker text:='if q.discount_pence>0 and (';
begin
 definition:=pg_get_functiondef('mealdeck_private.materialize_payment_order(uuid,uuid,uuid,uuid,uuid)'::regprocedure);
 if (length(definition)-length(replace(definition,marker,'')))/length(marker)<>1 then
   raise exception 'mealdeck_voucher_unreviewed_discount_gate'; end if;
 execute replace(definition,marker,
   'if mealdeck_private.consume_staff_voucher(q.id,p_customer,p_guest,p_staff,p_room) then null; elsif q.discount_pence>0 and (');
end $patch$;
revoke all on function mealdeck_private.materialize_payment_order(uuid,uuid,uuid,uuid,uuid)
 from public,anon,authenticated,service_role;
commit;
