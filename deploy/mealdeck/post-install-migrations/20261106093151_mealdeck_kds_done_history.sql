-- Generated with `supabase migration new mealdeck_kds_done_history` (CLI 3.0.0).
-- Add a read-only six-stage KDS projection; preserve every existing write RPC.
begin;
set local lock_timeout='5s';
do $guard$ begin
  if to_regnamespace('dishbee_private') is not null or
    to_regclass('mealdeck_private.installation') is null then
    raise exception 'mealdeck_kds_independent_profile_required'; end if;
  if not exists(select 1 from mealdeck_private.installation where singleton and profile='mealdeck-independent-v1')
    or to_regprocedure('public.mealdeck_ops_kds_board(uuid,uuid)') is null
    or to_regprocedure('public.mealdeck_ops_kds_complete_handoff(uuid,uuid,uuid,text,text)') is null
    or to_regprocedure('mealdeck_private.kds_release_authority(uuid)') is null then
    raise exception 'mealdeck_kds_previous_extensions_required'; end if;
  if to_regprocedure('public.mealdeck_ops_kds_workflow_board(uuid,uuid)') is not null
    and (select md5(prosrc) from pg_proc where oid=to_regprocedure('public.mealdeck_ops_kds_workflow_board(uuid,uuid)'))<>'3d5304c13406a3ac3a5efcaaf9eaefdb' then
    raise exception 'mealdeck_kds_unexpected_workflow_definition'; end if;
end $guard$;
create or replace function public.mealdeck_ops_kds_workflow_board(p_tenant uuid,p_location uuid)
returns jsonb language plpgsql stable security definer set search_path='' as $function$
declare board jsonb; completed jsonb:='[]'::jsonb; extra integer:=0;
  candidate record; evidence jsonb; card jsonb;
begin
  -- Retain the existing live identity, location permission and paid-release
  -- checks. This read does not create receipts or perform any transition.
  board:=public.mealdeck_ops_kds_board(p_tenant,p_location);
  if board->>'readiness'='ready' then
    for candidate in
      select o.id,p.handed_off_at from public.orders o
      join public.mealdeck_pass_orders p on p.order_id=o.id
        and p.tenant_id=o.tenant_id and p.location_id=o.location_id
      where o.tenant_id=p_tenant and o.location_id=p_location
        and o.source='mealdeck' and o.status='fulfilled'
        and o.payment_status='paid' and o.paid_at is not null
        and o.accepted_at is not null and p.status='handed_off'
        and p.handed_off_at>=now()-interval '12 hours' and p.handed_off_at<=now()
        and p.handed_off_at>=o.accepted_at
      order by p.handed_off_at desc,o.id
    loop
      -- A completed status alone is not evidence of a verified payment. Holds,
      -- refunds and disputes remain governed by the canonical payment ledger.
      evidence:=mealdeck_private.kds_release_authority(candidate.id);
      if evidence->'eligible' is distinct from 'true'::jsonb
        or evidence->'schema_version' is distinct from '1'::jsonb
        or evidence->>'order_id' is distinct from candidate.id::text
        or evidence->>'tenant_id' is distinct from p_tenant::text
        or evidence->>'location_id' is distinct from p_location::text
        or evidence->>'source' is distinct from 'mealdeck' then continue; end if;
      if jsonb_array_length(completed)>=100 then extra:=extra+1; continue; end if;
      perform mealdeck_ops_private.kds_assert_instructions(candidate.id);
      card:=mealdeck_ops_private.kds_order_card(candidate.id,evidence);
      completed:=completed||jsonb_build_array(jsonb_build_object(
        'order_id',card->'order_id','display_code',card->'display_code',
        'order_status','fulfilled','handoff_status','handed_off',
        'accepted_at',card->'accepted_at','completed_at',candidate.handed_off_at,
        'fulfilment',card->'fulfilment','group_order',card->'group_order',
        'cutlery_requested',coalesce(card->'cutlery_requested','false'::jsonb),
        'notes',card->'notes','items',card->'items'));
    end loop;
  end if;
  return board||jsonb_build_object('completed_orders',completed,
    'completed_remaining_order_count',extra,'completed_window_hours',12);
end
$function$;
revoke all on function public.mealdeck_ops_kds_workflow_board(uuid,uuid) from public,anon,authenticated,service_role;
grant execute on function public.mealdeck_ops_kds_workflow_board(uuid,uuid) to authenticated;
comment on function public.mealdeck_ops_kds_workflow_board(uuid,uuid) is
  'MealDeck six-stage KDS: current active orders plus read-only verified handovers from the last 12 hours.';
commit;
