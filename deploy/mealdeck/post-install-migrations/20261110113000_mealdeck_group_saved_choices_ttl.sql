-- Source-only additive migration: apply only after the independent MealDeck
-- group room lifecycle and departure migrations. No payment/financial rows are
-- deleted or altered, and no live server flags are changed here.
begin;
set local lock_timeout='5s';
set local statement_timeout='60s';
set local check_function_bodies=on;

do $guard$ begin
  if current_user in ('anon','authenticated','service_role','authenticator')
    or to_regnamespace('dishbee_private') is not null
    or to_regclass('mealdeck_private.ordering_rooms') is null
    or to_regclass('mealdeck_private.ordering_participants') is null
    or not exists (
      select 1 from mealdeck_private.installation
      where singleton and profile='mealdeck-independent-v1'
        and business_id is not null
    )
    or not exists (
      select 1 from information_schema.columns where table_schema='mealdeck_private'
      and table_name='ordering_rooms' and column_name='closed_at'
    )
  then raise exception 'mealdeck_choice_expiry_independent_lifecycle_required'; end if;
  if exists (
      select 1 from information_schema.columns where table_schema='mealdeck_private'
      and table_name='ordering_participants' and column_name='choices_saved_at'
    )
  then raise exception 'mealdeck_choice_expiry_existing_extension_needs_review'; end if;
  if (select md5(prosrc) from pg_proc where oid=
      to_regprocedure('mealdeck_private.lock_ordering_room(uuid,text)'))
      <> 'bed34265121595f0dcbb8c3bd1ee3311'
     or (select md5(prosrc) from pg_proc where oid=
      to_regprocedure('mealdeck_private.ordering_room_snapshot(uuid,text)'))
      <> 'a130530841d6a6d7bf263572e0266f04'
     or (select md5(prosrc) from pg_proc where oid=
      to_regprocedure('mealdeck_private.expire_unpaid_ordering_rooms()'))
      <> 'b6f01228d1458e869eba55f06b6e7f26'
  then raise exception 'mealdeck_choice_expiry_unexpected_function_definition'; end if;
end $guard$;

alter table mealdeck_private.ordering_participants
  add column choices_saved_at timestamptz;
-- Existing unfrozen unpaid draft choices receive a fresh five-minute grace
-- period. No review/payment rows are mutated by this migration.
update mealdeck_private.ordering_participants p
set choices_saved_at=clock_timestamp()
from mealdeck_private.ordering_rooms r
where p.room_id=r.id and r.phase='collecting' and r.order_id is null
  and r.closed_at is null and p.state in ('joined','ready')
  and jsonb_array_length(p.picks)>0;

create index ordering_choices_expiry_idx
  on mealdeck_private.ordering_participants(room_id,choices_saved_at)
  where choices_saved_at is not null and state in ('joined','ready');

-- Reuse existing versioned, scope-checked save RPC; the server stamps each
-- changed participant basket. A readiness toggle is NOT a new save.
create function mealdeck_private.stamp_ordering_choices_saved_at()
returns trigger language plpgsql security definer set search_path='' as $$
begin
  -- An explicit successful Save refreshes this person's TTL even when they
  -- save identical picks; the existing versioned RPC remains authoritative.
  new.choices_saved_at:=case
    when new.state in ('joined','ready')
      and jsonb_typeof(new.picks)='array' and jsonb_array_length(new.picks)>0
    then clock_timestamp()
    else null end;
  return new;
end $$;
create trigger mealdeck_ordering_choices_saved_at
before update of picks on mealdeck_private.ordering_participants
for each row execute function mealdeck_private.stamp_ordering_choices_saved_at();

-- Caller already holds the room lock, or this helper acquires it itself.
-- Expiring one participant never touches another person's choices; existing
-- share, quote, paid, processing or frozen rooms are not eligible.
create function mealdeck_private.expire_ordering_saved_choices(p_room uuid)
returns integer language plpgsql security definer set search_path='' as $$
declare r mealdeck_private.ordering_rooms%rowtype;changed integer:=0;
begin
  select * into r from mealdeck_private.ordering_rooms where id=p_room for update;
  if not found or r.phase<>'collecting' or r.order_id is not null
    or r.closed_at is not null then return 0; end if;
  update mealdeck_private.ordering_participants
    set picks='[]'::jsonb,state='joined',ready_at=null,
      choices_saved_at=null,version=version+1
  where room_id=p_room and state in ('joined','ready')
    and jsonb_array_length(picks)>0 and choices_saved_at is not null
    and choices_saved_at+interval '5 minutes'<=clock_timestamp();
  get diagnostics changed=row_count;
  if changed>0 then
    update mealdeck_private.ordering_rooms set revision=revision+1
      where id=p_room and phase='collecting' and order_id is null;
  end if;
  return changed;
end $$;

create or replace function mealdeck_private.lock_ordering_room(p_room uuid,p_actor_hash text)
returns mealdeck_private.ordering_rooms language plpgsql security definer set search_path='' as $$
declare r mealdeck_private.ordering_rooms%rowtype;
begin
  if p_actor_hash is null or p_actor_hash !~ '^[a-f0-9]{64}$' then raise exception 'mealdeck_ordering_room_unavailable'; end if;
  select * into r from mealdeck_private.ordering_rooms where id=p_room for update;
  if not found or not exists(select 1 from mealdeck_private.ordering_participants
    where room_id=p_room and actor_hash=p_actor_hash and state in ('joined','ready')) then
    raise exception 'mealdeck_ordering_room_unavailable'; end if;
  perform mealdeck_private.expire_ordering_invitations(p_room);
  -- Unpaid/planning rooms expire 30 minutes after creation, even if a person
  -- accepted the 3-minute invitation. A frozen/payment room is never timed out.
  if r.phase='collecting' and r.order_id is null and r.closed_at is null
    and r.created_at+interval '30 minutes'<=clock_timestamp() then
    update mealdeck_private.ordering_rooms set phase='cancelled',
      invitations_closed_at=coalesce(invitations_closed_at,clock_timestamp()),
      closed_at=clock_timestamp(),close_reason='unpaid_timeout',
      revision=revision+1 where id=p_room and phase='collecting';
    update mealdeck_private.ordering_participants set state='expired',version=version+1
      where room_id=p_room and state='invited';
  end if;
  perform mealdeck_private.expire_ordering_saved_choices(p_room);
  select * into r from mealdeck_private.ordering_rooms where id=p_room;
  return r;
end $$;


create or replace function mealdeck_private.ordering_room_snapshot(p_room uuid,p_actor_hash text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare r mealdeck_private.ordering_rooms%rowtype;v mealdeck_private.ordering_participants%rowtype;
  people jsonb;pending_count integer;joined_count integer;ready_count integer;bag_count integer;can_finalize boolean;
begin
  select * into r from mealdeck_private.ordering_rooms where id=p_room;
  select * into v from mealdeck_private.ordering_participants where room_id=p_room and actor_hash=p_actor_hash;
  if r.id is null or v.id is null then raise exception 'mealdeck_ordering_room_unavailable'; end if;
  select count(*) filter(where state='invited'),count(*) filter(where state in ('joined','ready')),
    count(*) filter(where state='ready'),count(*) filter(where state in ('joined','ready') and jsonb_array_length(picks)>0)
    into pending_count,joined_count,ready_count,bag_count from mealdeck_private.ordering_participants where room_id=p_room;
  can_finalize:=r.phase='collecting' and pending_count=0 and joined_count=ready_count and bag_count>0;
  select jsonb_agg(jsonb_build_object('participantId',p.id,'name',p.display_name,'isOrganiser',p.is_organiser,
    'state',p.state,'version',p.version,'bagNumber',p.bag_number,
    'shareId',case when v.is_organiser or p.id=v.id then p.share_id else null end,
    'paymentState',case when p.share_id is null then null
      when c.hold_reason is not null or (po.hold_reason is not null and c.captured_pence>0) then 'refund_review'
      when c.captured_pence=c.amount_pence then 'paid' when c.id is not null then 'pending' else 'unclaimed' end)
      ||case when v.is_organiser or p.id=v.id then jsonb_build_object(
        'picks',p.picks,
        'choicesExpiresAt',case
          when r.phase='collecting' and r.order_id is null and r.closed_at is null
            and p.state in ('joined','ready') and p.choices_saved_at is not null
            and jsonb_array_length(p.picks)>0
          then p.choices_saved_at + interval '5 minutes'
          else null end
       ) else '{}'::jsonb end
      order by p.slot_number) into people
    from mealdeck_private.ordering_participants p
      left join mealdeck_private.payment_collection_shares cs on cs.share_id=p.share_id and cs.active
      left join mealdeck_private.payment_collections c on c.id=cs.collection_id
      left join mealdeck_private.payment_orders po on po.order_id=r.order_id
    where p.room_id=p_room;
  return jsonb_build_object('schemaVersion',1,'roomId',r.id,'revision',r.revision,
    'phase',case when r.phase='collecting' and can_finalize then 'ready'
      when r.phase='payment' and exists(select 1 from mealdeck_private.payment_orders where order_id=r.order_id and cancel_requested_at is not null)
        then 'cancelled' else r.phase end,
    'paymentMode',r.payment_mode,'joinDeadline',r.join_deadline,
    'unpaidRoomExpiresAt',case when r.phase='collecting' and r.order_id is null
       then r.created_at+interval '30 minutes' else null end,
    'closedAt',r.closed_at,'closeReason',r.close_reason,
    'invitationsClosed',r.invitations_closed_at is not null,'serverNow',clock_timestamp(),'createdAt',r.created_at,
    'fulfilment',r.fulfilment,'vehicle',r.vehicle,'cutleryRequested',r.cutlery_requested,
    'viewer',jsonb_build_object('participantId',v.id,'role',case when v.is_organiser then 'organiser' else 'participant' end),
    'people',people,'pendingCount',pending_count,'joinedCount',joined_count,'readyCount',ready_count,
    'canFinalize',can_finalize and v.is_organiser,'orderId',r.order_id,'paymentRoomId',case when r.order_id is not null then r.id else null end);
end $$;


create or replace function mealdeck_private.expire_unpaid_ordering_rooms()
returns integer language plpgsql security definer set search_path='' as $$
declare candidate record; total integer:=0;
begin
  for candidate in
    select id,created_at from mealdeck_private.ordering_rooms
    where phase='collecting' and order_id is null and closed_at is null
      and (
        created_at+interval '30 minutes'<=clock_timestamp()
        or exists(
          select 1 from mealdeck_private.ordering_participants p
          where p.room_id=ordering_rooms.id and p.state in ('joined','ready')
            and jsonb_array_length(p.picks)>0 and p.choices_saved_at is not null
            and p.choices_saved_at+interval '5 minutes'<=clock_timestamp()
        )
      )
    order by created_at
    limit 200 for update skip locked
  loop
    perform mealdeck_private.expire_ordering_saved_choices(candidate.id);
    if candidate.created_at+interval '30 minutes'<=clock_timestamp() then
    update mealdeck_private.ordering_rooms set
      phase='cancelled',invitations_closed_at=coalesce(invitations_closed_at,clock_timestamp()),
      closed_at=clock_timestamp(),close_reason='unpaid_timeout',revision=revision+1
      where id=candidate.id;
    update mealdeck_private.ordering_participants
      set state='expired',version=version+1
      where room_id=candidate.id and state='invited';
    total:=total+1;
    end if;
  end loop;
  return total;
end $$;



-- Keep the existing deny-by-default private security boundary intact.
revoke all on function mealdeck_private.stamp_ordering_choices_saved_at(),
  mealdeck_private.expire_ordering_saved_choices(uuid)
  from public,anon,authenticated,service_role;
commit;
