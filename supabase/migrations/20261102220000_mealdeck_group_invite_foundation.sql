-- Phase 13: protected invitation storage. Apply only after integrating with
-- existing Dishbee tenant/location order schema, payment and server auth.
-- No public API or payment release is enabled by this migration.
create table if not exists public.mealdeck_checkout_groups (
 id uuid primary key default gen_random_uuid(),
 tenant_id uuid not null,
 location_id uuid not null,
 order_id uuid not null,
 owner_id uuid not null references auth.users(id),
 currency text not null check (currency ~ '^[A-Z]{3}$'),
 total_pence bigint not null check (total_pence > 0),
 owner_pence bigint not null check (owner_pence >= 0),
 revision bigint not null default 0 check (revision >= 0),
 status text not null default 'draft' check (status in ('draft','locked','cancelled','completed')),
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(),
 unique(tenant_id,order_id),
 unique(id,tenant_id)
);
create table if not exists public.mealdeck_checkout_invites (
 id uuid primary key default gen_random_uuid(),
 group_id uuid not null references public.mealdeck_checkout_groups(id) on delete cascade,
 participant_id uuid not null references auth.users(id),
 amount_pence bigint not null check (amount_pence > 0),
 token_hash text not null unique check (length(token_hash)=64 and token_hash ~ '^[a-f0-9]+$'),
 expires_at timestamptz not null,
 status text not null default 'invited' check (status in ('invited','accepted','declined','expired','revoked')),
 accepted_at timestamptz,
 created_at timestamptz not null default now(),
 unique(group_id,participant_id)
);
create index if not exists mealdeck_invites_group_idx on public.mealdeck_checkout_invites(group_id);
create index if not exists mealdeck_invites_participant_idx on public.mealdeck_checkout_invites(participant_id);
create index if not exists mealdeck_groups_tenant_location_idx on public.mealdeck_checkout_groups(tenant_id,location_id);

alter table public.mealdeck_checkout_groups enable row level security;
alter table public.mealdeck_checkout_invites enable row level security;
revoke all on public.mealdeck_checkout_groups from anon, authenticated;
revoke all on public.mealdeck_checkout_invites from anon, authenticated;
-- Deliberately no client-facing RLS policies. A reviewed, authenticated,
-- server-side API must perform tenant/role authorisation and transaction locking.
-- Service-role access must remain exclusively server-side.
