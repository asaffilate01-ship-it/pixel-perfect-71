-- Independent MealDeck: 30-minute unfrozen group-room lifetime and
-- fulfilment-controlled closure. Does NOT delete financial orders or shares.
-- Source reviewed against live MealDeck 2026-11-09; deploy only there.
begin;
set local lock_timeout='5s';

do $guard$ begin
  if to_regclass('mealdeck_private.installation') is null
     or to_regnamespace('dishbee_private') is not null
     or not exists(select 1 from mealdeck_private.installation
       where singleton and profile='mealdeck-independent-v1') then
    raise exception 'mealdeck_group_lifecycle_independent_profile_required';
  end if;
  if (select md5(prosrc) from pg_proc where oid=
      to_regprocedure('mealdeck_private.lock_ordering_room(uuid,text)'))
      <> 'aba33ccbedf49b54afe74d8ebf344097'
    or (select md5(prosrc) from pg_proc where oid=
      to_regprocedure('mealdeck_private.ordering_room_snapshot(uuid,text)'))
      <> '93810c827b77b36efc9be00c0f10819e'
    or (select md5(prosrc) from pg_proc where oid=
      to_regprocedure('public.mealdeck_ordering_payment_access(uuid,text,uuid,text,boolean)'))
      <> 'fb59044cd841a5250aac3630017789a7' then
    raise exception 'mealdeck_group_lifecycle_unexpected_function_definition';
  end if;
  if exists(select 1 from information_schema.columns where table_schema='mealdeck_private'
     and table_name='ordering_rooms' and column_name in ('closed_at','close_reason')) then
    raise exception 'mealdeck_group_lifecycle_existing_extension_needs_review';
  end if;
end $guard$;

alter table mealdeck_private.ordering_rooms
  add column closed_at timestamptz,
  add column close_reason text
    check(close_reason is null or close_reason in ('unpaid_timeout','all_left','fulfilled','cancelled'));

-- All room mutations already lock and check the trusted actor server-side.
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
      ||case when v.is_organiser or p.id=v.id then jsonb_build_object('picks',p.picks) else '{}'::jsonb end
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

-- A completed/closed room must not accept another payment attempt.
create or replace function public.mealdeck_ordering_payment_access(
  p_room uuid,p_actor_hash text,p_customer uuid,p_guest_token_hash text,p_cover_remaining boolean
) returns jsonb language plpgsql security definer set search_path='' as $$
declare r mealdeck_private.ordering_rooms%rowtype;p mealdeck_private.ordering_participants%rowtype;actor jsonb;token_hash text;
begin
  r:=mealdeck_private.lock_ordering_room(p_room,p_actor_hash);
  if r.phase<>'payment' or r.order_id is null or r.closed_at is not null then raise exception 'mealdeck_ordering_payment_unavailable'; end if;
  select * into p from mealdeck_private.ordering_participants where room_id=p_room and actor_hash=p_actor_hash;
  actor:=mealdeck_private.payment_actor(r.tenant_id,r.location_id,p_customer,p_guest_token_hash);
  if p.is_organiser and (r.owner_customer_id is distinct from p_customer or r.owner_guest_id is distinct from (actor->>'guestId')::uuid) then
    raise exception 'mealdeck_ordering_owner_identity_required'; end if;
  if p_cover_remaining is null or (p_cover_remaining and not p.is_organiser)
    or (not p_cover_remaining and p.share_id is null)
    or (r.payment_mode='organiser' and (not p.is_organiser or not p_cover_remaining)) then
    raise exception 'mealdeck_payment_claim_forbidden'; end if;
  if not p_cover_remaining then select s.token_hash into token_hash from mealdeck_private.payment_shares s where s.id=p.share_id; end if;
  return jsonb_build_object('roomId',r.id,'shareTokenHash',token_hash,'participantId',p.id,
    'owner',p.is_organiser,'paymentMode',r.payment_mode);
end $$;

-- Financial reads use the accepted room capability directly. They never invent
-- or impersonate the owner's stored Auth/guest identity to call another API.

-- A worker closes truly unplaced rooms even if nobody revisits the URL.
-- SKIP LOCKED avoids blocking a room currently finalising into its one order.
create function mealdeck_private.expire_unpaid_ordering_rooms()
returns integer language plpgsql security definer set search_path='' as $$
declare candidate record; total integer:=0;
begin
  for candidate in
    select id from mealdeck_private.ordering_rooms
    where phase='collecting' and order_id is null and closed_at is null
      and created_at+interval '30 minutes'<=clock_timestamp()
    order by created_at
    limit 200 for update skip locked
  loop
    update mealdeck_private.ordering_rooms set
      phase='cancelled',invitations_closed_at=coalesce(invitations_closed_at,clock_timestamp()),
      closed_at=clock_timestamp(),close_reason='unpaid_timeout',revision=revision+1
      where id=candidate.id;
    update mealdeck_private.ordering_participants
      set state='expired',version=version+1
      where room_id=candidate.id and state='invited';
    total:=total+1;
  end loop;
  return total;
end $$;

-- An organiser cancellation closes its room, but never drops payment ledgers.
create function mealdeck_private.stamp_ordering_room_cancellation()
returns trigger language plpgsql security definer set search_path='' as $$
begin
  if new.phase='cancelled' and old.phase is distinct from 'cancelled' and new.closed_at is null then
    new.closed_at:=clock_timestamp();
    new.close_reason:='cancelled';
  end if;
  return new;
end $$;
create trigger mealdeck_ordering_stamp_cancelled
before update of phase on mealdeck_private.ordering_rooms
for each row execute function mealdeck_private.stamp_ordering_room_cancellation();

-- KDS collection handoff and driver-delivered paths both set orders.status
-- to fulfilled. Never infer completion from a browser/back-button return.
create function mealdeck_private.close_ordering_room_on_fulfilment()
returns trigger language plpgsql security definer set search_path='' as $$
begin
  if new.status='fulfilled' and old.status is distinct from new.status then
    update mealdeck_private.ordering_rooms
      set closed_at=clock_timestamp(),close_reason='fulfilled',revision=revision+1
      where order_id=new.id and phase='payment' and closed_at is null;
  end if;
  return new;
end $$;
create trigger mealdeck_ordering_close_after_fulfilment
after update of status on public.orders
for each row execute function mealdeck_private.close_ordering_room_on_fulfilment();

revoke all on function mealdeck_private.expire_unpaid_ordering_rooms()
 from public,anon,authenticated,service_role;
revoke all on function mealdeck_private.stamp_ordering_room_cancellation()
 from public,anon,authenticated,service_role;
revoke all on function mealdeck_private.close_ordering_room_on_fulfilment()
 from public,anon,authenticated,service_role;

commit;
