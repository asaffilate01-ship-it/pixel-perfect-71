-- Generated with Supabase CLI 3.0.0: mealdeck_receipt_archive.
-- Retire completed receipt work without deleting audit history or claiming paper output.
begin;
set local lock_timeout='5s';
set local statement_timeout='30s';
set local check_function_bodies=on;
do $guard$
declare expected record;
begin
  if to_regnamespace('dishbee_private') is not null
    or to_regclass('mealdeck_private.installation') is null then
    raise exception 'mealdeck_receipt_archive_independent_profile_required'; end if;
  if current_user in ('anon','authenticated','service_role') or not exists(
    select 1 from pg_class where oid='mealdeck_private.installation'::regclass
      and pg_has_role(current_user,relowner,'USAGE')) then
    raise exception 'mealdeck_receipt_archive_database_owner_required'; end if;
  if not exists(select 1 from mealdeck_private.installation where singleton
    and profile='mealdeck-independent-v1' and business_id is not null)
    or to_regclass('mealdeck_private.order_numbers') is null then
    raise exception 'mealdeck_receipt_archive_previous_extensions_required'; end if;
  for expected in select * from (values
    ('mealdeck_ops_private.printer_lock_job(uuid,uuid,uuid)','9384411aeff09d4df80db67d807064e1','6b940cda9ea895606fcd3583f7c6e879'),
    ('public.mealdeck_printer_board(uuid,uuid)','3a2c03cbfe0f85aabb8fcf932bca5981','52cbeada7b94aa518170f55aea1bd892')
  ) x(signature,old_hash,new_hash)
  loop
    if not exists(select 1 from pg_proc where oid=to_regprocedure(expected.signature)
      and prosecdef and proconfig @> array['search_path=""']
      and md5(prosrc) in (expected.old_hash,expected.new_hash)) then
      raise exception 'mealdeck_receipt_archive_unreviewed_definition: %',expected.signature; end if;
  end loop;
  if (exists(select 1 from pg_attribute where attrelid='mealdeck_private.receipt_jobs'::regclass and attname='archived_at' and not attisdropped))
    is distinct from (exists(select 1 from pg_attribute where attrelid='mealdeck_private.receipt_jobs'::regclass and attname='archive_reason' and not attisdropped)) then
    raise exception 'mealdeck_receipt_archive_incomplete_installation'; end if;
  if to_regprocedure('mealdeck_private.archive_completed_receipt(uuid,text,text,text)') is not null
    and not exists(select 1 from pg_proc
      where oid=to_regprocedure('mealdeck_private.archive_completed_receipt(uuid,text,text,text)')
        and not prosecdef and proconfig @> array['search_path=""']
        and md5(prosrc)='e0c33837d09770890109b499e9411ddf') then
    raise exception 'mealdeck_receipt_archive_unreviewed_helper'; end if;
end $guard$;

alter table mealdeck_private.receipt_jobs add column if not exists archived_at timestamptz;
alter table mealdeck_private.receipt_jobs add column if not exists archive_reason text;
do $columns$
begin
  if not exists(select 1 from pg_attribute where attrelid='mealdeck_private.receipt_jobs'::regclass
      and attname='archived_at' and atttypid='timestamptz'::regtype and not attisdropped)
    or not exists(select 1 from pg_attribute where attrelid='mealdeck_private.receipt_jobs'::regclass
      and attname='archive_reason' and atttypid='text'::regtype and not attisdropped) then
    raise exception 'mealdeck_receipt_archive_unreviewed_columns'; end if;
end $columns$;

CREATE OR REPLACE FUNCTION mealdeck_ops_private.printer_lock_job(p_tenant uuid, p_location uuid, p_job uuid)
 RETURNS mealdeck_private.receipt_jobs
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare j mealdeck_private.receipt_jobs;o uuid;e jsonb;
begin
  perform mealdeck_ops_private.printer_assert_scope(p_tenant,p_location);
  perform 1 from auth.users where id=auth.uid() for share;
  perform 1 from mealdeck_private.printer_access where user_id=auth.uid() and tenant_id=p_tenant and location_id=p_location for share;
  perform 1 from public.mealdeck_ops_staff_access where user_id=auth.uid() and tenant_id=p_tenant for share;
  perform 1 from public.tenant_locations where tenant_id=p_tenant and id=p_location for share;
  select order_id into o from mealdeck_private.receipt_jobs where id=p_job and tenant_id=p_tenant and location_id=p_location;
  if o is null then raise exception 'mealdeck_printer_job_unavailable'; end if;
  perform 1 from public.orders where id=o for update;
  perform 1 from mealdeck_private.stripe_orders where order_id=o for share;
  select * into j from mealdeck_private.receipt_jobs where id=p_job for update;
  if j.archived_at is not null then raise exception 'mealdeck_printer_job_unavailable'; end if;
  perform mealdeck_ops_private.printer_assert_scope(p_tenant,p_location);
  e:=mealdeck_private.kds_release_authority(o);
  if e is null or e->'eligible' is distinct from 'true'::jsonb
    or not exists(select 1 from public.orders where id=o and accepted_at is not null
      and tenant_id=p_tenant and location_id=p_location and status in ('accepted','preparing','ready','fulfilled')) then
    raise exception 'mealdeck_printer_verified_acceptance_required'; end if;
  return j;
end $function$;

CREATE OR REPLACE FUNCTION public.mealdeck_printer_board(p_tenant uuid, p_location uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
 SET lock_timeout TO '3s'
AS $function$
begin
  perform mealdeck_ops_private.printer_assert_scope(p_tenant,p_location);
  -- A lost or expired terminal claim is never automatically sent again. The
  -- operator must inspect paper/bridge status and resolve it explicitly.
  update mealdeck_private.receipt_jobs set status='held',updated_at=now(),resolution='Terminal interrupted; inspect printer before another copy.'
    where tenant_id=p_tenant and location_id=p_location and archived_at is null and status in ('claimed','sending') and claim_expires_at<=now();
  return jsonb_build_object('schemaVersion',1,'tenantId',p_tenant,'locationId',p_location,'generatedAt',now(),
    'jobs',coalesce((select jsonb_agg(mealdeck_ops_private.printer_job_card(q.id) order by q.priority,q.created_at,q.id)
      from (select j.id,j.created_at,case j.status when 'queued' then 0 when 'claimed' then 1 when 'sending' then 1
          when 'held' then 2 when 'sent_unconfirmed' then 3 when 'failed' then 4 else 5 end as priority
        from mealdeck_private.receipt_jobs j join public.orders o on o.id=j.order_id
        where j.tenant_id=p_tenant and j.location_id=p_location and j.archived_at is null and o.accepted_at is not null
          and o.status in ('accepted','preparing','ready','fulfilled')
          and mealdeck_private.kds_release_authority(o.id)->'eligible'='true'::jsonb
          and (j.status<>'printed' or j.updated_at>now()-interval '12 hours')
          and not exists(select 1 from mealdeck_private.receipt_jobs newer where newer.order_id=j.order_id and newer.copy_number>j.copy_number)
        order by priority,j.created_at,j.id limit 100) q),'[]'::jsonb));
end $function$;

create or replace function mealdeck_private.archive_completed_receipt(
  p_job uuid,p_expected_payload_md5 text,p_expected_status text,p_reason text
) returns jsonb language plpgsql security invoker set search_path='' as $$
declare j mealdeck_private.receipt_jobs%rowtype; order_id uuid;
begin
  if current_user in ('anon','authenticated','service_role') or not exists(
    select 1 from pg_class where oid='mealdeck_private.installation'::regclass
      and pg_has_role(current_user,relowner,'USAGE')) then
    raise exception 'mealdeck_receipt_archive_database_owner_required'; end if;
  if p_job is null or p_expected_payload_md5 is null or p_expected_payload_md5 !~ '^[a-f0-9]{32}$'
    or p_expected_status is null or p_expected_status not in ('queued','sent_unconfirmed','held','printed','failed')
    or p_reason is null or length(trim(p_reason)) not between 5 and 300 then
    raise exception 'mealdeck_receipt_archive_invalid_request'; end if;
  select x.order_id into order_id from mealdeck_private.receipt_jobs x where x.id=p_job;
  if order_id is null then raise exception 'mealdeck_receipt_archive_job_unavailable'; end if;
  perform 1 from public.orders where id=order_id for update;
  select * into j from mealdeck_private.receipt_jobs where id=p_job for update;
  if not found or j.status is distinct from p_expected_status
    or md5(j.receipt::text) is distinct from p_expected_payload_md5
    or j.copy_number<>1 or j.reprint_of is not null
    or (select count(*) from mealdeck_private.receipt_jobs x where x.order_id=j.order_id)<>1
    or not exists(select 1 from public.orders o join public.mealdeck_pass_orders p on p.order_id=o.id
      where o.id=j.order_id and o.tenant_id=j.tenant_id and o.location_id=j.location_id
        and o.source='mealdeck' and o.status='fulfilled' and o.payment_status='paid'
        and p.handed_off_at is not null)
    or mealdeck_private.kds_release_authority(j.order_id)->'eligible' is distinct from 'true'::jsonb then
    raise exception 'mealdeck_receipt_archive_changed_review_required'; end if;
  if j.archived_at is not null then
    if j.archive_reason is distinct from trim(p_reason) then
      raise exception 'mealdeck_receipt_archive_changed_review_required'; end if;
    return jsonb_build_object('jobId',j.id,'archived',true,'updated',false,'retainedStatus',j.status);
  end if;
  -- Retire queue work without asserting a physical print outcome. Preserve the
  -- payload, original status, claims, send/confirmation timestamps and events.
  update mealdeck_private.receipt_jobs set archived_at=now(),archive_reason=trim(p_reason),updated_at=now()
    where id=j.id;
  insert into public.mealdeck_ops_audit_log(tenant_id,location_id,actor_id,action,entity_type,entity_id,previous_value,next_value)
    values(j.tenant_id,j.location_id,null,'printer.completed_receipt_archived','receipt_job',j.id,
      jsonb_build_object('status',j.status,'receiptMd5',p_expected_payload_md5,'sendStartedAt',j.send_started_at,'confirmedAt',j.confirmed_at),
      jsonb_build_object('archived',true,'retainedStatus',j.status,'reason',trim(p_reason)));
  return jsonb_build_object('jobId',j.id,'archived',true,'updated',true,'retainedStatus',j.status);
end $$;

revoke all on function mealdeck_private.archive_completed_receipt(uuid,text,text,text)
  from public,anon,authenticated,service_role;
notify pgrst,'reload schema';
commit;
