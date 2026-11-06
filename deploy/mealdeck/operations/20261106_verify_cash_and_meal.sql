-- Read-only verification after the reviewed cash migration, and again after meal components.
-- No order/customer/staff identifiers or contact information are returned.
with expected(signature,body_hash,is_definer) as (values
  ('mealdeck_private.cash_customer_name(text)','c91f340df334c0a7e6d7c73ba75ce38d',false),
  ('mealdeck_private.cash_record_immutable()','af6cd99201f49c78feb83af0709832d7',false),
  ('mealdeck_private.cash_authorize_locked(uuid,uuid,uuid)','df6b27fb06325bd241738e11b4359f7d',true),
  ('mealdeck_private.guard_cash_quote_owner()','48602c34d0f90c8c79e4a719cca3d486',true),
  ('mealdeck_private.order_checkout_quote_id(uuid)','ad869575c58ca66ef8e00b23290438fa',true),
  ('mealdeck_private.cash_order_financial_ready(uuid)','b4c5bd5b94f1184fe2f6d01951d59408',true),
  ('mealdeck_private.kds_release_authority_before_cash(uuid)','e687944dc60d19e877f5b486a9882748',true),
  ('mealdeck_private.kds_release_authority(uuid)','0d19656f9e94ce24743fbe9dec5b0ee1',true),
  ('mealdeck_private.cash_order_snapshot(uuid)','6ff46e2814643d89c310fc7ac3698096',true),
  ('public.mealdeck_create_cash_quote(uuid,uuid,uuid,jsonb,jsonb,text,text,text,text)','1845e4c8dc4a89ed86111ee1f8ebc11b',true),
  ('public.mealdeck_cash_order_status(uuid,uuid,uuid,uuid,uuid)','e3c77d2b7a390e4e452d27fd752fb4c9',true),
  ('public.mealdeck_cancel_cash_order_attempt(uuid,uuid,uuid,uuid,uuid)','3dcc7184e92e5a435a47d116d6b60fa7',true),
  ('public.mealdeck_confirm_cash_order(uuid,uuid,uuid,uuid,uuid,boolean)','76e38e5a85d2c4a04b7e5911f0022321',true),
  ('mealdeck_private.release_paid_order(uuid,text)','89b7ca882734b3a56d8badf62b3e81cc',true),
  ('mealdeck_private.materialize_payment_order(uuid,uuid,uuid,uuid,uuid)','d170220fc74064fa3c575f55347e16bb',true),
  ('mealdeck_private.price_checkout_lines(uuid,uuid,jsonb)','c867416a25499f372e6bce2c93468831',true),
  ('mealdeck_private.payment_order_financial_ready(uuid)','4563f2c3c6997cdc1d034afbe2f88733',true),
  ('mealdeck_private.assign_paid_order_number(uuid)','e002536d8ab39ed9dbde863de106c8da',true)
), functions as (
  select e.signature,md5(p.prosrc) actual_hash,
    coalesce(md5(p.prosrc)=e.body_hash and p.prosecdef=e.is_definer
      and p.proconfig @> array['search_path=""'],false) definition_ok,
    coalesce(has_function_privilege('anon',p.oid,'EXECUTE'),false) anon_execute,
    coalesce(has_function_privilege('authenticated',p.oid,'EXECUTE'),false) authenticated_execute,
    coalesce(has_function_privilege('service_role',p.oid,'EXECUTE'),false) service_execute,
    coalesce((select bool_or(a.grantee=0 and a.privilege_type='EXECUTE')
      from aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a),false) public_execute
  from expected e left join pg_proc p on p.oid=to_regprocedure(e.signature)
), tables as (
  select c.relname,c.relrowsecurity rls,
    has_table_privilege('anon',c.oid,'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER') anon_access,
    has_table_privilege('authenticated',c.oid,'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER') authenticated_access,
    has_table_privilege('service_role',c.oid,'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER') service_access,
    (select count(*) from pg_policy where polrelid=c.oid) policy_count
  from pg_class c join pg_namespace n on n.oid=c.relnamespace
  where n.nspname='mealdeck_private' and c.relname in ('cash_orders','cash_checkout_quotes','cash_closed_quotes')
), expected_triggers(relation,name) as (values
  ('mealdeck_private.cash_checkout_quotes','cash_quote_immutable'),
  ('mealdeck_private.cash_orders','cash_order_immutable'),
  ('mealdeck_private.cash_closed_quotes','cash_closed_quote_immutable'),
  ('mealdeck_private.cash_orders','cash_quote_owner'),
  ('mealdeck_private.stripe_orders','cash_quote_owner'),
  ('mealdeck_private.payment_orders','cash_quote_owner')
), trigger_checks as (
  select e.relation,e.name,coalesce(t.tgenabled='O',false) enabled
  from expected_triggers e left join pg_trigger t on t.tgrelid=to_regclass(e.relation) and t.tgname=e.name
), receipt_definition as (
  select md5(p.prosrc) actual_hash,
    md5(p.prosrc)=case when to_regprocedure('mealdeck_ops_private.receipt_snapshot_before_meal_components(uuid)') is null
      then '880995efe09dfd02f710ea2a87cfd6a4' else 'dabd8842f5ecedab177917950de317e5' end
      and p.prosecdef and p.proconfig @> array['search_path=""'] definition_ok,
    case when to_regprocedure('mealdeck_ops_private.receipt_snapshot_before_meal_components(uuid)') is null then true
      else (select md5(prosrc)='880995efe09dfd02f710ea2a87cfd6a4' from pg_proc
        where oid=to_regprocedure('mealdeck_ops_private.receipt_snapshot_before_meal_components(uuid)')) end cash_base_preserved
  from pg_proc p where p.oid=to_regprocedure('mealdeck_ops_private.receipt_snapshot(uuid)')
)
select jsonb_build_object(
  'installation',(select jsonb_build_object('profile',profile,'businessSet',business_id is not null)
    from mealdeck_private.installation where singleton),
  'functions',(select jsonb_agg(to_jsonb(f) order by signature) from functions f),
  'tables',(select jsonb_agg(to_jsonb(t) order by relname) from tables t),
  'triggers',(select jsonb_agg(to_jsonb(t) order by relation,name) from trigger_checks t),
  'receiptDefinition',(select to_jsonb(r) from receipt_definition r),
  'numberTrigger',(select jsonb_build_object('enabled',tgenabled='O','deferred',tgdeferrable and tginitdeferred)
    from pg_trigger where tgrelid='public.orders'::regclass and tgname='mealdeck_verified_paid_order_number'),
  'counts',jsonb_build_object(
    'cashQuotes',(select count(*) from mealdeck_private.cash_checkout_quotes),
    'cashOrders',(select count(*) from mealdeck_private.cash_orders),
    'closedUnusedQuotes',(select count(*) from mealdeck_private.cash_closed_quotes),
    'closedQuotesWithCashOrders',(select count(*) from mealdeck_private.cash_closed_quotes q join mealdeck_private.cash_orders c using(quote_id)),
    'cashOrdersMissingNumbers',(select count(*) from mealdeck_private.cash_orders c left join mealdeck_private.order_numbers n on n.order_id=c.order_id where n.order_id is null),
    'cashOrdersWithProviderLedger',(select count(*) from mealdeck_private.cash_orders c where exists(
      select 1 from mealdeck_private.stripe_orders s where s.order_id=c.order_id or s.quote_id=c.quote_id) or exists(
      select 1 from mealdeck_private.payment_orders p where p.order_id=c.order_id or p.quote_id=c.quote_id)),
    'activePaidCashWithoutAuthority',(select count(*) from mealdeck_private.cash_orders c join public.orders o on o.id=c.order_id
      where o.payment_status='paid' and o.status not in ('cancelled','refunded') and not mealdeck_private.cash_order_financial_ready(c.order_id)),
    'acceptedCashWithoutOriginalReceipt',(select count(*) from mealdeck_private.cash_orders c join public.orders o on o.id=c.order_id
      where o.accepted_at is not null and not exists(select 1 from mealdeck_private.receipt_jobs j where j.order_id=c.order_id and j.copy_number=1)),
    'originalCashReceiptsMissingCashLabel',(select count(*) from mealdeck_private.receipt_jobs j join mealdeck_private.cash_orders c on c.order_id=j.order_id
      where j.copy_number=1 and j.receipt->>'paymentMethod' is distinct from 'cash')
  )
) verification;
