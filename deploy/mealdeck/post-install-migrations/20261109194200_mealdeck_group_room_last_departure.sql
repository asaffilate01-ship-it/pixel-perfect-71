-- Close an unfrozen group the instant its last joined participant leaves.
-- The organiser's existing Cancel action remains the explicit departure path
-- for the owner. No settled payment room may be closed by participant state.
begin;
set local lock_timeout='5s';
do $guard$ begin
  if to_regclass('mealdeck_private.ordering_rooms') is null or
     to_regclass('mealdeck_private.ordering_participants') is null or
     not exists(select 1 from information_schema.columns where table_schema='mealdeck_private'
       and table_name='ordering_rooms' and column_name='close_reason') then
    raise exception 'mealdeck_room_departure_requires_lifecycle_migration';
  end if;
  if exists(select 1 from pg_trigger where tgname='mealdeck_ordering_last_person_left' and not tgisinternal) then
    raise exception 'mealdeck_room_departure_trigger_already_exists';
  end if;
end $guard$;

create function mealdeck_private.close_ordering_room_when_empty()
returns trigger language plpgsql security definer set search_path='' as $$
begin
  if old.state in ('joined','ready') and new.state not in ('joined','ready')
     and not exists (
       select 1 from mealdeck_private.ordering_participants
       where room_id=new.room_id and state in ('joined','ready')
     ) then
    update mealdeck_private.ordering_rooms set phase='cancelled',closed_at=clock_timestamp(),
      close_reason='all_left',invitations_closed_at=coalesce(invitations_closed_at,clock_timestamp()),
      revision=revision+1
    where id=new.room_id and phase='collecting' and order_id is null and closed_at is null;
  end if;
  return new;
end $$;
create trigger mealdeck_ordering_last_person_left
after update of state on mealdeck_private.ordering_participants
for each row when (old.state is distinct from new.state)
execute function mealdeck_private.close_ordering_room_when_empty();

revoke all on function mealdeck_private.close_ordering_room_when_empty()
from public,anon,authenticated,service_role;
commit;
