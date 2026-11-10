-- Private customer status enrichment: source-only post-install migration.
-- The customer's existing Auth-scoped receipt remains the only lookup authority.
-- No public tracking token, GPS coordinates or customer personal data are exposed.
begin;
set local lock_timeout='5s';
set local statement_timeout='30s';
set local check_function_bodies=on;

do $guard$ begin
  if current_user in ('anon','authenticated','service_role','authenticator')
    or to_regnamespace('dishbee_private') is not null
    or to_regclass('mealdeck_private.installation') is null
    or to_regclass('mealdeck_private.local_driver_orders') is null
    or not exists (
      select 1 from mealdeck_private.installation
      where singleton and profile='mealdeck-independent-v1' and business_id is not null
    )
    or to_regprocedure('public.mealdeck_customer_orders()') is null
    or (select md5(prosrc) from pg_proc where oid=
        to_regprocedure('public.mealdeck_customer_orders()'))
        <> 'ebd446c090b6d7b21fc4256b28a1a31f'
  then raise exception 'mealdeck_customer_delivery_status_unexpected_profile_or_function'; end if;
end $guard$;

CREATE OR REPLACE FUNCTION public.mealdeck_customer_orders()
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare customer uuid:=auth.uid();authority jsonb;row record;receipt jsonb;orders jsonb:='[]'::jsonb;
begin
  authority:=mealdeck_private.customer_registration_authority(customer);
  if customer is null or authority is null or authority->'registered' is distinct from 'true'::jsonb then
    raise exception 'mealdeck_checkout_registration_required'; end if;
  for row in
    select o.id from public.orders o
    join mealdeck_private.stripe_orders s on s.order_id=o.id and s.customer_id=customer
    where o.customer_id=customer and o.source='mealdeck'
    order by o.created_at desc,o.id desc limit 20
  loop
    receipt:=public.mealdeck_customer_order_receipt(row.id,customer);
    orders:=orders||jsonb_build_array(jsonb_build_object(
      'orderNumber',receipt->'orderNumber','orderId',receipt->'orderId','handoffCode',receipt->'handoffCode',
      'verifiedPaid',receipt->'verifiedPaid','held',receipt->'held',
      'paymentSessionExpired',receipt->'paymentSessionExpired','fulfilment',receipt->'fulfilment',
      'totalPence',receipt->'totalPence','createdAt',receipt->'createdAt','paidAt',receipt->'paidAt',
      'acceptedAt',receipt->'acceptedAt','preparingAt',receipt->'preparingAt',
      'readyForCollectionAt',receipt->'readyForCollectionAt','completedAt',receipt->'completedAt',
      'localDriverStatus',case when receipt->>'fulfilment'='delivery'
        and receipt->>'verifiedPaid'='true' and receipt->>'held'='false'
        then (
          select d.driver_status from mealdeck_private.local_driver_orders d
          join public.orders owned on owned.id=d.order_id
          where d.order_id=row.id and owned.customer_id=customer
            and owned.source='mealdeck' and owned.fulfilment='delivery'
            and owned.payment_status='paid'
            and d.tenant_id=owned.tenant_id and d.location_id=owned.location_id
          limit 1
        )
        else null end));
  end loop;
  return jsonb_build_object('orders',orders);
end $function$


-- Preserve the exact authenticated member authority; no anonymous or service
-- role can call the user-scoped history RPC directly.
revoke all on function public.mealdeck_customer_orders()
  from public,anon,service_role;
grant execute on function public.mealdeck_customer_orders() to authenticated;
commit;
