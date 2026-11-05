-- Add the owner's exact Stripe Checkout hostname without changing payment authority.
-- Install after shared/Terminal payments, on the independent MealDeck project only.
-- This accepts provider-issued URLs; it does not configure DNS/Stripe or enable orders.
begin;
set local lock_timeout='5s';

do $guard$ begin
  if to_regclass('mealdeck_private.installation') is null
    or to_regnamespace('dishbee_private') is not null then
    raise exception 'mealdeck_checkout_domain_independent_profile_required';
  end if;
  if not exists(select 1 from mealdeck_private.installation where singleton
    and profile='mealdeck-independent-v1') then
    raise exception 'mealdeck_checkout_domain_independent_profile_required';
  end if;
  if to_regclass('mealdeck_private.stripe_orders') is null
    or to_regclass('mealdeck_private.payment_collections') is null
    or to_regprocedure('public.mealdeck_bind_stripe_session(uuid,text,text,text,boolean)') is null
    or to_regprocedure('public.mealdeck_bind_order_payment(uuid,text,text,text,text,boolean)') is null then
    raise exception 'mealdeck_checkout_domain_previous_extensions_required';
  end if;
  -- Preserve any separately changed routine for review instead of overwriting it.
  -- The second digest permits a deliberate rerun of this exact additive change.
  if (select md5(prosrc) from pg_proc where oid=
    'public.mealdeck_bind_stripe_session(uuid,text,text,text,boolean)'::regprocedure)
    not in ('7dbe0003c565c7395aaa8264d894a970','3325f226bf5c0fdda19c89c96f4f2e3a')
    or (select md5(prosrc) from pg_proc where oid=
    'public.mealdeck_bind_order_payment(uuid,text,text,text,text,boolean)'::regprocedure)
    not in ('9b21c16448714a6bb2ed05ff3a5e17c6','0af7c9ec1caaed5c232c31bcfff54995') then
    raise exception 'mealdeck_checkout_domain_unexpected_definition';
  end if;
end $guard$;

-- No wildcard subdomains, credentials, ports, other products, or arbitrary paths.
-- The server separately requires MEALDECK_STRIPE_CHECKOUT_HOST=pay.mealdeck.co.uk.
create or replace function mealdeck_private.valid_checkout_url(p_url text)
returns boolean language sql immutable security invoker set search_path='' as $$
  select coalesce(length(p_url)<=4096 and p_url ~
    '^https://(checkout[.]stripe[.]com|pay[.]mealdeck[.]co[.]uk)/c/pay/cs_[A-Za-z0-9_]+([?][A-Za-z0-9_/=?%&.~+:-]*)?([#][A-Za-z0-9_/=?%&#.~+:-]*)?$', false)
$$;
revoke all on function mealdeck_private.valid_checkout_url(text) from public,anon,authenticated,service_role;

create or replace function public.mealdeck_bind_stripe_session(p_order uuid,p_session text,p_url text,p_account text,p_livemode boolean)
returns boolean language plpgsql security definer set search_path='' as $$
declare s mealdeck_private.stripe_orders%rowtype;
begin
  select * into s from mealdeck_private.stripe_orders where order_id=p_order for update;
  if not found or s.stripe_account is distinct from p_account or s.livemode is distinct from p_livemode
    or coalesce(p_session,'') !~ '^cs_(test_|live_)?[A-Za-z0-9]+$'
    or not mealdeck_private.valid_checkout_url(p_url)
    or (s.session_id is not null and s.session_id<>p_session) then
    raise exception 'mealdeck_checkout_session_mismatch'; end if;
  update mealdeck_private.stripe_orders set session_id=p_session,session_url=p_url where order_id=p_order;
  return true;
end $$;

create or replace function public.mealdeck_bind_order_payment(p_collection uuid,p_session text,p_intent text,p_url text,p_account text,p_livemode boolean)
returns jsonb language plpgsql security definer set search_path='' as $$
declare c mealdeck_private.payment_collections%rowtype;p mealdeck_private.payment_orders%rowtype;
begin
  select * into c from mealdeck_private.payment_collections where id=p_collection;
  if not found then raise exception 'mealdeck_payment_attempt_unavailable'; end if;
  p:=mealdeck_private.lock_payment_order(c.order_id);
  select * into c from mealdeck_private.payment_collections where id=p_collection for update;
  if p.stripe_account is distinct from p_account or p.livemode is distinct from p_livemode
    or (p_intent is not null and p_intent !~ '^pi_[A-Za-z0-9]+$')
    or (c.payment_intent_id is not null and c.payment_intent_id is distinct from p_intent)
    or (c.method='terminal' and (p_session is not null or p_url is not null or p_intent is null))
    or (c.method='checkout' and (p_session is null or p_session !~ '^cs_[A-Za-z0-9_]+$'
      or not mealdeck_private.valid_checkout_url(p_url)
      or (c.session_id is not null and c.session_id<>p_session) or (c.session_url is not null and c.session_url<>p_url))) then
    raise exception 'mealdeck_checkout_payment_mismatch'; end if;
  -- Persist an already-created provider object even if cancellation raced the
  -- network response. The server can then cancel/reconcile it safely.
  update mealdeck_private.payment_collections set session_id=p_session,session_url=p_url,
    payment_intent_id=coalesce(payment_intent_id,p_intent) where id=p_collection;
  return mealdeck_private.payment_collection_json(p_collection);
end $$;

revoke all on function public.mealdeck_bind_stripe_session(uuid,text,text,text,boolean) from public,anon,authenticated,service_role;
grant execute on function public.mealdeck_bind_stripe_session(uuid,text,text,text,boolean) to service_role;
revoke all on function public.mealdeck_bind_order_payment(uuid,text,text,text,text,boolean) from public,anon,authenticated,service_role;
grant execute on function public.mealdeck_bind_order_payment(uuid,text,text,text,text,boolean) to service_role;

commit;
