-- REVIEW-ONLY, owner-operated read-only export. Never execute from a customer API.
-- Use psql with ON_ERROR_STOP=1 and the exact verified installation_id, location_id,
-- stripe_account and eligible_skus (JSON array of exact canonical SKU strings).
-- The output contains private identifiers: keep it in restricted storage, never GitHub.
\set ON_ERROR_STOP on
begin transaction isolation level repeatable read read only;
set local statement_timeout = '30s';
set local lock_timeout = '5s';
do $guard$
begin
  if current_user in ('anon','authenticated','service_role')
    or to_regnamespace('dishbee_private') is not null
    or to_regclass('mealdeck_private.installation') is null
    or not exists(select 1 from pg_catalog.pg_class c
      where c.oid=to_regclass('mealdeck_private.installation')
      and pg_catalog.pg_has_role(current_user,c.relowner,'USAGE'))
  then raise exception 'mealdeck_draw_independent_owner_required'; end if;
end $guard$;

with
cfg as (
  select :'installation_id'::uuid installation_id, :'location_id'::uuid location_id,
    :'stripe_account'::text stripe_account, :'eligible_skus'::jsonb eligible_skus
),
requested as (
  select distinct entry #>> '{}' sku
  from cfg cross join lateral jsonb_array_elements(
    case when jsonb_typeof(cfg.eligible_skus)='array' then cfg.eligible_skus else '[]'::jsonb end
  ) item(entry)
  where jsonb_typeof(entry)='string'
    and char_length(entry #>> '{}') between 1 and 160
    and btrim(entry #>> '{}')=entry #>> '{}'
    and btrim(entry #>> '{}')<>''
),
scope as (
  select i.business_id tenant_id,l.id location_id
  from cfg join mealdeck_private.installation i on i.installation_id=cfg.installation_id
    and i.singleton and i.profile='mealdeck-independent-v1'
  join public.tenants t on t.id=i.business_id and t.currency='GBP'
  join public.tenant_locations l on l.tenant_id=t.id and l.id=cfg.location_id
    and l.slug='shared-kitchen'
),
eligible as (
  select m.id, m.sku from public.menu_items m join scope s on m.tenant_id=s.tenant_id
  join requested r on r.sku=m.sku
),
ready as (
  select exists(select 1 from scope)
    and (select count(*) from requested) between 1 and 100
    and (select case when jsonb_typeof(eligible_skus)='array' then jsonb_array_length(eligible_skus) else 0 end from cfg)=(select count(*) from requested)
    and (select count(*) from eligible)=(select count(*) from requested)
    and (select count(distinct sku) from eligible)=(select count(*) from requested)
    and (select stripe_account ~ '^acct_[A-Za-z0-9]+$' from cfg)
    and current_timestamp >= timestamptz '2026-12-07 00:00:00+00'
    and current_timestamp < timestamptz '2026-12-16 19:20:00+00' as ok
),
qualifying as (
  select distinct o.customer_id, o.id order_id
  from ready r join scope sc on r.ok
  join public.orders o on o.tenant_id=sc.tenant_id and o.location_id=sc.location_id
  join mealdeck_private.stripe_orders p on p.order_id=o.id and p.customer_id=o.customer_id
  join mealdeck_private.checkout_quotes q on q.id=p.quote_id and q.customer_id=o.customer_id
    and q.tenant_id=o.tenant_id and q.location_id=o.location_id
  join auth.users u on u.id=o.customer_id
  join mealdeck_private.customer_profiles c on c.user_id=o.customer_id
  where o.source='mealdeck' and not o.guest_checkout and p.guest_id is null and q.guest_id is null
    and o.group_order_room_id is null
    and o.currency='GBP' and p.livemode
    and p.stripe_account=(select stripe_account from cfg)
    and o.paid_at >= timestamptz '2026-12-03 00:00:00+00'
    and o.paid_at < timestamptz '2026-12-07 00:00:00+00'
    and p.verified_at is not null and p.verified_at <= current_timestamp
    and o.payment_status='paid' and o.status::text not in ('cancelled','refunded')
    and o.total_pence>0 and p.captured_pence=o.total_pence and p.refunded_pence=0
    and p.void_reason is null and p.payment_intent_id=o.payment_reference
    and p.payment_intent_id is not null and p.session_id is not null
    and exists(select 1 from mealdeck_private.stripe_events e where e.order_id=o.id
      and e.event_type in ('checkout.session.completed','checkout.session.async_payment_succeeded'))
    and not exists(select 1 from mealdeck_private.whatsapp_handoffs w where w.quote_id=q.id or w.order_id=o.id)
    and u.email_confirmed_at is not null and u.email_confirmed_at<=o.paid_at
    and c.created_at<=o.paid_at and u.deleted_at is null and not coalesce(u.is_anonymous,false)
    and nullif(btrim(u.email),'') is not null
    and (u.banned_until is null or u.banned_until<=current_timestamp)
    and exists(select 1 from public.order_items oi join eligible e on e.id=oi.menu_item_id
      where oi.tenant_id=o.tenant_id and oi.order_id=o.id and oi.quantity>0 and oi.unit_price_pence>0)
),
entrants as (
  select customer_id, jsonb_agg(order_id::text order by order_id) order_ids
  from qualifying group by customer_id
)
select jsonb_build_object(
  'version',1,'campaign','munchbox-cinema-20261203',
  'ready',(select ok from ready),'snapshotAt',to_char(current_timestamp at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS"Z"'),
  'installationId',(select installation_id from cfg),
  'locationId',(select location_id from cfg),
  'eligibleSkus',coalesce((select jsonb_agg(sku order by sku) from eligible),'[]'::jsonb),
  'entrants',coalesce((select jsonb_agg(jsonb_build_object('memberId',customer_id,'orderIds',order_ids) order by customer_id) from entrants),'[]'::jsonb)
);
rollback;
