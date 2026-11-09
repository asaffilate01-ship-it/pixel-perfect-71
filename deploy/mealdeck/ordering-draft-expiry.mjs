/**
 * Proposed post-install addition for independently hosted MealDeck only.
 * This is NOT an enabled production migration. The owner must run the
 * verified SQL transaction and explicitly opt into the pg_cron scheduler.
 * No orders, payment collections, kitchen tickets or receipts are deleted.
 */
export function buildOrderingDraftExpirySql({ scheduleCron = false } = {}) {
  if (typeof scheduleCron !== "boolean") throw new Error("Invalid expiry scheduler option");
  return String.raw`
begin;
set local lock_timeout='5s';
set local statement_timeout='30s';
set local check_function_bodies=on;

do $verify$
begin
  if pg_catalog.to_regnamespace('dishbee_private') is not null
    or pg_catalog.to_regclass('mealdeck_private.installation') is null
    or pg_catalog.to_regclass('mealdeck_private.ordering_rooms') is null
    or pg_catalog.to_regclass('mealdeck_private.ordering_participants') is null
    or pg_catalog.to_regprocedure('mealdeck_private.lock_ordering_room(uuid,text)') is null
  then raise exception 'mealdeck_group_expiry_wrong_installation'; end if;
  if current_user in ('anon','authenticated','service_role','authenticator') or
     not exists (select 1 from pg_catalog.pg_class c
       where c.oid='mealdeck_private.installation'::pg_catalog.regclass
         and pg_catalog.pg_has_role(current_user,c.relowner,'USAGE'))
  then raise exception 'mealdeck_group_expiry_owner_required'; end if;
  if not exists(select 1 from mealdeck_private.installation i
                where i.singleton and i.profile='mealdeck-independent-v1')
  then raise exception 'mealdeck_group_expiry_wrong_profile'; end if;
end;
$verify$;

alter table mealdeck_private.ordering_participants
  add column if not exists draft_expires_at timestamptz;

-- Every person's first nonempty saved choice starts their FIVE-MINUTE limit.
-- A later quantity edit cannot extend it. Clearing their own draft resets it.
-- Existing active drafts get a grace period from installation, never an
-- invented historical deadline; frozen/paid rooms are never touched.
update mealdeck_private.ordering_participants p
set draft_expires_at=clock_timestamp()+interval '5 minutes'
from mealdeck_private.ordering_rooms r
where p.room_id=r.id and r.phase='collecting'
  and p.state in ('joined','ready') and jsonb_array_length(p.picks)>0
  and p.draft_expires_at is null;

create or replace function mealdeck_private.ordering_draft_stamp_expiry()
returns trigger language plpgsql security invoker set search_path='' as $stamp$
begin
  if tg_op='INSERT' then
    new.draft_expires_at:=case when jsonb_array_length(new.picks)>0
      then clock_timestamp()+interval '5 minutes' else null end;
  elsif new.picks is distinct from old.picks then
    if jsonb_array_length(new.picks)=0 then
      new.draft_expires_at:=null;
    elsif jsonb_array_length(old.picks)=0 then
      new.draft_expires_at:=clock_timestamp()+interval '5 minutes';
    else
      new.draft_expires_at:=old.draft_expires_at;
    end if;
  else
    new.draft_expires_at:=old.draft_expires_at;
  end if;
  return new;
end;
$stamp$;

drop trigger if exists mealdeck_ordering_draft_expiry_stamp
  on mealdeck_private.ordering_participants;
create trigger mealdeck_ordering_draft_expiry_stamp
before insert or update on mealdeck_private.ordering_participants
for each row execute function mealdeck_private.ordering_draft_stamp_expiry();

create index if not exists mealdeck_ordering_draft_expiry_pending
on mealdeck_private.ordering_participants(room_id,draft_expires_at)
where state in ('joined','ready') and draft_expires_at is not null;

create or replace function mealdeck_private.expire_ordering_drafts_in_room(p_room uuid)
returns integer language plpgsql security definer set search_path='' as $expire$
declare v_phase text; v_changed integer:=0;
begin
  select phase into v_phase from mealdeck_private.ordering_rooms
    where id=p_room for update;
  if v_phase is distinct from 'collecting' then return 0; end if;
  update mealdeck_private.ordering_participants
    set picks='[]'::jsonb, state='joined', ready_at=null, version=version+1
    where room_id=p_room and state in ('joined','ready')
      and jsonb_array_length(picks)>0
      and draft_expires_at<=clock_timestamp();
  get diagnostics v_changed=row_count;
  if v_changed>0 then
    update mealdeck_private.ordering_rooms set revision=revision+1
      where id=p_room and phase='collecting';
  end if;
  return v_changed;
end;
$expire$;

-- Replaces ONLY the central room lock: existing invitation-expiry and actor
-- ownership checks are retained. Every read/mutation expires drafts BEFORE
-- permission, version, quote and finalisation checks use stale choices.
create or replace function mealdeck_private.lock_ordering_room(
  p_room uuid, p_actor_hash text)
returns mealdeck_private.ordering_rooms
language plpgsql security definer set search_path='' as $lock$
declare r mealdeck_private.ordering_rooms%rowtype;
begin
  if p_actor_hash is null or p_actor_hash !~ '^[a-f0-9]{64}$'
    then raise exception 'mealdeck_ordering_room_unavailable'; end if;
  select * into r from mealdeck_private.ordering_rooms
    where id=p_room for update;
  if not found or not exists(
    select 1 from mealdeck_private.ordering_participants
    where room_id=p_room and actor_hash=p_actor_hash and state in ('joined','ready'))
    then raise exception 'mealdeck_ordering_room_unavailable'; end if;
  perform mealdeck_private.expire_ordering_invitations(p_room);
  perform mealdeck_private.expire_ordering_drafts_in_room(p_room);
  select * into r from mealdeck_private.ordering_rooms where id=p_room;
  return r;
end;
$lock$;

-- An owner-only bounded sweep handles abandoned tabs even if no room API is
-- called. Lock each parent FIRST to avoid races with payment finalisation;
-- skip locked rooms and touch no frozen/paid/refunding order.
create or replace function mealdeck_private.sweep_unpaid_ordering_drafts(
  p_batch integer default 100)
returns jsonb language plpgsql security definer set search_path='' as $sweep$
declare v_room uuid; v_rooms integer:=0; v_drafts integer:=0;
begin
  if session_user in ('anon','authenticated','service_role','authenticator')
     or p_batch is null or p_batch<1 or p_batch>100
    then raise exception 'mealdeck_group_expiry_owner_only' using errcode='42501'; end if;
  for v_room in
    select r.id from mealdeck_private.ordering_rooms r
    where r.phase='collecting'
      and exists (
        select 1 from mealdeck_private.ordering_participants p
        where p.room_id=r.id and p.state in ('joined','ready')
          and p.draft_expires_at<=clock_timestamp()
          and jsonb_array_length(p.picks)>0)
    order by r.id
    limit p_batch
    for update of r skip locked
  loop
    v_rooms:=v_rooms+1;
    v_drafts:=v_drafts+mealdeck_private.expire_ordering_drafts_in_room(v_room);
  end loop;
  return jsonb_build_object('roomsConsidered',v_rooms,'draftsExpired',v_drafts);
end;
$sweep$;

revoke all on function mealdeck_private.ordering_draft_stamp_expiry(),
  mealdeck_private.expire_ordering_drafts_in_room(uuid),
  mealdeck_private.sweep_unpaid_ordering_drafts(integer)
  from public,anon,authenticated,service_role;

${scheduleCron ? String.raw`
-- OPTIONAL, explicit owner action only: pg_cron must already be installed.
-- Every 30 seconds is a maximum of roughly 30 seconds of idle sweep delay;
-- the room RPC itself expires stale drafts at the precise server deadline.
select cron.schedule(
  'mealdeck-unpaid-group-draft-expiry-v1',
  '30 seconds',
  'select mealdeck_private.sweep_unpaid_ordering_drafts(100);'
);
` : '-- The production scheduler remains DISABLED until separately accepted.'}
commit;
`;
}
