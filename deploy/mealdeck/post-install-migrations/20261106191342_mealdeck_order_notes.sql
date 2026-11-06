-- Generated with Supabase CLI 3.0.0: mealdeck_order_notes.
-- Freeze optional plain-text special requests with the reviewed quote, then copy
-- them into new orders. Existing payment facts and receipt snapshots are untouched.
begin;
set local lock_timeout='5s';
set local statement_timeout='30s';
set local check_function_bodies=on;

do $guard$
declare expected record;
begin
  if to_regnamespace('dishbee_private') is not null
    or to_regclass('mealdeck_private.installation') is null then
    raise exception 'mealdeck_order_notes_independent_profile_required'; end if;
  if current_user in ('anon','authenticated','service_role') or not exists(
    select 1 from pg_class where oid='mealdeck_private.installation'::regclass
      and pg_has_role(current_user,relowner,'USAGE')) then
    raise exception 'mealdeck_order_notes_database_owner_required'; end if;
  if not exists(select 1 from mealdeck_private.installation where singleton
    and profile='mealdeck-independent-v1' and business_id is not null)
    or to_regclass('mealdeck_private.order_numbers') is null
    or to_regprocedure('mealdeck_private.price_checkout_lines_before_included_stock(uuid,uuid,jsonb)') is null then
    raise exception 'mealdeck_order_notes_previous_extensions_required'; end if;
  if (to_regclass('mealdeck_private.checkout_quote_notes') is null)
    is distinct from (to_regprocedure('mealdeck_private.normalise_checkout_notes(text)') is null) then
    raise exception 'mealdeck_order_notes_incomplete_installation'; end if;
  -- The unchanged quote creator accepts its reviewed source definition and the
  -- captured live variant that retains the approved private-test 30% offer.
  -- Neither variant is replaced or repriced by this migration.
  for expected in select * from (values
    ('mealdeck_private.materialize_payment_order(uuid,uuid,uuid,uuid,uuid)','133126b820cf9f3ff9e65b1154e07b1e','d170220fc74064fa3c575f55347e16bb'),
    ('mealdeck_private.checkout_receipt_for_identity(uuid,uuid,uuid)','9c3e21cb2f030b88d005bbbff4975102','c7935a10744ccf6971be1abb6758604d'),
    ('mealdeck_private.group_payment_snapshot(uuid,boolean,uuid)','7dfa0f61ef7c62bd403d3855eef97e8e','e106028e91cb9b9d3c72091b66dd7992'),
    ('mealdeck_private.create_checkout_quote_for_actor(uuid,uuid,uuid,uuid,uuid,text,jsonb,jsonb,text,jsonb)','7614993635874e546b8c65fd7899308a','aae853a38bd262b074525ff3707af461'),
    ('public.mealdeck_create_checkout_quote(uuid,uuid,uuid,text,jsonb,jsonb,text,jsonb)','9ebf53f817b1c3feddf4c8d566d277c7','9ebf53f817b1c3feddf4c8d566d277c7'),
    ('public.mealdeck_create_guest_checkout_quote(uuid,uuid,text,text,jsonb,jsonb,text,jsonb)','8e41fdef271d2e153c349dfce031faf4','8e41fdef271d2e153c349dfce031faf4')
  ) x(signature,old_hash,new_hash)
  loop
    if not exists(select 1 from pg_proc where oid=to_regprocedure(expected.signature)
      and prosecdef and proconfig @> array['search_path=""']
      and md5(prosrc) in (expected.old_hash,expected.new_hash)) then
      raise exception 'mealdeck_order_notes_unreviewed_definition: %',expected.signature; end if;
  end loop;
  for expected in select * from (values
    ('mealdeck_private.normalise_checkout_notes(text)','aa0cd608ee89054c0a5fb69354d6eb30',false),
    ('mealdeck_private.checkout_quote_notes_immutable()','d56f3ca81b54ac097ddda49cf2a1316f',false),
    ('mealdeck_private.freeze_new_checkout_notes(jsonb,uuid,uuid,uuid,uuid,text,text)','4afafd273fb63ea65ffeccb116d5a66a',true),
    ('public.mealdeck_create_checkout_quote_with_notes(uuid,uuid,uuid,text,jsonb,jsonb,text,jsonb,text)','8b0bad9869b0529c6b8f3027de6c15b1',true),
    ('public.mealdeck_create_guest_checkout_quote_with_notes(uuid,uuid,text,text,jsonb,jsonb,text,jsonb,text)','8e8b2f0b9f64e1f3df88ece398a1898e',true)
  ) x(signature,body_hash,is_definer)
  loop
    if to_regprocedure(expected.signature) is not null and not exists(
      select 1 from pg_proc where oid=to_regprocedure(expected.signature)
        and md5(prosrc)=expected.body_hash and prosecdef=expected.is_definer
        and proconfig @> array['search_path=""']) then
      raise exception 'mealdeck_order_notes_unreviewed_helper: %',expected.signature; end if;
  end loop;
end $guard$;

create or replace function mealdeck_private.normalise_checkout_notes(p_notes text)
returns text language plpgsql immutable set search_path='' as $$
declare clean text; code integer; i integer;
begin
  if p_notes is null then return null; end if;
  clean:=replace(replace(p_notes,E'\r\n',E'\n'),E'\r',E'\n');
  -- ECMAScript trim whitespace, excluding controls/format characters which are
  -- rejected rather than silently removed. LF/tab remain valid within notes.
  clean:=btrim(clean,U&'\0009\000A\0020\00A0\1680\2000\2001\2002\2003\2004\2005\2006\2007\2008\2009\200A\2028\2029\202F\205F\3000');
  if clean='' then return null; end if;
  if char_length(clean)>1000 then raise exception 'mealdeck_checkout_notes_invalid'; end if;
  for i in 1..char_length(clean) loop
    code:=ascii(substr(clean,i,1));
    -- Cc except TAB/LF, malformed surrogates, and Unicode Cf. The browser helper
    -- rejects the same classes before trimming; the receipt bridge also rejects
    -- Cf and flattens permitted line breaks/tabs only when printing.
    if (code between 0 and 31 and code not in (9,10)) or code between 127 and 159
      or code between 55296 and 57343
      or code in (173,1564,1757,1807,2274,6158,65279,69821,69837,917505)
      or code between 1536 and 1541 or code between 2192 and 2193
      or code between 8203 and 8207 or code between 8234 and 8238
      or code between 8288 and 8292 or code between 8294 and 8303
      or code between 65529 and 65531 or code between 78896 and 78911
      or code between 113824 and 113827 or code between 119155 and 119162
      or code between 917536 and 917631 then
      raise exception 'mealdeck_checkout_notes_invalid';
    end if;
  end loop;
  return clean;
end $$;

create table if not exists mealdeck_private.checkout_quote_notes(
  quote_id uuid primary key references mealdeck_private.checkout_quotes(id) on delete restrict,
  notes text not null check(char_length(notes) between 1 and 1000
    and notes is not distinct from mealdeck_private.normalise_checkout_notes(notes)),
  created_at timestamptz not null default now()
);
alter table mealdeck_private.checkout_quote_notes enable row level security;
revoke all on mealdeck_private.checkout_quote_notes from public,anon,authenticated,service_role;

create or replace function mealdeck_private.checkout_quote_notes_immutable()
returns trigger language plpgsql set search_path='' as $$
begin
  raise exception 'mealdeck_checkout_notes_immutable';
end $$;
drop trigger if exists checkout_quote_notes_immutable on mealdeck_private.checkout_quote_notes;
create trigger checkout_quote_notes_immutable before update or delete
  on mealdeck_private.checkout_quote_notes for each row
  execute function mealdeck_private.checkout_quote_notes_immutable();

create or replace function mealdeck_private.freeze_new_checkout_notes(
  p_quote jsonb,p_tenant uuid,p_location uuid,p_customer uuid,p_guest uuid,p_request_hash text,p_notes text
) returns jsonb language plpgsql security definer set search_path='' as $$
declare q mealdeck_private.checkout_quotes%rowtype; clean text;
begin
  clean:=mealdeck_private.normalise_checkout_notes(p_notes);
  -- Called only with the fresh result of the existing scoped quote RPC. No
  -- public endpoint accepts a quote ID to add or edit instructions afterwards.
  select * into q from mealdeck_private.checkout_quotes
    where id=(p_quote->>'quoteId')::uuid and tenant_id=p_tenant and location_id=p_location
      and customer_id is not distinct from p_customer and guest_id is not distinct from p_guest
      and staff_id is null and request_hash=p_request_hash and created_at=now() and expires_at>now()
    for update;
  if not found or exists(select 1 from mealdeck_private.stripe_orders where quote_id=q.id)
    or exists(select 1 from mealdeck_private.payment_orders where quote_id=q.id)
    or exists(select 1 from mealdeck_private.checkout_quote_notes where quote_id=q.id) then
    raise exception 'mealdeck_checkout_notes_quote_unavailable'; end if;
  if clean is not null then
    insert into mealdeck_private.checkout_quote_notes(quote_id,notes) values(q.id,clean);
  end if;
  return p_quote||jsonb_build_object('notes',clean);
end $$;

create or replace function public.mealdeck_create_checkout_quote_with_notes(
  p_tenant uuid,p_location uuid,p_customer uuid,p_fulfilment text,p_vehicle jsonb,
  p_selection jsonb,p_request_hash text,p_packing jsonb,p_notes text
) returns jsonb language plpgsql security definer set search_path='' as $$
declare quote jsonb; clean text;
begin
  clean:=mealdeck_private.normalise_checkout_notes(p_notes);
  -- Preserve the current member identity/private verification wrapper exactly.
  quote:=public.mealdeck_create_checkout_quote(p_tenant,p_location,p_customer,p_fulfilment,
    p_vehicle,p_selection,p_request_hash,p_packing);
  return mealdeck_private.freeze_new_checkout_notes(quote,p_tenant,p_location,p_customer,null,p_request_hash,clean);
end $$;

create or replace function public.mealdeck_create_guest_checkout_quote_with_notes(
  p_tenant uuid,p_location uuid,p_token_hash text,p_fulfilment text,p_vehicle jsonb,
  p_selection jsonb,p_request_hash text,p_packing jsonb,p_notes text
) returns jsonb language plpgsql security definer set search_path='' as $$
declare quote jsonb; clean text; guest mealdeck_private.guest_sessions%rowtype;
begin
  clean:=mealdeck_private.normalise_checkout_notes(p_notes);
  quote:=public.mealdeck_create_guest_checkout_quote(p_tenant,p_location,p_token_hash,p_fulfilment,
    p_vehicle,p_selection,p_request_hash,p_packing);
  guest:=mealdeck_private.guest_session_authority(p_tenant,p_location,p_token_hash);
  if guest.id is null then raise exception 'mealdeck_checkout_guest_session_invalid'; end if;
  return mealdeck_private.freeze_new_checkout_notes(quote,p_tenant,p_location,null,guest.id,p_request_hash,clean);
end $$;


create or replace function mealdeck_private.materialize_payment_order(p_quote uuid,p_customer uuid,p_guest uuid,p_staff uuid,p_room uuid)
returns public.orders language plpgsql security definer set search_path='' as $$
declare q mealdeck_private.checkout_quotes%rowtype;o public.orders%rowtype;
  member jsonb:='{}'::jsonb;priced jsonb;offer jsonb;handoff text;line jsonb;
begin
  select * into q from mealdeck_private.checkout_quotes where id=p_quote
    and customer_id is not distinct from p_customer and guest_id is not distinct from p_guest
    and staff_id is not distinct from p_staff for update;
  if not found then raise exception 'mealdeck_checkout_quote_unavailable'; end if;
  if p_staff is null then member:=mealdeck_private.checkout_identity(q.tenant_id,q.location_id,p_customer,p_guest);
  else perform public.mealdeck_terminal_authorize(p_staff,q.tenant_id,q.location_id); end if;
  perform mealdeck_private.assert_payment_open(q.tenant_id,q.location_id,p_guest is not null);
  perform mealdeck_private.validate_checkout_packing(q.selection,q.packing_plan);
    if q.expires_at<=now() then raise exception 'mealdeck_checkout_quote_expired'; end if;
    if public.mealdeck_online_checkout_status(q.tenant_id,q.location_id)->'channelOpen' is distinct from 'true'::jsonb then
      raise exception 'mealdeck_checkout_unavailable'; end if;
    priced:=mealdeck_private.price_checkout_lines(q.tenant_id,q.location_id,q.selection);
    if priced->'lines' is distinct from q.priced_lines or (priced->>'grossPence')::integer<>q.gross_pence then
      raise exception 'mealdeck_checkout_price_changed'; end if;
    offer:=mealdeck_private.opening_offer(q.tenant_id,q.location_id);
    if q.discount_pence>0 and (offer->>'status'<>'active' or not exists(
      select 1 from mealdeck_private.checkout_settings c where c.tenant_id=q.tenant_id and c.location_id=q.location_id
        and c.opening_start_date=q.opening_start_date)) then raise exception 'mealdeck_checkout_offer_changed'; end if;
    -- Existing canonical total = net goods + delivery. Gross/discount remain
    -- immutable in the linked quote, avoiding a fabricated free line or fee.
    handoff:=mealdeck_private.allocate_checkout_handoff_code(q.tenant_id,q.location_id);
    insert into public.orders(tenant_id,location_id,customer_id,status,fulfilment,source,currency,
      subtotal_pence,delivery_pence,total_pence,customer_name,customer_email,customer_phone,vehicle,
      vehicle_registration,handoff_code,packing_plan,cutlery_requested,review_confirmed_at,handoff_code_reserved,guest_checkout,group_order_room_id,notes)
      values(q.tenant_id,q.location_id,p_customer,'payment_pending',q.fulfilment::public.fulfilment_type,
        'mealdeck','GBP',q.total_pence,0,q.total_pence,member->>'name',member->>'email',member->>'phone',
        q.vehicle,q.vehicle->>'registrationLast4',handoff,
        q.packing_plan,(q.packing_plan->>'cutleryRequested')::boolean,now(),true,p_guest is not null,p_room,
        (select n.notes from mealdeck_private.checkout_quote_notes n where n.quote_id=q.id)) returning * into o;
    for line in select value from jsonb_array_elements(q.priced_lines) loop
      insert into public.order_items(tenant_id,order_id,brand_id,menu_item_id,item_name,quantity,unit_price_pence,modifiers,notes,
        checkout_line_id,parent_checkout_line_id,base_unit_price_pence)
        values(q.tenant_id,o.id,(line->>'brand_id')::uuid,(line->>'menu_item_id')::uuid,line->>'name',
          (line->>'quantity')::integer,(line->>'unit_pence')::integer,line->'modifiers',line->>'attachment',
          line->>'lineId',line->>'parentLineId',(line->>'base_unit_pence')::integer);
    end loop;
  return o;
end $$;

create or replace function mealdeck_private.checkout_receipt_for_identity(p_order uuid,p_customer uuid,p_guest uuid)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare o public.orders%rowtype;q mealdeck_private.checkout_quotes%rowtype;s mealdeck_private.stripe_orders%rowtype;funding mealdeck_private.payment_orders%rowtype;
begin
  select * into o from public.orders where id=p_order and customer_id is not distinct from p_customer and source='mealdeck'
    and guest_checkout=(p_guest is not null);
  select * into s from mealdeck_private.stripe_orders where order_id=o.id and customer_id is not distinct from p_customer and guest_id is not distinct from p_guest;
  if s.order_id is null then
    select * into funding from mealdeck_private.payment_orders where order_id=o.id and customer_id is not distinct from p_customer
      and guest_id is not distinct from p_guest and staff_id is null;
    if found then
      s.order_id:=funding.order_id;s.quote_id:=funding.quote_id;s.verified_at:=funding.verified_at;s.void_reason:=funding.hold_reason;s.expires_at:=funding.expires_at;
      select coalesce(sum(captured_pence),0),coalesce(sum(refunded_pence),0) into s.captured_pence,s.refunded_pence
        from mealdeck_private.payment_collections where order_id=funding.order_id;
    end if;
  end if;
  if o.id is null or s.order_id is null then raise exception 'mealdeck_checkout_order_unavailable'; end if;
  perform mealdeck_private.checkout_identity(o.tenant_id,o.location_id,p_customer,p_guest);
  select * into q from mealdeck_private.checkout_quotes where id=s.quote_id and tenant_id=o.tenant_id
    and location_id=o.location_id and customer_id is not distinct from p_customer and guest_id is not distinct from p_guest;
  if not found then raise exception 'mealdeck_checkout_order_unavailable'; end if;
  return jsonb_build_object('orderNumber',mealdeck_private.paid_order_number(p_order),'orderId',o.id,'quoteId',q.id,'guestOrder',o.guest_checkout,'status',o.status,'paymentStatus',o.payment_status,
    'verifiedPaid',s.captured_pence=o.total_pence and s.verified_at is not null and s.refunded_pence=0
      and s.void_reason is null and o.payment_status='paid',
    'handoffCode',case when s.verified_at is not null then o.handoff_code else null end,
    'fulfilment',o.fulfilment,'createdAt',o.created_at,'paidAt',o.paid_at,'acceptedAt',o.accepted_at,'serverNow',now(),
    'collectionEstimateMinutes',q.collection_estimate_minutes,
    'estimatedReadyAt',case when o.paid_at is not null then o.paid_at+make_interval(mins=>q.collection_estimate_minutes) else null end,
    'grossPence',q.gross_pence,'discountPence',q.discount_pence,'totalPence',o.total_pence,'lines',q.priced_lines,
    'packingPlan',o.packing_plan,'cutleryRequested',o.cutlery_requested,'notes',o.notes,
    'passStatus',(select p.status from public.mealdeck_pass_orders p where p.order_id=o.id),
    'preparingAt',(select min(t.started_at) from public.kds_tickets t where t.order_id=o.id),
    'readyAt',(select max(t.ready_at) from public.kds_tickets t where t.order_id=o.id),
    'readyForCollectionAt',(select p.ready_for_handoff_at from public.mealdeck_pass_orders p where p.order_id=o.id),
    'completedAt',(select p.handed_off_at from public.mealdeck_pass_orders p where p.order_id=o.id),
    'paymentSessionExpired',s.captured_pence=0 and s.expires_at<=now(),
    'held',s.void_reason is not null)
    ||case when p_guest is not null then jsonb_build_object('loyaltyEligible',false) else '{}'::jsonb end;
end $$;

create or replace function mealdeck_private.group_payment_snapshot(p_order uuid,p_owner boolean,p_share uuid)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare p mealdeck_private.payment_orders%rowtype;q mealdeck_private.checkout_quotes%rowtype;
  o public.orders%rowtype;captured integer;refunded integer;available integer;shares jsonb;lines jsonb;packing jsonb;
begin
  select * into p from mealdeck_private.payment_orders where order_id=p_order;
  select * into q from mealdeck_private.checkout_quotes where id=p.quote_id;
  select * into o from public.orders where id=p_order;
  select coalesce(sum(captured_pence),0),coalesce(sum(refunded_pence),0) into captured,refunded
    from mealdeck_private.payment_collections where order_id=p_order;
  select coalesce(sum(s.amount_pence),0) into available from mealdeck_private.payment_shares s
    where s.order_id=p_order and not exists(select 1 from mealdeck_private.payment_collection_shares cs where cs.share_id=s.id and cs.active);
  select jsonb_agg(jsonb_build_object('shareId',s.id,'bagNumber',s.bag_number,'amountPence',s.amount_pence,
    'paidPence',case when c.captured_pence=c.amount_pence then s.amount_pence else 0 end,
    'status',case when c.hold_reason is not null or (p.hold_reason is not null and c.captured_pence>0) then 'refund_review'
      when c.captured_pence=c.amount_pence then 'paid' when c.id is not null then 'pending' else 'unclaimed' end)
    order by s.bag_number) into shares
    from mealdeck_private.payment_shares s
      left join mealdeck_private.payment_collection_shares cs on cs.share_id=s.id and cs.active
      left join mealdeck_private.payment_collections c on c.id=cs.collection_id where s.order_id=p_order and (p_owner or s.id=p_share);
  if p_owner then lines:=q.priced_lines;packing:=q.packing_plan;
  else
    select q.packing_plan || jsonb_build_object('bags',jsonb_build_array(b)) into packing
      from jsonb_array_elements(q.packing_plan->'bags') b join mealdeck_private.payment_shares s
        on s.bag_number=(b->>'number')::integer where s.id=p_share and s.order_id=p_order;
    select coalesce(jsonb_agg(l || jsonb_build_object('quantity',(a->>'quantity')::integer,
      'line_pence',(a->>'quantity')::integer*(l->>'unit_pence')::integer) order by n),'[]'::jsonb) into lines
      from jsonb_array_elements(q.priced_lines) with ordinality x(l,n)
      join jsonb_array_elements(packing->'bags'->0->'allocations') a on a->>'lineId'=l->>'lineId';
  end if;
  return jsonb_build_object('orderNumber',mealdeck_private.paid_order_number(p_order),'roomId',p.room_id,'orderId',p.order_id,'version',1,'splitMode',p.split_mode,
    'currency','GBP','status',case when p.hold_reason is not null and captured>0 then 'refund_review'
      when p.cancel_requested_at is not null then 'cancelled' when p.hold_reason is not null then 'refund_review'
      when p.verified_at is not null then 'paid' else 'collecting' end,
    'totalPence',p.total_pence,'capturedPence',captured,'paidPence',greatest(0,captured-refunded),
    'refundedPence',refunded,'remainingPence',greatest(0,p.total_pence-captured+refunded),
    'unclaimedPence',available,'expiresAt',p.expires_at,'fundingExpired',p.expires_at<=now(),
    'holdReason',p.hold_reason,'ownerAccess',p_owner,'ownShareId',p_share,
    'viewer',jsonb_build_object('role',case when p_owner then 'organiser' else 'participant' end,'shareId',p_share),'shares',shares,
    'lines',lines,'packingPlan',packing,'collectionEstimateMinutes',q.collection_estimate_minutes,
    'fulfilment',o.fulfilment,'createdAt',o.created_at,'paidAt',o.paid_at,'acceptedAt',o.accepted_at,
    'handoffCode',case when p.verified_at is not null and p.hold_reason is null then o.handoff_code else null end,
    'serverNow',now()) || case when p_owner then jsonb_build_object('quoteId',q.id,'notes',o.notes) else '{}'::jsonb end;
end $$;

revoke all on function mealdeck_private.normalise_checkout_notes(text) from public,anon,authenticated,service_role;
revoke all on function mealdeck_private.checkout_quote_notes_immutable() from public,anon,authenticated,service_role;
revoke all on function mealdeck_private.freeze_new_checkout_notes(jsonb,uuid,uuid,uuid,uuid,text,text) from public,anon,authenticated,service_role;
revoke all on function public.mealdeck_create_checkout_quote_with_notes(uuid,uuid,uuid,text,jsonb,jsonb,text,jsonb,text) from public,anon,authenticated,service_role;
revoke all on function public.mealdeck_create_guest_checkout_quote_with_notes(uuid,uuid,text,text,jsonb,jsonb,text,jsonb,text) from public,anon,authenticated,service_role;
revoke all on function mealdeck_private.materialize_payment_order(uuid,uuid,uuid,uuid,uuid) from public,anon,authenticated,service_role;
revoke all on function mealdeck_private.checkout_receipt_for_identity(uuid,uuid,uuid) from public,anon,authenticated,service_role;
revoke all on function mealdeck_private.group_payment_snapshot(uuid,boolean,uuid) from public,anon,authenticated,service_role;
grant execute on function public.mealdeck_create_checkout_quote_with_notes(uuid,uuid,uuid,text,jsonb,jsonb,text,jsonb,text) to service_role;
grant execute on function public.mealdeck_create_guest_checkout_quote_with_notes(uuid,uuid,text,text,jsonb,jsonb,text,jsonb,text) to service_role;
notify pgrst,'reload schema';
commit;
