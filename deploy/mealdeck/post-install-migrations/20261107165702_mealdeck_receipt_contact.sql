-- Generated with Supabase CLI 3.0.0: mealdeck_receipt_contact.
-- Add saved order phone to authorised printer presentation without changing
-- immutable receipt snapshots, fingerprints, send states or legacy RPC shapes.
begin;
set local lock_timeout='5s';
set local statement_timeout='30s';
set local check_function_bodies=on;

do $guard$
begin
  if to_regnamespace('dishbee_private') is not null
    or to_regclass('mealdeck_private.installation') is null then
    raise exception 'mealdeck_receipt_contact_independent_profile_required'; end if;
  if current_user in ('anon','authenticated','service_role') or not exists(
    select 1 from pg_class c where c.oid='mealdeck_private.installation'::regclass
      and pg_has_role(current_user,c.relowner,'USAGE')) then
    raise exception 'mealdeck_receipt_contact_database_owner_required'; end if;
  if not exists(select 1 from mealdeck_private.installation where singleton
      and profile='mealdeck-independent-v1' and business_id is not null)
    or to_regclass('mealdeck_private.receipt_jobs') is null
    or to_regprocedure('mealdeck_ops_private.printer_assert_scope(uuid,uuid)') is null
    or to_regprocedure('mealdeck_ops_private.printer_job_card(uuid)') is null
    or to_regprocedure('public.mealdeck_printer_claim_receipt(uuid,uuid)') is null then
    raise exception 'mealdeck_receipt_contact_previous_extensions_required'; end if;
  if (select md5(prosrc) from pg_proc where oid='mealdeck_ops_private.printer_job_card(uuid)'::regprocedure)
      not in ('cb8fed339a2cd31cd49a5ea06023c352','0573c2e2259ec328c848eae3dc4c0a4a')
    or (select md5(prosrc) from pg_proc where oid='public.mealdeck_printer_claim_receipt(uuid,uuid)'::regprocedure)
      <> 'a31ea11fdc0c0877172ae65b6943630f'
    or exists(select 1 from pg_proc where oid=to_regprocedure('mealdeck_ops_private.printer_receipt_contact(uuid)')
      and md5(prosrc)<>'128732094c20495847bfbcd8826bca0a')
    or exists(select 1 from pg_proc where oid=to_regprocedure('public.mealdeck_printer_claim_contact(uuid,uuid)')
      and md5(prosrc)<>'1e466f502086b968f069cb849b835936') then
    raise exception 'mealdeck_receipt_contact_unexpected_definition'; end if;
end $guard$;

-- No customer-profile lookup: the order retains its checkout contact. The
-- tenant/location join and live printer identity are verified for every read.
create or replace function mealdeck_ops_private.printer_receipt_contact(p_job uuid)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare j mealdeck_private.receipt_jobs;phone text;
begin
  select * into j from mealdeck_private.receipt_jobs where id=p_job;
  if not found then raise exception 'mealdeck_printer_job_unavailable'; end if;
  perform mealdeck_ops_private.printer_assert_scope(j.tenant_id,j.location_id);
  select o.customer_phone into phone from public.orders o
    where o.id=j.order_id and o.tenant_id=j.tenant_id and o.location_id=j.location_id;
  if not found then raise exception 'mealdeck_printer_job_unavailable'; end if;
  return jsonb_build_object('schemaVersion',1,'orderId',j.order_id,
    'customerPhone',case when phone ~ '^\+[1-9][0-9]{7,14}$' and phone !~ '[^+0-9]' then phone else null end);
end $$;

create or replace function mealdeck_ops_private.printer_job_card(p_job uuid)
returns jsonb language sql stable security definer set search_path='' as $$
  select jsonb_build_object('jobId',j.id,'orderId',j.order_id,'copyNumber',j.copy_number,
    'status',j.status,'createdAt',j.created_at,'updatedAt',j.updated_at,'resolution',j.resolution,
    'receipt',j.receipt,'receiptContact',mealdeck_ops_private.printer_receipt_contact(j.id))
    from mealdeck_private.receipt_jobs j where j.id=p_job
$$;

-- The existing canonical-receipt RPC deliberately retains its exact two-key
-- response for installed Node/TCP bridges. This new optional RPC reuses all its
-- verified identity, MFA, scope, payment, acceptance, claim-owner and expiry
-- checks before returning the separately bound saved contact.
create or replace function public.mealdeck_printer_claim_contact(p_job uuid,p_claim uuid)
returns jsonb language plpgsql security definer set search_path='' set lock_timeout='3s' as $$
declare canonical jsonb;contact jsonb;
begin
  canonical:=public.mealdeck_printer_claim_receipt(p_job,p_claim);
  contact:=mealdeck_ops_private.printer_receipt_contact(p_job);
  if canonical->'receipt'->>'orderId' is distinct from contact->>'orderId' then
    raise exception 'mealdeck_printer_job_unavailable'; end if;
  return jsonb_build_object('receiptContact',contact);
end $$;

revoke all on function mealdeck_ops_private.printer_receipt_contact(uuid),
  mealdeck_ops_private.printer_job_card(uuid)
  from public,anon,authenticated,service_role;
revoke all on function public.mealdeck_printer_claim_contact(uuid,uuid)
  from public,anon,authenticated,service_role;
grant execute on function public.mealdeck_printer_claim_contact(uuid,uuid) to authenticated;
commit;
