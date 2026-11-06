-- Generated with Supabase CLI: mealdeck_checkout_session_paths.
-- Stripe returned /g/pay/ for the owner's approved custom Checkout hostname.
-- Extend only the private URL-shape helper after the existing domain migration.
-- Provider identity, payment authority, grants and saved URLs remain unchanged.
begin;
set local lock_timeout='5s';

do $guard$ begin
  if to_regclass('mealdeck_private.installation') is null
    or to_regnamespace('dishbee_private') is not null then
    raise exception 'mealdeck_checkout_session_paths_independent_profile_required';
  end if;
  if not exists(select 1 from mealdeck_private.installation where singleton
    and profile='mealdeck-independent-v1') then
    raise exception 'mealdeck_checkout_session_paths_independent_profile_required';
  end if;
  if to_regprocedure('mealdeck_private.valid_checkout_url(text)') is null
    or to_regprocedure('public.mealdeck_bind_stripe_session(uuid,text,text,text,boolean)') is null
    or to_regprocedure('public.mealdeck_bind_order_payment(uuid,text,text,text,text,boolean)') is null then
    raise exception 'mealdeck_checkout_session_paths_previous_extension_required';
  end if;
  -- Only the reviewed installed helper or this exact revision may be replaced.
  -- The public bind routines are verified here and are never redefined.
  if (select md5(prosrc) from pg_proc where oid=
    'mealdeck_private.valid_checkout_url(text)'::regprocedure)
    not in ('3a397b1027ee84cb65478e273b1f5f48','0fdb899ca5512685e6a86a4a0ba7c8b3')
    or (select md5(prosrc) from pg_proc where oid=
    'public.mealdeck_bind_stripe_session(uuid,text,text,text,boolean)'::regprocedure)
    <> '3325f226bf5c0fdda19c89c96f4f2e3a'
    or (select md5(prosrc) from pg_proc where oid=
    'public.mealdeck_bind_order_payment(uuid,text,text,text,text,boolean)'::regprocedure)
    <> '0af7c9ec1caaed5c232c31bcfff54995' then
    raise exception 'mealdeck_checkout_session_paths_unexpected_definition';
  end if;
end $guard$;

-- Accept only the two observed Checkout path families on the existing hosts.
-- The trusted server also checks the configured host and exact provider Session ID.
-- Never rewrite the path, query or fragment of a provider-issued URL.
create or replace function mealdeck_private.valid_checkout_url(p_url text)
returns boolean language sql immutable security invoker set search_path='' as $$
  select coalesce(length(p_url)<=4096 and p_url ~
    '^https://(checkout[.]stripe[.]com|pay[.]mealdeck[.]co[.]uk)/[cg]/pay/cs_[A-Za-z0-9_]+([?][A-Za-z0-9_/=?%&.~+:-]*)?([#][A-Za-z0-9_/=?%&#.~+:-]*)?$', false)
$$;
revoke all on function mealdeck_private.valid_checkout_url(text) from public,anon,authenticated,service_role;

commit;
