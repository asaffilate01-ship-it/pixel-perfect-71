-- Lookup only an EXISTING verified Auth user, by exact email, for explicit
-- manager-approved driver onboarding. No user creation and no role elevation.
-- The source migration is separate from publication and production installation.
begin;
set local lock_timeout='5s';
set local statement_timeout='30s';

do $guard$ begin
  if current_user in ('anon','authenticated','service_role','authenticator')
    or to_regnamespace('dishbee_private') is not null
    or to_regclass('mealdeck_private.installation') is null
    or to_regclass('mealdeck_private.driver_roster') is null
    or to_regprocedure('mealdeck_ops_private.kds_assert_scope(uuid,uuid,text)') is null
    or not exists(select 1 from mealdeck_private.installation
      where singleton and profile='mealdeck-independent-v1' and business_id is not null)
  then raise exception 'mealdeck_driver_lookup_wrong_database_or_actor'; end if;
end $guard$;

create or replace function public.mealdeck_ops_driver_find_verified_email(
  p_tenant uuid,p_location uuid,p_email text
) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare
  v_email text;
  v_user uuid;
begin
  -- No public customer or ordinary kitchen role can enumerate Auth users.
  perform mealdeck_ops_private.kds_assert_scope(p_tenant,p_location,'staff.manage');
  if not exists(select 1 from mealdeck_private.installation i
      where i.singleton and i.business_id=p_tenant)
    or not exists(select 1 from public.tenant_locations l
      where l.tenant_id=p_tenant and l.id=p_location
        and l.slug='shared-kitchen' and l.active)
  then raise exception 'mealdeck_driver_forbidden' using errcode='42501'; end if;

  v_email:=lower(btrim(coalesce(p_email,'')));
  if length(v_email) < 6 or length(v_email) > 254
     or v_email !~ '^[^[:space:]@]+@[^[:space:]@]+[.][^[:space:]@]+$'
  then raise exception 'mealdeck_driver_email_invalid'; end if;
  select u.id into v_user
  from auth.users u
  where lower(u.email)=v_email and u.email_confirmed_at is not null
    and u.deleted_at is null and not coalesce(u.is_anonymous,false)
    and (u.banned_until is null or u.banned_until<=now())
  limit 1;
  return jsonb_build_object('found',v_user is not null,'userId',v_user);
end $$;
revoke all on function public.mealdeck_ops_driver_find_verified_email(uuid,uuid,text)
  from public,anon,authenticated,service_role;
grant execute on function public.mealdeck_ops_driver_find_verified_email(uuid,uuid,text)
  to authenticated;
commit;
