-- Owner requested that the first six handed-over orders leave the receipt queue.
-- This archives queue work only. It never claims that a receipt physically printed.
-- Run after 20261106195536_mealdeck_receipt_archive.sql as one atomic transaction.
begin;
set local lock_timeout='5s';
set local statement_timeout='30s';
do $retire$
declare expected record; actual record; before_history jsonb; after_history jsonb;
  scope_tenant constant uuid:='94f97f02-70ec-445a-87a4-b51c0956d193';
  scope_location constant uuid:='a0ba64ac-e268-44d3-8345-fce8d24999b6';
  reason constant text:='Owner requested retirement: order handed over; no further receipt required.';
begin
  if not exists(select 1 from pg_proc
    where oid=to_regprocedure('mealdeck_private.archive_completed_receipt(uuid,text,text,text)')
      and not prosecdef and proconfig @> array['search_path=""']
      and md5(prosrc)='e0c33837d09770890109b499e9411ddf') then
    raise exception 'mealdeck_receipt_retirement_reviewed_extension_required'; end if;
  for expected in select * from (values
    (1,'8d9b2b29-ee63-4a25-ae21-b690bdffafdb'::uuid,'c5941695a51448f26fef373a699d08d8','sent_unconfirmed'),
    (2,'3cada7ca-37f8-4107-8a6f-ee9bfe122dc5'::uuid,'f0bdbd151d55e339d92fa299970682fb','queued'),
    (3,'01aefeb5-443b-4934-82d8-0a89942b5a49'::uuid,'010c23b98726a716f8536ddb5d57cf95','queued'),
    (4,'554ab615-f93e-4ee1-b7bd-7e88c3afa0bf'::uuid,'e8c1b99a0841a210e1e46c634ff63dc7','queued'),
    (5,'23510710-c02e-4624-af7c-d4ebf686109a'::uuid,'a65b78ffb669f113749af8b2d2f65fe6','queued'),
    (6,'0e603bb5-ab76-42be-a38b-bfb63192b483'::uuid,'ee678d0c2e185e7d2e99c21ecb39291f','queued')
  ) x(order_number,job_id,payload_md5,retained_status)
  loop
    select j.order_id,n.number into actual from mealdeck_private.receipt_jobs j
      join mealdeck_private.order_numbers n on n.order_id=j.order_id
      where j.id=expected.job_id and j.tenant_id=scope_tenant and j.location_id=scope_location
        and n.tenant_id=scope_tenant and n.location_id=scope_location;
    if not found or actual.number<>expected.order_number then
      raise exception 'mealdeck_receipt_retirement_scope_changed'; end if;
    perform 1 from public.orders where id=actual.order_id for update;
    perform 1 from mealdeck_private.receipt_jobs where id=expected.job_id for update;
    select jsonb_build_object(
      'order',(select to_jsonb(o) from public.orders o where o.id=actual.order_id),
      'payment',(select to_jsonb(s) from mealdeck_private.stripe_orders s where s.order_id=actual.order_id),
      'items',(select jsonb_agg(to_jsonb(i) order by i.id) from public.order_items i where i.order_id=actual.order_id),
      'events',(select jsonb_agg(to_jsonb(e) order by e.id) from mealdeck_private.receipt_events e where e.job_id=expected.job_id),
      'receipt',(select to_jsonb(j)-'archived_at'-'archive_reason'-'updated_at' from mealdeck_private.receipt_jobs j where j.id=expected.job_id)
    ) into before_history;
    perform mealdeck_private.archive_completed_receipt(expected.job_id,expected.payload_md5,expected.retained_status,reason);
    select jsonb_build_object(
      'order',(select to_jsonb(o) from public.orders o where o.id=actual.order_id),
      'payment',(select to_jsonb(s) from mealdeck_private.stripe_orders s where s.order_id=actual.order_id),
      'items',(select jsonb_agg(to_jsonb(i) order by i.id) from public.order_items i where i.order_id=actual.order_id),
      'events',(select jsonb_agg(to_jsonb(e) order by e.id) from mealdeck_private.receipt_events e where e.job_id=expected.job_id),
      'receipt',(select to_jsonb(j)-'archived_at'-'archive_reason'-'updated_at' from mealdeck_private.receipt_jobs j where j.id=expected.job_id)
    ) into after_history;
    if before_history is distinct from after_history then
      raise exception 'mealdeck_receipt_retirement_history_changed'; end if;
  end loop;
end $retire$;
select n.number as order_number,j.archived_at is not null as archived,j.status as retained_status
  from mealdeck_private.order_numbers n join mealdeck_private.receipt_jobs j on j.order_id=n.order_id
  where n.tenant_id='94f97f02-70ec-445a-87a4-b51c0956d193' and n.location_id='a0ba64ac-e268-44d3-8345-fce8d24999b6'
    and n.number between 1 and 6 order by n.number;
commit;
