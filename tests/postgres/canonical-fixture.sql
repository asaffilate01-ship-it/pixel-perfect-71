-- DISPOSABLE TEST DATABASE ONLY. Never apply this file to Supabase or a real
-- Dishbee database. It is the smallest canonical interface needed to execute
-- MealDeck's real operations/KDS migrations, rather than mocked RPC outcomes.
-- Table shapes come from dishbee-helper migrations:
--   20260925232000_catalogue_kds.sql
--   20260925233000_order_kds_gate.sql
--   20260927230000_mealdeck_serviceability_kds.sql
--   20260928103000_mealdeck_pass_live_menu.sql
--   20260929183000_cafe1_full_parity_import.sql
--   20260930200000_dishbee_groups.sql
-- Nonessential commercial tables, partner integrations and hosted Auth are not
-- recreated. auth.uid() reads a server test claim; no browser token is trusted.
-- Source revision: dishbee-helper 4a267048b485aa7e8eef91e7341e86ae8e74ab7f.

do $$ begin
  if not exists(select 1 from pg_roles where rolname='anon') then
    create role anon nologin;
  end if;
  if not exists(select 1 from pg_roles where rolname='authenticated') then
    create role authenticated nologin;
  end if;
  if not exists(select 1 from pg_roles where rolname='service_role') then
    create role service_role nologin bypassrls;
  end if;
end $$;

-- Sentinel implementations of existing canonical callbacks. The workspace
-- migration must leave these definitions/ACLs alone, and kitchen actions must
-- never invoke payment confirmation, fresh release or legacy station writes.
-- These are side-effect traps, not replacements for production implementations.
create function public.release_order_to_kds(uuid) returns integer
language plpgsql as $$ begin raise exception 'test_release_callback_must_not_run'; end $$;
create function public.confirm_order_payment(uuid,text) returns boolean
language plpgsql as $$ begin raise exception 'test_payment_callback_must_not_run'; end $$;
create function public.update_kds_ticket(uuid,text) returns boolean
language plpgsql as $$ begin raise exception 'test_station_callback_must_not_run'; end $$;
create function public.update_mealdeck_pass_status(uuid,text) returns boolean
language plpgsql as $$ begin raise exception 'test_dispatch_callback_must_not_run'; end $$;
revoke all on function public.release_order_to_kds(uuid),
  public.confirm_order_payment(uuid,text),public.update_kds_ticket(uuid,text),
  public.update_mealdeck_pass_status(uuid,text) from public,anon,authenticated;
grant execute on function public.release_order_to_kds(uuid),
  public.confirm_order_payment(uuid,text),public.update_kds_ticket(uuid,text),
  public.update_mealdeck_pass_status(uuid,text) to service_role;

create schema auth;
create table auth.users(id uuid primary key, email text);
create function auth.uid() returns uuid language sql stable as $$
  select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid
$$;
create function auth.role() returns text language sql stable as $$
  select current_setting('request.jwt.claim.role',true)
$$;
grant usage on schema auth to anon,authenticated,service_role;
grant execute on function auth.uid(),auth.role() to anon,authenticated,service_role;

create table public.tenants(
  id uuid primary key default gen_random_uuid(),name text not null
);
create table public.tenant_locations(
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id),
  name text not null,
  active boolean not null default true
);
create table public.tenant_brands(
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id),
  name text not null,slug text not null,
  active boolean not null default true,
  kds_color text,kds_text_color text
);
create table public.menu_categories(
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id),
  brand_id uuid references public.tenant_brands(id),
  name text not null,slug text not null,
  sort_order integer not null default 0,
  active boolean not null default true,
  unique(tenant_id,brand_id,slug)
);
create table public.menu_items(
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id),
  brand_id uuid references public.tenant_brands(id),
  category_id uuid not null references public.menu_categories(id),
  name text not null,description text,
  price_pence integer not null check(price_pence>=0),
  image_url text,sku text,active boolean not null default true,
  dietary jsonb not null default '{}'::jsonb,
  allergens text[] not null default '{}',
  created_at timestamptz not null default now()
);
create table public.kitchen_stations(
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id),
  location_id uuid not null references public.tenant_locations(id),
  name text not null,code text not null,
  active boolean not null default true,
  sort_order integer not null default 0,
  unique(location_id,code)
);
create table public.menu_item_station_routes(
  tenant_id uuid not null references public.tenants(id),
  location_id uuid not null references public.tenant_locations(id),
  item_id uuid not null references public.menu_items(id),
  station_id uuid not null references public.kitchen_stations(id),
  prep_kind text not null default 'prep' check(prep_kind in('cook','prep','none')),
  prep_seconds integer,
  primary key(location_id,item_id,station_id)
);

create type public.order_status as enum(
  'draft','payment_pending','paid','authorised_tab','accepted','preparing',
  'ready','fulfilled','cancelled','refunded'
);
create type public.fulfilment_type as enum('pickup','curbside','delivery','dine_in');
create table public.orders(
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id),
  location_id uuid not null references public.tenant_locations(id),
  customer_id uuid references auth.users(id),
  status public.order_status not null default 'draft',
  fulfilment public.fulfilment_type not null,
  subtotal_pence integer not null default 0,
  delivery_pence integer not null default 0,
  total_pence integer not null default 0,
  payment_reference text,payment_status text not null default 'pending',
  delivery_provider text,delivery_quote_ref text,
  vehicle jsonb,delivery_address jsonb,notes text,
  customer_name text,customer_phone text,
  handoff_code text,vehicle_registration text,source text,
  group_order_room_id uuid,
  created_at timestamptz not null default now(),paid_at timestamptz
);
create table public.order_items(
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id),
  order_id uuid not null references public.orders(id) on delete cascade,
  brand_id uuid references public.tenant_brands(id),
  menu_item_id uuid not null references public.menu_items(id),
  item_name text not null,
  quantity integer not null check(quantity>0),
  unit_price_pence integer not null check(unit_price_pence>=0),
  modifiers jsonb not null default '[]'::jsonb,notes text,
  group_participant_id uuid,group_participant_name text
);
create table public.kds_tickets(
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id),
  order_id uuid not null references public.orders(id) on delete cascade,
  station_id uuid not null references public.kitchen_stations(id),
  status text not null default 'queued',
  created_at timestamptz not null default now(),
  started_at timestamptz,ready_at timestamptz,
  unique(order_id,station_id)
);
create table public.kds_ticket_items(
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id),
  ticket_id uuid not null references public.kds_tickets(id) on delete cascade,
  order_item_id uuid not null references public.order_items(id) on delete cascade,
  station_id uuid not null references public.kitchen_stations(id),
  prep_kind text not null default 'prep',prep_seconds integer,
  quantity integer not null check(quantity>0),
  status text not null default 'queued',
  started_at timestamptz,ready_at timestamptz,
  unique(ticket_id,order_item_id,station_id)
);
create table public.mealdeck_pass_orders(
  order_id uuid primary key references public.orders(id) on delete cascade,
  tenant_id uuid not null references public.tenants(id),
  location_id uuid not null references public.tenant_locations(id),
  status text not null default 'waiting_for_kitchen'
    check(status in('waiting_for_kitchen','ready_to_pack','packing','sealed',
      'ready_for_handoff','handed_off','cancelled')),
  ready_to_pack_at timestamptz,packing_started_at timestamptz,
  sealed_at timestamptz,ready_for_handoff_at timestamptz,handed_off_at timestamptz,
  updated_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Only the columns read by the actual group financial-ready function are
-- needed here. The function below is the canonical implementation, unchanged.
create table public.group_order_rooms(
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id),
  location_id uuid not null references public.tenant_locations(id),
  payment_mode text not null,
  delivery_pence integer not null default 0,
  master_order_id uuid references public.orders(id),
  status text not null default 'submitted'
);
alter table public.orders add constraint orders_group_order_room_id_fkey
  foreign key(group_order_room_id) references public.group_order_rooms(id);
create table public.group_order_participants(
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references public.group_order_rooms(id),
  tenant_id uuid not null references public.tenants(id),
  display_name text not null,
  included boolean not null default true,
  payment_status text not null default 'pending',
  cart_subtotal_pence integer not null default 0
);
create table public.group_order_payment_attempts(
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references public.group_order_rooms(id),
  participant_id uuid references public.group_order_participants(id),
  tenant_id uuid not null references public.tenants(id),
  payer_scope text not null,
  amount_pence integer not null check(amount_pence>0),
  status text not null default 'created'
);

create or replace function public.group_order_financial_ready(p_room uuid)
returns boolean
language sql stable security definer set search_path=public as $$
  with room as (
    select * from public.group_order_rooms where id=p_room
  ),
  included as (
    select p.*
    from public.group_order_participants p
    join room r on r.id=p.room_id
    where p.included and p.cart_subtotal_pence>0
  ),
  host_due as (
    select
      case
        when r.payment_mode in ('host_pays','host_collects') then
          coalesce((select sum(p.cart_subtotal_pence) from included p),0)+r.delivery_pence
        else
          coalesce((select sum(p.cart_subtotal_pence) from included p where p.payment_status='host_cover'),0)+r.delivery_pence
      end::integer amount
    from room r
  )
  select
    exists(select 1 from room)
    and not exists(
      select 1
      from included p
      join room r on true
      where r.payment_mode in ('separate','separate_host_balance')
        and p.payment_status not in ('paid','host_cover')
    )
    and (
      (select amount from host_due)=0
      or exists(
        select 1
        from public.group_order_payment_attempts a
        where a.room_id=p_room
          and a.payer_scope in ('host_all','host_cover')
          and a.status='paid'
          and a.amount_pence=(select amount from host_due)
      )
    )
$$;
revoke all on function public.group_order_financial_ready(uuid)
  from public,anon,authenticated;
grant execute on function public.group_order_financial_ready(uuid) to service_role;

-- Canonical tables are inaccessible directly to staff in this test database.
-- Authorized operations must pass through the real MealDeck RPCs under test.
do $$ declare t text; begin
  foreach t in array array[
    'tenants','tenant_locations','tenant_brands','menu_categories','menu_items',
    'kitchen_stations','menu_item_station_routes','orders','order_items',
    'kds_tickets','kds_ticket_items','mealdeck_pass_orders','group_order_rooms',
    'group_order_participants','group_order_payment_attempts'
  ] loop
    execute format('alter table public.%I enable row level security',t);
    execute format('revoke all on public.%I from public,anon,authenticated',t);
  end loop;
end $$;
