-- Additive opening-weekend contact-only checkout. Preserve historical contacts,
-- all payment gates, staff authentication, opening hours and receipt capabilities.
begin;
set local lock_timeout='5s';
do $guard$ begin
  if to_regnamespace('dishbee_private') is not null
    or to_regclass('mealdeck_private.installation') is null then
    raise exception 'mealdeck_guest_independent_profile_required'; end if;
  if not exists(select 1 from mealdeck_private.installation where singleton and profile='mealdeck-independent-v1')
    or to_regclass('mealdeck_private.guest_sessions') is null then
    raise exception 'mealdeck_guest_previous_extensions_required'; end if;
  if coalesce((select md5(prosrc) from pg_proc where oid=to_regprocedure('public.mealdeck_begin_guest_session(uuid,uuid,text,text,text,text)')),'')
    not in ('c2c39b85995dc319432a17b6846cba58','7dc521c64ec93ab8b32bdb6f1e05213e') then
    raise exception 'mealdeck_guest_unexpected_definition'; end if;
  if coalesce((select md5(prosrc) from pg_proc where oid=to_regprocedure('public.mealdeck_customer_register(text,text,boolean,boolean,boolean,text,text)')),'')
    not in ('7a8569c26d368070b9ef8ee08504e244','b266bab37cd4260efe1c7f2ffe9d7090') then
    raise exception 'mealdeck_guest_unexpected_registration_definition'; end if;
end $guard$;

-- NULL is a genuinely absent email, never a made-up email or account identity.
-- The existing email CHECK still validates every non-null historical/new value.
alter table mealdeck_private.guest_sessions alter column email drop not null;

create or replace function mealdeck_private.email_registration_available_at(p_at timestamptz)
returns boolean language sql immutable security invoker set search_path='' as $$
  select p_at is not null and (p_at<timestamptz '2026-11-06 00:00:00 Europe/London'
    or p_at>=timestamptz '2026-11-09 00:00:00 Europe/London')
$$;
revoke all on function mealdeck_private.email_registration_available_at(timestamptz)
  from public,anon,authenticated,service_role;

create or replace function public.mealdeck_begin_guest_session(
  p_tenant uuid,p_location uuid,p_token_hash text,p_name text,p_email text,p_phone text
) returns jsonb language plpgsql security definer set search_path='' as $$
declare g mealdeck_private.guest_sessions%rowtype;v_name text;v_email text;
begin
  if public.mealdeck_online_checkout_status(p_tenant,p_location)->'guestCheckoutEligible' is distinct from 'true'::jsonb then
    raise exception 'mealdeck_checkout_guest_unavailable';
  end if;
  v_name:=regexp_replace(btrim(p_name),'[[:space:]]+',' ','g');v_email:=nullif(lower(btrim(p_email)),'');
  if p_token_hash is null or p_token_hash !~ '^[a-f0-9]{64}$'
    or p_name is null or p_name ~ '[[:cntrl:]]' or length(v_name) not between 1 and 120
    or (v_email is not null and (length(v_email) not between 3 and 254
      or v_email !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'))
    or p_phone is null or p_phone !~ '^\+[1-9][0-9]{7,14}$' then
    raise exception 'mealdeck_checkout_guest_details_invalid';
  end if;
  -- Serialize creation per kitchen so unique contacts cannot evade the global
  -- bound. Repeat requests for the same secret/contact are idempotent.
  perform pg_advisory_xact_lock(hashtextextended('mealdeck-guest-create:'||p_tenant::text||':'||p_location::text,0));
  select * into g from mealdeck_private.guest_sessions where token_hash=p_token_hash;
  if found then
    if g.tenant_id<>p_tenant or g.location_id<>p_location or g.name<>v_name or g.email is distinct from v_email or g.phone<>p_phone
      or g.revoked_at is not null or g.expires_at<=now() then
      raise exception 'mealdeck_checkout_guest_session_invalid';
    end if;
    return mealdeck_private.guest_session_card(g);
  end if;
  if (select count(*) from mealdeck_private.guest_sessions where tenant_id=p_tenant and location_id=p_location
      and created_at>now()-interval '10 minutes' and (email=v_email or phone=p_phone))>=6
    or (select count(*) from mealdeck_private.guest_sessions where tenant_id=p_tenant and location_id=p_location
      and created_at>now()-interval '5 minutes')>=500 then
    raise exception 'mealdeck_checkout_retry_later';
  end if;
  insert into mealdeck_private.guest_sessions(tenant_id,location_id,token_hash,name,email,phone)
    values(p_tenant,p_location,p_token_hash,v_name,v_email,p_phone) returning * into g;
  return mealdeck_private.guest_session_card(g);
end $$;
revoke all on function public.mealdeck_begin_guest_session(uuid,uuid,text,text,text,text) from public,anon,authenticated,service_role;
grant execute on function public.mealdeck_begin_guest_session(uuid,uuid,text,text,text,text) to service_role;

create or replace function public.mealdeck_customer_register(
  p_name text,p_phone text,p_email_marketing boolean,p_push_marketing boolean,
  p_order_notifications boolean,p_privacy_version text,p_consent_version text
) returns jsonb language plpgsql security definer set search_path=''
as $$
declare v_user uuid:=auth.uid(); v_inserted integer; v_authority jsonb; v_email text;
begin
  if v_user is null then raise exception 'mealdeck_customer_unauthenticated' using errcode='42501'; end if;
  v_authority:=mealdeck_private.customer_registration_authority(v_user);
  if v_authority is null then
    raise exception 'mealdeck_customer_email_verification_required' using errcode='42501';
  end if;
  if not mealdeck_private.email_registration_available_at(now())
    and not exists(select 1 from mealdeck_private.customer_profiles where user_id=v_user) then
    raise exception 'mealdeck_customer_registration_deferred';
  end if;
  v_email:=v_authority->>'email';
  if p_name is null or length(btrim(p_name)) not between 1 and 120 or p_name~'[[:cntrl:]]'
    or p_phone is null or p_phone!~'^\+[1-9][0-9]{7,14}$'
    or p_email_marketing is null or p_push_marketing is null or p_order_notifications is null
    or p_privacy_version is distinct from 'mealdeck-customer-2026-11-05'
    or p_consent_version is distinct from 'mealdeck-preferences-2026-11-05' then
    raise exception 'mealdeck_customer_invalid_profile';
  end if;
  insert into mealdeck_private.customer_profiles(
    user_id,name,phone,email_marketing,email_marketing_address,push_marketing,order_notifications,privacy_notice_version
  ) values(v_user,btrim(p_name),p_phone,p_email_marketing,case when p_email_marketing then v_email else null end,
    p_push_marketing,p_order_notifications,p_privacy_version)
    on conflict(user_id) do nothing;
  get diagnostics v_inserted=row_count;
  if v_inserted=1 then
    perform mealdeck_private.record_customer_preferences(v_user,p_email_marketing,p_push_marketing,
      p_order_notifications,null,null,null,'registration',v_email);
  end if;
  -- An email-link retry never overwrites the customer's newer preferences.
  return public.mealdeck_customer_profile();
end;
$$;
revoke all on function public.mealdeck_customer_register(text,text,boolean,boolean,boolean,text,text)
  from public,anon,authenticated,service_role;
grant execute on function public.mealdeck_customer_register(text,text,boolean,boolean,boolean,text,text)
  to authenticated;

commit;
