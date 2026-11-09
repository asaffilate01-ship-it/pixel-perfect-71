-- Install after 20261109194000_mealdeck_group_room_lifecycle.sql.
-- One-minute cron gives real automatic expiry without needing a browser poll.
begin;
set local lock_timeout='5s';
do $register$
declare current_job record;
begin
  if to_regnamespace('mealdeck_private') is null
    or to_regprocedure('mealdeck_private.expire_unpaid_ordering_rooms()') is null
    or not exists(select 1 from pg_extension where extname='pg_cron') then
    raise exception 'mealdeck_group_expiry_worker_missing_prerequisites';
  end if;
  select jobid, schedule, command, active into current_job
    from cron.job where jobname='mealdeck-group-unpaid-timeout';
  if found then
    if current_job.schedule<>'* * * * *' or
      current_job.command<>'select mealdeck_private.expire_unpaid_ordering_rooms();' or
      not current_job.active then
      raise exception 'mealdeck_group_expiry_worker_drift';
    end if;
  else
    perform cron.schedule(
      'mealdeck-group-unpaid-timeout',
      '* * * * *',
      'select mealdeck_private.expire_unpaid_ordering_rooms();'
    );
  end if;
end $register$;
commit;
