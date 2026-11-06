-- TEST FIXTURE ONLY. Exact installed quote creator read from the independent
-- MealDeck database on 6 November 2026. Its existing private-test offer condition
-- is preserved by the notes extension; no production identity or credential is included.
CREATE OR REPLACE FUNCTION mealdeck_private.create_checkout_quote_for_actor(p_tenant uuid, p_location uuid, p_customer uuid, p_guest uuid, p_staff uuid, p_fulfilment text, p_vehicle jsonb, p_selection jsonb, p_request_hash text, p_packing jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare member jsonb;priced jsonb;offer jsonb;q mealdeck_private.checkout_quotes%rowtype;
  gross integer;discount integer:=0;d date;estimate_minutes integer;launch jsonb:=mealdeck_private.launch_window();
begin
  if p_staff is null then member:=mealdeck_private.checkout_identity(p_tenant,p_location,p_customer,p_guest);
  else
    if p_customer is not null or p_guest is not null then raise exception 'mealdeck_payment_identity_required'; end if;
    perform public.mealdeck_terminal_authorize(p_staff,p_tenant,p_location);
  end if;
  if p_guest is not null and launch->'guestEligible' is distinct from 'true'::jsonb then
    raise exception 'mealdeck_checkout_guest_unavailable'; end if;
  if launch->'orderingOpen' is distinct from 'true'::jsonb then
    raise exception 'mealdeck_checkout_outside_opening_hours'; end if;
  if public.mealdeck_online_checkout_status(p_tenant,p_location)->'channelOpen' is distinct from 'true'::jsonb
    or p_fulfilment is null or p_fulfilment not in ('pickup','curbside') then
    raise exception 'mealdeck_checkout_unavailable';
  end if;
  if p_request_hash is null or p_request_hash !~ '^[a-f0-9]{64}$' then raise exception 'mealdeck_checkout_invalid_selection'; end if;
  if p_fulfilment='curbside' then
    if jsonb_typeof(p_vehicle) is distinct from 'object'
      or length(trim(coalesce(p_vehicle->>'make',''))) not between 2 and 60
      or length(trim(coalesce(p_vehicle->>'colour',''))) not between 2 and 40
      or coalesce(p_vehicle->>'registrationLast4','') !~ '^[A-Z0-9]{4}$'
      or p_vehicle - array['make','colour','registrationLast4']::text[] <> '{}'::jsonb then
      raise exception 'mealdeck_checkout_vehicle_required';
    end if;
  elsif p_vehicle is not null then raise exception 'mealdeck_checkout_vehicle_not_needed'; end if;
  perform mealdeck_private.validate_checkout_packing(p_selection,p_packing);
  perform pg_advisory_xact_lock(hashtextextended('checkout-quote:'||case when p_staff is not null then 'staff:'||p_staff::text when p_guest is null then 'member:'||p_customer::text else 'guest:'||p_guest::text end,0));
  if (select count(*) from mealdeck_private.checkout_quotes where customer_id is not distinct from p_customer and guest_id is not distinct from p_guest and staff_id is not distinct from p_staff
    and created_at>now()-interval '5 minutes')>=30 then raise exception 'mealdeck_checkout_retry_later'; end if;
  priced:=mealdeck_private.price_checkout_lines(p_tenant,p_location,p_selection);
  gross:=(priced->>'grossPence')::integer;
  offer:=mealdeck_private.opening_offer(p_tenant,p_location);
  if offer->>'status'='active' and (launch->'guestEligible'='true'::jsonb
    or (p_guest is null and p_staff is null and mealdeck_private.launch_test_eligible_at(p_customer,now()))) then
    discount:=(gross::bigint*30+50)/100;
    select opening_start_date into d from mealdeck_private.checkout_settings where tenant_id=p_tenant and location_id=p_location;
  end if;
  select collection_estimate_minutes into estimate_minutes from mealdeck_private.checkout_settings
    where tenant_id=p_tenant and location_id=p_location;
  insert into mealdeck_private.checkout_quotes(tenant_id,location_id,customer_id,guest_id,staff_id,fulfilment,vehicle,
    request_hash,selection,priced_lines,gross_pence,discount_pence,total_pence,opening_start_date,collection_estimate_minutes,packing_plan,expires_at)
    values(p_tenant,p_location,p_customer,p_guest,p_staff,p_fulfilment,p_vehicle,p_request_hash,p_selection,
      priced->'lines',gross,discount,gross-discount,d,estimate_minutes,p_packing,
      least(now()+interval '10 minutes',coalesce((launch->>'currentClosesAt')::timestamptz,now()+interval '10 minutes'))) returning * into q;
  return jsonb_build_object('quoteId',q.id,'expiresAt',q.expires_at,'grossPence',gross,
    'discountPence',discount,'totalPence',q.total_pence,'currency','GBP','fulfilment',p_fulfilment,
    'guestOrder',p_guest is not null,'lines',q.priced_lines,'openingOffer',offer,'collectionEstimateMinutes',estimate_minutes,'packingPlan',q.packing_plan)
    ||case when p_guest is not null then jsonb_build_object('loyaltyEligible',false) else '{}'::jsonb end;
end $function$;
