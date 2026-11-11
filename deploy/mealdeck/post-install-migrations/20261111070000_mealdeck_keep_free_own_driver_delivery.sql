-- MealDeck Luton own-driver delivery: remove ONLY the unapproved
-- automatic 1 December 2026 priced-courier cutoff.
-- Business policy remains £0 delivery fee, £15 discounted payable food minimum
-- and 4 km verified radius, subject to current kitchen/driver availability.
-- No payment, order, receipt, or dispatch records are changed by this DDL.
begin;
set local lock_timeout='5s';
set local statement_timeout='30s';
do $guard$
declare
  gate record;
begin
  if current_user in ('anon','authenticated','service_role','authenticator')
     or to_regnamespace('dishbee_private') is not null
     or to_regclass('public.orders') is null
     or to_regclass('mealdeck_private.installation') is null
     or to_regclass('mealdeck_private.local_driver_quotes') is null
     or not exists (
       select 1 from mealdeck_private.installation
       where singleton and profile='mealdeck-independent-v1'
         and business_id is not null
     )
  then raise exception 'mealdeck_free_delivery_independent_profile_required'; end if;

  select t.tgisinternal, t.tgenabled, t.tgfoid::regprocedure::text as handler,
         md5(p.prosrc) as handler_hash, pg_get_triggerdef(t.oid) as definition
  into gate
  from pg_trigger t
  join pg_proc p on p.oid=t.tgfoid
  where t.tgrelid='public.orders'::regclass
    and t.tgname='mealdeck_december_paid_quote_gate';

  if not found
     or gate.tgisinternal is distinct from false
     or gate.tgenabled is distinct from 'O'
     or gate.handler is distinct from
       'mealdeck_private.reject_unquoted_december_luton_delivery()'
     or gate.handler_hash is distinct from
       'b30716663152ef181423c903058d28e3'
     or gate.definition is distinct from
       'CREATE TRIGGER mealdeck_december_paid_quote_gate BEFORE INSERT OR UPDATE OF fulfilment, delivery_pence ON public.orders FOR EACH ROW EXECUTE FUNCTION mealdeck_private.reject_unquoted_december_luton_delivery()'
  then raise exception 'mealdeck_free_delivery_unexpected_december_gate'; end if;
end $guard$;

-- This historical future gate would otherwise reject every new direct
-- Luton delivery after 2026-12-01, even a paid £15 eligible free delivery.
-- Drop the SINGLE named trigger; retain its revoked private function for audit.
drop trigger mealdeck_december_paid_quote_gate on public.orders;
commit;
