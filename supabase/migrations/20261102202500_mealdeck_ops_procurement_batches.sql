-- MealDeck Phase 8: controlled supplier purchasing, receiving and lot provenance.
-- Depends on both Phase 7 MealDeck ops migrations AND canonical Dishbee schema.
-- Source only until approved staging replay. Never posts payments, VAT, KDS,
-- bank settlement or an external supplier purchase automatically.
-- All public tables have RLS ENABLED and NO direct client write grants.

create table public.mealdeck_ops_suppliers(
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  name text not null check(length(trim(name)) between 2 and 160),
  contact_email text check(contact_email is null or length(contact_email)<=254),
  lead_time_days integer not null default 2 check(lead_time_days between 0 and 180),
  status text not null default 'active' check(status in ('active','paused')),
  note text not null default '' check(length(note)<=400),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(tenant_id,id),
  unique(tenant_id,name)
);

create table public.mealdeck_ops_purchase_orders(
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  location_id uuid not null references public.tenant_locations(id) on delete cascade,
  supplier_id uuid not null,
  status text not null default 'draft' check(status in (
    'draft','submitted','approved','partially_received','received','cancelled'
  )),
  currency text not null default 'GBP' check(currency='GBP'),
  note text not null default '' check(length(note)<=500),
  created_by uuid not null references auth.users(id),
  approved_by uuid references auth.users(id) on delete set null,
  approved_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(tenant_id,location_id,id),
  foreign key(tenant_id,supplier_id)
    references public.mealdeck_ops_suppliers(tenant_id,id)
);

create table public.mealdeck_ops_purchase_lines(
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  location_id uuid not null references public.tenant_locations(id) on delete cascade,
  purchase_order_id uuid not null,
  ingredient_id uuid not null,
  pack_count integer not null check(pack_count between 1 and 10000),
  base_units_per_pack numeric(14,3) not null
    check(base_units_per_pack>0 and base_units_per_pack<=1000000),
  price_per_pack_pence integer not null
    check(price_per_pack_pence between 0 and 10000000),
  received_base_units numeric(16,3) not null default 0
    check(received_base_units>=0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(tenant_id,location_id,id),
  unique(purchase_order_id,ingredient_id),
  foreign key(tenant_id,location_id,purchase_order_id)
    references public.mealdeck_ops_purchase_orders(tenant_id,location_id,id),
  foreign key(tenant_id,ingredient_id)
    references public.mealdeck_ops_ingredients(tenant_id,id)
);

-- Batch balances are TRACKED lots, not an assertion that the wider legacy
-- stock ledger has been reconciled for older unassigned consumption.
create table public.mealdeck_ops_stock_batches(
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  location_id uuid not null references public.tenant_locations(id) on delete cascade,
  ingredient_id uuid not null,
  supplier_id uuid not null,
  purchase_order_id uuid not null,
  batch_code text not null check(length(trim(batch_code)) between 1 and 100),
  expiry_kind text not null check(expiry_kind in ('use_by','best_before','none')),
  expiry_on date,
  received_base_units numeric(16,3) not null default 0
    check(received_base_units>=0),
  issued_base_units numeric(16,3) not null default 0
    check(issued_base_units>=0 and issued_base_units<=received_base_units),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check ((expiry_kind='none' and expiry_on is null) or
         (expiry_kind<>'none' and expiry_on is not null)),
  unique(tenant_id,location_id,id),
  unique(tenant_id,location_id,ingredient_id,batch_code),
  foreign key(tenant_id,location_id,purchase_order_id)
    references public.mealdeck_ops_purchase_orders(tenant_id,location_id,id),
  foreign key(tenant_id,supplier_id)
    references public.mealdeck_ops_suppliers(tenant_id,id),
  foreign key(tenant_id,ingredient_id)
    references public.mealdeck_ops_ingredients(tenant_id,id)
);

create table public.mealdeck_ops_purchase_receipts(
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  location_id uuid not null references public.tenant_locations(id) on delete cascade,
  purchase_line_id uuid not null,
  batch_id uuid not null,
  delivery_reference text not null
    check(length(trim(delivery_reference)) between 2 and 100),
  base_quantity numeric(16,3) not null
    check(base_quantity>0 and base_quantity<=10000000),
  received_by uuid not null references auth.users(id),
  received_at timestamptz not null default now(),
  unique(purchase_line_id,delivery_reference),
  foreign key(tenant_id,location_id,purchase_line_id)
    references public.mealdeck_ops_purchase_lines(tenant_id,location_id,id),
  foreign key(tenant_id,location_id,batch_id)
    references public.mealdeck_ops_stock_batches(tenant_id,location_id,id)
);

create table public.mealdeck_ops_batch_issues(
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  location_id uuid not null references public.tenant_locations(id) on delete cascade,
  batch_id uuid not null,
  issue_reference text not null check(length(trim(issue_reference)) between 2 and 100),
  base_quantity numeric(16,3) not null check(base_quantity>0),
  reason text not null check(reason in ('production','waste','adjustment')),
  note text not null default '' check(length(note)<=300),
  issued_by uuid not null references auth.users(id),
  issued_at timestamptz not null default now(),
  unique(tenant_id,location_id,issue_reference),
  foreign key(tenant_id,location_id,batch_id)
    references public.mealdeck_ops_stock_batches(tenant_id,location_id,id)
);

do $$
declare t text;
begin
  foreach t in array array[
    'mealdeck_ops_suppliers','mealdeck_ops_purchase_orders',
    'mealdeck_ops_purchase_lines','mealdeck_ops_stock_batches',
    'mealdeck_ops_purchase_receipts','mealdeck_ops_batch_issues'
  ] loop
    execute format('alter table public.%I enable row level security',t);
    execute format('revoke all on table public.%I from public,anon,authenticated',t);
  end loop;
end $$;

-- Kitchen users may read supplier names for their own POs, but NOT commercial
-- contact details; a finance-authorised role can read the full supplier master.
create or replace function public.mealdeck_ops_supplier_list(
  p_tenant uuid,p_location uuid
) returns table(
  supplier_id uuid,name text,contact_email text,
  lead_time_days integer,status text
)
language plpgsql stable security definer set search_path=''
as $$
begin
  if not(
    mealdeck_ops_private.can(p_tenant,p_location,'inventory.read') or
    mealdeck_ops_private.can(p_tenant,p_location,'finance.read')
  ) then raise exception 'mealdeck_ops_forbidden'; end if;
  return query
    select s.id,s.name::text,
      case when mealdeck_ops_private.can(p_tenant,p_location,'finance.read')
        then s.contact_email::text else null::text end,
      s.lead_time_days,s.status
    from public.mealdeck_ops_suppliers s
    where s.tenant_id=p_tenant
      and (
        mealdeck_ops_private.can(p_tenant,p_location,'finance.read') or
        exists(select 1 from public.mealdeck_ops_purchase_orders o
          where o.tenant_id=p_tenant and o.location_id=p_location
            and o.supplier_id=s.id)
      )
    order by s.name limit 200;
end;
$$;

create or replace function public.mealdeck_ops_save_supplier(
  p_tenant uuid,p_id uuid,p_name text,p_email text,
  p_lead_days integer,p_status text
) returns uuid
language plpgsql security definer set search_path=''
as $$
declare v_id uuid;
begin
  if not mealdeck_ops_private.can(p_tenant,null,'finance.manage') then
    raise exception 'mealdeck_ops_global_finance_required';
  end if;
  if nullif(trim(coalesce(p_name,'')),'') is null
    or length(trim(p_name)) not between 2 and 160
    or length(coalesce(p_email,''))>254
    or (nullif(trim(coalesce(p_email,'')),'') is not null and
        p_email !~ '^[^[:space:]@]+@[^[:space:]@]+[.][^[:space:]@]+$')
    or p_lead_days is null or p_lead_days not between 0 and 180
    or p_status not in ('active','paused') then
    raise exception 'mealdeck_ops_invalid_supplier';
  end if;
  if p_id is null then
    insert into public.mealdeck_ops_suppliers(
      tenant_id,name,contact_email,lead_time_days,status
    ) values(
      p_tenant,trim(p_name),nullif(trim(coalesce(p_email,'')),''),
      p_lead_days,p_status
    ) returning id into v_id;
  else
    update public.mealdeck_ops_suppliers s
    set name=trim(p_name),contact_email=nullif(trim(coalesce(p_email,'')),''),
      lead_time_days=p_lead_days,status=p_status,updated_at=now()
    where s.id=p_id and s.tenant_id=p_tenant
    returning id into v_id;
    if v_id is null then raise exception 'mealdeck_ops_supplier_not_found'; end if;
  end if;
  insert into public.mealdeck_ops_audit_log(
    tenant_id,actor_id,action,entity_type,entity_id,next_value
  ) values(
    p_tenant,(select auth.uid()),'supplier.save','supplier',v_id,
    jsonb_build_object('name',trim(p_name),'status',p_status)
  );
  return v_id;
end;
$$;

create or replace function public.mealdeck_ops_purchase_list(
  p_tenant uuid,p_location uuid
) returns table(
  order_id uuid,supplier_name text,status text,created_at timestamptz,
  approved_at timestamptz,ordered_units numeric,received_units numeric,
  quoted_total_pence bigint,note text,created_by uuid
)
language plpgsql stable security definer set search_path=''
as $$
begin
  if not(
    mealdeck_ops_private.can(p_tenant,p_location,'inventory.read') or
    mealdeck_ops_private.can(p_tenant,p_location,'finance.read')
  ) then raise exception 'mealdeck_ops_forbidden'; end if;
  return query
    select o.id,s.name::text,o.status,o.created_at,o.approved_at,
      coalesce(sum(l.pack_count*l.base_units_per_pack),0)::numeric,
      coalesce(sum(l.received_base_units),0)::numeric,
      case when mealdeck_ops_private.can(p_tenant,p_location,'costs.read')
        then coalesce(sum(l.pack_count::bigint*l.price_per_pack_pence),0)
        else null::bigint end as quoted_total_pence,
      o.note,o.created_by
    from public.mealdeck_ops_purchase_orders o
    join public.mealdeck_ops_suppliers s
      on s.id=o.supplier_id and s.tenant_id=p_tenant
    left join public.mealdeck_ops_purchase_lines l
      on l.purchase_order_id=o.id and l.tenant_id=p_tenant
        and l.location_id=p_location
    where o.tenant_id=p_tenant and o.location_id=p_location
    group by o.id,s.name
    order by o.created_at desc limit 200;
end;
$$;

create or replace function public.mealdeck_ops_purchase_lines_list(
  p_tenant uuid,p_location uuid,p_order uuid
) returns table(
  line_id uuid,ingredient_id uuid,ingredient_name text,base_unit text,
  pack_count integer,base_units_per_pack numeric,
  received_base_units numeric,price_per_pack_pence integer
)
language plpgsql stable security definer set search_path=''
as $$
begin
  if not(
    mealdeck_ops_private.can(p_tenant,p_location,'inventory.read') or
    mealdeck_ops_private.can(p_tenant,p_location,'finance.read')
  ) then raise exception 'mealdeck_ops_forbidden'; end if;
  if not exists(select 1 from public.mealdeck_ops_purchase_orders o
      where o.id=p_order and o.tenant_id=p_tenant
        and o.location_id=p_location) then
    raise exception 'mealdeck_ops_purchase_order_not_found';
  end if;
  return query select l.id,l.ingredient_id,i.name::text,i.base_unit::text,
      l.pack_count,l.base_units_per_pack,l.received_base_units,
      case when mealdeck_ops_private.can(p_tenant,p_location,'costs.read')
        then l.price_per_pack_pence else null::integer end
    from public.mealdeck_ops_purchase_lines l
    join public.mealdeck_ops_ingredients i
      on i.id=l.ingredient_id and i.tenant_id=p_tenant
    where l.purchase_order_id=p_order and l.tenant_id=p_tenant
      and l.location_id=p_location
    order by i.name;
end;
$$;

create or replace function public.mealdeck_ops_create_purchase(
  p_tenant uuid,p_location uuid,p_supplier uuid,p_note text
) returns uuid
language plpgsql security definer set search_path=''
as $$
declare v_id uuid;
begin
  if not mealdeck_ops_private.can(p_tenant,p_location,'finance.manage') then
    raise exception 'mealdeck_ops_forbidden';
  end if;
  if length(coalesce(p_note,''))>500
    or not exists(select 1 from public.tenant_locations x
      where x.tenant_id=p_tenant and x.id=p_location)
    or not exists(select 1 from public.mealdeck_ops_suppliers s
      where s.tenant_id=p_tenant and s.id=p_supplier
        and s.status='active') then
    raise exception 'mealdeck_ops_purchase_location_or_supplier_invalid';
  end if;
  insert into public.mealdeck_ops_purchase_orders(
    tenant_id,location_id,supplier_id,note,created_by
  ) values(
    p_tenant,p_location,p_supplier,coalesce(p_note,''),(select auth.uid())
  ) returning id into v_id;
  insert into public.mealdeck_ops_audit_log(
    tenant_id,location_id,actor_id,action,entity_type,entity_id
  ) values(
    p_tenant,p_location,(select auth.uid()),'purchase.draft','purchase_order',v_id
  );
  return v_id;
end;
$$;

create or replace function public.mealdeck_ops_save_purchase_line(
  p_tenant uuid,p_location uuid,p_order uuid,p_ingredient uuid,
  p_pack_count integer,p_base_units numeric,p_pack_price integer
) returns uuid
language plpgsql security definer set search_path=''
as $$
declare
  v_order public.mealdeck_ops_purchase_orders%rowtype;
  v_id uuid;
begin
  if not mealdeck_ops_private.can(p_tenant,p_location,'finance.manage') then
    raise exception 'mealdeck_ops_forbidden';
  end if;
  select * into v_order from public.mealdeck_ops_purchase_orders o
    where o.id=p_order and o.tenant_id=p_tenant
      and o.location_id=p_location for update;
  if not found or v_order.status<>'draft' then
    raise exception 'mealdeck_ops_purchase_not_editable'; end if;
  if p_pack_count is null or p_pack_count not between 1 and 10000
    or p_base_units is null or p_base_units<=0 or p_base_units>1000000
    or p_pack_price is null or p_pack_price<0 or p_pack_price>10000000
    or p_pack_count::numeric*p_base_units>10000000
    or not exists(select 1 from public.mealdeck_ops_ingredients i
      where i.tenant_id=p_tenant and i.id=p_ingredient and i.active)
  then raise exception 'mealdeck_ops_invalid_purchase_line'; end if;

  insert into public.mealdeck_ops_purchase_lines(
    tenant_id,location_id,purchase_order_id,ingredient_id,
    pack_count,base_units_per_pack,price_per_pack_pence
  ) values(
    p_tenant,p_location,p_order,p_ingredient,
    p_pack_count,p_base_units,p_pack_price
  ) on conflict(purchase_order_id,ingredient_id)
  do update set
    pack_count=excluded.pack_count,
    base_units_per_pack=excluded.base_units_per_pack,
    price_per_pack_pence=excluded.price_per_pack_pence,
    updated_at=now()
  returning id into v_id;
  return v_id;
end;
$$;

-- Explicit two-stage purchase approval. Submission does NOT contact supplier.
-- Only a global finance administrator OTHER than the creator can approve.
create or replace function public.mealdeck_ops_advance_purchase(
  p_tenant uuid,p_location uuid,p_order uuid,p_action text
) returns boolean
language plpgsql security definer set search_path=''
as $$
declare v_order public.mealdeck_ops_purchase_orders%rowtype;
begin
  if not mealdeck_ops_private.can(p_tenant,p_location,'finance.manage') then
    raise exception 'mealdeck_ops_forbidden'; end if;
  select * into v_order from public.mealdeck_ops_purchase_orders o
    where o.id=p_order and o.tenant_id=p_tenant
      and o.location_id=p_location for update;
  if not found then raise exception 'mealdeck_ops_purchase_order_not_found'; end if;

  if p_action='submit' then
    if v_order.status<>'draft'
      or not exists(select 1 from public.mealdeck_ops_purchase_lines l
        where l.tenant_id=p_tenant and l.location_id=p_location
          and l.purchase_order_id=p_order)
    then raise exception 'mealdeck_ops_purchase_not_submittable'; end if;
    update public.mealdeck_ops_purchase_orders o
      set status='submitted',updated_at=now() where o.id=p_order;
  elsif p_action='approve' then
    if not mealdeck_ops_private.can(p_tenant,null,'finance.manage')
      or v_order.status<>'submitted'
      or v_order.created_by=(select auth.uid())
    then raise exception 'mealdeck_ops_second_approver_required'; end if;
    update public.mealdeck_ops_purchase_orders o
      set status='approved',approved_by=(select auth.uid()),
          approved_at=now(),updated_at=now()
      where o.id=p_order;
  elsif p_action='cancel' then
    if v_order.status not in ('draft','submitted')
    then raise exception 'mealdeck_ops_purchase_cannot_cancel'; end if;
    update public.mealdeck_ops_purchase_orders o
      set status='cancelled',updated_at=now() where o.id=p_order;
  else raise exception 'mealdeck_ops_purchase_action_invalid';
  end if;

  insert into public.mealdeck_ops_audit_log(
    tenant_id,location_id,actor_id,action,entity_type,entity_id
  ) values(
    p_tenant,p_location,(select auth.uid()),'purchase.'||p_action,
    'purchase_order',p_order
  );
  return true;
end;
$$;

-- Receive a specific APPROVED PO line into a traceable batch. The PO lock
-- serialises concurrent receipts. The delivery reference is an idempotency
-- key per line, so a duplicate caller does not increase stock twice.
create or replace function public.mealdeck_ops_receive_purchase(
  p_tenant uuid,p_location uuid,p_line uuid,
  p_base_qty numeric,p_batch_code text,p_expiry_kind text,
  p_expiry date,p_delivery_ref text
) returns uuid
language plpgsql security definer set search_path=''
as $$
declare
  v_line public.mealdeck_ops_purchase_lines%rowtype;
  v_order public.mealdeck_ops_purchase_orders%rowtype;
  v_batch public.mealdeck_ops_stock_batches%rowtype;
  v_existing public.mealdeck_ops_purchase_receipts%rowtype;
  v_id uuid;
  v_full boolean;
begin
  if not mealdeck_ops_private.can(p_tenant,p_location,'inventory.write') then
    raise exception 'mealdeck_ops_forbidden'; end if;
  if p_base_qty is null or p_base_qty<=0 or p_base_qty>10000000
    or nullif(trim(coalesce(p_batch_code,'')),'') is null
    or length(trim(p_batch_code))>100
    or nullif(trim(coalesce(p_delivery_ref,'')),'') is null
    or length(trim(p_delivery_ref))<2
    or length(trim(p_delivery_ref))>100
    or p_expiry_kind not in ('use_by','best_before','none')
    or (p_expiry_kind='none' and p_expiry is not null)
    or (p_expiry_kind<>'none' and (p_expiry is null or p_expiry<current_date))
  then raise exception 'mealdeck_ops_invalid_receipt'; end if;

  select * into v_line from public.mealdeck_ops_purchase_lines l
    where l.id=p_line and l.tenant_id=p_tenant
      and l.location_id=p_location;
  if not found then raise exception 'mealdeck_ops_purchase_line_not_found'; end if;
  select * into v_order from public.mealdeck_ops_purchase_orders o
    where o.id=v_line.purchase_order_id and o.tenant_id=p_tenant
      and o.location_id=p_location for update;
  if not found then
    raise exception 'mealdeck_ops_purchase_order_not_found'; end if;
  select * into v_line from public.mealdeck_ops_purchase_lines l
    where l.id=p_line and l.tenant_id=p_tenant
      and l.location_id=p_location for update;

  select * into v_existing from public.mealdeck_ops_purchase_receipts rec
    where rec.purchase_line_id=p_line
      and rec.delivery_reference=trim(p_delivery_ref);
  if found then
    if v_existing.base_quantity<>p_base_qty or
      not exists(
        select 1 from public.mealdeck_ops_stock_batches b
        where b.id=v_existing.batch_id
          and b.tenant_id=p_tenant and b.location_id=p_location
          and b.batch_code=trim(p_batch_code)
          and b.expiry_kind=p_expiry_kind
          and b.expiry_on is not distinct from p_expiry
      ) then raise exception 'mealdeck_ops_receipt_idempotency_mismatch'; end if;
    return v_existing.id;
  end if;

  if v_order.status not in ('approved','partially_received') then
    raise exception 'mealdeck_ops_purchase_not_receivable';
  end if;
  if v_line.received_base_units+p_base_qty >
      v_line.pack_count::numeric*v_line.base_units_per_pack then
    raise exception 'mealdeck_ops_received_quantity_exceeds_purchase'; end if;

  select * into v_batch from public.mealdeck_ops_stock_batches b
    where b.tenant_id=p_tenant and b.location_id=p_location
      and b.ingredient_id=v_line.ingredient_id
      and b.batch_code=trim(p_batch_code) for update;
  if found then
    if v_batch.purchase_order_id<>v_order.id
      or v_batch.supplier_id<>v_order.supplier_id
      or v_batch.expiry_kind<>p_expiry_kind
      or v_batch.expiry_on is distinct from p_expiry
    then raise exception 'mealdeck_ops_batch_provenance_mismatch'; end if;
    update public.mealdeck_ops_stock_batches b
    set received_base_units=b.received_base_units+p_base_qty,updated_at=now()
    where b.id=v_batch.id;
  else
    insert into public.mealdeck_ops_stock_batches(
      tenant_id,location_id,ingredient_id,supplier_id,purchase_order_id,
      batch_code,expiry_kind,expiry_on,received_base_units
    ) values(
      p_tenant,p_location,v_line.ingredient_id,v_order.supplier_id,v_order.id,
      trim(p_batch_code),p_expiry_kind,p_expiry,p_base_qty
    ) returning * into v_batch;
  end if;

  insert into public.mealdeck_ops_purchase_receipts(
    tenant_id,location_id,purchase_line_id,batch_id,
    delivery_reference,base_quantity,received_by
  ) values(
    p_tenant,p_location,p_line,v_batch.id,trim(p_delivery_ref),
    p_base_qty,(select auth.uid())
  ) returning id into v_id;
  update public.mealdeck_ops_purchase_lines l
    set received_base_units=l.received_base_units+p_base_qty,
        updated_at=now()
    where l.id=p_line;

  insert into public.mealdeck_ops_stock_movements(
    tenant_id,location_id,ingredient_id,delta_qty,
    reason,note,recorded_by
  ) values(
    p_tenant,p_location,v_line.ingredient_id,p_base_qty,'purchase',
    left('PO '||v_order.id::text||' · batch '||trim(p_batch_code),300),
    (select auth.uid())
  );

  select bool_and(l.received_base_units>=
    l.pack_count::numeric*l.base_units_per_pack) into v_full
    from public.mealdeck_ops_purchase_lines l
    where l.purchase_order_id=v_order.id and l.tenant_id=p_tenant;
  update public.mealdeck_ops_purchase_orders o
    set status=case when coalesce(v_full,false)
      then 'received' else 'partially_received' end,
      updated_at=now() where o.id=v_order.id;
  insert into public.mealdeck_ops_audit_log(
    tenant_id,location_id,actor_id,action,entity_type,entity_id,next_value
  ) values(
    p_tenant,p_location,(select auth.uid()),'purchase.receive',
    'purchase_receipt',v_id,
    jsonb_build_object('lineId',p_line,'baseQuantity',p_base_qty,
      'batchId',v_batch.id)
  );
  return v_id;
end;
$$;

create or replace function public.mealdeck_ops_batch_list(
  p_tenant uuid,p_location uuid,p_days integer default 14
) returns table(
  batch_id uuid,ingredient_id uuid,ingredient_name text,unit text,
  supplier_name text,batch_code text,expiry_kind text,expiry_on date,
  received_base_units numeric,issued_base_units numeric,
  tracked_balance numeric,expiry_state text
)
language plpgsql stable security definer set search_path=''
as $$
begin
  if not mealdeck_ops_private.can(p_tenant,p_location,'inventory.read') then
    raise exception 'mealdeck_ops_forbidden'; end if;
  if p_days is null or p_days not between 1 and 90 then
    raise exception 'mealdeck_ops_expiry_window_invalid'; end if;
  return query
    select b.id,b.ingredient_id,i.name::text,i.base_unit::text,
      s.name::text,b.batch_code,b.expiry_kind,b.expiry_on,
      b.received_base_units,b.issued_base_units,
      b.received_base_units-b.issued_base_units,
      case
        when b.expiry_kind='none' then 'not_applicable'
        when b.expiry_on<current_date then 'expired'
        when b.expiry_on<=current_date+p_days then 'due_soon'
        else 'ok'
      end::text
    from public.mealdeck_ops_stock_batches b
    join public.mealdeck_ops_ingredients i
      on i.id=b.ingredient_id and i.tenant_id=p_tenant
    join public.mealdeck_ops_suppliers s
      on s.id=b.supplier_id and s.tenant_id=p_tenant
    where b.tenant_id=p_tenant and b.location_id=p_location
      and b.received_base_units>b.issued_base_units
    order by b.expiry_on asc nulls last,b.created_at desc
    limit 400;
end;
$$;

create or replace function public.mealdeck_ops_issue_batch(
  p_tenant uuid,p_location uuid,p_batch uuid,
  p_quantity numeric,p_reason text,p_reference text,p_note text
) returns uuid
language plpgsql security definer set search_path=''
as $$
declare
  v_batch public.mealdeck_ops_stock_batches%rowtype;
  v_prior public.mealdeck_ops_batch_issues%rowtype;
  v_id uuid;
begin
  if not mealdeck_ops_private.can(p_tenant,p_location,'inventory.write') then
    raise exception 'mealdeck_ops_forbidden'; end if;
  if p_quantity is null or p_quantity<=0 or p_quantity>10000000
    or p_reason not in ('production','waste','adjustment')
    or nullif(trim(coalesce(p_reference,'')),'') is null
    or length(trim(p_reference))<2 or length(trim(p_reference))>100
    or length(coalesce(p_note,''))>300 then
    raise exception 'mealdeck_ops_issue_invalid'; end if;
  select * into v_batch from public.mealdeck_ops_stock_batches b
    where b.id=p_batch and b.tenant_id=p_tenant
      and b.location_id=p_location for update;
  if not found then raise exception 'mealdeck_ops_batch_not_found'; end if;
  select * into v_prior from public.mealdeck_ops_batch_issues bi
    where bi.tenant_id=p_tenant and bi.location_id=p_location
      and bi.issue_reference=trim(p_reference);
  if found then
    if v_prior.batch_id<>p_batch or v_prior.base_quantity<>p_quantity
       or v_prior.reason<>p_reason then
      raise exception 'mealdeck_ops_issue_idempotency_mismatch'; end if;
    return v_prior.id;
  end if;
  if v_batch.received_base_units-v_batch.issued_base_units<p_quantity then
    raise exception 'mealdeck_ops_batch_insufficient_stock'; end if;
  if p_reason='production' and v_batch.expiry_kind='use_by'
      and v_batch.expiry_on<current_date then
    raise exception 'mealdeck_ops_cannot_use_expired_batch'; end if;

  insert into public.mealdeck_ops_batch_issues(
    tenant_id,location_id,batch_id,issue_reference,base_quantity,
    reason,note,issued_by
  ) values(
    p_tenant,p_location,p_batch,trim(p_reference),p_quantity,
    p_reason,coalesce(p_note,''),(select auth.uid())
  ) returning id into v_id;
  update public.mealdeck_ops_stock_batches b
    set issued_base_units=b.issued_base_units+p_quantity,
      updated_at=now() where b.id=p_batch;
  insert into public.mealdeck_ops_stock_movements(
    tenant_id,location_id,ingredient_id,delta_qty,reason,note,recorded_by
  ) values(
    p_tenant,p_location,v_batch.ingredient_id,-p_quantity,p_reason,
    left('Batch '||v_batch.batch_code||': '||coalesce(p_note,''),300),
    (select auth.uid())
  );
  return v_id;
end;
$$;

do $$
declare sig text;
begin
  foreach sig in array array[
    'mealdeck_ops_supplier_list(uuid,uuid)',
    'mealdeck_ops_save_supplier(uuid,uuid,text,text,integer,text)',
    'mealdeck_ops_purchase_list(uuid,uuid)',
    'mealdeck_ops_purchase_lines_list(uuid,uuid,uuid)',
    'mealdeck_ops_create_purchase(uuid,uuid,uuid,text)',
    'mealdeck_ops_save_purchase_line(uuid,uuid,uuid,uuid,integer,numeric,integer)',
    'mealdeck_ops_advance_purchase(uuid,uuid,uuid,text)',
    'mealdeck_ops_receive_purchase(uuid,uuid,uuid,numeric,text,text,date,text)',
    'mealdeck_ops_batch_list(uuid,uuid,integer)',
    'mealdeck_ops_issue_batch(uuid,uuid,uuid,numeric,text,text,text)'
  ] loop
    execute format('revoke all on function public.%s from public,anon,authenticated',sig);
    execute format('grant execute on function public.%s to authenticated',sig);
  end loop;
end $$;
