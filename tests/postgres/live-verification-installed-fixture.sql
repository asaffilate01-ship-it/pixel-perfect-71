-- TEST FIXTURE ONLY. Exact deployed private launch-test authority read on
-- 6 November 2026, with a synthetic existing verified customer supplied by the
-- JavaScript fixture. No production Auth/user UUID or credential is included.
create table mealdeck_private.launch_test_access(
  singleton boolean primary key default true check(singleton),
  user_id uuid not null unique references auth.users(id),
  email text not null check(email='test@mealdeck.co.uk'),
  begins_at timestamptz not null check(begins_at=timestamptz '2026-11-06 08:00:00+00'),
  ends_at timestamptz not null check(ends_at=timestamptz '2026-11-06 15:00:00+00')
);
alter table mealdeck_private.launch_test_access enable row level security;
revoke all on mealdeck_private.launch_test_access from public,anon,authenticated,service_role;
CREATE OR REPLACE FUNCTION mealdeck_private.launch_test_eligible_at(p_customer uuid, p_at timestamp with time zone)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select exists(select 1 from mealdeck_private.launch_test_access a join auth.users u on u.id=a.user_id
    where a.singleton and a.user_id=p_customer and lower(u.email)=a.email and u.email_confirmed_at is not null
      and not coalesce(u.is_anonymous,false) and u.deleted_at is null
      and (u.banned_until is null or u.banned_until<=p_at) and p_at>=a.begins_at and p_at<a.ends_at)
$function$;

CREATE OR REPLACE FUNCTION mealdeck_private.begin_launch_test_context(p_customer uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
  -- Transaction-local and reset on every entry. Only service-only, identity-bound
  -- payment RPCs call this; the browser cannot supply a clock or authorization flag.
  perform set_config('mealdeck.launch_test_actor','',true);
  if now()<timestamptz '2026-11-06 15:00:00 Europe/London' then
    if not mealdeck_private.launch_test_eligible_at(p_customer,now()) then
      raise exception 'mealdeck_prelaunch_test_account_required'; end if;
    perform set_config('mealdeck.launch_test_actor',p_customer::text,true);
  end if;
end $function$;

CREATE OR REPLACE FUNCTION mealdeck_private.launch_window()
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare w jsonb:=mealdeck_private.launch_window_at(now());actor text:=current_setting('mealdeck.launch_test_actor',true);
begin
  if actor ~ '^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$' then
    if mealdeck_private.launch_test_eligible_at(actor::uuid,now()) then
      return w||jsonb_build_object('orderingOpen',true,'guestEligible',false,'status','active',
        'currentClosesAt',timestamptz '2026-11-06 15:00:00 Europe/London');
    end if;
  end if;
  return w;
end $function$;

CREATE OR REPLACE FUNCTION public.mealdeck_checkout_status_for_customer(p_tenant uuid, p_location uuid, p_customer uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
  perform set_config('mealdeck.launch_test_actor','',true);
  if mealdeck_private.launch_test_eligible_at(p_customer,now()) then
    perform mealdeck_private.begin_launch_test_context(p_customer);
  end if;
  return public.mealdeck_online_checkout_status(p_tenant,p_location);
end $function$;

CREATE OR REPLACE FUNCTION public.mealdeck_create_checkout_quote(p_tenant uuid, p_location uuid, p_customer uuid, p_fulfilment text, p_vehicle jsonb, p_selection jsonb, p_request_hash text, p_packing jsonb)
 RETURNS jsonb
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select mealdeck_private.begin_launch_test_context(p_customer);
  select mealdeck_private.create_checkout_quote_for_identity(p_tenant,p_location,p_customer,null,p_fulfilment,
    p_vehicle,p_selection,p_request_hash,p_packing)
$function$;

CREATE OR REPLACE FUNCTION public.mealdeck_prepare_stripe_order(p_quote uuid, p_customer uuid, p_attempt uuid, p_stripe_account text, p_livemode boolean)
 RETURNS jsonb
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select mealdeck_private.begin_launch_test_context(p_customer);
  select mealdeck_private.prepare_stripe_order_for_identity(p_quote,p_customer,null,p_attempt,p_stripe_account,p_livemode)
$function$;

revoke all on function mealdeck_private.launch_test_eligible_at(uuid,timestamptz),
  mealdeck_private.begin_launch_test_context(uuid),mealdeck_private.launch_window()
  from public,anon,authenticated,service_role;
revoke all on function public.mealdeck_checkout_status_for_customer(uuid,uuid,uuid),
  public.mealdeck_create_checkout_quote(uuid,uuid,uuid,text,jsonb,jsonb,text,jsonb),
  public.mealdeck_prepare_stripe_order(uuid,uuid,uuid,text,boolean)
  from public,anon,authenticated,service_role;
grant execute on function public.mealdeck_checkout_status_for_customer(uuid,uuid,uuid),
  public.mealdeck_create_checkout_quote(uuid,uuid,uuid,text,jsonb,jsonb,text,jsonb),
  public.mealdeck_prepare_stripe_order(uuid,uuid,uuid,text,boolean) to service_role;

