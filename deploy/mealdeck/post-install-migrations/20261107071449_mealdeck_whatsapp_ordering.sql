-- Independent MealDeck WhatsApp ordering transport. Additive, disabled by server
-- configuration until explicitly activated. This creates no payment authority.
begin;
set local lock_timeout='5s';

do $guard$ begin
  if to_regclass('mealdeck_private.guest_sessions') is null
    or to_regclass('mealdeck_private.stripe_orders') is null
    or to_regnamespace('dishbee_private') is not null
    or not exists(select 1 from mealdeck_private.installation where singleton
      and profile='mealdeck-independent-v1') then
    raise exception 'mealdeck_whatsapp_independent_checkout_required';
  end if;
end $guard$;

create table mealdeck_private.whatsapp_sessions(
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,location_id uuid not null,
  phone_id text not null check(phone_id ~ '^[0-9]{5,30}$'),
  -- Sender identities may be business-scoped opaque IDs, never an Auth identity.
  sender_id text not null check(length(sender_id) between 1 and 256 and sender_id !~ '[[:cntrl:][:space:]]'),
  draft jsonb not null default '{}' check(jsonb_typeof(draft)='object' and octet_length(draft::text)<=131072),
  revision bigint not null default 0 check(revision>=0),
  draft_expires_at timestamptz not null default now()+interval '24 hours',
  last_inbound_at timestamptz not null default now(),
  mode text not null default 'ai' check(mode in ('ai','support','staff')),
  support_reason text check(length(support_reason)<=300),
  staff_id uuid references auth.users(id),
  lease_id uuid,lease_expires_at timestamptz,
  current_order_id uuid references public.orders(id),arrived_at timestamptz,
  created_at timestamptz not null default now(),updated_at timestamptz not null default now(),
  unique(tenant_id,location_id,phone_id,sender_id),
  unique(id,tenant_id,location_id,phone_id),
  foreign key(tenant_id,location_id) references public.tenant_locations(tenant_id,id)
);
create table mealdeck_private.whatsapp_inbound(
  id uuid primary key default gen_random_uuid(),session_id uuid not null,
  tenant_id uuid not null,location_id uuid not null,phone_id text not null,
  provider_message_id text not null check(length(provider_message_id) between 1 and 512 and provider_message_id !~ '[[:cntrl:]]'),
  input jsonb not null check(jsonb_typeof(input)='object' and octet_length(input::text)<=16384),
  input_hash text not null check(input_hash ~ '^[a-f0-9]{64}$'),
  received_at timestamptz not null,created_at timestamptz not null default now(),
  status text not null default 'queued' check(status in ('queued','processing','processed','held','dismissed')),
  attempts integer not null default 0 check(attempts between 0 and 5),
  available_at timestamptz not null default now(),lease_id uuid,lease_expires_at timestamptz,
  applied_revision bigint,completed_at timestamptz,
  unique(tenant_id,location_id,phone_id,provider_message_id),
  foreign key(session_id,tenant_id,location_id,phone_id)
    references mealdeck_private.whatsapp_sessions(id,tenant_id,location_id,phone_id)
);
create index whatsapp_inbound_work on mealdeck_private.whatsapp_inbound(tenant_id,location_id,phone_id,available_at,created_at)
  where status in ('queued','processing');
create index whatsapp_inbound_sender_rate on mealdeck_private.whatsapp_inbound(session_id,created_at desc);
create table mealdeck_private.whatsapp_handoffs(
  id uuid primary key default gen_random_uuid(),session_id uuid not null,
  tenant_id uuid not null,location_id uuid not null,phone_id text not null,
  token_hash text not null unique check(token_hash ~ '^[a-f0-9]{64}$'),
  claim_hash text unique check(claim_hash ~ '^[a-f0-9]{64}$'),
  draft_revision bigint not null,frozen_draft jsonb not null check(jsonb_typeof(frozen_draft)='object'),
  created_at timestamptz not null default now(),expires_at timestamptz not null default now()+interval '15 minutes',
  claimed_at timestamptz,revoked_at timestamptz,
  request_hash text check(request_hash ~ '^[a-f0-9]{64}$'),
  quote_id uuid unique references mealdeck_private.checkout_quotes(id),
  order_id uuid unique references mealdeck_private.stripe_orders(order_id),
  customer_id uuid references auth.users(id),guest_id uuid references mealdeck_private.guest_sessions(id),
  foreign key(session_id,tenant_id,location_id,phone_id)
    references mealdeck_private.whatsapp_sessions(id,tenant_id,location_id,phone_id),
  check(expires_at>created_at and expires_at<=created_at+interval '15 minutes'),
  check(quote_id is null or (request_hash is not null and num_nonnulls(customer_id,guest_id)=1)),
  check(order_id is null or quote_id is not null)
);
create index whatsapp_handoffs_session on mealdeck_private.whatsapp_handoffs(session_id,created_at desc);
create table mealdeck_private.whatsapp_outbox(
  id uuid primary key default gen_random_uuid(),sequence bigint generated always as identity,
  session_id uuid not null,tenant_id uuid not null,location_id uuid not null,phone_id text not null,
  transition_key text not null check(length(transition_key) between 1 and 250),
  reply jsonb not null check(jsonb_typeof(reply)='object' and octet_length(reply::text)<=20000),
  status text not null default 'queued' check(status in ('queued','sending','sent','held','cancelled')),
  attempts integer not null default 0 check(attempts between 0 and 5),
  lease_id uuid,lease_expires_at timestamptz,available_at timestamptz not null default now(),
  provider_message_id text check(length(provider_message_id)<=512),
  hold_reason text check(length(hold_reason)<=80),
  status_order_id uuid references public.orders(id),status_key text,
  created_at timestamptz not null default now(),sent_at timestamptz,
  unique(session_id,transition_key),
  foreign key(session_id,tenant_id,location_id,phone_id)
    references mealdeck_private.whatsapp_sessions(id,tenant_id,location_id,phone_id)
);
create index whatsapp_outbox_work on mealdeck_private.whatsapp_outbox(tenant_id,location_id,phone_id,sequence)
  where status in ('queued','sending');
create table mealdeck_private.whatsapp_staff_events(
  id uuid primary key default gen_random_uuid(),session_id uuid not null references mealdeck_private.whatsapp_sessions(id),
  actor_id uuid not null references auth.users(id),action text not null check(action in ('takeover','release','reply')),
  request_id uuid,unique(actor_id,request_id),
  created_at timestamptz not null default now()
);
do $security$ declare t text; begin
  foreach t in array array['whatsapp_sessions','whatsapp_inbound','whatsapp_handoffs','whatsapp_outbox','whatsapp_staff_events'] loop
    execute format('alter table mealdeck_private.%I enable row level security',t);
    execute format('revoke all on mealdeck_private.%I from public,anon,authenticated,service_role',t);
  end loop;
  revoke all on sequence mealdeck_private.whatsapp_outbox_sequence_seq from public,anon,authenticated,service_role;
end $security$;

create function mealdeck_private.whatsapp_assert_scope(p_tenant uuid,p_location uuid,p_phone_id text)
returns void language plpgsql stable security definer set search_path='' as $$
begin
  if p_phone_id is null or p_phone_id !~ '^[0-9]{5,30}$' or not exists(
    select 1 from mealdeck_private.installation i join public.tenants t on t.id=i.business_id
      join public.tenant_locations l on l.tenant_id=t.id
    where i.singleton and i.profile='mealdeck-independent-v1' and t.id=p_tenant
      and t.active and t.currency='GBP' and l.id=p_location and l.active
      and l.slug='shared-kitchen' and l.timezone='Europe/London') then
    raise exception 'mealdeck_whatsapp_scope_invalid';
  end if;
end $$;

create function mealdeck_private.whatsapp_order_card(p_session uuid,p_order uuid default null)
returns jsonb language sql stable security definer set search_path='' as $$
  select jsonb_build_object('orderId',o.id,'fulfilment',o.fulfilment,
    'status',case when so.void_reason is not null or so.refunded_pence>0 or o.payment_status::text in ('refunded','partially_refunded','failed') or o.status::text='cancelled' then 'held'
      when so.verified_at is null or so.captured_pence<>o.total_pence or o.payment_status<>'paid' then 'payment_pending'
      when po.handed_off_at is not null then 'completed'
      when po.ready_for_handoff_at is not null then 'ready'
      when o.accepted_at is not null then 'accepted' else 'paid' end,
    'verifiedPaid',so.verified_at is not null and so.captured_pence=o.total_pence and so.refunded_pence=0
      and so.void_reason is null and o.payment_status='paid',
    'acceptedAt',o.accepted_at,'readyForCollectionAt',po.ready_for_handoff_at,'completedAt',po.handed_off_at,
    'handoffCode',case when so.verified_at is not null and so.captured_pence=o.total_pence
      and so.refunded_pence=0 and so.void_reason is null and o.payment_status='paid' then o.handoff_code else null end,
    'arrivedAt',case when o.id=s.current_order_id then s.arrived_at else null end,
    'canStartNewOrder',so.verified_at is not null and so.captured_pence=o.total_pence and
      ((po.handed_off_at is not null and so.void_reason is null and so.refunded_pence=0 and o.payment_status='paid')
       or (so.refunded_pence=so.captured_pence and so.captured_pence>0 and o.payment_status='refunded')))
  from mealdeck_private.whatsapp_sessions s
  join public.orders o on o.id=coalesce(p_order,s.current_order_id) and o.tenant_id=s.tenant_id and o.location_id=s.location_id and o.source='mealdeck'
  join mealdeck_private.whatsapp_handoffs h on h.session_id=s.id and h.order_id=o.id
  join mealdeck_private.stripe_orders so on so.order_id=o.id and so.quote_id=h.quote_id
    and so.customer_id is not distinct from h.customer_id and so.guest_id is not distinct from h.guest_id
  left join public.mealdeck_pass_orders po on po.order_id=o.id
  where s.id=p_session
$$;

create function mealdeck_private.whatsapp_handoff_card(p_handoff mealdeck_private.whatsapp_handoffs)
returns jsonb language sql stable security definer set search_path='' as $$
  select jsonb_build_object('handoffId',p_handoff.id,'draft',p_handoff.frozen_draft,'revision',p_handoff.draft_revision,
    'expiresAt',p_handoff.expires_at,'quoteId',p_handoff.quote_id,'orderId',p_handoff.order_id,
    'requestHash',p_handoff.request_hash,
    'paused',(select mode<>'ai' from mealdeck_private.whatsapp_sessions where id=p_handoff.session_id),
    'checkoutMode',case when p_handoff.customer_id is not null then 'member' when p_handoff.guest_id is not null then 'guest' else null end,
    'phase',case when p_handoff.order_id is not null then 'order' when p_handoff.quote_id is not null then 'quoted' else 'draft' end,
    'attemptId',(select attempt_id from mealdeck_private.stripe_orders where quote_id=p_handoff.quote_id
      and customer_id is not distinct from p_handoff.customer_id and guest_id is not distinct from p_handoff.guest_id),
    'orderBinding',case when p_handoff.order_id is not null then mealdeck_private.whatsapp_order_card(p_handoff.session_id,p_handoff.order_id) else null end)
$$;

create function mealdeck_private.whatsapp_selection(p_draft jsonb)
returns jsonb language sql immutable set search_path='' as $$
  select jsonb_build_object('picks',p_draft->'picks','fulfilment',p_draft->'fulfilment','customer',p_draft->'customer',
    'vehicle',p_draft->'vehicle','packingPlan',p_draft->'packingPlan','notes',p_draft->'notes')
$$;

create function mealdeck_private.whatsapp_order_terminal(p_order uuid)
returns boolean language sql stable security definer set search_path='' as $$
  select coalesce(exists(select 1 from mealdeck_private.stripe_orders so join public.orders o on o.id=so.order_id
    left join public.mealdeck_pass_orders po on po.order_id=o.id where o.id=p_order and so.verified_at is not null
    and so.captured_pence=o.total_pence and ((po.handed_off_at is not null and so.void_reason is null and so.refunded_pence=0 and o.payment_status='paid')
      or (so.refunded_pence=so.captured_pence and so.captured_pence>0 and o.payment_status='refunded'))),false)
$$;

create function mealdeck_private.whatsapp_can_start_new(p_session uuid)
returns boolean language sql stable security definer set search_path='' as $$
  select not exists(select 1 from mealdeck_private.whatsapp_handoffs h
    join mealdeck_private.whatsapp_sessions s on s.id=h.session_id
    join mealdeck_private.checkout_quotes q on q.id=h.quote_id
    where s.id=p_session and h.revoked_at is null and (h.order_id is null or h.order_id=s.current_order_id)
      and not mealdeck_private.whatsapp_order_terminal(h.order_id)
      and exists(select 1 from mealdeck_private.stripe_orders so where so.quote_id=h.quote_id))
$$;

-- Caller holds the session lock. A pause revokes only capabilities which cannot
-- already correspond to an externally submitted/unknown payment attempt.
create function mealdeck_private.whatsapp_pause_unprepared(p_session uuid)
returns void language plpgsql security definer set search_path='' as $$
declare h mealdeck_private.whatsapp_handoffs%rowtype;
begin
  for h in select * from mealdeck_private.whatsapp_handoffs where session_id=p_session and revoked_at is null and order_id is null order by created_at for update loop
    if h.quote_id is not null then
      perform 1 from mealdeck_private.checkout_quotes where id=h.quote_id for update;
      if exists(select 1 from mealdeck_private.stripe_orders where quote_id=h.quote_id) then continue;end if;
      update mealdeck_private.checkout_quotes set expires_at=least(expires_at,now()) where id=h.quote_id;
    end if;
    update mealdeck_private.whatsapp_handoffs set revoked_at=now() where id=h.id;
  end loop;
  update mealdeck_private.whatsapp_outbox set status='cancelled',hold_reason='staff_review_required'
    where session_id=p_session and status='queued' and reply ? 'sealedCheckoutLink';
end $$;

create function mealdeck_private.whatsapp_valid_reply(p_reply jsonb)
returns boolean language plpgsql immutable set search_path='' as $$
declare v jsonb;section jsonb;n integer:=0;
begin
  if jsonb_typeof(p_reply) is distinct from 'object' or jsonb_typeof(p_reply->'text') is distinct from 'string'
    or length(p_reply->>'text') not between 1 and 4096 or octet_length(p_reply::text)>20000
    or exists(select 1 from jsonb_object_keys(p_reply) k where k not in ('text','buttons','list','sealedCheckoutLink'))
    or (p_reply ? 'buttons' and p_reply ? 'list') then return false; end if;
  if p_reply ? 'sealedCheckoutLink' then
    if p_reply ? 'buttons' or p_reply ? 'list' or jsonb_typeof(p_reply->'sealedCheckoutLink') is distinct from 'string'
      or length(p_reply->>'sealedCheckoutLink') not between 43 and 4099 or p_reply->>'sealedCheckoutLink' !~ '^v1\.[A-Za-z0-9_-]+$' then return false;end if;
  end if;
  if p_reply ? 'buttons' then
    if jsonb_typeof(p_reply->'buttons') is distinct from 'array' then return false; end if;
    if jsonb_array_length(p_reply->'buttons') not between 1 and 3 then return false; end if;
    for v in select value from jsonb_array_elements(p_reply->'buttons') loop
      if jsonb_typeof(v) is distinct from 'object' or jsonb_typeof(v->'id') is distinct from 'string'
        or jsonb_typeof(v->'title') is distinct from 'string' or length(v->>'id') not between 1 and 200
        or length(v->>'title') not between 1 and 20 then return false; end if;
    end loop;
  end if;
  if p_reply ? 'list' then
    if jsonb_typeof(p_reply->'list') is distinct from 'array' then return false;end if;
    if jsonb_array_length(p_reply->'list') not between 1 and 10 then return false;end if;
    for section in select value from jsonb_array_elements(p_reply->'list') loop
      if jsonb_typeof(section) is distinct from 'object' or jsonb_typeof(section->'title') is distinct from 'string'
        or length(section->>'title') not between 1 and 24 or jsonb_typeof(section->'rows') is distinct from 'array' then return false;end if;
      if jsonb_array_length(section->'rows') not between 1 and 10 then return false;end if;
      n:=n+jsonb_array_length(section->'rows');
      for v in select value from jsonb_array_elements(section->'rows') loop
        if jsonb_typeof(v) is distinct from 'object' or jsonb_typeof(v->'id') is distinct from 'string'
          or jsonb_typeof(v->'title') is distinct from 'string' or length(v->>'id') not between 1 and 200
          or length(v->>'title') not between 1 and 24 or length(coalesce(v->>'description',''))>72 then return false;end if;
      end loop;
    end loop;
    if n>10 then return false;end if;
  end if;
  return true;
end $$;

-- Opt-out is a narrow deterministic admission rule, including while staff own
-- the thread or normal ordering admission is rate limited. It never mutates an
-- order/payment. Older unapplied automation is dismissed so an old consent
-- answer or an in-flight draft cannot silently turn updates back on.
create function mealdeck_private.whatsapp_apply_opt_out(p_session uuid,p_text text)
returns boolean language plpgsql security definer set search_path='' as $$
declare s mealdeck_private.whatsapp_sessions%rowtype;v_text text:=lower(btrim(coalesce(p_text,''),E' \t\r\n'));
  stop_orders boolean;stop_marketing boolean;d jsonb;
begin
  stop_orders:=v_text in ('stop','unsubscribe','stop all','stop messages','stop updates','updates off');
  stop_marketing:=v_text in ('stop','unsubscribe','stop all','stop messages','stop offers','offers off');
  if not stop_orders and not stop_marketing then return false;end if;
  select * into s from mealdeck_private.whatsapp_sessions where id=p_session for update;
  if s.id is null then return false;end if;
  d:=s.draft;
  if d<>'{}'::jsonb then
    if stop_orders then d:=jsonb_set(d,'{orderUpdatesConsent}','false'::jsonb);end if;
    if stop_marketing then d:=jsonb_set(d,'{marketingConsent}','false'::jsonb);end if;
    d:=jsonb_set(d,'{revision}',to_jsonb(s.revision+1));
  end if;
  update mealdeck_private.whatsapp_sessions set draft=d,revision=revision+1,lease_id=null,lease_expires_at=null,updated_at=now() where id=s.id;
  update mealdeck_private.whatsapp_handoffs set draft_revision=s.revision+1 where session_id=s.id and quote_id is null and revoked_at is null;
  update mealdeck_private.whatsapp_inbound set status='dismissed',lease_id=null,lease_expires_at=null,completed_at=now()
    where session_id=s.id and status in ('queued','processing');
  if stop_orders then
    update mealdeck_private.whatsapp_outbox set status='cancelled',hold_reason='order_updates_stopped' where session_id=s.id and status='queued'
      and (status_order_id is not null or transition_key like 'event:%');
  end if;
  return true;
end $$;

create function public.mealdeck_whatsapp_enqueue(p_tenant uuid,p_location uuid,p_phone_id text,
  p_provider_message_id text,p_sender_id text,p_input jsonb,p_received_at timestamptz)
returns jsonb language plpgsql security definer set search_path='' as $$
declare s mealdeck_private.whatsapp_sessions%rowtype;e mealdeck_private.whatsapp_inbound%rowtype;opted_out boolean:=false;
begin
  perform mealdeck_private.whatsapp_assert_scope(p_tenant,p_location,p_phone_id);
  if p_sender_id is null or length(p_sender_id) not between 1 and 256 or p_sender_id ~ '[[:cntrl:][:space:]]'
    or p_provider_message_id is null or length(p_provider_message_id) not between 1 and 512 or p_provider_message_id ~ '[[:cntrl:]]'
    or jsonb_typeof(p_input) is distinct from 'object' or octet_length(p_input::text)>16384
    or p_received_at is null or p_received_at>now()+interval '1 minute' or p_received_at<now()-interval '7 days' then
    raise exception 'mealdeck_whatsapp_event_invalid'; end if;
  -- Serialises short admission checks only. Processing occurs outside this lock.
  perform pg_advisory_xact_lock(hashtextextended('whatsapp-admission:'||p_tenant::text||':'||p_location::text||':'||p_phone_id,0));
  select * into e from mealdeck_private.whatsapp_inbound where tenant_id=p_tenant and location_id=p_location
    and phone_id=p_phone_id and provider_message_id=p_provider_message_id;
  if found then
    if not exists(select 1 from mealdeck_private.whatsapp_sessions where id=e.session_id and sender_id=p_sender_id)
      or e.input_hash<>encode(sha256(convert_to(p_input::text,'UTF8')),'hex') then raise exception 'mealdeck_whatsapp_event_conflict'; end if;
    return jsonb_build_object('accepted',true,'duplicate',true,'eventId',e.id);
  end if;
  select * into s from mealdeck_private.whatsapp_sessions where tenant_id=p_tenant and location_id=p_location
    and phone_id=p_phone_id and sender_id=p_sender_id for update;
  if found then opted_out:=mealdeck_private.whatsapp_apply_opt_out(s.id,p_input->>'text');end if;
  if (select count(*) from mealdeck_private.whatsapp_inbound where tenant_id=p_tenant and location_id=p_location and phone_id=p_phone_id
    and status in ('queued','processing'))>=1000 then
    if opted_out then
      insert into mealdeck_private.whatsapp_inbound(session_id,tenant_id,location_id,phone_id,provider_message_id,input,input_hash,received_at,status,completed_at)
        values(s.id,p_tenant,p_location,p_phone_id,p_provider_message_id,p_input,encode(sha256(convert_to(p_input::text,'UTF8')),'hex'),p_received_at,'processed',now());
    end if;
    return jsonb_build_object('accepted',false,'reason','queue_full','optOutApplied',opted_out);
  end if;
  if s.id is null then
    if (select count(*) from mealdeck_private.whatsapp_sessions where tenant_id=p_tenant and location_id=p_location
      and phone_id=p_phone_id and created_at>now()-interval '1 hour')>=500 then
      return jsonb_build_object('accepted',false,'reason','rate_limited'); end if;
    insert into mealdeck_private.whatsapp_sessions(tenant_id,location_id,phone_id,sender_id,last_inbound_at)
      values(p_tenant,p_location,p_phone_id,p_sender_id,least(p_received_at,now())) returning * into s;
  end if;
  if (select count(*) from mealdeck_private.whatsapp_inbound where session_id=s.id and created_at>now()-interval '1 minute')>=20
    or (select count(*) from mealdeck_private.whatsapp_inbound where session_id=s.id and created_at>now()-interval '24 hours')>=200 then
    if opted_out then
      insert into mealdeck_private.whatsapp_inbound(session_id,tenant_id,location_id,phone_id,provider_message_id,input,input_hash,received_at,status,completed_at)
        values(s.id,p_tenant,p_location,p_phone_id,p_provider_message_id,p_input,
          encode(sha256(convert_to(p_input::text,'UTF8')),'hex'),p_received_at,'processed',now());
    end if;
    return jsonb_build_object('accepted',false,'reason','rate_limited','optOutApplied',opted_out);
  end if;
  update mealdeck_private.whatsapp_sessions set last_inbound_at=greatest(last_inbound_at,least(p_received_at,now())),updated_at=now() where id=s.id;
  insert into mealdeck_private.whatsapp_inbound(session_id,tenant_id,location_id,phone_id,provider_message_id,input,input_hash,received_at)
    values(s.id,p_tenant,p_location,p_phone_id,p_provider_message_id,p_input,encode(sha256(convert_to(p_input::text,'UTF8')),'hex'),p_received_at) returning * into e;
  return jsonb_build_object('accepted',true,'duplicate',false,'eventId',e.id);
end $$;

create function public.mealdeck_whatsapp_claim_inbound(p_tenant uuid,p_location uuid,p_phone_id text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare s mealdeck_private.whatsapp_sessions%rowtype;e mealdeck_private.whatsapp_inbound%rowtype;l uuid:=gen_random_uuid();
begin
  perform mealdeck_private.whatsapp_assert_scope(p_tenant,p_location,p_phone_id);
  select * into s from mealdeck_private.whatsapp_sessions s0 where s0.tenant_id=p_tenant and s0.location_id=p_location and s0.phone_id=p_phone_id
    and s0.mode='ai' and (s0.lease_id is null or s0.lease_expires_at<=now()) and exists(
      select 1 from mealdeck_private.whatsapp_inbound e0 where e0.session_id=s0.id
      and ((e0.status='queued' and e0.available_at<=now()) or (e0.status='processing' and e0.lease_expires_at<=now())))
    order by s0.updated_at,s0.id for update of s0 skip locked limit 1;
  if not found then return null; end if;
  select * into e from mealdeck_private.whatsapp_inbound where session_id=s.id and status in ('queued','processing')
    order by created_at,id for update limit 1;
  if e.available_at>now() or (e.status='processing' and e.lease_expires_at>now()) then return null; end if;
  if e.attempts>=5 then
    update mealdeck_private.whatsapp_inbound set status='held',lease_id=null,lease_expires_at=null where id=e.id;
    update mealdeck_private.whatsapp_sessions set mode='support',support_reason='processing_failed',lease_id=null,lease_expires_at=null,updated_at=now() where id=s.id;
    return null;
  end if;
  -- Unbound expired drafts may be cleared; prepared or quoted payment recovery is retained.
  if s.draft_expires_at<=now() and not exists(select 1 from mealdeck_private.whatsapp_handoffs where session_id=s.id and quote_id is not null) then
    update mealdeck_private.whatsapp_handoffs set revoked_at=now() where session_id=s.id and revoked_at is null and quote_id is null;
    s.draft:='{}';s.revision:=s.revision+1;
  end if;
  update mealdeck_private.whatsapp_sessions set lease_id=l,lease_expires_at=now()+interval '90 seconds',
    draft=s.draft,revision=s.revision,draft_expires_at=now()+interval '24 hours',updated_at=now() where id=s.id;
  update mealdeck_private.whatsapp_inbound set status='processing',attempts=attempts+1,lease_id=l,
    lease_expires_at=now()+interval '90 seconds' where id=e.id;
  return jsonb_build_object('eventId',e.id,'leaseId',l,'sessionId',s.id,'senderId',s.sender_id,
    'receivedAt',e.received_at,'input',e.input,'draft',s.draft,'revision',s.revision,
    'canStartNewOrder',mealdeck_private.whatsapp_can_start_new(s.id),'orderBinding',mealdeck_private.whatsapp_order_card(s.id));
end $$;

create function public.mealdeck_whatsapp_finish_inbound(p_tenant uuid,p_location uuid,p_phone_id text,
  p_event uuid,p_lease uuid,p_revision bigint,p_draft jsonb,p_replies jsonb,p_token_hash text default null)
returns jsonb language plpgsql security definer set search_path='' as $$
declare s mealdeck_private.whatsapp_sessions%rowtype;e mealdeck_private.whatsapp_inbound%rowtype;
  h mealdeck_private.whatsapp_handoffs%rowtype;r jsonb;n integer:=0;selection_changed boolean;reset_safe boolean:=false;old_q mealdeck_private.checkout_quotes%rowtype;
begin
  perform mealdeck_private.whatsapp_assert_scope(p_tenant,p_location,p_phone_id);
  select * into e from mealdeck_private.whatsapp_inbound where id=p_event and tenant_id=p_tenant and location_id=p_location and phone_id=p_phone_id;
  if e.id is null then raise exception 'mealdeck_whatsapp_lease_stale'; end if;
  select * into s from mealdeck_private.whatsapp_sessions where id=e.session_id for update;
  select * into e from mealdeck_private.whatsapp_inbound where id=p_event for update;
  if e.status='processed' and e.lease_id=p_lease then return jsonb_build_object('applied',false,'duplicate',true,'revision',e.applied_revision); end if;
  if e.status<>'processing' or e.lease_id is distinct from p_lease or s.lease_id is distinct from p_lease
    or e.lease_expires_at<=now() or s.revision<>p_revision or s.mode<>'ai' then raise exception 'mealdeck_whatsapp_lease_stale'; end if;
  if jsonb_typeof(p_draft) is distinct from 'object' or octet_length(p_draft::text)>131072
    or jsonb_typeof(p_replies) is distinct from 'array' then raise exception 'mealdeck_whatsapp_result_invalid'; end if;
  if jsonb_array_length(p_replies)>20 then raise exception 'mealdeck_whatsapp_result_invalid'; end if;
  for r in select value from jsonb_array_elements(p_replies) loop
    if not mealdeck_private.whatsapp_valid_reply(r) then raise exception 'mealdeck_whatsapp_reply_invalid'; end if;
  end loop;
  if (select count(*) from mealdeck_private.whatsapp_outbox where tenant_id=p_tenant and location_id=p_location and phone_id=p_phone_id and status in ('queued','sending'))
    +jsonb_array_length(p_replies)>5000 then raise exception 'mealdeck_whatsapp_outbox_full'; end if;
  selection_changed:=mealdeck_private.whatsapp_selection(p_draft) is distinct from mealdeck_private.whatsapp_selection(s.draft);
  select * into h from mealdeck_private.whatsapp_handoffs where session_id=s.id and quote_id is not null and revoked_at is null
    and (order_id is null or order_id=s.current_order_id) order by created_at desc limit 1 for update;
  if h.id is not null then
    if p_draft->'checkoutLocked'='false'::jsonb then
      reset_safe:=mealdeck_private.whatsapp_order_terminal(h.order_id);
      if h.order_id is null then
        select * into old_q from mealdeck_private.checkout_quotes where id=h.quote_id for update;
        reset_safe:=not exists(select 1 from mealdeck_private.stripe_orders where quote_id=h.quote_id);
        if reset_safe then
          update mealdeck_private.checkout_quotes set expires_at=least(expires_at,now()) where id=old_q.id;
          update mealdeck_private.whatsapp_handoffs set revoked_at=now() where id=h.id;
        end if;
      end if;
    end if;
    if not reset_safe and (mealdeck_private.whatsapp_selection(p_draft) is distinct from mealdeck_private.whatsapp_selection(h.frozen_draft)
      or p_token_hash is not null or p_draft->'checkoutLocked'='false'::jsonb) then raise exception 'mealdeck_whatsapp_checkout_locked';end if;
    if reset_safe then
      update mealdeck_private.whatsapp_sessions set current_order_id=null,arrived_at=null where id=s.id;
      h:=null;
    end if;
  end if;
  if p_token_hash is not null and (p_token_hash !~ '^[a-f0-9]{64}$' or h.id is not null) then raise exception 'mealdeck_whatsapp_handoff_invalid'; end if;
  if selection_changed or p_token_hash is not null then
    update mealdeck_private.whatsapp_handoffs set revoked_at=now() where session_id=s.id and quote_id is null and revoked_at is null;
  else
    update mealdeck_private.whatsapp_handoffs set draft_revision=s.revision+1 where session_id=s.id and quote_id is null and revoked_at is null;
  end if;
  update mealdeck_private.whatsapp_sessions set draft=jsonb_set(p_draft,'{revision}',to_jsonb(revision+1)),revision=revision+1,draft_expires_at=now()+interval '24 hours',
    mode=case when nullif(p_draft->>'handoffReason','') is not null then 'support' else mode end,
    support_reason=left(nullif(p_draft->>'handoffReason',''),300),lease_id=null,lease_expires_at=null,updated_at=now() where id=s.id returning * into s;
  if p_token_hash is not null then
    insert into mealdeck_private.whatsapp_handoffs(session_id,tenant_id,location_id,phone_id,token_hash,draft_revision,frozen_draft)
      values(s.id,p_tenant,p_location,p_phone_id,p_token_hash,s.revision,s.draft) returning * into h;
  end if;
  for r in select value from jsonb_array_elements(p_replies) loop
    n:=n+1;
    insert into mealdeck_private.whatsapp_outbox(session_id,tenant_id,location_id,phone_id,transition_key,reply)
      values(s.id,p_tenant,p_location,p_phone_id,'event:'||e.id::text||':'||n::text,r) on conflict(session_id,transition_key) do nothing;
  end loop;
  update mealdeck_private.whatsapp_inbound set status='processed',completed_at=now(),applied_revision=s.revision,lease_expires_at=null where id=e.id;
  if s.mode<>'ai' then perform mealdeck_private.whatsapp_pause_unprepared(s.id);end if;
  if p_draft->'orderUpdatesConsent' is distinct from 'true'::jsonb then
    update mealdeck_private.whatsapp_outbox set status='cancelled',hold_reason='order_updates_stopped'
      where session_id=s.id and status='queued' and status_order_id is not null;
  end if;
  return jsonb_build_object('applied',true,'revision',s.revision,'handoffId',case when p_token_hash is not null then h.id else null end);
end $$;

create function public.mealdeck_whatsapp_fail_inbound(p_tenant uuid,p_location uuid,p_phone_id text,p_event uuid,p_lease uuid,p_retryable boolean)
returns boolean language plpgsql security definer set search_path='' as $$
declare e mealdeck_private.whatsapp_inbound%rowtype;s mealdeck_private.whatsapp_sessions%rowtype;
begin
  perform mealdeck_private.whatsapp_assert_scope(p_tenant,p_location,p_phone_id);
  select * into e from mealdeck_private.whatsapp_inbound where id=p_event and tenant_id=p_tenant and location_id=p_location and phone_id=p_phone_id;
  if e.id is null then return false; end if;
  select * into s from mealdeck_private.whatsapp_sessions where id=e.session_id for update;
  select * into e from mealdeck_private.whatsapp_inbound where id=p_event for update;
  if e.status<>'processing' or e.lease_id is distinct from p_lease or s.lease_id is distinct from p_lease then return false; end if;
  update mealdeck_private.whatsapp_inbound set status=case when p_retryable and attempts<5 then 'queued' else 'held' end,
    available_at=now()+make_interval(secs=>least(60,5*e.attempts)),lease_id=null,lease_expires_at=null where id=e.id;
  update mealdeck_private.whatsapp_sessions set lease_id=null,lease_expires_at=null,updated_at=now(),
    mode=case when p_retryable and e.attempts<5 then mode else 'support' end,
    support_reason=case when p_retryable and e.attempts<5 then support_reason else 'processing_failed' end where id=s.id;
  return true;
end $$;

create function public.mealdeck_whatsapp_claim_outbox(p_tenant uuid,p_location uuid,p_phone_id text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare s mealdeck_private.whatsapp_sessions%rowtype;o mealdeck_private.whatsapp_outbox%rowtype;l uuid:=gen_random_uuid();
begin
  perform mealdeck_private.whatsapp_assert_scope(p_tenant,p_location,p_phone_id);
  -- An expired send lease may mean Meta accepted the message. Never retry it.
  update mealdeck_private.whatsapp_outbox set status='held',hold_reason='send_outcome_unknown',lease_expires_at=null
    where tenant_id=p_tenant and location_id=p_location and phone_id=p_phone_id and status='sending' and lease_expires_at<=now();
  select * into s from mealdeck_private.whatsapp_sessions s0 where s0.tenant_id=p_tenant and s0.location_id=p_location and s0.phone_id=p_phone_id
    and exists(select 1 from mealdeck_private.whatsapp_outbox x where x.session_id=s0.id and x.status='queued' and x.available_at<=now())
    and not exists(select 1 from mealdeck_private.whatsapp_outbox x where x.session_id=s0.id and x.status='sending')
    order by s0.updated_at,s0.id for update of s0 skip locked limit 1;
  if not found then return null; end if;
  select * into o from mealdeck_private.whatsapp_outbox where session_id=s.id and status='queued' order by sequence for update limit 1;
  if o.available_at>now() then return null; end if;
  if s.last_inbound_at<=now()-interval '24 hours' then
    update mealdeck_private.whatsapp_outbox set status='held',hold_reason='customer_service_window_closed' where session_id=s.id and status='queued';
    return null;
  end if;
  if o.status_order_id is not null and ((mealdeck_private.whatsapp_order_card(s.id)->>'status') is distinct from o.status_key
      or s.draft->'orderUpdatesConsent' is distinct from 'true'::jsonb) then
    update mealdeck_private.whatsapp_outbox set status='cancelled',hold_reason='status_superseded' where id=o.id;return null;
  end if;
  if o.attempts>=5 then update mealdeck_private.whatsapp_outbox set status='held',hold_reason='send_rejected_repeatedly' where id=o.id;return null;end if;
  update mealdeck_private.whatsapp_outbox set status='sending',attempts=attempts+1,lease_id=l,lease_expires_at=now()+interval '60 seconds' where id=o.id;
  return jsonb_build_object('id',o.id,'leaseId',l,'senderId',s.sender_id,'reply',o.reply,
    'lastInboundAt',s.last_inbound_at,'windowExpiresAt',s.last_inbound_at+interval '24 hours');
end $$;

create function public.mealdeck_whatsapp_finish_outbox(p_tenant uuid,p_location uuid,p_phone_id text,p_id uuid,p_lease uuid,
  p_outcome text,p_provider_message_id text default null)
returns boolean language plpgsql security definer set search_path='' as $$
declare o mealdeck_private.whatsapp_outbox%rowtype;
begin
  perform mealdeck_private.whatsapp_assert_scope(p_tenant,p_location,p_phone_id);
  if p_outcome is null or p_outcome not in ('sent','retry','uncertain')
    or (p_outcome='sent' and (p_provider_message_id is null or length(p_provider_message_id) not between 1 and 512)) then
    raise exception 'mealdeck_whatsapp_send_result_invalid';end if;
  select * into o from mealdeck_private.whatsapp_outbox where id=p_id and tenant_id=p_tenant and location_id=p_location and phone_id=p_phone_id for update;
  if o.id is null or o.lease_id is distinct from p_lease then return false; end if;
  if o.status='sent' and p_outcome='sent' and o.provider_message_id=p_provider_message_id then return true;end if;
  if o.status<>'sending' then return false;end if;
  update mealdeck_private.whatsapp_outbox set status=case when p_outcome='sent' then 'sent' when p_outcome='retry' and attempts<5 then 'queued' else 'held' end,
    provider_message_id=case when p_outcome='sent' then p_provider_message_id else null end,
    sent_at=case when p_outcome='sent' then now() else null end,
    hold_reason=case when p_outcome='uncertain' then 'send_outcome_unknown' when p_outcome='retry' and attempts>=5 then 'send_rejected_repeatedly' else null end,
    available_at=now()+make_interval(secs=>least(300,15*o.attempts)),lease_expires_at=null where id=o.id;
  return true;
end $$;

create function public.mealdeck_whatsapp_exchange_handoff(p_tenant uuid,p_location uuid,p_phone_id text,
  p_token_hash text,p_claim_hash text,p_existing_claim_hash text default null)
returns jsonb language plpgsql security definer set search_path='' as $$
declare h mealdeck_private.whatsapp_handoffs%rowtype;s mealdeck_private.whatsapp_sessions%rowtype;
begin
  perform mealdeck_private.whatsapp_assert_scope(p_tenant,p_location,p_phone_id);
  if p_token_hash is null or p_token_hash !~ '^[a-f0-9]{64}$' or p_claim_hash is null or p_claim_hash !~ '^[a-f0-9]{64}$' then
    raise exception 'mealdeck_whatsapp_handoff_unavailable';end if;
  select * into h from mealdeck_private.whatsapp_handoffs where token_hash=p_token_hash and tenant_id=p_tenant and location_id=p_location and phone_id=p_phone_id;
  if h.id is null then raise exception 'mealdeck_whatsapp_handoff_unavailable';end if;
  select * into s from mealdeck_private.whatsapp_sessions where id=h.session_id for update;
  select * into h from mealdeck_private.whatsapp_handoffs where id=h.id for update;
  if h.revoked_at is not null or (h.quote_id is null and (h.expires_at<=now() or h.draft_revision<>s.revision)) then
    raise exception 'mealdeck_whatsapp_handoff_unavailable';end if;
  if h.claim_hash is not null then
    if p_existing_claim_hash is null or h.claim_hash<>p_existing_claim_hash then raise exception 'mealdeck_whatsapp_handoff_consumed';end if;
    return mealdeck_private.whatsapp_handoff_card(h)||jsonb_build_object('resumed',true);
  end if;
  update mealdeck_private.whatsapp_handoffs set claim_hash=p_claim_hash,claimed_at=now() where id=h.id returning * into h;
  return mealdeck_private.whatsapp_handoff_card(h)||jsonb_build_object('resumed',false);
end $$;

create function public.mealdeck_whatsapp_read_handoff(p_tenant uuid,p_location uuid,p_phone_id text,p_claim_hash text)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare h mealdeck_private.whatsapp_handoffs%rowtype;
begin
  perform mealdeck_private.whatsapp_assert_scope(p_tenant,p_location,p_phone_id);
  select h0.* into h from mealdeck_private.whatsapp_handoffs h0 join mealdeck_private.whatsapp_sessions s on s.id=h0.session_id
    where h0.claim_hash=p_claim_hash and h0.tenant_id=p_tenant and h0.location_id=p_location and h0.phone_id=p_phone_id
      and h0.revoked_at is null and (h0.quote_id is not null or (h0.expires_at>now() and h0.draft_revision=s.revision));
  if h.id is null then raise exception 'mealdeck_whatsapp_handoff_unavailable';end if;
  return mealdeck_private.whatsapp_handoff_card(h);
end $$;

create function public.mealdeck_whatsapp_register_quote(p_tenant uuid,p_location uuid,p_phone_id text,p_claim_hash text,
  p_quote uuid,p_request_hash text,p_customer uuid default null,p_guest_token_hash text default null)
returns jsonb language plpgsql security definer set search_path='' as $$
declare h mealdeck_private.whatsapp_handoffs%rowtype;s mealdeck_private.whatsapp_sessions%rowtype;
  q mealdeck_private.checkout_quotes%rowtype;old_q mealdeck_private.checkout_quotes%rowtype;g uuid;
begin
  perform mealdeck_private.whatsapp_assert_scope(p_tenant,p_location,p_phone_id);
  if num_nonnulls(p_customer,p_guest_token_hash)<>1 or p_request_hash is null or p_request_hash !~ '^[a-f0-9]{64}$' then
    raise exception 'mealdeck_whatsapp_actor_invalid';end if;
  if p_guest_token_hash is not null then
    select id into g from mealdeck_private.guest_session_authority(p_tenant,p_location,p_guest_token_hash);
    if g is null then raise exception 'mealdeck_whatsapp_actor_invalid';end if;
  end if;
  select * into h from mealdeck_private.whatsapp_handoffs where claim_hash=p_claim_hash and tenant_id=p_tenant and location_id=p_location and phone_id=p_phone_id;
  if h.id is null then raise exception 'mealdeck_whatsapp_handoff_unavailable';end if;
  select * into s from mealdeck_private.whatsapp_sessions where id=h.session_id for update;
  select * into h from mealdeck_private.whatsapp_handoffs where id=h.id for update;
  if s.mode<>'ai' then raise exception 'mealdeck_whatsapp_paused';end if;
  if h.revoked_at is not null or (h.quote_id is null and (h.expires_at<=now() or h.draft_revision<>s.revision))
    or (h.quote_id is not null and (h.customer_id is distinct from p_customer or h.guest_id is distinct from g or h.request_hash<>p_request_hash)) then
    raise exception 'mealdeck_whatsapp_checkout_locked';end if;
  if h.quote_id is not null and h.quote_id<>p_quote then
    select * into old_q from mealdeck_private.checkout_quotes where id=h.quote_id for update;
    if h.order_id is not null or exists(select 1 from mealdeck_private.stripe_orders where quote_id=h.quote_id) then
      raise exception 'mealdeck_whatsapp_checkout_locked';end if;
  end if;
  select * into q from mealdeck_private.checkout_quotes where id=p_quote and tenant_id=p_tenant and location_id=p_location
    and customer_id is not distinct from p_customer and guest_id is not distinct from g and request_hash=p_request_hash for update;
  if q.id is null or (h.quote_id is null and q.expires_at<=now()) then raise exception 'mealdeck_whatsapp_quote_invalid';end if;
  if old_q.id is not null then
    if q.expires_at<=now() then raise exception 'mealdeck_whatsapp_quote_invalid';end if;
    -- A prepare already holding this quote lock has completed before the check
    -- above; a prepare waiting behind us must now reject the superseded quote.
    update mealdeck_private.checkout_quotes set expires_at=least(expires_at,now()) where id=old_q.id;
  end if;
  update mealdeck_private.whatsapp_handoffs set quote_id=q.id,request_hash=q.request_hash,customer_id=p_customer,guest_id=g where id=h.id returning * into h;
  update mealdeck_private.whatsapp_sessions set draft=jsonb_set(draft,'{checkoutLocked}','true'::jsonb),updated_at=now() where id=s.id;
  return mealdeck_private.whatsapp_handoff_card(h);
end $$;

create function public.mealdeck_whatsapp_bind_order(p_tenant uuid,p_location uuid,p_phone_id text,p_claim_hash text,
  p_quote uuid,p_attempt uuid,p_order uuid,p_customer uuid default null,p_guest_token_hash text default null)
returns jsonb language plpgsql security definer set search_path='' as $$
declare h mealdeck_private.whatsapp_handoffs%rowtype;s mealdeck_private.whatsapp_sessions%rowtype;g uuid;
begin
  perform mealdeck_private.whatsapp_assert_scope(p_tenant,p_location,p_phone_id);
  if num_nonnulls(p_customer,p_guest_token_hash)<>1 then raise exception 'mealdeck_whatsapp_actor_invalid';end if;
  if p_guest_token_hash is not null then
    select id into g from mealdeck_private.guest_session_authority(p_tenant,p_location,p_guest_token_hash);
    if g is null then raise exception 'mealdeck_whatsapp_actor_invalid';end if;
  end if;
  select * into h from mealdeck_private.whatsapp_handoffs where claim_hash=p_claim_hash and tenant_id=p_tenant and location_id=p_location and phone_id=p_phone_id;
  if h.id is null then raise exception 'mealdeck_whatsapp_handoff_unavailable';end if;
  select * into s from mealdeck_private.whatsapp_sessions where id=h.session_id for update;
  select * into h from mealdeck_private.whatsapp_handoffs where id=h.id for update;
  if s.mode<>'ai' and h.order_id is null then raise exception 'mealdeck_whatsapp_paused';end if;
  if h.revoked_at is not null or h.quote_id is distinct from p_quote or h.customer_id is distinct from p_customer
    or h.guest_id is distinct from g or (h.order_id is not null and h.order_id<>p_order)
    or not exists(select 1 from mealdeck_private.stripe_orders so join mealdeck_private.checkout_quotes q on q.id=so.quote_id
      join public.orders o on o.id=so.order_id where so.order_id=p_order and so.quote_id=h.quote_id and so.attempt_id=p_attempt
      and so.customer_id is not distinct from h.customer_id and so.guest_id is not distinct from h.guest_id
      and q.tenant_id=p_tenant and q.location_id=p_location and q.request_hash=h.request_hash
      and o.tenant_id=p_tenant and o.location_id=p_location and o.source='mealdeck') then
    raise exception 'mealdeck_whatsapp_order_invalid';end if;
  update mealdeck_private.whatsapp_handoffs set order_id=p_order where id=h.id returning * into h;
  update mealdeck_private.whatsapp_sessions set current_order_id=p_order,arrived_at=case when current_order_id=p_order then arrived_at else null end,
    updated_at=now() where id=s.id;
  return mealdeck_private.whatsapp_handoff_card(h);
end $$;

create function public.mealdeck_whatsapp_mark_arrived(p_tenant uuid,p_location uuid,p_phone_id text,p_session uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare s mealdeck_private.whatsapp_sessions%rowtype;c jsonb;
begin
  perform mealdeck_private.whatsapp_assert_scope(p_tenant,p_location,p_phone_id);
  select * into s from mealdeck_private.whatsapp_sessions where id=p_session and tenant_id=p_tenant and location_id=p_location and phone_id=p_phone_id for update;
  c:=mealdeck_private.whatsapp_order_card(s.id);
  if c is null or c->>'fulfilment'<>'curbside' or c->'verifiedPaid' is distinct from 'true'::jsonb
    or c->>'status' not in ('paid','accepted','ready') then raise exception 'mealdeck_whatsapp_arrival_unavailable';end if;
  update mealdeck_private.whatsapp_sessions set arrived_at=coalesce(arrived_at,now()),updated_at=now() where id=s.id;
  return mealdeck_private.whatsapp_order_card(s.id);
end $$;

create function public.mealdeck_whatsapp_queue_status_notifications(p_tenant uuid,p_location uuid,p_phone_id text)
returns integer language plpgsql security definer set search_path='' as $$
declare s mealdeck_private.whatsapp_sessions%rowtype;c jsonb;message text;n integer:=0;inserted integer;
begin
  perform mealdeck_private.whatsapp_assert_scope(p_tenant,p_location,p_phone_id);
  for s in select * from mealdeck_private.whatsapp_sessions where tenant_id=p_tenant and location_id=p_location and phone_id=p_phone_id
    and current_order_id is not null and last_inbound_at>now()-interval '24 hours' and draft->'orderUpdatesConsent'='true'::jsonb
    and not exists(select 1 from mealdeck_private.whatsapp_outbox o where o.session_id=whatsapp_sessions.id
      and o.transition_key='order:'||whatsapp_sessions.current_order_id::text||':'||(mealdeck_private.whatsapp_order_card(whatsapp_sessions.id)->>'status'))
    order by updated_at limit 200 for update skip locked loop
    c:=mealdeck_private.whatsapp_order_card(s.id);
    message:=case c->>'status'
      when 'paid' then 'Payment confirmed. Your order is awaiting kitchen acceptance. We will update you here.'
      when 'accepted' then 'The kitchen has accepted your order. We will tell you when it is ready for collection.'
      when 'ready' then 'Your order is ready for collection. Your collection code is '||coalesce(c->>'handoffCode','available at checkout')||'.'
      when 'completed' then 'Your order has been handed over. Thank you for ordering with MealDeck.'
      when 'held' then 'Your order needs a team check. Please use the support option for help.' else null end;
    if message is not null then
      insert into mealdeck_private.whatsapp_outbox(session_id,tenant_id,location_id,phone_id,transition_key,reply,status_order_id,status_key)
        values(s.id,p_tenant,p_location,p_phone_id,'order:'||s.current_order_id::text||':'||(c->>'status'),jsonb_build_object('text',message),s.current_order_id,c->>'status')
        on conflict(session_id,transition_key) do nothing;
      get diagnostics inserted=row_count;n:=n+inserted;
    end if;
  end loop;
  return n;
end $$;

-- Staff see the current thread and its own linked order, never arbitrary receipts.
create function public.mealdeck_whatsapp_staff_inbox(p_tenant uuid,p_location uuid,p_phone_id text)
returns jsonb language plpgsql stable security definer set search_path='' as $$
begin
  perform mealdeck_ops_private.kds_assert_scope(p_tenant,p_location,'orders.read');
  perform mealdeck_private.whatsapp_assert_scope(p_tenant,p_location,p_phone_id);
  return coalesce((select jsonb_agg(card order by updated_at desc) from (
    select s.updated_at,jsonb_build_object('sessionId',s.id,'senderId',s.sender_id,'mode',s.mode,'supportReason',s.support_reason,
      'assignedTo',s.staff_id,'lastInboundAt',s.last_inbound_at,'draft',s.draft,'orderBinding',mealdeck_private.whatsapp_order_card(s.id),
      'recentMessages',coalesce((select jsonb_agg(jsonb_build_object('eventId',m.id,'input',m.input,'receivedAt',m.received_at,'status',m.status) order by m.created_at)
        from (select * from mealdeck_private.whatsapp_inbound where session_id=s.id order by created_at desc limit 12) m),'[]'::jsonb),
      'recentReplies',coalesce((select jsonb_agg(jsonb_build_object('id',m.id,'requestId',case when m.transition_key like 'staff:%' then split_part(m.transition_key,':',3) else null end,
        'status',m.status,'reply',m.reply-'sealedCheckoutLink','createdAt',m.created_at) order by m.sequence)
        from (select * from mealdeck_private.whatsapp_outbox where session_id=s.id order by sequence desc limit 12) m),'[]'::jsonb),
      'heldReplies',coalesce((select jsonb_agg(jsonb_build_object('id',m.id,'reason',m.hold_reason,'reply',m.reply-'sealedCheckoutLink') order by m.created_at)
        from (select * from mealdeck_private.whatsapp_outbox where session_id=s.id and status='held' order by created_at desc limit 6) m),'[]'::jsonb)) as card
    from mealdeck_private.whatsapp_sessions s where s.tenant_id=p_tenant and s.location_id=p_location and s.phone_id=p_phone_id
      and (s.mode<>'ai' or s.arrived_at is not null or exists(select 1 from mealdeck_private.whatsapp_outbox where session_id=s.id and status='held'))
    order by s.updated_at desc limit 100) entries),'[]'::jsonb);
end $$;

create function public.mealdeck_whatsapp_staff_control(p_tenant uuid,p_location uuid,p_phone_id text,p_session uuid,p_action text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare s mealdeck_private.whatsapp_sessions%rowtype;
begin
  perform mealdeck_ops_private.kds_assert_scope(p_tenant,p_location,'orders.status');
  perform mealdeck_private.whatsapp_assert_scope(p_tenant,p_location,p_phone_id);
  if p_action is null or p_action not in ('takeover','release') then raise exception 'mealdeck_whatsapp_staff_action_invalid';end if;
  select * into s from mealdeck_private.whatsapp_sessions where id=p_session and tenant_id=p_tenant and location_id=p_location and phone_id=p_phone_id for update;
  if s.id is null then raise exception 'mealdeck_whatsapp_session_unavailable';end if;
  if s.staff_id is not null and s.staff_id<>auth.uid() then raise exception 'mealdeck_ops_forbidden';end if;
  update mealdeck_private.whatsapp_sessions set mode=case when p_action='takeover' then 'staff' else 'ai' end,
    staff_id=case when p_action='takeover' then auth.uid() else null end,
    support_reason=case when p_action='release' then null else support_reason end,
    draft=jsonb_set(case when p_action='release' then jsonb_set(jsonb_set(draft,'{handoffReason}','null'::jsonb),'{stage}',
      case when draft->'checkoutLocked'='true'::jsonb then '"checkout"'::jsonb else '"fulfilment"'::jsonb end) else draft end,'{revision}',to_jsonb(revision+1)),
    revision=revision+1,lease_id=null,lease_expires_at=null,updated_at=now() where id=s.id;
  update mealdeck_private.whatsapp_handoffs set draft_revision=s.revision+1 where session_id=s.id and revoked_at is null and quote_id is null;
  if p_action='takeover' then perform mealdeck_private.whatsapp_pause_unprepared(s.id);end if;
  -- Human handling owns the received backlog. Releasing must not replay old orders.
  update mealdeck_private.whatsapp_inbound set status='dismissed',lease_id=null,lease_expires_at=null,completed_at=now()
    where session_id=s.id and status in ('queued','processing','held');
  update mealdeck_private.whatsapp_outbox set status='cancelled',hold_reason='staff_takeover'
    where session_id=s.id and status='queued' and status_order_id is null and transition_key not like 'staff:%';
  insert into mealdeck_private.whatsapp_staff_events(session_id,actor_id,action) values(s.id,auth.uid(),p_action);
  return jsonb_build_object('sessionId',s.id,'mode',case when p_action='takeover' then 'staff' else 'ai' end);
end $$;

-- Transport retention is deliberately separate from canonical order/receipt
-- retention: message bodies are redacted after seven days; unbound drafts after
-- 24h and handoffs after 15m. Terminal claimed snapshots expire after 30 days.
-- Any prepared payment without verified terminal evidence retains recovery.
create function public.mealdeck_whatsapp_cleanup(p_tenant uuid,p_location uuid,p_phone_id text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare h mealdeck_private.whatsapp_handoffs%rowtype;q mealdeck_private.checkout_quotes%rowtype;n integer;messages integer:=0;drafts integer:=0;handoffs integer:=0;
begin
  perform mealdeck_private.whatsapp_assert_scope(p_tenant,p_location,p_phone_id);
  update mealdeck_private.whatsapp_inbound set input='{"redacted":true}'::jsonb,
    status=case when status in ('queued','processing') then 'held' else status end,
    lease_id=case when status in ('queued','processing') then null else lease_id end,
    lease_expires_at=case when status in ('queued','processing') then null else lease_expires_at end
    where id in(select id from mealdeck_private.whatsapp_inbound where tenant_id=p_tenant and location_id=p_location and phone_id=p_phone_id
      and created_at<now()-interval '7 days' and input<>'{"redacted":true}'::jsonb limit 2000);
  get diagnostics messages=row_count;
  update mealdeck_private.whatsapp_outbox set reply='{"text":"Message removed after the retention period."}'::jsonb,
    status=case when status in ('queued','sending') then 'held' else status end,
    hold_reason=case when status in ('queued','sending') then 'retention_expired' else hold_reason end,
    lease_expires_at=null where id in(select id from mealdeck_private.whatsapp_outbox where tenant_id=p_tenant and location_id=p_location and phone_id=p_phone_id
      and created_at<now()-interval '7 days' and reply<>'{"text":"Message removed after the retention period."}'::jsonb limit 2000);
  get diagnostics n=row_count;messages:=messages+n;
  -- Lock session before handoff, matching finish/register/bind lock order.
  for h in select h0.* from mealdeck_private.whatsapp_handoffs h0 join mealdeck_private.whatsapp_sessions s on s.id=h0.session_id
    where h0.tenant_id=p_tenant and h0.location_id=p_location and h0.phone_id=p_phone_id and h0.revoked_at is null
      and ((h0.order_id is null and h0.expires_at<=now()) or (h0.created_at<now()-interval '30 days' and mealdeck_private.whatsapp_order_terminal(h0.order_id)))
    order by h0.created_at limit 200 for update of s skip locked loop
    select * into h from mealdeck_private.whatsapp_handoffs where id=h.id for update;
    if h.order_id is null and h.quote_id is not null then
      select * into q from mealdeck_private.checkout_quotes where id=h.quote_id for update;
      if q.expires_at>now() or exists(select 1 from mealdeck_private.stripe_orders where quote_id=h.quote_id) then continue;end if;
    end if;
    update mealdeck_private.whatsapp_handoffs set revoked_at=now(),frozen_draft='{}'::jsonb where id=h.id;
    handoffs:=handoffs+1;
  end loop;
  update mealdeck_private.whatsapp_handoffs set frozen_draft='{}'::jsonb where tenant_id=p_tenant and location_id=p_location and phone_id=p_phone_id
    and revoked_at is not null and order_id is null and (quote_id is null or not exists(select 1 from mealdeck_private.stripe_orders so where so.quote_id=whatsapp_handoffs.quote_id));
  update mealdeck_private.whatsapp_sessions s set draft='{}'::jsonb,revision=revision+1 where s.tenant_id=p_tenant and s.location_id=p_location and s.phone_id=p_phone_id
    and s.draft_expires_at<=now() and s.draft<>'{}'::jsonb and (s.lease_id is null or s.lease_expires_at<=now())
    and not exists(select 1 from mealdeck_private.whatsapp_handoffs h0 where h0.session_id=s.id and h0.quote_id is not null
      and h0.revoked_at is null and not mealdeck_private.whatsapp_order_terminal(h0.order_id));
  get diagnostics drafts=row_count;
  return jsonb_build_object('messageBodiesRedacted',messages,'draftsExpired',drafts,'handoffsExpired',handoffs);
end $$;

create function public.mealdeck_whatsapp_staff_reply(p_tenant uuid,p_location uuid,p_phone_id text,p_session uuid,p_text text,p_request_id uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare s mealdeck_private.whatsapp_sessions%rowtype;o mealdeck_private.whatsapp_outbox%rowtype;
begin
  perform mealdeck_ops_private.kds_assert_scope(p_tenant,p_location,'orders.status');
  perform mealdeck_private.whatsapp_assert_scope(p_tenant,p_location,p_phone_id);
  if p_request_id is null or p_text is null or not mealdeck_private.whatsapp_valid_reply(jsonb_build_object('text',p_text)) then
    raise exception 'mealdeck_whatsapp_reply_invalid';end if;
  select * into s from mealdeck_private.whatsapp_sessions where id=p_session and tenant_id=p_tenant and location_id=p_location and phone_id=p_phone_id for update;
  if s.id is null or s.mode<>'staff' or s.staff_id is distinct from auth.uid() then raise exception 'mealdeck_ops_forbidden';end if;
  if s.last_inbound_at<=now()-interval '24 hours' then raise exception 'mealdeck_whatsapp_window_closed';end if;
  select * into o from mealdeck_private.whatsapp_outbox where session_id=s.id and transition_key='staff:'||auth.uid()::text||':'||p_request_id::text;
  if o.id is not null then
    if o.reply is distinct from jsonb_build_object('text',p_text) then raise exception 'mealdeck_whatsapp_reply_conflict';end if;
    return jsonb_build_object('id',o.id,'status',o.status,'duplicate',true);
  end if;
  if (select count(*) from mealdeck_private.whatsapp_outbox where session_id=s.id and created_at>now()-interval '1 minute')>=20 then
    raise exception 'mealdeck_whatsapp_rate_limited';end if;
  insert into mealdeck_private.whatsapp_outbox(session_id,tenant_id,location_id,phone_id,transition_key,reply)
    values(s.id,p_tenant,p_location,p_phone_id,'staff:'||auth.uid()::text||':'||p_request_id::text,jsonb_build_object('text',p_text)) returning * into o;
  insert into mealdeck_private.whatsapp_staff_events(session_id,actor_id,action,request_id) values(s.id,auth.uid(),'reply',p_request_id);
  return jsonb_build_object('id',o.id,'status',o.status,'duplicate',false);
end $$;

-- Explicit grants override inherited defaults. No direct private table access,
-- no browser service-role credentials, and no customer-executable transport RPC.
do $grants$ declare r record;begin
  for r in select p.oid::regprocedure as signature from pg_proc p join pg_namespace n on n.oid=p.pronamespace
    where n.nspname='mealdeck_private' and p.proname like 'whatsapp_%' loop
    execute format('revoke all on function %s from public,anon,authenticated,service_role',r.signature);
  end loop;
  for r in select p.oid::regprocedure as signature,p.proname from pg_proc p join pg_namespace n on n.oid=p.pronamespace
    where n.nspname='public' and p.proname like 'mealdeck_whatsapp_%' and p.proname not like 'mealdeck_whatsapp_guest_%' loop
    execute format('revoke all on function %s from public,anon,authenticated,service_role',r.signature);
    if r.proname in ('mealdeck_whatsapp_staff_inbox','mealdeck_whatsapp_staff_control','mealdeck_whatsapp_staff_reply') then
      execute format('grant execute on function %s to authenticated',r.signature);
    else execute format('grant execute on function %s to service_role',r.signature);end if;
  end loop;
end $grants$;

commit;
