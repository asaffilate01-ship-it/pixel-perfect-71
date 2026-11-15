-- MealDeck dedicated database ONLY. Additive, read-only staff expiry projection.
-- Do not install on the Dishbee/Cafe 1 database. This SQL does not cancel,
-- void, refund, change order status, or release any order to KDS.
begin;
set local lock_timeout = '5s';
set local statement_timeout = '30s';

do $guard$
begin
  if to_regclass('mealdeck_private.installation') is null
    or to_regclass('mealdeck_private.stripe_orders') is null
    or to_regprocedure('mealdeck_ops_private.kds_assert_scope(uuid,uuid,text)') is null
    or not exists(select 1 from mealdeck_private.installation
      where singleton and profile='mealdeck-independent-v1') then
    raise exception 'mealdeck_independent_expiry_projection_requires_verified_installation';
  end if;
end $guard$;

-- Return only a server-confirmed expiration flag for a scoped staff-selected
-- list of existing orders. Age alone is NEVER proof of payment expiry.
-- The full canonical order and payment records remain unchanged for auditing.
create or replace function public.mealdeck_ops_checkout_expirations(
  p_tenant uuid,p_location uuid,p_orders uuid[]
) returns table(order_id uuid,payment_session_expired boolean)
language plpgsql stable security definer set search_path='' as $function$
begin
  perform mealdeck_ops_private.kds_assert_scope(p_tenant,p_location,'orders.read');
  if p_orders is null or cardinality(p_orders)>500 then
    raise exception 'mealdeck_checkout_expiration_invalid_scope';
  end if;
  return query
  select o.id,
    (o.status='payment_pending'
      and o.paid_at is null
      and o.payment_status<>'paid'
      and s.session_id is not null
      and s.captured_pence=0
      and s.verified_at is null
      and s.void_reason is null
      and s.expires_at<=now()) as payment_session_expired
  from public.orders o
  join mealdeck_private.stripe_orders s on s.order_id=o.id
  where o.tenant_id=p_tenant and o.location_id=p_location
    and o.source='mealdeck' and o.id=any(p_orders)
  order by o.id;
end $function$;

revoke all on function public.mealdeck_ops_checkout_expirations(uuid,uuid,uuid[])
  from public,anon,authenticated,service_role;
grant execute on function public.mealdeck_ops_checkout_expirations(uuid,uuid,uuid[]) to authenticated;
comment on function public.mealdeck_ops_checkout_expirations(uuid,uuid,uuid[]) is
  'Auth-scoped, read-only server-clock expiry labels; never changes payment or KDS state.';
notify pgrst, 'reload schema';
commit;
