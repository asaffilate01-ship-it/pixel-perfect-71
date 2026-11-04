-- Standalone MealDeck production foundation, for a NEW dedicated Supabase
-- project only. This source is assembled with the unchanged operations
-- migrations by deploy/mealdeck/build.mjs; do not run it independently.
-- No tenant, account, priced catalogue, order or payment is seeded here.

do $fresh$
declare v_platform_schemas constant text[] := array[
  'public','information_schema','auth','storage','extensions','realtime','_realtime',
  '_analytics','supabase_functions','supabase_migrations','vault','graphql','graphql_public',
  'pgbouncer','net','cron','pgsodium','pgsodium_masks'
];
begin
  if current_setting('server_version_num')::integer<150000
    or to_regclass('auth.users') is null
    or to_regprocedure('auth.uid()') is null
    or not exists(select 1 from pg_roles where rolname='anon')
    or not exists(select 1 from pg_roles where rolname='authenticated')
    or not exists(select 1 from pg_roles where rolname='service_role') then
    raise exception 'mealdeck_standalone_requires_supabase_auth';
  end if;
  if exists(select 1 from pg_namespace where nspname in
      ('dishbee_private','mealdeck_private','mealdeck_ops_private'))
    or exists(select 1 from pg_class c join pg_namespace n on n.oid=c.relnamespace
      where n.nspname='public' and c.relkind in ('r','p','v','m','S','f')
        and not exists(select 1 from pg_depend d where d.classid='pg_class'::regclass
          and d.objid=c.oid and d.deptype='e'))
    or exists(select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace
      where n.nspname='public' and not exists(select 1 from pg_depend d
        where d.classid='pg_proc'::regclass and d.objid=p.oid and d.deptype='e'))
    or exists(select 1 from pg_type t join pg_namespace n on n.oid=t.typnamespace
      left join pg_class tc on tc.oid=t.typrelid
      where n.nspname='public' and (t.typtype in ('e','d','r','m')
          or (t.typtype='c' and tc.relkind='c'))
        and not exists(select 1 from pg_depend d where d.classid='pg_type'::regclass
          and d.objid=t.oid and d.deptype='e')) then
    raise exception 'mealdeck_standalone_requires_fresh_database';
  end if;
  -- An application using Auth/Storage can have only private functions, types
  -- or sequences and no own tables. Such a project is still shared. Supabase
  -- platform schemas and extension-owned objects are deliberately excluded.
  -- Table/view row types are covered by their relation; a standalone composite
  -- type (relkind c) needs its own check.
  if exists(select 1 from pg_class c join pg_namespace n on n.oid=c.relnamespace
    where c.relkind in ('r','p','v','m','f','S') and n.nspname not like 'pg_%'
      and n.nspname<>all(v_platform_schemas)
      and not exists(select 1 from pg_depend d where d.classid='pg_class'::regclass
        and d.objid=c.oid and d.deptype='e'))
    or exists(select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace
      where n.nspname not like 'pg_%' and n.nspname<>all(v_platform_schemas)
        and not exists(select 1 from pg_depend d where d.classid='pg_proc'::regclass
          and d.objid=p.oid and d.deptype='e'))
    or exists(select 1 from pg_type t join pg_namespace n on n.oid=t.typnamespace
      left join pg_class tc on tc.oid=t.typrelid
      where n.nspname not like 'pg_%' and n.nspname<>all(v_platform_schemas)
        and (t.typtype in ('e','d','r','m') or (t.typtype='c' and tc.relkind='c'))
        and not exists(select 1 from pg_depend d where d.classid='pg_type'::regclass
          and d.objid=t.oid and d.deptype='e')) then
    raise exception 'mealdeck_standalone_requires_fresh_database';
  end if;
end $fresh$;

create schema mealdeck_private;
revoke all on schema mealdeck_private from public,anon,authenticated,service_role;

create table mealdeck_private.installation(
  singleton boolean primary key default true check(singleton),
  profile text not null check(profile='mealdeck-independent-v1'),
  installation_id uuid not null unique default gen_random_uuid(),
  installed_at timestamptz not null default now(),
  business_id uuid,
  bootstrap_owner_id uuid references auth.users(id),
  bootstrapped_at timestamptz
);
alter table mealdeck_private.installation enable row level security;
revoke all on mealdeck_private.installation from public,anon,authenticated,service_role;
insert into mealdeck_private.installation(singleton,profile)
  values(true,'mealdeck-independent-v1');

create table public.tenants(
  id uuid primary key default gen_random_uuid(),
  name text not null check(length(trim(name)) between 2 and 140),
  slug text not null unique check(slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  legal_name text not null check(length(trim(legal_name)) between 2 and 200),
  currency text not null default 'GBP' check(currency ~ '^[A-Z]{3}$'),
  active boolean not null default true,
  created_at timestamptz not null default now()
);
alter table mealdeck_private.installation add foreign key(business_id) references public.tenants(id);

create table public.tenant_locations(
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id),
  name text not null check(length(trim(name)) between 2 and 140),
  slug text not null check(slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  timezone text not null default 'Europe/London',
  active boolean not null default true,
  created_at timestamptz not null default now(),
  unique(tenant_id,id),unique(tenant_id,slug)
);
create table public.tenant_brands(
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id),
  name text not null check(length(trim(name)) between 2 and 140),
  slug text not null check(slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  active boolean not null default false,
  logo_url text,
  created_at timestamptz not null default now(),
  unique(tenant_id,id),unique(tenant_id,slug)
);
create table public.menu_categories(
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id),
  brand_id uuid not null,
  name text not null check(length(trim(name)) between 2 and 140),
  slug text not null check(slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  sort_order integer not null default 0,
  active boolean not null default false,
  foreign key(tenant_id,brand_id) references public.tenant_brands(tenant_id,id),
  unique(tenant_id,id),unique(tenant_id,brand_id,id),unique(tenant_id,brand_id,slug)
);
create table public.menu_items(
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id),
  brand_id uuid not null,
  category_id uuid not null,
  name text not null check(length(trim(name)) between 1 and 140),
  description text not null default '' check(length(description)<=2000),
  -- No default price. An unpriced launch-menu name must not become a free item.
  price_pence integer not null check(price_pence between 0 and 1000000),
  image_url text,sku text,
  active boolean not null default false,
  dietary jsonb not null default '{}'::jsonb check(jsonb_typeof(dietary)='object'),
  allergens text[] not null default '{}',
  created_at timestamptz not null default now(),
  foreign key(tenant_id,brand_id,category_id) references public.menu_categories(tenant_id,brand_id,id),
  unique(tenant_id,id),unique(tenant_id,brand_id,id)
);
create index menu_items_tenant_category_idx on public.menu_items(tenant_id,category_id);

create table public.modifier_groups(
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id),
  name text not null check(length(trim(name)) between 1 and 140),
  min_select integer not null default 0,
  max_select integer not null default 1,
  check(min_select>=0 and max_select between 1 and 100 and min_select<=max_select),
  unique(tenant_id,id)
);
create table public.modifier_options(
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id),
  group_id uuid not null,
  name text not null check(length(trim(name)) between 1 and 140),
  price_delta_pence integer not null check(price_delta_pence between 0 and 1000000),
  active boolean not null default false,
  foreign key(tenant_id,group_id) references public.modifier_groups(tenant_id,id),
  unique(tenant_id,id),unique(tenant_id,group_id,id)
);
create table public.menu_item_modifier_groups(
  tenant_id uuid not null references public.tenants(id),
  item_id uuid not null,group_id uuid not null,sort_order integer not null default 0,
  primary key(item_id,group_id),
  foreign key(tenant_id,item_id) references public.menu_items(tenant_id,id),
  foreign key(tenant_id,group_id) references public.modifier_groups(tenant_id,id)
);

create table public.kitchen_stations(
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id),
  location_id uuid not null,
  name text not null check(length(trim(name)) between 2 and 140),
  code text not null check(length(trim(code)) between 1 and 40),
  active boolean not null default true,
  sort_order integer not null default 0,
  foreign key(tenant_id,location_id) references public.tenant_locations(tenant_id,id),
  unique(tenant_id,id),unique(tenant_id,location_id,id),unique(location_id,code)
);
create table public.menu_item_station_routes(
  tenant_id uuid not null references public.tenants(id),
  location_id uuid not null,item_id uuid not null,station_id uuid not null,
  prep_kind text not null default 'prep' check(prep_kind in ('prep','finish','drink','pack')),
  prep_seconds integer check(prep_seconds between 0 and 86400),
  primary key(location_id,item_id,station_id),
  foreign key(tenant_id,item_id) references public.menu_items(tenant_id,id),
  foreign key(tenant_id,location_id,station_id) references public.kitchen_stations(tenant_id,location_id,id)
);
create table public.ordering_channels(
  tenant_id uuid not null references public.tenants(id),
  location_id uuid not null,
  channel_key text not null check(channel_key='mealdeck'),
  enabled boolean not null default false,
  fulfilment_modes text[] not null default array['delivery']::text[],
  updated_at timestamptz not null default now(),
  primary key(tenant_id,location_id,channel_key),
  foreign key(tenant_id,location_id) references public.tenant_locations(tenant_id,id),
  check(cardinality(fulfilment_modes)>0 and fulfilment_modes<@array['delivery','pickup','curbside','dine_in']::text[])
);
create table public.menu_item_channel_rules(
  tenant_id uuid not null references public.tenants(id),
  location_id uuid not null,channel_key text not null,menu_item_id uuid not null,
  visible boolean not null default false,
  price_override_pence integer check(price_override_pence between 0 and 1000000),
  updated_at timestamptz not null default now(),
  primary key(tenant_id,location_id,channel_key,menu_item_id),
  foreign key(tenant_id,location_id,channel_key) references public.ordering_channels(tenant_id,location_id,channel_key),
  foreign key(tenant_id,menu_item_id) references public.menu_items(tenant_id,id)
);

create type public.order_status as enum(
  'draft','payment_pending','paid','authorised_tab','accepted','preparing','ready','fulfilled','cancelled','refunded'
);
create type public.fulfilment_type as enum('pickup','curbside','delivery','dine_in');
create table public.orders(
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id),
  location_id uuid not null,
  customer_id uuid references auth.users(id),
  status public.order_status not null default 'draft',
  fulfilment public.fulfilment_type not null,
  source text not null default 'mealdeck' check(source='mealdeck'),
  currency text not null default 'GBP' check(currency ~ '^[A-Z]{3}$'),
  subtotal_pence integer not null default 0 check(subtotal_pence>=0),
  delivery_pence integer not null default 0 check(delivery_pence>=0),
  total_pence integer not null default 0 check(total_pence>=0),
  payment_status text not null default 'pending'
    check(payment_status in ('pending','authorised','paid','failed','partially_refunded','refunded')),
  payment_reference text,
  customer_name text,customer_phone text,customer_email text,
  delivery_address jsonb,vehicle jsonb,vehicle_registration text,
  delivery_provider text,delivery_quote_ref text,
  handoff_code text check(handoff_code is null or handoff_code ~ '^\d{4}$'),
  notes text check(length(notes)<=20000),group_order_room_id uuid,
  created_at timestamptz not null default now(),paid_at timestamptz,
  foreign key(tenant_id,location_id) references public.tenant_locations(tenant_id,id),
  check(total_pence::bigint=subtotal_pence::bigint+delivery_pence::bigint),
  unique(tenant_id,id),unique(tenant_id,location_id,id)
);
create index orders_kitchen_queue_idx on public.orders(tenant_id,location_id,created_at,id)
  where status in ('accepted','preparing','ready');
create index orders_location_created_idx on public.orders(tenant_id,location_id,created_at desc);

-- Reserved server-owned group metadata. Financial readiness is deliberately
-- false until the independently verified MealDeck group-payment adapter exists.
create table public.group_order_rooms(
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id),
  location_id uuid not null,master_order_id uuid,
  status text not null default 'draft'
    check(status in ('draft','locked','collecting','verified','submitted','cancelled')),
  payment_mode text not null
    check(payment_mode in ('host_pays','host_collects','separate','separate_host_balance')),
  delivery_pence integer not null default 0 check(delivery_pence>=0),
  created_at timestamptz not null default now(),
  foreign key(tenant_id,location_id) references public.tenant_locations(tenant_id,id),
  foreign key(tenant_id,location_id,master_order_id) references public.orders(tenant_id,location_id,id),
  unique(tenant_id,location_id,id)
);
alter table public.orders add foreign key(tenant_id,location_id,group_order_room_id)
  references public.group_order_rooms(tenant_id,location_id,id);
create function public.group_order_financial_ready(p_room uuid)
returns boolean language plpgsql stable security definer set search_path='' as $$
declare v_ready boolean;
begin
  if not exists(select 1 from pg_catalog.pg_proc p
    where p.oid=pg_catalog.to_regprocedure('mealdeck_private.group_payment_authority(uuid)')
      and p.prorettype='boolean'::pg_catalog.regtype and p.provolatile='s'
      and not pg_catalog.has_function_privilege('anon',p.oid,'EXECUTE')
      and not pg_catalog.has_function_privilege('authenticated',p.oid,'EXECUTE')
      and not pg_catalog.has_function_privilege('service_role',p.oid,'EXECUTE')) then return false; end if;
  execute 'select mealdeck_private.group_payment_authority($1)' into v_ready using p_room;
  return v_ready is true;
exception when others then return false;
end $$;
revoke all on function public.group_order_financial_ready(uuid) from public,anon,authenticated,service_role;

create table public.order_items(
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id),order_id uuid not null,
  brand_id uuid not null,menu_item_id uuid not null,
  item_name text not null check(length(trim(item_name)) between 1 and 1000),
  quantity integer not null check(quantity between 1 and 999),
  unit_price_pence integer not null check(unit_price_pence between 0 and 1000000),
  modifiers jsonb not null default '[]'::jsonb check(jsonb_typeof(modifiers)='array'),
  notes text check(length(notes)<=20000),
  group_participant_id uuid,group_participant_name text,
  foreign key(tenant_id,order_id) references public.orders(tenant_id,id),
  foreign key(tenant_id,brand_id,menu_item_id) references public.menu_items(tenant_id,brand_id,id),
  unique(tenant_id,order_id,id)
);
create index order_items_order_idx on public.order_items(order_id,id);
create table public.kds_tickets(
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id),location_id uuid not null,
  order_id uuid not null,station_id uuid not null,
  status text not null default 'queued' check(status in ('queued','preparing','ready')),
  created_at timestamptz not null default now(),started_at timestamptz,ready_at timestamptz,
  foreign key(tenant_id,location_id,order_id) references public.orders(tenant_id,location_id,id),
  foreign key(tenant_id,location_id,station_id) references public.kitchen_stations(tenant_id,location_id,id),
  unique(order_id,station_id),unique(tenant_id,location_id,order_id,id,station_id)
);
create table public.kds_ticket_items(
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id),location_id uuid not null,
  order_id uuid not null,ticket_id uuid not null,order_item_id uuid not null,station_id uuid not null,
  prep_kind text not null default 'prep' check(prep_kind in ('prep','finish','drink','pack')),
  prep_seconds integer check(prep_seconds between 0 and 86400),
  quantity integer not null check(quantity between 1 and 999),
  status text not null default 'queued' check(status in ('queued','preparing','ready')),
  started_at timestamptz,ready_at timestamptz,
  foreign key(tenant_id,location_id,order_id,ticket_id,station_id)
    references public.kds_tickets(tenant_id,location_id,order_id,id,station_id),
  foreign key(tenant_id,order_id,order_item_id) references public.order_items(tenant_id,order_id,id),
  unique(ticket_id,order_item_id,station_id)
);
create index kds_ticket_items_order_item_idx on public.kds_ticket_items(order_item_id);
create table public.mealdeck_pass_orders(
  order_id uuid primary key,tenant_id uuid not null,location_id uuid not null,
  status text not null default 'waiting_for_kitchen' check(status in
    ('waiting_for_kitchen','ready_to_pack','packing','sealed','ready_for_handoff','handed_off','cancelled')),
  ready_to_pack_at timestamptz,packing_started_at timestamptz,sealed_at timestamptz,
  ready_for_handoff_at timestamptz,handed_off_at timestamptz,
  updated_by uuid references auth.users(id),
  created_at timestamptz not null default now(),updated_at timestamptz not null default now(),
  foreign key(tenant_id,location_id,order_id) references public.orders(tenant_id,location_id,id)
);

create table public.mealdeck_refund_allocations(
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,location_id uuid not null,order_id uuid not null,
  amount_pence bigint not null check(amount_pence>0),
  status text not null check(status in ('requested','settled','failed')),
  provider_event_ref text,
  created_at timestamptz not null default now(),
  foreign key(tenant_id,location_id,order_id) references public.orders(tenant_id,location_id,id),
  unique(tenant_id,provider_event_ref)
);
-- Read compatibility for an existing finance RPC, backed solely by MealDeck's
-- local records. This is not a Hive connection or a second settlement ledger.
create view public.hive_refund_allocations with(security_invoker=true) as
  select id,tenant_id,location_id,order_id,amount_pence,status,created_at
  from public.mealdeck_refund_allocations;
revoke all on public.hive_refund_allocations from public,anon,authenticated,service_role;

do $security$
declare t text;
begin
  foreach t in array array[
    'tenants','tenant_locations','tenant_brands','menu_categories','menu_items',
    'modifier_groups','modifier_options','menu_item_modifier_groups','kitchen_stations',
    'menu_item_station_routes','ordering_channels','menu_item_channel_rules','orders',
    'group_order_rooms','order_items','kds_tickets','kds_ticket_items','mealdeck_pass_orders',
    'mealdeck_refund_allocations'
  ] loop
    execute format('alter table public.%I enable row level security',t);
    execute format('revoke all on table public.%I from public,anon,authenticated,service_role',t);
  end loop;
end $security$;
