-- Delivery address on the authorised H10S receipt, not in the immutable
-- receipt, payment records, fingerprint, public customer API or print journal.
-- Apply AFTER the local-driver delivery migration and saved receipt contact.
begin;
set local lock_timeout = '5s';
set local statement_timeout = '30s';
set local check_function_bodies = on;

do $printer_delivery_guard$
begin
  if to_regnamespace('dishbee_private') is not null
    or to_regclass('mealdeck_private.installation') is null
    or to_regclass('mealdeck_private.local_driver_orders') is null
    or to_regclass('mealdeck_private.local_driver_quotes') is null
    or to_regprocedure('mealdeck_ops_private.printer_receipt_contact(uuid)') is null
    or to_regprocedure('public.mealdeck_printer_claim_contact(uuid,uuid)') is null
    or not exists (
      select 1 from mealdeck_private.installation
      where singleton and profile = 'mealdeck-independent-v1'
        and business_id = '94f97f02-70ec-445a-87a4-b51c0956d193'::uuid
    ) then
    raise exception 'mealdeck_delivery_printer_wrong_database';
  end if;
  if current_user in ('anon','authenticated','service_role')
    or not exists (
      select 1 from pg_class c
      where c.oid = 'mealdeck_private.installation'::regclass
        and pg_has_role(current_user,c.relowner,'USAGE')
    ) then
    raise exception 'mealdeck_delivery_printer_owner_required';
  end if;
  -- Do not overwrite staff extensions or an unexpected receipt projection.
  if (select md5(prosrc) from pg_proc
      where oid='mealdeck_ops_private.printer_receipt_contact(uuid)'::regprocedure
     ) <> '128732094c20495847bfbcd8826bca0a' then
    raise exception 'mealdeck_delivery_printer_contact_definition_changed';
  end if;
end $printer_delivery_guard$;

-- The canonical, already-paid order and immutable delivery quote provide the
-- address. The existing printer scope assertion controls every retrieval.
-- Only delivery adds this FOURTH contact field. Pickup/kerbside retain their
-- exact existing three-key shape for v0.2.2 compatibility.
create or replace function mealdeck_ops_private.printer_receipt_contact(p_job uuid)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare j mealdeck_private.receipt_jobs%rowtype;
        o public.orders%rowtype;
        addr jsonb;
        details jsonb;
        phone text;
begin
  select * into j from mealdeck_private.receipt_jobs where id=p_job;
  if not found then raise exception 'mealdeck_printer_job_unavailable'; end if;
  perform mealdeck_ops_private.printer_assert_scope(j.tenant_id,j.location_id);
  select * into o from public.orders
    where id=j.order_id and tenant_id=j.tenant_id and location_id=j.location_id;
  if not found then raise exception 'mealdeck_printer_job_unavailable'; end if;

  phone:=case when o.customer_phone ~ '^\+[1-9][0-9]{7,14}$'
    then o.customer_phone else null end;
  details:=jsonb_build_object('schemaVersion',1,'orderId',j.order_id,
    'customerPhone',phone);
  if o.fulfilment<>'delivery' then return details; end if;
  if phone is null or o.accepted_at is null then
    raise exception 'mealdeck_printer_delivery_details_unavailable'; end if;

  select q.address into addr
  from mealdeck_private.local_driver_orders d
  join mealdeck_private.local_driver_quotes q on q.quote_id=d.quote_id
    and q.tenant_id=d.tenant_id and q.location_id=d.location_id
  where d.order_id=o.id and d.tenant_id=j.tenant_id
    and d.location_id=j.location_id;
  if not found or jsonb_typeof(addr)<>'object'
    or coalesce(addr->>'postcode','') !~ '^[A-Z]{1,2}[0-9][A-Z0-9]? [0-9][A-Z]{2}$'
    or length(btrim(coalesce(addr->>'doorNumber',''))) not between 1 and 40
    or length(btrim(coalesce(addr->>'roadName',''))) not between 2 and 120
    or length(coalesce(addr->>'addressLine2',''))>120
    or (addr - array['postcode','doorNumber','roadName','addressLine2']::text[])<>'{}'::jsonb
  then raise exception 'mealdeck_printer_delivery_details_unavailable'; end if;

  return details || jsonb_build_object('deliveryAddress',jsonb_build_object(
    'postcode',addr->>'postcode',
    'doorNumber',btrim(addr->>'doorNumber'),
    'roadName',btrim(addr->>'roadName'),
    'addressLine2',coalesce(btrim(addr->>'addressLine2'),'')
  ));
end $$;

-- The existing printer_job_card and claim_contact RPC already call the private
-- helper. claim_contact performs the full claim/expiry/scope verification using
-- mealdeck_printer_claim_receipt BEFORE returning the projection. No new public
-- RPC, table access or authorization capability is granted.
revoke all on function mealdeck_ops_private.printer_receipt_contact(uuid)
  from public,anon,authenticated,service_role;
commit;
