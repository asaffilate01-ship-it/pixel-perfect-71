-- MealDeck Phase 17/18 SOURCE-ONLY foundation for approved Dishbee staging.
-- This migration neither books providers nor exposes customer-facing access.
-- Server must validate canonical order/tenant/payment/KDS under row lock BEFORE use.
create table if not exists public.mealdeck_fulfilment_outbox (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id),
  location_id uuid not null references public.tenant_locations(id),
  order_id uuid not null,
  idempotency_key text not null unique check (length(idempotency_key) between 10 and 240),
  provider text not null check (provider in ('own_fleet','uber_direct','deliveroo_express','just_eat_go','stuart')),
  quote_id text not null check (length(quote_id) between 1 and 160),
  currency text not null check (currency ~ '^[A-Z]{3}$'),
  cost_pence bigint not null check (cost_pence >= 0),
  quote_expires_at timestamptz not null,
  -- Default blocked; no worker may act until an authorised server advances it.
  status text not null default 'blocked'
    check (status in ('blocked','ready','requesting','booked','failed','cancelled','delivered')),
  provider_booking_ref text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(tenant_id,location_id,order_id),
  unique(id,tenant_id,location_id,order_id)
);
create index if not exists mealdeck_fulfilment_outbox_status_idx
  on public.mealdeck_fulfilment_outbox(status,created_at);
alter table public.mealdeck_fulfilment_outbox enable row level security;
revoke all on public.mealdeck_fulfilment_outbox from public,anon,authenticated;

-- One verified event identity per tenant/provider, bound to an existing outbox.
create table if not exists public.mealdeck_fulfilment_provider_events (
  id uuid primary key default gen_random_uuid(),
  outbox_id uuid not null,
  tenant_id uuid not null,
  location_id uuid not null,
  order_id uuid not null,
  provider text not null check (provider in ('own_fleet','uber_direct','deliveroo_express','just_eat_go','stuart')),
  provider_event_id text not null check (length(provider_event_id) between 1 and 160),
  event_kind text not null check (event_kind in (
    'booking_confirmed','courier_assigned','collected','delivered','booking_failed','cancelled'
  )),
  occurred_at timestamptz not null,
  received_at timestamptz not null default now(),
  foreign key (outbox_id,tenant_id,location_id,order_id)
    references public.mealdeck_fulfilment_outbox(id,tenant_id,location_id,order_id),
  unique(tenant_id,provider,provider_event_id)
);
alter table public.mealdeck_fulfilment_provider_events enable row level security;
revoke all on public.mealdeck_fulfilment_provider_events from public,anon,authenticated;

-- HMAC only, no plaintext code or vehicle registration is stored.
-- Failed attempts require serialised, atomic increments in a reviewed backend.
create table if not exists public.mealdeck_handoff_proofs (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id),
  location_id uuid not null references public.tenant_locations(id),
  order_id uuid not null,
  mode text not null check (mode in ('pickup','kerbside','delivery')),
  proof_hmac text not null check (proof_hmac ~ '^[a-f0-9]{64}$'),
  failed_attempts integer not null default 0 check (failed_attempts between 0 and 5),
  expires_at timestamptz not null,
  verified_at timestamptz,
  created_at timestamptz not null default now(),
  unique(tenant_id,location_id,order_id,mode)
);
alter table public.mealdeck_handoff_proofs enable row level security;
revoke all on public.mealdeck_handoff_proofs from public,anon,authenticated;
-- Deliberately no anonymous/authenticated policies or grants.
