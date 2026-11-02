-- MealDeck internal recipes, inventory, costs and read-only finance.
-- Depends on 20261102191000_mealdeck_ops_core.sql and canonical Dishbee
-- tenant/menu/order/payment tables. Source-only until approved staging replay.
-- Cost figures are ESTIMATES, not accounting COGS or merchant settlements.

create table public.mealdeck_ops_ingredients (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  name text not null check(length(trim(name)) between 2 and 140),
  base_unit text not null check(base_unit in ('g','ml','each')),
  sku text,
  allergens text[] not null default '{}',
  reorder_threshold numeric(14,3) not null default 0 check(reorder_threshold>=0),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(tenant_id,id),
  unique(tenant_id,name,base_unit)
);

create table public.mealdeck_ops_recipes (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  menu_item_id uuid not null references public.menu_items(id) on delete cascade,
  version integer not null default 1 check(version>=1),
  yield_units numeric(12,3) not null default 1 check(yield_units>0),
  prep_minutes integer not null default 0 check(prep_minutes between 0 and 1440),
  instructions text not null default '' check(length(instructions)<=12000),
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(tenant_id,id),
  unique(tenant_id,menu_item_id)
);

create table public.mealdeck_ops_recipe_lines (
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  recipe_id uuid not null,
  ingredient_id uuid not null,
  quantity numeric(14,3) not null check(quantity>0 and quantity<=1000000),
  waste_pct numeric(5,2) not null default 0 check(waste_pct between 0 and 100),
  primary key(recipe_id,ingredient_id),
  foreign key(tenant_id,recipe_id)
    references public.mealdeck_ops_recipes(tenant_id,id) on delete cascade,
  foreign key(tenant_id,ingredient_id)
    references public.mealdeck_ops_ingredients(tenant_id,id)
);

create table public.mealdeck_ops_recipe_history(
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  recipe_id uuid not null references public.mealdeck_ops_recipes(id) on delete cascade,
  version integer not null check(version>=1),
  snapshot jsonb not null,
  archived_by uuid references auth.users(id) on delete set null,
  archived_at timestamptz not null default now(),
  unique(recipe_id,version)
);

-- Quote values are PENCE for one base unit (gram/ml/each). Historical supplier
-- quotes remain available by effective_on, and are never silently used as a
-- payment/refund record. Store supplier cost excluding VAT consistently.
create table public.mealdeck_ops_ingredient_costs(
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  location_id uuid not null references public.tenant_locations(id) on delete cascade,
  ingredient_id uuid not null,
  effective_on date not null,
  supplier text not null default '' check(length(supplier)<=160),
  cost_per_unit_pence numeric(16,6) not null check(cost_per_unit_pence>=0),
  recorded_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  -- Append-only quotes: corrections are later rows, never silent overwrites.
  foreign key(tenant_id,ingredient_id)
    references public.mealdeck_ops_ingredients(tenant_id,id)
);
create index mealdeck_ops_cost_lookup_idx on
  public.mealdeck_ops_ingredient_costs(
    tenant_id,location_id,ingredient_id,effective_on desc,created_at desc
  );

-- Append-only stock movements. A purchase is not automatically accounting
-- expenditure, and stock quantity is not permission to dispatch/fulfil an order.
create table public.mealdeck_ops_stock_movements(
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  location_id uuid not null references public.tenant_locations(id) on delete cascade,
  ingredient_id uuid not null,
  delta_qty numeric(14,3) not null check(delta_qty<>0),
  reason text not null check(reason in (
    'opening','purchase','production','waste','adjustment','transfer_in','transfer_out'
  )),
  note text not null default '' check(length(note)<=300),
  recorded_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  foreign key(tenant_id,ingredient_id)
    references public.mealdeck_ops_ingredients(tenant_id,id)
);
create index mealdeck_ops_stock_location_idx
  on public.mealdeck_ops_stock_movements(tenant_id,location_id,ingredient_id,created_at);

-- Manual expense entries are separate, unreconciled operational records.
-- Do not describe them as a certified P&L or bank-provider settlement.
create table public.mealdeck_ops_expenses(
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  location_id uuid not null references public.tenant_locations(id) on delete cascade,
  occurred_on date not null,
  category text not null check(category in (
    'labour','rent','utilities','marketing','packaging','supplies',
    'software','repair','transport','other'
  )),
  amount_pence bigint not null check(amount_pence>0 and amount_pence<=1000000000),
  note text not null default '' check(length(note)<=300),
  recorded_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);
create index mealdeck_ops_expense_location_idx
  on public.mealdeck_ops_expenses(tenant_id,location_id,occurred_on);

do $$
declare t text;
begin
  foreach t in array array[
    'mealdeck_ops_ingredients','mealdeck_ops_recipes',
    'mealdeck_ops_recipe_lines','mealdeck_ops_recipe_history',
    'mealdeck_ops_ingredient_costs','mealdeck_ops_stock_movements',
    'mealdeck_ops_expenses'
  ] loop
    execute format('alter table public.%I enable row level security',t);
    execute format('revoke all on table public.%I from public,anon,authenticated',t);
  end loop;
end $$;

-- All commercial data is accessed through specific authenticated, scoped RPCs,
-- not exposed table CRUD. Kitchen roles can view recipes but NEVER cost quotes.

create or replace function public.mealdeck_ops_ingredient_list(p_tenant uuid,p_location uuid)
returns table(
  ingredient_id uuid,name text,base_unit text,allergens text[],
  reorder_threshold numeric,active boolean
)
language plpgsql stable security definer set search_path=''
as $$
begin
  if not(mealdeck_ops_private.can(p_tenant,p_location,'recipes.read') or
     mealdeck_ops_private.can(p_tenant,p_location,'inventory.read')) then
    raise exception 'mealdeck_ops_forbidden';
  end if;
  return query select i.id,i.name,i.base_unit,i.allergens,i.reorder_threshold,i.active
    from public.mealdeck_ops_ingredients i
    where i.tenant_id=p_tenant
      and (
        mealdeck_ops_private.can(p_tenant,null,'recipes.read')
        or mealdeck_ops_private.can(p_tenant,p_location,'costs.read')
        or exists(
          select 1 from public.mealdeck_ops_stock_movements sm
          where sm.tenant_id=p_tenant and sm.location_id=p_location
            and sm.ingredient_id=i.id
        )
        or exists(
          select 1 from public.mealdeck_ops_recipe_lines line
          join public.mealdeck_ops_recipes recipe
            on recipe.id=line.recipe_id and recipe.tenant_id=p_tenant
          join public.menu_item_station_routes route
            on route.tenant_id=p_tenant and route.location_id=p_location
            and route.item_id=recipe.menu_item_id
          where line.tenant_id=p_tenant and line.ingredient_id=i.id
        )
      )
    order by i.name limit 1000;
end;
$$;

create or replace function public.mealdeck_ops_upsert_ingredient(
  p_tenant uuid,p_id uuid,p_name text,p_unit text,p_allergens text[],p_reorder numeric
) returns uuid
language plpgsql security definer set search_path=''
as $$
declare v_id uuid;
begin
  if not mealdeck_ops_private.can(p_tenant,null,'recipes.write') then
    raise exception 'mealdeck_ops_global_recipes_permission_required';
  end if;
  if p_unit not in ('g','ml','each')
    or nullif(trim(coalesce(p_name,'')),'') is null
    or length(trim(p_name))>140 or p_allergens is null
    or cardinality(p_allergens)>30
    or p_reorder is null or p_reorder<0 or p_reorder>100000000 then
    raise exception 'mealdeck_ops_invalid_ingredient';
  end if;
  if p_id is null then
    insert into public.mealdeck_ops_ingredients(
      tenant_id,name,base_unit,allergens,reorder_threshold
    ) values (
      p_tenant,trim(p_name),p_unit,p_allergens,p_reorder
    ) returning id into v_id;
  else
    if exists(
      select 1 from public.mealdeck_ops_ingredients i
      where i.id=p_id and i.tenant_id=p_tenant
        and i.base_unit<>p_unit
        and (
          exists(select 1 from public.mealdeck_ops_recipe_lines l
            where l.ingredient_id=i.id and l.tenant_id=p_tenant)
          or exists(select 1 from public.mealdeck_ops_stock_movements sm
            where sm.ingredient_id=i.id and sm.tenant_id=p_tenant)
          or exists(select 1 from public.mealdeck_ops_ingredient_costs c
            where c.ingredient_id=i.id and c.tenant_id=p_tenant)
        )
    ) then raise exception 'mealdeck_ops_ingredient_unit_in_use'; end if;
    update public.mealdeck_ops_ingredients i
      set name=trim(p_name),base_unit=p_unit,allergens=p_allergens,
          reorder_threshold=p_reorder,updated_at=now()
      where i.id=p_id and i.tenant_id=p_tenant
      returning id into v_id;
    if v_id is null then raise exception 'mealdeck_ops_ingredient_not_found'; end if;
  end if;
  return v_id;
end;
$$;

create or replace function public.mealdeck_ops_recipe_list(
  p_tenant uuid,p_location uuid
) returns table(
  recipe_id uuid,menu_item_id uuid,item_name text,brand_name text,
  version integer,yield_units numeric,prep_minutes integer,
  instructions text,ingredients jsonb,updated_at timestamptz
)
language plpgsql stable security definer set search_path=''
as $$
begin
  if not mealdeck_ops_private.can(p_tenant,p_location,'recipes.read') then
    raise exception 'mealdeck_ops_forbidden';
  end if;
  return query
    select r.id,r.menu_item_id,m.name::text,b.name::text,
      r.version,r.yield_units,r.prep_minutes,r.instructions,
      coalesce((
        select jsonb_agg(jsonb_build_object(
          'ingredientId',l.ingredient_id,'name',i.name,'unit',i.base_unit,
          'quantity',l.quantity,'wastePercent',l.waste_pct,
          'allergens',i.allergens
        ) order by i.name)
        from public.mealdeck_ops_recipe_lines l
        join public.mealdeck_ops_ingredients i
          on i.id=l.ingredient_id and i.tenant_id=p_tenant
        where l.recipe_id=r.id and l.tenant_id=p_tenant
      ),'[]'::jsonb),r.updated_at
    from public.mealdeck_ops_recipes r
    join public.menu_items m on m.id=r.menu_item_id and m.tenant_id=p_tenant
    left join public.tenant_brands b on b.id=m.brand_id and b.tenant_id=p_tenant
    where r.tenant_id=p_tenant
      and (
        mealdeck_ops_private.can(p_tenant,null,'recipes.read')
        or exists(
          select 1 from public.menu_item_station_routes sr
          where sr.tenant_id=p_tenant and sr.location_id=p_location
            and sr.item_id=r.menu_item_id
        )
      )
    order by b.name,m.name
    limit 500;
end;
$$;

create or replace function public.mealdeck_ops_save_recipe(
  p_tenant uuid,p_item uuid,p_yield numeric,p_prep integer,
  p_instructions text,p_ingredients jsonb
) returns uuid
language plpgsql security definer set search_path=''
as $$
declare
  v_existing public.mealdeck_ops_recipes%rowtype;
  v_id uuid;
  v_line jsonb;
  v_ingredient uuid;
  v_quantity numeric;
  v_waste numeric;
  v_count integer:=0;
begin
  if not mealdeck_ops_private.can(p_tenant,null,'recipes.write') then
    raise exception 'mealdeck_ops_global_recipes_permission_required';
  end if;
  if not exists(select 1 from public.menu_items m
    where m.id=p_item and m.tenant_id=p_tenant) then
    raise exception 'mealdeck_ops_menu_item_not_found';
  end if;
  if p_yield is null or p_yield<=0 or p_yield>100000
    or p_prep is null or p_prep<0 or p_prep>1440
    or length(coalesce(p_instructions,''))>12000
    or p_ingredients is null or jsonb_typeof(p_ingredients)<>'array'
    or jsonb_array_length(p_ingredients)>60 then
    raise exception 'mealdeck_ops_recipe_invalid';
  end if;

  select * into v_existing from public.mealdeck_ops_recipes r
    where r.tenant_id=p_tenant and r.menu_item_id=p_item for update;
  if found then
    insert into public.mealdeck_ops_recipe_history(
      tenant_id,recipe_id,version,snapshot,archived_by
    )
    select p_tenant,v_existing.id,v_existing.version,jsonb_build_object(
      'yield',v_existing.yield_units,'prepMinutes',v_existing.prep_minutes,
      'instructions',v_existing.instructions,
      'ingredients',coalesce((
        select jsonb_agg(jsonb_build_object(
          'ingredientId',l.ingredient_id,
          'quantity',l.quantity,'wastePercent',l.waste_pct
        ) order by l.ingredient_id)
        from public.mealdeck_ops_recipe_lines l
        where l.tenant_id=p_tenant and l.recipe_id=v_existing.id
      ),'[]'::jsonb)
    ),(select auth.uid());
    update public.mealdeck_ops_recipes r
      set yield_units=p_yield,prep_minutes=p_prep,
        instructions=coalesce(p_instructions,''),version=r.version+1,
        updated_by=(select auth.uid()),updated_at=now()
      where r.id=v_existing.id and r.tenant_id=p_tenant
      returning id into v_id;
    delete from public.mealdeck_ops_recipe_lines l
      where l.tenant_id=p_tenant and l.recipe_id=v_id;
  else
    insert into public.mealdeck_ops_recipes(
      tenant_id,menu_item_id,yield_units,prep_minutes,instructions,updated_by
    ) values (
      p_tenant,p_item,p_yield,p_prep,coalesce(p_instructions,''),(select auth.uid())
    ) returning id into v_id;
  end if;

  for v_line in select value from jsonb_array_elements(p_ingredients)
    as e(value)
  loop
    if jsonb_typeof(v_line)<>'object'
      or coalesce(v_line->>'ingredientId','') !~
        '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'
      or coalesce(v_line->>'quantity','') !~ '^[0-9]+([.][0-9]{1,3})?$'
      or coalesce(v_line->>'wastePercent','') !~ '^[0-9]+([.][0-9]{1,2})?$' then
      raise exception 'mealdeck_ops_recipe_line_invalid';
    end if;
    v_ingredient=(v_line->>'ingredientId')::uuid;
    v_quantity=(v_line->>'quantity')::numeric;
    v_waste=(v_line->>'wastePercent')::numeric;
    if v_quantity<=0 or v_quantity>1000000 or v_waste<0 or v_waste>100
      or not exists(select 1 from public.mealdeck_ops_ingredients i
        where i.id=v_ingredient and i.tenant_id=p_tenant and i.active) then
      raise exception 'mealdeck_ops_recipe_ingredient_invalid';
    end if;
    insert into public.mealdeck_ops_recipe_lines(
      tenant_id,recipe_id,ingredient_id,quantity,waste_pct
    ) values (p_tenant,v_id,v_ingredient,v_quantity,v_waste);
    v_count=v_count+1;
  end loop;
  return v_id;
end;
$$;

create or replace function public.mealdeck_ops_record_ingredient_cost(
  p_tenant uuid,p_location uuid,p_ingredient uuid,
  p_effective date,p_supplier text,p_unit_cost numeric
) returns uuid
language plpgsql security definer set search_path=''
as $$
declare v_id uuid;
begin
  if not mealdeck_ops_private.can(p_tenant,p_location,'costs.write') then
    raise exception 'mealdeck_ops_forbidden';
  end if;
  if not exists(select 1 from public.tenant_locations l
      where l.id=p_location and l.tenant_id=p_tenant)
    or not exists(select 1 from public.mealdeck_ops_ingredients i
      where i.id=p_ingredient and i.tenant_id=p_tenant) then
    raise exception 'mealdeck_ops_location_or_ingredient_mismatch';
  end if;
  if p_effective is null or p_effective>current_date+interval '31 days'
    or p_supplier is null or length(p_supplier)>160
    or p_unit_cost is null or p_unit_cost<0 or p_unit_cost>1000000 then
    raise exception 'mealdeck_ops_invalid_cost_quote';
  end if;
  insert into public.mealdeck_ops_ingredient_costs(
    tenant_id,location_id,ingredient_id,effective_on,supplier,
    cost_per_unit_pence,recorded_by
  ) values(
    p_tenant,p_location,p_ingredient,p_effective,p_supplier,p_unit_cost,
    (select auth.uid())
  ) returning id into v_id;
  return v_id;
end;
$$;

create or replace function public.mealdeck_ops_cost_list(
  p_tenant uuid,p_location uuid
) returns table(
  ingredient_id uuid,ingredient_name text,base_unit text,
  cost_per_unit_pence numeric,effective_on date,supplier text
)
language plpgsql stable security definer set search_path=''
as $$
begin
  if not mealdeck_ops_private.can(p_tenant,p_location,'costs.read') then
    raise exception 'mealdeck_ops_forbidden';
  end if;
  return query
    select i.id,i.name,i.base_unit,quote.cost_per_unit_pence,
      quote.effective_on,quote.supplier
    from public.mealdeck_ops_ingredients i
    left join lateral (
      select c.cost_per_unit_pence,c.effective_on,c.supplier
      from public.mealdeck_ops_ingredient_costs c
      where c.tenant_id=p_tenant and c.location_id=p_location
        and c.ingredient_id=i.id and c.effective_on<=current_date
      order by c.effective_on desc,c.created_at desc
      limit 1
    ) quote on true
    where i.tenant_id=p_tenant
    order by i.name
    limit 1000;
end;
$$;

create or replace function public.mealdeck_ops_recipe_costs(
  p_tenant uuid,p_location uuid
) returns table(
  menu_item_id uuid,menu_item_name text,recipe_version integer,
  estimated_cost_pence integer,missing_ingredient_costs integer
)
language plpgsql stable security definer set search_path=''
as $$
begin
  if not mealdeck_ops_private.can(p_tenant,p_location,'costs.read') then
    raise exception 'mealdeck_ops_forbidden';
  end if;
  return query
    select r.menu_item_id,m.name::text,r.version,
      case
        when count(l.ingredient_id)=0
          or count(quote.cost_per_unit_pence)<>count(l.ingredient_id)
          then null::integer
        else round(sum(
          l.quantity*(1+l.waste_pct/100)*quote.cost_per_unit_pence
        )/r.yield_units)::integer
      end as estimated_cost_pence,
      (count(l.ingredient_id)-count(quote.cost_per_unit_pence))::integer
        as missing_ingredient_costs
    from public.mealdeck_ops_recipes r
    join public.menu_items m on m.id=r.menu_item_id and m.tenant_id=p_tenant
    left join public.mealdeck_ops_recipe_lines l
      on l.recipe_id=r.id and l.tenant_id=p_tenant
    left join lateral(
      select c.cost_per_unit_pence from public.mealdeck_ops_ingredient_costs c
      where c.tenant_id=p_tenant and c.location_id=p_location
        and c.ingredient_id=l.ingredient_id
        and c.effective_on<=current_date
      order by c.effective_on desc,c.created_at desc
      limit 1
    ) quote on true
    where r.tenant_id=p_tenant
    group by r.id,r.menu_item_id,m.name,r.version,r.yield_units
    order by m.name
    limit 500;
end;
$$;

create or replace function public.mealdeck_ops_record_stock(
  p_tenant uuid,p_location uuid,p_ingredient uuid,
  p_delta numeric,p_reason text,p_note text
) returns uuid
language plpgsql security definer set search_path=''
as $$
declare v_id uuid;
begin
  if not mealdeck_ops_private.can(p_tenant,p_location,'inventory.write') then
    raise exception 'mealdeck_ops_forbidden';
  end if;
  if not exists(select 1 from public.tenant_locations l
    where l.id=p_location and l.tenant_id=p_tenant)
    or not exists(select 1 from public.mealdeck_ops_ingredients i
      where i.id=p_ingredient and i.tenant_id=p_tenant) then
    raise exception 'mealdeck_ops_location_or_ingredient_mismatch';
  end if;
  if p_delta is null or p_delta=0 or abs(p_delta)>1000000 or
    p_reason not in ('opening','purchase','production','waste',
                     'adjustment','transfer_in','transfer_out')
    or length(coalesce(p_note,''))>300
    or (p_reason in ('opening','purchase','transfer_in') and p_delta<=0)
    or (p_reason in ('production','waste','transfer_out') and p_delta>=0) then
    raise exception 'mealdeck_ops_invalid_stock_movement';
  end if;
  insert into public.mealdeck_ops_stock_movements(
    tenant_id,location_id,ingredient_id,delta_qty,reason,note,recorded_by
  ) values(
    p_tenant,p_location,p_ingredient,p_delta,p_reason,coalesce(p_note,''),
    (select auth.uid())
  ) returning id into v_id;
  return v_id;
end;
$$;

create or replace function public.mealdeck_ops_stock_levels(
  p_tenant uuid,p_location uuid
) returns table(
  ingredient_id uuid,name text,base_unit text,
  quantity numeric,reorder_threshold numeric
)
language plpgsql stable security definer set search_path=''
as $$
begin
  if not mealdeck_ops_private.can(p_tenant,p_location,'inventory.read') then
    raise exception 'mealdeck_ops_forbidden';
  end if;
  return query
    select i.id,i.name,i.base_unit,coalesce(sum(s.delta_qty),0)::numeric,
      i.reorder_threshold
    from public.mealdeck_ops_ingredients i
    left join public.mealdeck_ops_stock_movements s
      on s.tenant_id=p_tenant and s.location_id=p_location
      and s.ingredient_id=i.id
    where i.tenant_id=p_tenant and i.active
    group by i.id,i.name,i.base_unit,i.reorder_threshold
    order by i.name limit 1000;
end;
$$;

create or replace function public.mealdeck_ops_add_expense(
  p_tenant uuid,p_location uuid,p_date date,
  p_category text,p_amount_pence bigint,p_note text
) returns uuid
language plpgsql security definer set search_path=''
as $$
declare v_id uuid;
begin
  if not mealdeck_ops_private.can(p_tenant,p_location,'finance.manage') then
    raise exception 'mealdeck_ops_forbidden';
  end if;
  if not exists(select 1 from public.tenant_locations l
    where l.id=p_location and l.tenant_id=p_tenant)
    or p_date is null or p_date>current_date+interval '31 days'
    or p_category not in (
      'labour','rent','utilities','marketing','packaging','supplies',
      'software','repair','transport','other'
    ) or p_amount_pence is null or p_amount_pence<=0
    or p_amount_pence>1000000000
    or length(coalesce(p_note,''))>300 then
    raise exception 'mealdeck_ops_invalid_expense';
  end if;
  insert into public.mealdeck_ops_expenses(
    tenant_id,location_id,occurred_on,category,amount_pence,note,recorded_by
  ) values(
    p_tenant,p_location,p_date,p_category,p_amount_pence,
    coalesce(p_note,''),(select auth.uid())
  ) returning id into v_id;
  return v_id;
end;
$$;

create or replace function public.mealdeck_ops_expense_list(
  p_tenant uuid,p_location uuid,p_from date,p_to date
) returns table(
  expense_id uuid,occurred_on date,category text,amount_pence bigint,note text
)
language plpgsql stable security definer set search_path=''
as $$
begin
  if not mealdeck_ops_private.can(p_tenant,p_location,'finance.read') then
    raise exception 'mealdeck_ops_forbidden';
  end if;
  if p_from is null or p_to is null or p_to<p_from
    or p_to-p_from>93 then raise exception 'mealdeck_ops_invalid_period'; end if;
  return query
    select e.id,e.occurred_on,e.category,e.amount_pence,e.note
    from public.mealdeck_ops_expenses e
    where e.tenant_id=p_tenant and e.location_id=p_location
      and e.occurred_on between p_from and p_to
    order by e.occurred_on desc,e.created_at desc
    limit 500;
end;
$$;

-- Order history is read from the canonical Dishbee order ledger, without
-- customer email/phone or unrestricted order notes in the overview.
create or replace function public.mealdeck_ops_order_history(
  p_tenant uuid,p_location uuid,p_from date,p_to date
) returns table(
  order_id uuid,source text,status text,fulfilment text,
  created_at timestamptz,paid_at timestamptz,
  total_pence integer,item_count bigint
)
language plpgsql stable security definer set search_path=''
as $$
begin
  if not mealdeck_ops_private.can(p_tenant,p_location,'orders.read') then
    raise exception 'mealdeck_ops_forbidden';
  end if;
  if p_from is null or p_to is null or p_to<p_from
     or p_to-p_from>93 then raise exception 'mealdeck_ops_invalid_period'; end if;
  return query
    select o.id,o.source::text,o.status::text,o.fulfilment::text,
      o.created_at,o.paid_at,o.total_pence,
      coalesce(sum(i.quantity),0)::bigint as item_count
    from public.orders o
    left join public.order_items i
      on i.order_id=o.id and i.tenant_id=p_tenant
    where o.tenant_id=p_tenant and o.location_id=p_location
      and o.created_at >= p_from::timestamptz
      and o.created_at < (p_to+1)::timestamptz
    group by o.id,o.source,o.status,o.fulfilment,o.created_at,
      o.paid_at,o.total_pence
    order by o.created_at desc
    limit 250;
end;
$$;

-- Line-item drill-down preserves canonical item notes/modifiers for authorised
-- operations staff; it deliberately excludes customer contact details.
create or replace function public.mealdeck_ops_order_lines(
  p_tenant uuid,p_location uuid,p_order uuid
) returns table(
  item_id uuid,item_name text,brand_name text,quantity integer,
  unit_price_pence integer,modifiers jsonb,notes text
)
language plpgsql stable security definer set search_path=''
as $$
begin
  if not mealdeck_ops_private.can(p_tenant,p_location,'orders.read') then
    raise exception 'mealdeck_ops_forbidden';
  end if;
  if not exists(select 1 from public.orders o
      where o.id=p_order and o.tenant_id=p_tenant and o.location_id=p_location)
  then raise exception 'mealdeck_ops_order_not_found'; end if;
  return query
    select i.id,i.item_name::text,b.name::text,
      i.quantity,i.unit_price_pence,i.modifiers,i.notes::text
    from public.order_items i
    left join public.tenant_brands b
      on b.id=i.brand_id and b.tenant_id=p_tenant
    where i.order_id=p_order and i.tenant_id=p_tenant
    order by i.id
    limit 250;
end;
$$;

-- Analytics totals: "paid" means Dishbee has a recorded paid_at; it does not
-- establish Adyen bank settlement or a VAT-exclusive accounting net figure.
create or replace function public.mealdeck_ops_analytics(
  p_tenant uuid,p_location uuid,p_from date,p_to date
) returns jsonb
language plpgsql stable security definer set search_path=''
as $$
declare v_result jsonb;
begin
  if not mealdeck_ops_private.can(p_tenant,p_location,'analytics.read') then
    raise exception 'mealdeck_ops_forbidden';
  end if;
  if p_from is null or p_to is null or p_to<p_from
    or p_to-p_from>93 then raise exception 'mealdeck_ops_invalid_period'; end if;
  select jsonb_build_object(
    'periodFrom',p_from,'periodTo',p_to,
    'paidOrders',count(*) filter(where o.paid_at is not null),
    'recordedPaidGrossPence',coalesce(sum(o.total_pence) filter(
      where o.paid_at is not null),0),
    'daily',coalesce((
      select jsonb_agg(jsonb_build_object(
        'date',x.day,'orders',x.orders,'grossPence',x.gross
      ) order by x.day)
      from (
        select o2.paid_at::date day,count(*) orders,sum(o2.total_pence) gross
        from public.orders o2
        where o2.tenant_id=p_tenant and o2.location_id=p_location
          and o2.paid_at::date between p_from and p_to
        group by o2.paid_at::date
      ) x
    ),'[]'::jsonb),
    'channels',coalesce((
      select jsonb_agg(jsonb_build_object(
        'source',x.source,'orders',x.orders,'grossPence',x.gross
      ) order by x.orders desc)
      from (
        select coalesce(o3.source,'unknown') source,
          count(*) orders,sum(o3.total_pence) gross
        from public.orders o3
        where o3.tenant_id=p_tenant and o3.location_id=p_location
          and o3.paid_at::date between p_from and p_to
        group by coalesce(o3.source,'unknown')
      ) x
    ),'[]'::jsonb)
  ) into v_result
  from public.orders o
  where o.tenant_id=p_tenant and o.location_id=p_location
    and o.paid_at::date between p_from and p_to;
  return v_result;
end;
$$;

-- Sales mix is grouped from paid Dishbee order items; totals exclude
-- delivery fees, provider charges, refunds and unverified marketplace events.
create or replace function public.mealdeck_ops_brand_sales(
  p_tenant uuid,p_location uuid,p_from date,p_to date
) returns table(
  brand_id uuid,brand_name text,item_count bigint,
  order_count bigint,recorded_goods_gross_pence bigint
)
language plpgsql stable security definer set search_path=''
as $$
begin
  if not mealdeck_ops_private.can(p_tenant,p_location,'analytics.read') then
    raise exception 'mealdeck_ops_forbidden';
  end if;
  if p_from is null or p_to is null or p_to<p_from
    or p_to-p_from>93 then raise exception 'mealdeck_ops_invalid_period'; end if;
  return query
    select i.brand_id,coalesce(b.name,'Unassigned')::text,
      coalesce(sum(i.quantity),0)::bigint,count(distinct o.id)::bigint,
      coalesce(sum(i.quantity*i.unit_price_pence),0)::bigint
    from public.orders o
    join public.order_items i
      on i.order_id=o.id and i.tenant_id=p_tenant
    left join public.tenant_brands b
      on b.id=i.brand_id and b.tenant_id=p_tenant
    where o.tenant_id=p_tenant and o.location_id=p_location
      and o.paid_at::date between p_from and p_to
    group by i.brand_id,b.name
    order by coalesce(sum(i.quantity*i.unit_price_pence),0) desc
    limit 100;
end;
$$;

create or replace function public.mealdeck_ops_finance_summary(
  p_tenant uuid,p_location uuid,p_from date,p_to date
) returns jsonb
language plpgsql stable security definer set search_path=''
as $$
declare
  v_paid bigint;
  v_paid_orders bigint;
  v_pending bigint;
  v_pending_value bigint;
  v_refunds bigint;
  v_expenses bigint;
begin
  if not mealdeck_ops_private.can(p_tenant,p_location,'finance.read') then
    raise exception 'mealdeck_ops_forbidden';
  end if;
  if p_from is null or p_to is null or p_to<p_from
    or p_to-p_from>93 then raise exception 'mealdeck_ops_invalid_period'; end if;

  select coalesce(sum(o.total_pence),0),count(*)
    into v_paid,v_paid_orders
    from public.orders o
    where o.tenant_id=p_tenant and o.location_id=p_location
      and o.paid_at::date between p_from and p_to;

  select count(*),coalesce(sum(o.total_pence),0)
    into v_pending,v_pending_value
    from public.orders o
    where o.tenant_id=p_tenant and o.location_id=p_location
      and o.status='payment_pending'
      and o.created_at::date between p_from and p_to;

  select coalesce(sum(r.amount_pence),0) into v_refunds
    from public.hive_refund_allocations r
    where r.tenant_id=p_tenant and r.location_id=p_location
      and r.status='settled'
      and r.created_at::date between p_from and p_to;

  select coalesce(sum(e.amount_pence),0) into v_expenses
    from public.mealdeck_ops_expenses e
    where e.tenant_id=p_tenant and e.location_id=p_location
      and e.occurred_on between p_from and p_to;

  return jsonb_build_object(
    'periodFrom',p_from,'periodTo',p_to,
    'recordedPaidGrossPence',v_paid,
    'recordedPaidOrders',v_paid_orders,
    'pendingOrderCount',v_pending,
    'pendingOrderValuePence',v_pending_value,
    'settledHiveRefundsPence',v_refunds,
    'recordedManualExpensesPence',v_expenses,
    'unreconciled',true,
    'vatCalculated',false,
    'actualCogsCalculated',false,
    'bankSettlementVerified',false
  );
end;
$$;

do $$
declare sig record;
begin
  for sig in select * from (values
    ('mealdeck_ops_ingredient_list(uuid,uuid)'),
    ('mealdeck_ops_upsert_ingredient(uuid,uuid,text,text,text[],numeric)'),
    ('mealdeck_ops_recipe_list(uuid,uuid)'),
    ('mealdeck_ops_save_recipe(uuid,uuid,numeric,integer,text,jsonb)'),
    ('mealdeck_ops_record_ingredient_cost(uuid,uuid,uuid,date,text,numeric)'),
    ('mealdeck_ops_cost_list(uuid,uuid)'),
    ('mealdeck_ops_recipe_costs(uuid,uuid)'),
    ('mealdeck_ops_record_stock(uuid,uuid,uuid,numeric,text,text)'),
    ('mealdeck_ops_stock_levels(uuid,uuid)'),
    ('mealdeck_ops_add_expense(uuid,uuid,date,text,bigint,text)'),
    ('mealdeck_ops_expense_list(uuid,uuid,date,date)'),
    ('mealdeck_ops_order_history(uuid,uuid,date,date)'),
    ('mealdeck_ops_order_lines(uuid,uuid,uuid)'),
    ('mealdeck_ops_analytics(uuid,uuid,date,date)'),
    ('mealdeck_ops_finance_summary(uuid,uuid,date,date)'),
    ('mealdeck_ops_brand_sales(uuid,uuid,date,date)')
  ) as f(signature) loop
    execute format('revoke all on function public.%s from public,anon,authenticated',sig.signature);
    execute format('grant execute on function public.%s to authenticated',sig.signature);
  end loop;
end $$;
