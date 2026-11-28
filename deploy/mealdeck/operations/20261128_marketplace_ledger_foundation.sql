-- Manual source candidate, not an automatic migration or commissioning instruction.
-- Port only the isolated ledger tables/indexes/ACLs from PR #126.
-- Deliberately no public RPC, worker, board replacement or direct-order write.
-- Permanent activation and command-dispatch locks for this foundation phase.
begin;
set local lock_timeout='5s';
do $guard$ begin
  if to_regnamespace('dishbee_private') is not null
     or to_regclass('mealdeck_private.installation') is null then
    raise exception 'mealdeck_marketplace_independent_profile_required';
  end if;
  if not exists(select 1 from mealdeck_private.installation where singleton and profile='mealdeck-independent-v1')
    or to_regprocedure('public.mealdeck_ops_kds_workflow_board(uuid,uuid)') is null then
    raise exception 'mealdeck_marketplace_previous_extensions_required';
  end if;
  if exists(select 1 from pg_class c join pg_namespace n on n.oid=c.relnamespace
     where n.nspname='mealdeck_private' and c.relname like 'marketplace_%') then
    raise exception 'mealdeck_marketplace_ledger_already_present';
  end if;
end $guard$;

create table mealdeck_private.marketplace_connectors(
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,location_id uuid not null,
  platform text not null check(platform in ('uber_eats','just_eat')),
  external_store_id text not null check(length(external_store_id) between 1 and 200),
  label text not null check(length(label) between 1 and 120),
  station_id uuid not null,brand_id uuid,
  token_hash text not null check(token_hash ~ '^[a-f0-9]{64}$'),
  profile_id text not null check(length(profile_id) between 1 and 120),
  profile_version text not null check(length(profile_version) between 1 and 80),
  capabilities jsonb not null,
  enabled boolean not null default false,
  constraint marketplace_foundation_disabled check (not enabled),
  commissioned_at timestamptz,commissioning_reference text,permission_reference text,
  last_seen_at timestamptz,health_status text not null default 'unconfigured'
    check(health_status in ('unconfigured','healthy','degraded')),
  health_error_code text check(health_error_code in (
    'ui_unavailable','identity_mismatch','profile_mismatch','session_required',
    'device_unavailable','observation_incomplete','command_uncertain','bridge_error')),
  created_at timestamptz not null default now(),
  unique(platform,external_store_id),unique(tenant_id,location_id,id),
  check(external_store_id=btrim(external_store_id)),
  foreign key(tenant_id,location_id) references public.tenant_locations(tenant_id,id),
  foreign key(tenant_id,location_id,station_id)
    references public.kitchen_stations(tenant_id,location_id,id),
  foreign key(tenant_id,brand_id) references public.tenant_brands(tenant_id,id),
  check(not enabled or (commissioned_at is not null and
    length(commissioning_reference) between 1 and 500 and length(permission_reference) between 1 and 500)),
  check(not (health_status='healthy' and health_error_code is not null)),
  check(jsonb_typeof(capabilities)='object' and
    capabilities ?& array['accept','preparing','ready','handover'] and
    capabilities-array['accept','preparing','ready','handover']='{}'::jsonb and
    jsonb_typeof(capabilities->'accept')='boolean' and
    jsonb_typeof(capabilities->'preparing')='boolean' and
    jsonb_typeof(capabilities->'ready')='boolean' and
    jsonb_typeof(capabilities->'handover')='boolean')
);

-- These are marketplace-owned orders, not direct MealDeck checkout orders.
-- The immutable observed snapshot records the platform's commercial terms.
-- It is never repriced with MealDeck offers or used to create a payment.
create table mealdeck_private.marketplace_orders(
  id uuid primary key default gen_random_uuid(),connector_id uuid not null,
  tenant_id uuid not null,location_id uuid not null,
  external_order_id text not null check(length(external_order_id) between 1 and 200),
  display_reference text not null check(length(display_reference) between 1 and 80),
  snapshot jsonb not null check(jsonb_typeof(snapshot)='object'),
  fulfilment text not null check(fulfilment in ('collection','platform_delivery','merchant_delivery')),
  currency text not null check(currency='GBP'),
  total_pence integer not null check(total_pence between 0 and 10000000),
  placed_at timestamptz not null,received_at timestamptz not null default now(),
  notes text check(length(notes)<=1000),
  platform_state text not null check(platform_state in ('new','accepted','preparing','ready','handed_over','cancelled')),
  observed_at timestamptz not null,
  hold_reason text check(hold_reason in ('snapshot_changed','state_regressed')),
  imported_after_handover boolean not null default false,
  accepted_at timestamptz,preparing_at timestamptz,ready_at timestamptz,
  packing_at timestamptz,sealed_at timestamptz,handed_over_at timestamptz,
  cancellation_acknowledged_at timestamptz,cancellation_acknowledged_by uuid references auth.users(id),
  revision bigint not null default 1 check(revision>0),
  unique(connector_id,external_order_id),unique(connector_id,id),
  check(external_order_id=btrim(external_order_id) and display_reference=btrim(display_reference)),
  check(placed_at<=observed_at),
  foreign key(tenant_id,location_id,connector_id)
    references mealdeck_private.marketplace_connectors(tenant_id,location_id,id),
  check(preparing_at is null or accepted_at is not null),
  check(ready_at is null or preparing_at is not null),
  check(packing_at is null or ready_at is not null),
  check(sealed_at is null or packing_at is not null),
  check(handed_over_at is null or sealed_at is not null)
);
create index marketplace_orders_board on mealdeck_private.marketplace_orders(tenant_id,location_id,received_at,id)
  where handed_over_at is null and not imported_after_handover and cancellation_acknowledged_at is null;
create index marketplace_orders_completed on mealdeck_private.marketplace_orders(tenant_id,location_id,handed_over_at desc)
  where handed_over_at is not null;

create table mealdeck_private.marketplace_order_items(
  id uuid primary key default gen_random_uuid(),order_id uuid not null,
  connector_id uuid not null,external_line_id text not null,
  position integer not null check(position between 1 and 200),
  name text not null check(length(name) between 1 and 300),
  quantity integer not null check(quantity between 1 and 999),
  unit_price_pence integer check(unit_price_pence between 0 and 10000000),
  modifiers jsonb not null check(jsonb_typeof(modifiers)='array' and jsonb_array_length(modifiers)<=100),
  notes text check(length(notes)<=1000),ready_at timestamptz,
  unique(order_id,external_line_id),unique(order_id,position),
  foreign key(connector_id,order_id) references mealdeck_private.marketplace_orders(connector_id,id)
);

-- Only changed observations are kept, avoiding a full snapshot per poll.
-- Conflicting snapshots remain private and hold the original ticket for review.
create table mealdeck_private.marketplace_observations(
  id uuid primary key default gen_random_uuid(),sequence bigint generated always as identity,connector_id uuid not null,
  order_id uuid not null,observed_at timestamptz not null,
  platform_state text not null,snapshot jsonb not null,
  profile_id text not null,profile_version text not null,
  received_at timestamptz not null default now(),
  foreign key(connector_id,order_id) references mealdeck_private.marketplace_orders(connector_id,id)
);
create index marketplace_observations_order on mealdeck_private.marketplace_observations(order_id,sequence desc);

create table mealdeck_private.marketplace_commands(
  id uuid primary key default gen_random_uuid(),sequence bigint generated always as identity,
  connector_id uuid not null,order_id uuid not null,
  action text not null check(action in ('accept','preparing','ready','handover')),
  status text not null check(status in ('queued','sending','confirmed','needs_checking','unsupported')),
  actor_id uuid not null references auth.users(id),created_at timestamptz not null default now(),
  lease_token uuid,lease_expires_at timestamptz,
  -- At most one execute claim. Any expired claim is reconciliation-only.
  execute_claimed_at timestamptz,reconcile_claimed_at timestamptz,
  confirmed_at timestamptz,result_outcome text,observed_state text,result_readback_at timestamptz,
  result_profile_id text,result_profile_version text,
  unique(order_id,action),
  constraint marketplace_foundation_no_dispatch check (status='queued' and lease_token is null and lease_expires_at is null and execute_claimed_at is null and reconcile_claimed_at is null and confirmed_at is null and result_outcome is null and observed_state is null and result_readback_at is null and result_profile_id is null and result_profile_version is null),
  foreign key(connector_id,order_id) references mealdeck_private.marketplace_orders(connector_id,id),
  check((lease_token is null)=(lease_expires_at is null))
);
create index marketplace_commands_work on mealdeck_private.marketplace_commands(connector_id,sequence)
  where status in ('queued','sending','needs_checking');

do $security$ declare t text; begin
  foreach t in array array['marketplace_connectors','marketplace_orders','marketplace_order_items',
    'marketplace_observations','marketplace_commands'] loop
    execute format('alter table mealdeck_private.%I enable row level security',t);
    execute format('revoke all on mealdeck_private.%I from public,anon,authenticated,service_role',t);
  end loop;
end $security$;
revoke all on sequence mealdeck_private.marketplace_commands_sequence_seq from public,anon,authenticated,service_role;
revoke all on sequence mealdeck_private.marketplace_observations_sequence_seq from public,anon,authenticated,service_role;

commit;
