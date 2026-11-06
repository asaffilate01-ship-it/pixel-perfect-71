-- Generated with `supabase migration new mealdeck_kds_six_stages`.
-- Additive read-only history. Never broadens the active kitchen release path.
begin;
set local lock_timeout='5s';
do $guard$ begin
  if to_regclass('mealdeck_private.installation') is null
    or to_regnamespace('dishbee_private') is not null then
    raise exception 'mealdeck_kds_independent_profile_required'; end if;
  if not exists(select 1 from mealdeck_private.installation where singleton and profile='mealdeck-independent-v1')
    or to_regprocedure('public.mealdeck_ops_kds_board(uuid,uuid)') is null
    or to_regprocedure('public.mealdeck_ops_kds_complete_handoff(uuid,uuid,uuid,text,text)') is null
    or to_regprocedure('mealdeck_private.kds_release_authority(uuid)') is null then
    raise exception 'mealdeck_kds_kitchen_printer_required'; end if;
end $guard$;

create or replace function public.mealdeck_ops_kds_board_v2(p_tenant uuid,p_location uuid)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare board jsonb; done jsonb:='[]'::jsonb; o record; e jsonb; card jsonb;
  remaining integer:=0; verified timestamptz;
begin
  -- Reuses verified staff identity, tenant/location, live permissions and the
  -- unchanged paid-only active board. Done cannot displace an active order.
  board:=public.mealdeck_ops_kds_board(p_tenant,p_location);
  if board->>'readiness'='ready' then
    for o in
      select x.id,x.created_at,x.accepted_at,p.handed_off_at,p.updated_at
      from public.orders x join public.mealdeck_pass_orders p
        on p.order_id=x.id and p.tenant_id=x.tenant_id and p.location_id=x.location_id
      where x.tenant_id=p_tenant and x.location_id=p_location and x.source='mealdeck'
        and x.status='fulfilled' and x.payment_status='paid' and x.paid_at is not null
        and x.paid_at<=now() and x.accepted_at is not null and p.status='handed_off'
        and p.handed_off_at>=now()-interval '24 hours' and p.handed_off_at<=now()
        and p.handed_off_at>=x.accepted_at
      order by p.handed_off_at desc,x.id
    loop
      -- A local completed flag is not evidence of either funding or handover.
      e:=mealdeck_private.kds_release_authority(o.id);
      if e is null or e->'schema_version' is distinct from '1'::jsonb
        or e->'eligible' is distinct from 'true'::jsonb
        or e->>'order_id' is distinct from o.id::text
        or e->>'tenant_id' is distinct from p_tenant::text
        or e->>'location_id' is distinct from p_location::text
        or e->>'source' is distinct from 'mealdeck'
        or coalesce(e->>'release_id','') !~ '^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$'
        or coalesce(e->>'verified_at','') !~ '^\d{4}-\d{2}-\d{2}T' then continue; end if;
      begin
        verified:=(e->>'verified_at')::timestamptz;
      exception when invalid_datetime_format or datetime_field_overflow then continue;
      end;
      if not isfinite(verified) or verified<o.created_at or verified>o.handed_off_at then continue; end if;
      if jsonb_array_length(done)>=100 then remaining:=remaining+1; continue; end if;
      perform mealdeck_ops_private.kds_assert_instructions(o.id);
      card:=mealdeck_ops_private.kds_order_card(o.id,e);
      -- Keep canonical quantities, names, bags, extras and the original code.
      -- The old card deliberately omits terminal pass states; extend only here.
      card:=card||jsonb_build_object('completed_at',o.handed_off_at,'pass',
        jsonb_build_object('status','handed_off','updated_at',o.updated_at,
          'version',md5(jsonb_build_array(o.id,'handed_off',o.updated_at,card->>'version')::text)));
      done:=done||jsonb_build_array(card);
    end loop;
  end if;
  return board||jsonb_build_object('completed_orders',done,'remaining_completed_count',remaining);
end $$;
revoke all on function public.mealdeck_ops_kds_board_v2(uuid,uuid) from public,anon,authenticated,service_role;
grant execute on function public.mealdeck_ops_kds_board_v2(uuid,uuid) to authenticated;
commit;
