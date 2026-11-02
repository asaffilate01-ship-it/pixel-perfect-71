-- MealDeck internal operations foundation for an approved Dishbee Supabase project.
-- DO NOT run against a different/empty Supabase project: canonical tenants,
-- locations, menus and orders are already owned by Dishbee.
-- This migration is source-only until real staging RLS and replay are accepted.
-- No public guest ordering, payment state or KDS release is changed.

create schema if not exists private;
revoke all on schema private from public, anon, authenticated;

create table public.mealdeck_ops_staff_access(
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  location_id uuid references public.tenant_locations(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null check(role in (
    'owner','admin','operations','kitchen','menu','finance','analyst','viewer'
  )),
  grant_permissions text[] not null default '{}',
  deny_permissions text[] not null default '{}',
  enabled boolean not null default true,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  scope_key text generated always as (coalesce(location_id::text,'all')) stored,
  unique(tenant_id,user_id,scope_key),
  check(not(grant_permissions && deny_permissions)),
  check(cardinality(grant_permissions)<=20 and cardinality(deny_permissions)<=20)
);
create index mealdeck_ops_staff_user_idx
  on public.mealdeck_ops_staff_access(user_id,enabled,tenant_id);
alter table public.mealdeck_ops_staff_access enable row level security;
revoke all on public.mealdeck_ops_staff_access from public,anon,authenticated;

-- All permissions are checked against the actor's verified Supabase auth.uid().
-- A location-specific role cannot perform a tenant-wide global write.
create or replace function private.mealdeck_ops_can(
  p_tenant uuid,p_location uuid,p_permission text
) returns boolean
language sql stable security definer set search_path=''
as $$
  select coalesce(
    auth.uid() is not null
    and p_permission = any(array[
      'menu.read','menu.write','orders.read','orders.status',
      'recipes.read','recipes.write','costs.read','costs.write',
      'finance.read','finance.manage','analytics.read',
      'inventory.read','inventory.write','staff.read','staff.manage'
    ]::text[])
    and exists(
      select 1 from public.mealdeck_ops_staff_access a
      where a.user_id=(select auth.uid())
        and a.tenant_id=p_tenant and a.enabled
        and (a.location_id is null or
          (p_location is not null and a.location_id=p_location))
        and not(p_permission=any(a.deny_permissions))
        and (
          p_permission=any(a.grant_permissions)
          or p_permission=any(case a.role
            when 'owner' then array[
              'menu.read','menu.write','orders.read','orders.status',
              'recipes.read','recipes.write','costs.read','costs.write',
              'finance.read','finance.manage','analytics.read',
              'inventory.read','inventory.write','staff.read','staff.manage'
            ]::text[]
            when 'admin' then array[
              'menu.read','menu.write','orders.read','orders.status',
              'recipes.read','recipes.write','costs.read','costs.write',
              'finance.read','finance.manage','analytics.read',
              'inventory.read','inventory.write','staff.read','staff.manage'
            ]::text[]
            when 'operations' then array[
              'menu.read','orders.read','orders.status',
              'recipes.read','analytics.read','inventory.read','inventory.write'
            ]::text[]
            when 'kitchen' then array[
              'menu.read','orders.read','orders.status','recipes.read','inventory.read'
            ]::text[]
            when 'menu' then array[
              'menu.read','menu.write','recipes.read','recipes.write','inventory.read'
            ]::text[]
            when 'finance' then array[
              'menu.read','orders.read','recipes.read','costs.read','costs.write',
              'finance.read','finance.manage','analytics.read','inventory.read'
            ]::text[]
            when 'analyst' then array[
              'menu.read','analytics.read'
            ]::text[]
            else array['menu.read']::text[]
          end)
        )
    ),false
  );
$$;
revoke all on function private.mealdeck_ops_can(uuid,uuid,text)
  from public,anon,authenticated;

-- Bootstrap must be performed by an authorised platform DBA after checking
-- the Auth user ID, canonical Dishbee tenant and location. There is NO signup
-- trigger, tenant self-registration, automatic owner, or user_metadata shortcut.
create or replace function public.mealdeck_ops_my_access()
returns table(
  access_id uuid,tenant_id uuid,tenant_name text,location_id uuid,
  role text,grant_permissions text[],deny_permissions text[]
)
language sql stable security definer set search_path=''
as $$
  select a.id,a.tenant_id,t.name::text,a.location_id,a.role,
    a.grant_permissions,a.deny_permissions
  from public.mealdeck_ops_staff_access a
  join public.tenants t on t.id=a.tenant_id
  where a.user_id=(select auth.uid()) and a.enabled
  order by t.name,a.location_id nulls first,a.role
$$;

create or replace function public.mealdeck_ops_staff_list(p_tenant uuid)
returns table(
  access_id uuid,user_id uuid,user_email text,location_id uuid,
  role text,enabled boolean,grant_permissions text[],deny_permissions text[],
  created_at timestamptz
)
language plpgsql stable security definer set search_path=''
as $$
begin
  if not private.mealdeck_ops_can(p_tenant,null,'staff.read') then
    raise exception 'mealdeck_ops_forbidden';
  end if;
  return query
    select a.id,a.user_id,u.email::text,a.location_id,a.role,a.enabled,
      a.grant_permissions,a.deny_permissions,a.created_at
    from public.mealdeck_ops_staff_access a
    join auth.users u on u.id=a.user_id
    where a.tenant_id=p_tenant
    order by a.created_at desc
    limit 250;
end;
$$;

create or replace function public.mealdeck_ops_assign_staff(
  p_tenant uuid,p_user uuid,p_location uuid,p_role text,
  p_grants text[],p_denies text[],p_enabled boolean
) returns uuid
language plpgsql security definer set search_path=''
as $$
declare
  v_actor_role text;
  v_existing public.mealdeck_ops_staff_access%rowtype;
  v_id uuid;
  v_all text[]:=array[
    'menu.read','menu.write','orders.read','orders.status',
    'recipes.read','recipes.write','costs.read','costs.write',
    'finance.read','finance.manage','analytics.read',
    'inventory.read','inventory.write','staff.read','staff.manage'
  ];
begin
  if not private.mealdeck_ops_can(p_tenant,null,'staff.manage') then
    raise exception 'mealdeck_ops_forbidden';
  end if;
  select a.role into v_actor_role
    from public.mealdeck_ops_staff_access a
    where a.user_id=(select auth.uid()) and a.tenant_id=p_tenant
      and a.location_id is null and a.enabled
      and a.role in ('owner','admin')
    order by case when a.role='owner' then 0 else 1 end
    limit 1;
  if not found then raise exception 'mealdeck_ops_owner_admin_required'; end if;
  if p_user=(select auth.uid()) then
    raise exception 'mealdeck_ops_no_self_role_changes';
  end if;
  if p_user is null or p_enabled is null or
      p_role not in ('owner','admin','operations','kitchen','menu','finance','analyst','viewer')
      or p_grants is null or p_denies is null or
      cardinality(p_grants)>20 or cardinality(p_denies)>20 or
      p_grants && p_denies or
      not(p_grants <@ v_all) or not(p_denies <@ v_all) then
    raise exception 'mealdeck_ops_invalid_staff_assignment';
  end if;
  if p_location is not null and not exists(
    select 1 from public.tenant_locations l
      where l.id=p_location and l.tenant_id=p_tenant
  ) then raise exception 'mealdeck_ops_location_mismatch'; end if;
  if not exists(select 1 from auth.users u where u.id=p_user) then
    raise exception 'mealdeck_ops_user_not_provisioned';
  end if;
  if v_actor_role <> 'owner' and (
    p_role in ('owner','admin') or
    p_grants && array['staff.manage','finance.manage']::text[]
  ) then raise exception 'mealdeck_ops_owner_approval_required'; end if;

  select * into v_existing from public.mealdeck_ops_staff_access a
  where a.tenant_id=p_tenant and a.user_id=p_user
    and a.location_id is not distinct from p_location for update;
  if found and v_existing.role='owner' and v_actor_role<>'owner' then
    raise exception 'mealdeck_ops_owner_approval_required';
  end if;

  insert into public.mealdeck_ops_staff_access(
    tenant_id,user_id,location_id,role,grant_permissions,
    deny_permissions,enabled,created_by
  ) values (
    p_tenant,p_user,p_location,p_role,p_grants,p_denies,p_enabled,(select auth.uid())
  ) on conflict(tenant_id,user_id,scope_key) do update set
    role=excluded.role,
    grant_permissions=excluded.grant_permissions,
    deny_permissions=excluded.deny_permissions,
    enabled=excluded.enabled,
    updated_at=now()
  returning id into v_id;
  return v_id;
end;
$$;

-- Safe location-specific menu visibility controls use Dishbee's *existing*
-- canonical menu rules. No separately-priced or shadow customer catalogue.
create or replace function public.mealdeck_ops_menu_list(
  p_tenant uuid,p_location uuid
) returns table(
  item_id uuid,brand_id uuid,brand_name text,category_name text,
  item_name text,description text,price_pence integer,
  active boolean,visible boolean,location_price_pence integer,
  allergens text[]
)
language plpgsql stable security definer set search_path=''
as $$
begin
  if not private.mealdeck_ops_can(p_tenant,p_location,'menu.read') then
    raise exception 'mealdeck_ops_forbidden';
  end if;
  if not exists(
    select 1 from public.tenant_locations l
    where l.id=p_location and l.tenant_id=p_tenant
  ) then raise exception 'mealdeck_ops_location_mismatch'; end if;
  return query
    select i.id,i.brand_id,b.name::text,c.name::text,i.name::text,
      i.description::text,i.price_pence,i.active,
      coalesce(r.visible,true) as visible,
      coalesce(r.price_override_pence,i.price_pence) as location_price_pence,
      i.allergens
    from public.menu_items i
    left join public.tenant_brands b on b.id=i.brand_id and b.tenant_id=i.tenant_id
    join public.menu_categories c on c.id=i.category_id
    left join public.menu_item_channel_rules r
      on r.menu_item_id=i.id and r.tenant_id=p_tenant
      and r.location_id=p_location and r.channel_key='mealdeck'
    where i.tenant_id=p_tenant
    order by b.name,c.name,i.name
    limit 750;
end;
$$;

create or replace function public.mealdeck_ops_update_menu_item(
  p_tenant uuid,p_item uuid,p_name text,p_description text,
  p_price_pence integer,p_active boolean
) returns boolean
language plpgsql security definer set search_path=''
as $$
declare v_id uuid;
begin
  -- Master menu products are shared across locations: only global staff
  -- may edit canonical names and prices.
  if not private.mealdeck_ops_can(p_tenant,null,'menu.write') then
    raise exception 'mealdeck_ops_global_menu_permission_required';
  end if;
  if nullif(trim(coalesce(p_name,'')),'') is null
     or length(trim(p_name))>140
     or length(coalesce(p_description,''))>2000
     or p_price_pence is null or p_price_pence<0
     or p_price_pence>1000000 or p_active is null then
    raise exception 'mealdeck_ops_invalid_menu_item';
  end if;
  update public.menu_items i
    set name=trim(p_name),description=p_description,
      price_pence=p_price_pence,active=p_active
    where i.id=p_item and i.tenant_id=p_tenant
    returning i.id into v_id;
  return v_id is not null;
end;
$$;

create or replace function public.mealdeck_ops_set_menu_visibility(
  p_tenant uuid,p_location uuid,p_item uuid,p_visible boolean
) returns boolean
language plpgsql security definer set search_path=''
as $$
begin
  if not private.mealdeck_ops_can(p_tenant,p_location,'menu.write') then
    raise exception 'mealdeck_ops_forbidden';
  end if;
  if p_visible is null or not exists(
    select 1 from public.menu_items i where i.id=p_item and i.tenant_id=p_tenant
  ) or not exists(
    select 1 from public.ordering_channels c
      where c.tenant_id=p_tenant and c.location_id=p_location
        and c.channel_key='mealdeck'
  ) then
    raise exception 'mealdeck_ops_menu_channel_not_configured';
  end if;

  insert into public.menu_item_channel_rules(
    tenant_id,location_id,channel_key,menu_item_id,visible
  ) values (p_tenant,p_location,'mealdeck',p_item,p_visible)
  on conflict(tenant_id,location_id,channel_key,menu_item_id)
  do update set visible=excluded.visible,updated_at=now();
  return true;
end;
$$;

revoke all on function public.mealdeck_ops_my_access() from public,anon,authenticated;
revoke all on function public.mealdeck_ops_staff_list(uuid) from public,anon,authenticated;
revoke all on function public.mealdeck_ops_assign_staff(
  uuid,uuid,uuid,text,text[],text[],boolean
) from public,anon,authenticated;
revoke all on function public.mealdeck_ops_menu_list(uuid,uuid)
  from public,anon,authenticated;
revoke all on function public.mealdeck_ops_update_menu_item(
  uuid,uuid,text,text,integer,boolean
) from public,anon,authenticated;
revoke all on function public.mealdeck_ops_set_menu_visibility(
  uuid,uuid,uuid,boolean
) from public,anon,authenticated;

grant execute on function public.mealdeck_ops_my_access() to authenticated;
grant execute on function public.mealdeck_ops_staff_list(uuid) to authenticated;
grant execute on function public.mealdeck_ops_assign_staff(
  uuid,uuid,uuid,text,text[],text[],boolean
) to authenticated;
grant execute on function public.mealdeck_ops_menu_list(uuid,uuid) to authenticated;
grant execute on function public.mealdeck_ops_update_menu_item(
  uuid,uuid,text,text,integer,boolean
) to authenticated;
grant execute on function public.mealdeck_ops_set_menu_visibility(
  uuid,uuid,uuid,boolean
) to authenticated;


-- Location discovery and category selection are also permission-scoped.
create or replace function public.mealdeck_ops_locations(p_tenant uuid)
returns table(location_id uuid,location_name text)
language plpgsql stable security definer set search_path=''
as $$
begin
  if (select auth.uid()) is null then
    raise exception 'mealdeck_ops_login_required';
  end if;
  return query
    select l.id,l.name::text
    from public.tenant_locations l
    where l.tenant_id=p_tenant
      and private.mealdeck_ops_can(p_tenant,l.id,'menu.read')
    order by l.name;
end;
$$;

create or replace function public.mealdeck_ops_menu_taxonomy(
  p_tenant uuid,p_location uuid
) returns table(
  category_id uuid,category_name text,brand_id uuid,brand_name text
)
language plpgsql stable security definer set search_path=''
as $$
begin
  if not private.mealdeck_ops_can(p_tenant,p_location,'menu.read') then
    raise exception 'mealdeck_ops_forbidden';
  end if;
  return query
    select c.id,c.name::text,b.id,b.name::text
    from public.menu_categories c
    join public.tenant_brands b
      on b.id=c.brand_id and b.tenant_id=p_tenant
    where c.tenant_id=p_tenant
    order by b.name,c.name
    limit 400;
end;
$$;

create or replace function public.mealdeck_ops_create_menu_item(
  p_tenant uuid,p_brand uuid,p_category uuid,
  p_name text,p_description text,p_price_pence integer
) returns uuid
language plpgsql security definer set search_path=''
as $$
declare v_id uuid;
begin
  if not private.mealdeck_ops_can(p_tenant,null,'menu.write') then
    raise exception 'mealdeck_ops_global_menu_permission_required';
  end if;
  if nullif(trim(coalesce(p_name,'')),'') is null
    or length(trim(p_name))>140
    or length(coalesce(p_description,''))>2000
    or p_price_pence is null or p_price_pence<0
    or p_price_pence>1000000
    or not exists(
      select 1 from public.tenant_brands b
      where b.id=p_brand and b.tenant_id=p_tenant
    )
    or not exists(
      select 1 from public.menu_categories c
      where c.id=p_category and c.tenant_id=p_tenant
        and (c.brand_id is null or c.brand_id=p_brand)
    ) then
    raise exception 'mealdeck_ops_invalid_menu_item';
  end if;
  insert into public.menu_items(
    tenant_id,brand_id,category_id,name,description,price_pence,active
  ) values(
    p_tenant,p_brand,p_category,trim(p_name),coalesce(p_description,''),
    p_price_pence,true
  ) returning id into v_id;
  return v_id;
end;
$$;

revoke all on function public.mealdeck_ops_locations(uuid)
  from public,anon,authenticated;
revoke all on function public.mealdeck_ops_menu_taxonomy(uuid,uuid)
  from public,anon,authenticated;
revoke all on function public.mealdeck_ops_create_menu_item(
  uuid,uuid,uuid,text,text,integer
) from public,anon,authenticated;

grant execute on function public.mealdeck_ops_locations(uuid)
  to authenticated;
grant execute on function public.mealdeck_ops_menu_taxonomy(uuid,uuid)
  to authenticated;
grant execute on function public.mealdeck_ops_create_menu_item(
  uuid,uuid,uuid,text,text,integer
) to authenticated;
