-- Generated with Supabase CLI: mealdeck_live_verification_continuation.
-- Continue the existing single verified test identity through today's service
-- close. Public hours, provider checks, sign-off and paid-order release stay put.
begin;
set local lock_timeout='5s';
set local statement_timeout='30s';
set local check_function_bodies=on;
set local timezone='UTC';

do $guard$
begin
  if to_regnamespace('dishbee_private') is not null
    or to_regclass('mealdeck_private.installation') is null then
    raise exception 'mealdeck_live_verification_independent_profile_required'; end if;
  if current_user in ('anon','authenticated','service_role') or not exists(
    select 1 from pg_class c where c.oid='mealdeck_private.installation'::regclass
      and pg_has_role(current_user,c.relowner,'USAGE')) then
    raise exception 'mealdeck_live_verification_database_owner_required'; end if;
  if to_regclass('mealdeck_private.launch_test_access') is null
    or to_regclass('mealdeck_private.customer_profiles') is null
    or to_regprocedure('public.mealdeck_checkout_status_for_customer(uuid,uuid,uuid)') is null
    or to_regprocedure('mealdeck_private.launch_test_eligible_at(uuid,timestamptz)') is null
    or to_regprocedure('mealdeck_private.begin_launch_test_context(uuid)') is null
    or to_regprocedure('mealdeck_private.launch_window()') is null
    or to_regprocedure('mealdeck_private.launch_window_at(timestamptz)') is null then
    raise exception 'mealdeck_live_verification_previous_authority_required'; end if;
end $guard$;

lock table mealdeck_private.launch_test_access in access exclusive mode;

do $guard$
declare a mealdeck_private.launch_test_access%rowtype;scope record;v_expected record;
begin
  select t.id tenant_id,l.id location_id into scope
    from mealdeck_private.installation i
    join public.tenants t on t.id=i.business_id
    join public.tenant_locations l on l.tenant_id=t.id
    where i.singleton and i.profile='mealdeck-independent-v1'
      and i.bootstrap_owner_id is not null and i.bootstrapped_at is not null
      and t.active and t.slug='mealdeck' and t.legal_name='313 Brands Ltd' and t.currency='GBP'
      and l.slug='shared-kitchen' and l.active
      and (select count(*) from public.tenants)=1
      and (select count(*) from public.tenant_locations x where x.tenant_id=t.id and x.active)=1;
  if not found then raise exception 'mealdeck_live_verification_installed_scope_required'; end if;
  select * into a from mealdeck_private.launch_test_access where singleton;
  if not found or (select count(*) from mealdeck_private.launch_test_access)<>1
    or a.email<>'test@mealdeck.co.uk'
    or a.begins_at<>timestamptz '2026-11-06 08:00:00+00'
    or a.ends_at not in (timestamptz '2026-11-06 15:00:00+00',timestamptz '2026-11-06 23:00:00+00') then
    raise exception 'mealdeck_live_verification_existing_identity_window_required'; end if;
  perform 1 from auth.users u where u.id=a.user_id and lower(u.email)=a.email
    and u.email_confirmed_at is not null and not coalesce(u.is_anonymous,false)
    and u.deleted_at is null and (u.banned_until is null or u.banned_until<=now()) for share;
  if not found or (select count(*) from auth.users where lower(email)=a.email)<>1
    or not exists(select 1 from mealdeck_private.customer_profiles where user_id=a.user_id) then
    raise exception 'mealdeck_live_verification_verified_existing_customer_required'; end if;
  if not exists(select 1 from pg_constraint where conrelid='mealdeck_private.launch_test_access'::regclass
    and conname='launch_test_access_ends_at_check' and contype='c' and convalidated)
    or exists(select 1 from unnest(array['anon','authenticated','service_role']) role_name
      where has_table_privilege(role_name,'mealdeck_private.launch_test_access','SELECT,INSERT,UPDATE,DELETE')) then
    raise exception 'mealdeck_live_verification_private_allowlist_required'; end if;

  -- Fail rather than overwrite an unreviewed production authority. The second
  -- digest on changed functions permits a safe rerun of this exact migration.
  for v_expected in select * from (values
    ('mealdeck_private.launch_test_eligible_at(uuid,timestamptz)','5c07fed9cb1f60dd89ae9e04c7b1da93','5c07fed9cb1f60dd89ae9e04c7b1da93'),
    ('mealdeck_private.begin_launch_test_context(uuid)','0f085eecfc2979375a77257c5f8596bf','65c0328d8deb09807281ac6ed9a002cd'),
    ('mealdeck_private.launch_window()','98b9134a92297af99cf5ad77aec92a79','faf401040f2313384a4cf17bd68c69a3'),
    ('public.mealdeck_checkout_status_for_customer(uuid,uuid,uuid)','9a6f82f336dbd8cc8c052b200d30f44f','b6d1343b00dd753abd2661da9830cb58'),
    ('public.mealdeck_create_checkout_quote(uuid,uuid,uuid,text,jsonb,jsonb,text,jsonb)','9ebf53f817b1c3feddf4c8d566d277c7','9ebf53f817b1c3feddf4c8d566d277c7'),
    ('public.mealdeck_prepare_stripe_order(uuid,uuid,uuid,text,boolean)','16bd1d37ab4b16bf424211f2fea25d1f','16bd1d37ab4b16bf424211f2fea25d1f')
  ) x(signature,old_hash,new_hash)
  loop
    if not exists(select 1 from pg_proc p where p.oid=to_regprocedure(v_expected.signature)
      and p.prosecdef and md5(p.prosrc) in (v_expected.old_hash,v_expected.new_hash)
      and p.proconfig @> array['search_path=""']) then
      raise exception 'mealdeck_live_verification_unreviewed_authority: %',v_expected.signature;
    end if;
  end loop;

  alter table mealdeck_private.launch_test_access drop constraint launch_test_access_ends_at_check;
  update mealdeck_private.launch_test_access set ends_at=timestamptz '2026-11-06 23:00:00+00'
    where singleton and user_id=a.user_id and email=a.email and begins_at=a.begins_at and ends_at=a.ends_at;
  alter table mealdeck_private.launch_test_access add constraint launch_test_access_ends_at_check
    check(ends_at=timestamptz '2026-11-06 23:00:00+00');
  if a.ends_at<>timestamptz '2026-11-06 23:00:00+00' then
    insert into public.mealdeck_ops_audit_log(tenant_id,location_id,actor_id,action,entity_type,entity_id,previous_value,next_value)
      values(scope.tenant_id,scope.location_id,null,'checkout.live_verification_window_extended','customer',a.user_id,
        jsonb_build_object('startsAt',a.begins_at,'expiresAt',a.ends_at),
        jsonb_build_object('startsAt',a.begins_at,'expiresAt',timestamptz '2026-11-06 23:00:00+00',
          'source','20261106151511_mealdeck_live_verification_continuation'));
  end if;
end $guard$;

create or replace function mealdeck_private.begin_launch_test_context(p_customer uuid)
returns void language plpgsql security definer set search_path='' as $$
begin
  -- Reset on every entry. Only the existing service-only, identity-bound member
  -- quote and prepare RPCs call this; no browser-supplied flag or clock is read.
  perform set_config('mealdeck.launch_test_actor','',true);
  if mealdeck_private.launch_test_eligible_at(p_customer,now()) then
    perform set_config('mealdeck.launch_test_actor',p_customer::text,true);
  elsif now()<(mealdeck_private.launch_window_at(now())->>'startsAt')::timestamptz then
    -- This is the unchanged PUBLIC opening boundary, not the private expiry.
    raise exception 'mealdeck_prelaunch_test_account_required';
  end if;
end $$;

create or replace function mealdeck_private.launch_window()
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare w jsonb:=mealdeck_private.launch_window_at(now());
  actor text:=current_setting('mealdeck.launch_test_actor',true);v_ends_at timestamptz;
begin
  if actor ~ '^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$' then
    if mealdeck_private.launch_test_eligible_at(actor::uuid,now())
      and w->'orderingOpen' is distinct from 'true'::jsonb then
      select ends_at into v_ends_at from mealdeck_private.launch_test_access where singleton and user_id=actor::uuid;
      return w||jsonb_build_object('orderingOpen',true,'guestEligible',false,'status','active',
        'currentClosesAt',v_ends_at);
    end if;
  end if;
  return w;
end $$;

create or replace function public.mealdeck_checkout_status_for_customer(
  p_tenant uuid,p_location uuid,p_customer uuid
) returns jsonb language plpgsql security definer set search_path='' as $$
declare result jsonb;admission jsonb:=jsonb_build_object('eligible',false);
begin
  perform set_config('mealdeck.launch_test_actor','',true);
  if mealdeck_private.launch_test_eligible_at(p_customer,now()) and exists(
    select 1 from mealdeck_private.installation i
    join public.tenants t on t.id=i.business_id and t.active and t.slug='mealdeck' and t.currency='GBP'
    join public.tenant_locations l on l.tenant_id=t.id and l.active and l.slug='shared-kitchen'
    where i.singleton and i.profile='mealdeck-independent-v1' and t.id=p_tenant and l.id=p_location
  ) then
    perform mealdeck_private.begin_launch_test_context(p_customer);
    select jsonb_build_object('eligible',true,'startsAt',begins_at,'expiresAt',ends_at)
      into admission from mealdeck_private.launch_test_access where singleton and user_id=p_customer;
  end if;
  result:=public.mealdeck_online_checkout_status(p_tenant,p_location)
    ||jsonb_build_object('liveVerification',admission);
  -- Keep the normal public launch window (and its opening-offer pricing) intact.
  -- This private status admission is member-only even when public hours are open.
  if admission->'eligible'='true'::jsonb then
    result:=result||jsonb_build_object('guestCheckoutEligible',false);
  end if;
  -- Do not leave a private actor set for another RPC in the same transaction.
  perform set_config('mealdeck.launch_test_actor','',true);
  return result;
end $$;

revoke all on function mealdeck_private.begin_launch_test_context(uuid),mealdeck_private.launch_window()
  from public,anon,authenticated,service_role;
revoke all on function public.mealdeck_checkout_status_for_customer(uuid,uuid,uuid)
  from public,anon,authenticated,service_role;
grant execute on function public.mealdeck_checkout_status_for_customer(uuid,uuid,uuid) to service_role;

commit;
