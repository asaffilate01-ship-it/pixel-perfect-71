-- MealDeck Phase 9: supplier invoice three-way matching and credit-note controls.
-- Source-only; apply ONLY after Phase 7/8 in an approved Dishbee staging DB.
-- No supplier money movement, HMRC filing, Adyen operation, KDS release or
-- automatic accounting posting occurs in this migration.

create table public.mealdeck_ops_supplier_invoices(
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  location_id uuid not null references public.tenant_locations(id) on delete cascade,
  supplier_id uuid not null,
  purchase_order_id uuid not null,
  invoice_number text not null check(length(trim(invoice_number)) between 2 and 100),
  invoice_number_key text generated always as (lower(trim(invoice_number))) stored,
  invoice_date date not null,
  due_date date,
  currency text not null default 'GBP' check(currency='GBP'),
  declared_net_pence bigint not null check(declared_net_pence>0 and declared_net_pence<=1000000000),
  declared_vat_pence bigint not null check(declared_vat_pence>=0 and declared_vat_pence<=200000000),
  declared_gross_pence bigint generated always as
    (declared_net_pence+declared_vat_pence) stored,
  status text not null default 'draft' check(status in
    ('draft','submitted','matched','approved','void')),
  tax_document_reviewed boolean not null default false,
  tax_reviewed_by uuid references auth.users(id) on delete set null,
  tax_reviewed_at timestamptz,
  note text not null default '' check(length(note)<=500),
  created_by uuid not null references auth.users(id),
  approved_by uuid references auth.users(id) on delete set null,
  approved_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(tenant_id,location_id,id),
  unique(tenant_id,supplier_id,invoice_number_key),
  foreign key(tenant_id,supplier_id)
    references public.mealdeck_ops_suppliers(tenant_id,id),
  foreign key(tenant_id,location_id,purchase_order_id)
    references public.mealdeck_ops_purchase_orders(tenant_id,location_id,id)
);
create index mealdeck_ops_invoice_period on
  public.mealdeck_ops_supplier_invoices(tenant_id,location_id,invoice_date desc);

create table public.mealdeck_ops_supplier_invoice_lines(
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  location_id uuid not null references public.tenant_locations(id) on delete cascade,
  invoice_id uuid not null,
  purchase_line_id uuid not null,
  base_quantity numeric(16,3) not null
    check(base_quantity>0 and base_quantity<=10000000),
  net_pence bigint not null check(net_pence>=0 and net_pence<=1000000000),
  vat_pence bigint not null check(vat_pence>=0 and vat_pence<=200000000),
  tax_category text not null default 'unreviewed' check(tax_category in (
    'unreviewed','zero','reduced','standard','exempt','out_of_scope'
  )),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(tenant_id,location_id,id),
  unique(invoice_id,purchase_line_id),
  check(tax_category not in ('zero','exempt','out_of_scope') or vat_pence=0),
  foreign key(tenant_id,location_id,invoice_id)
    references public.mealdeck_ops_supplier_invoices(tenant_id,location_id,id),
  foreign key(tenant_id,location_id,purchase_line_id)
    references public.mealdeck_ops_purchase_lines(tenant_id,location_id,id)
);

-- Credit notes are separately approved claims against a previously approved
-- invoice; they are NOT refunds, bank payments, or VAT returns.
create table public.mealdeck_ops_supplier_credits(
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  location_id uuid not null references public.tenant_locations(id) on delete cascade,
  supplier_id uuid not null,
  invoice_id uuid not null,
  credit_number text not null check(length(trim(credit_number)) between 2 and 100),
  credit_number_key text generated always as (lower(trim(credit_number))) stored,
  issued_on date not null,
  reason text not null check(length(trim(reason)) between 3 and 500),
  net_pence bigint not null check(net_pence>=0 and net_pence<=1000000000),
  vat_pence bigint not null check(vat_pence>=0 and vat_pence<=200000000),
  gross_pence bigint generated always as (net_pence+vat_pence) stored,
  status text not null default 'draft' check(status in
    ('draft','submitted','approved','void')),
  created_by uuid not null references auth.users(id),
  approved_by uuid references auth.users(id) on delete set null,
  approved_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check(net_pence+vat_pence>0),
  unique(tenant_id,location_id,id),
  unique(tenant_id,supplier_id,credit_number_key),
  foreign key(tenant_id,location_id,invoice_id)
    references public.mealdeck_ops_supplier_invoices(tenant_id,location_id,id),
  foreign key(tenant_id,supplier_id)
    references public.mealdeck_ops_suppliers(tenant_id,id)
);

do $$
declare t text;
begin
  foreach t in array array[
    'mealdeck_ops_supplier_invoices',
    'mealdeck_ops_supplier_invoice_lines',
    'mealdeck_ops_supplier_credits'
  ] loop
    execute format('alter table public.%I enable row level security',t);
    execute format('revoke all on table public.%I from public,anon,authenticated',t);
  end loop;
end $$;

create or replace function public.mealdeck_ops_invoice_list(
  p_tenant uuid,p_location uuid,p_from date,p_to date
) returns table(
  invoice_id uuid,supplier_name text,invoice_number text,
  invoice_date date,due_date date,status text,
  declared_net_pence bigint,declared_vat_pence bigint,
  declared_gross_pence bigint,tax_document_reviewed boolean,
  purchase_order_id uuid,created_by uuid,approved_at timestamptz,
  line_count bigint
)
language plpgsql stable security definer set search_path=''
as $$
begin
  if not mealdeck_ops_private.can(p_tenant,p_location,'finance.read') then
    raise exception 'mealdeck_ops_forbidden';
  end if;
  if p_from is null or p_to is null or p_to<p_from
    or p_to-p_from>366 then raise exception 'mealdeck_ops_invalid_period'; end if;
  return query
    select inv.id,s.name::text,inv.invoice_number,inv.invoice_date,inv.due_date,
      inv.status,inv.declared_net_pence,inv.declared_vat_pence,
      inv.declared_gross_pence,inv.tax_document_reviewed,
      inv.purchase_order_id,inv.created_by,inv.approved_at,
      count(l.id)::bigint
    from public.mealdeck_ops_supplier_invoices inv
    join public.mealdeck_ops_suppliers s
      on s.id=inv.supplier_id and s.tenant_id=p_tenant
    left join public.mealdeck_ops_supplier_invoice_lines l
      on l.tenant_id=p_tenant and l.location_id=p_location
        and l.invoice_id=inv.id
    where inv.tenant_id=p_tenant and inv.location_id=p_location
      and inv.invoice_date between p_from and p_to
    group by inv.id,s.name
    order by inv.invoice_date desc,inv.created_at desc
    limit 300;
end;
$$;

create or replace function public.mealdeck_ops_invoice_line_list(
  p_tenant uuid,p_location uuid,p_invoice uuid
) returns table(
  line_id uuid,purchase_line_id uuid,ingredient_name text,base_unit text,
  base_quantity numeric,po_received_quantity numeric,
  net_pence bigint,vat_pence bigint,tax_category text,
  po_quoted_net_pence bigint
)
language plpgsql stable security definer set search_path=''
as $$
begin
  if not mealdeck_ops_private.can(p_tenant,p_location,'finance.read') then
    raise exception 'mealdeck_ops_forbidden';
  end if;
  if not exists(
    select 1 from public.mealdeck_ops_supplier_invoices inv
    where inv.id=p_invoice and inv.tenant_id=p_tenant
      and inv.location_id=p_location
  ) then raise exception 'mealdeck_ops_invoice_not_found'; end if;

  return query select l.id,l.purchase_line_id,i.name::text,i.base_unit::text,
    l.base_quantity,po.received_base_units,l.net_pence,l.vat_pence,
    l.tax_category,
    round(l.base_quantity*po.price_per_pack_pence/
      po.base_units_per_pack)::bigint
    from public.mealdeck_ops_supplier_invoice_lines l
    join public.mealdeck_ops_purchase_lines po
      on po.id=l.purchase_line_id and po.tenant_id=p_tenant
        and po.location_id=p_location
    join public.mealdeck_ops_ingredients i
      on i.id=po.ingredient_id and i.tenant_id=p_tenant
    where l.invoice_id=p_invoice and l.tenant_id=p_tenant
      and l.location_id=p_location
    order by i.name;
end;
$$;

create or replace function public.mealdeck_ops_create_invoice(
  p_tenant uuid,p_location uuid,p_order uuid,
  p_number text,p_date date,p_due date,p_net bigint,p_vat bigint,p_note text
) returns uuid
language plpgsql security definer set search_path=''
as $$
declare
  v_po public.mealdeck_ops_purchase_orders%rowtype;
  v_id uuid;
begin
  if not mealdeck_ops_private.can(p_tenant,p_location,'finance.manage') then
    raise exception 'mealdeck_ops_forbidden';
  end if;
  select * into v_po from public.mealdeck_ops_purchase_orders po
    where po.id=p_order and po.tenant_id=p_tenant
      and po.location_id=p_location;
  if not found or v_po.status not in ('approved','partially_received','received')
  then raise exception 'mealdeck_ops_purchase_not_invoiceable'; end if;

  if nullif(trim(coalesce(p_number,'')),'') is null
    or length(trim(p_number)) not between 2 and 100
    or p_date is null or p_date>current_date+interval '31 days'
    or (p_due is not null and p_due<p_date)
    or p_net is null or p_net<=0 or p_net>1000000000
    or p_vat is null or p_vat<0 or p_vat>200000000
    or length(coalesce(p_note,''))>500 then
    raise exception 'mealdeck_ops_invoice_invalid';
  end if;
  insert into public.mealdeck_ops_supplier_invoices(
    tenant_id,location_id,supplier_id,purchase_order_id,
    invoice_number,invoice_date,due_date,declared_net_pence,
    declared_vat_pence,note,created_by
  ) values(
    p_tenant,p_location,v_po.supplier_id,p_order,
    trim(p_number),p_date,p_due,p_net,p_vat,
    coalesce(p_note,''),(select auth.uid())
  ) returning id into v_id;
  insert into public.mealdeck_ops_audit_log(
    tenant_id,location_id,actor_id,action,entity_type,entity_id,
    next_value
  ) values(
    p_tenant,p_location,(select auth.uid()),'invoice.draft',
    'supplier_invoice',v_id,
    jsonb_build_object('purchaseOrderId',p_order,
      'invoiceNumber',trim(p_number),'declaredNetPence',p_net,
      'declaredVatPence',p_vat)
  );
  return v_id;
end;
$$;

create or replace function public.mealdeck_ops_save_invoice_line(
  p_tenant uuid,p_location uuid,p_invoice uuid,p_po_line uuid,
  p_quantity numeric,p_net bigint,p_vat bigint,p_tax text
) returns uuid
language plpgsql security definer set search_path=''
as $$
declare
  v_invoice public.mealdeck_ops_supplier_invoices%rowtype;
  v_po_line public.mealdeck_ops_purchase_lines%rowtype;
  v_id uuid;
begin
  if not mealdeck_ops_private.can(p_tenant,p_location,'finance.manage') then
    raise exception 'mealdeck_ops_forbidden';
  end if;
  select * into v_invoice from public.mealdeck_ops_supplier_invoices inv
    where inv.id=p_invoice and inv.tenant_id=p_tenant
      and inv.location_id=p_location for update;
  if not found or v_invoice.status<>'draft' then
    raise exception 'mealdeck_ops_invoice_not_editable'; end if;
  select * into v_po_line from public.mealdeck_ops_purchase_lines l
    where l.id=p_po_line and l.tenant_id=p_tenant
      and l.location_id=p_location
      and l.purchase_order_id=v_invoice.purchase_order_id;
  if not found then raise exception 'mealdeck_ops_invoice_po_line_mismatch'; end if;

  if p_quantity is null or p_quantity<=0 or p_quantity>10000000
    or p_net is null or p_net<0 or p_net>1000000000
    or p_vat is null or p_vat<0 or p_vat>200000000
    or p_tax not in (
      'unreviewed','zero','reduced','standard','exempt','out_of_scope'
    ) or (p_tax in ('zero','exempt','out_of_scope') and p_vat<>0)
    or (p_quantity<>trunc(p_quantity) and exists(
      select 1 from public.mealdeck_ops_ingredients i
        where i.tenant_id=p_tenant and i.id=v_po_line.ingredient_id
          and i.base_unit='each'
    ))
  then raise exception 'mealdeck_ops_invalid_invoice_line'; end if;

  insert into public.mealdeck_ops_supplier_invoice_lines(
    tenant_id,location_id,invoice_id,purchase_line_id,
    base_quantity,net_pence,vat_pence,tax_category
  ) values(
    p_tenant,p_location,p_invoice,p_po_line,p_quantity,p_net,p_vat,p_tax
  ) on conflict(invoice_id,purchase_line_id) do update set
    base_quantity=excluded.base_quantity,net_pence=excluded.net_pence,
    vat_pence=excluded.vat_pence,tax_category=excluded.tax_category,
    updated_at=now()
  returning id into v_id;
  return v_id;
end;
$$;

-- Serialise invoice matching through the original purchase-order row.
-- Claimed quantities from OTHER matched/approved invoices cannot exceed
-- physical receipts of the same PO line. Single-line quoted price tolerance
-- is ±max(1p, 1%) to allow minor rounding only; exceptions stay blocked.
create or replace function public.mealdeck_ops_invoice_action(
  p_tenant uuid,p_location uuid,p_invoice uuid,p_action text
) returns boolean
language plpgsql security definer set search_path=''
as $$
declare
  v_inv public.mealdeck_ops_supplier_invoices%rowtype;
  v_po public.mealdeck_ops_purchase_orders%rowtype;
  v_row record;
  v_count integer;
  v_net bigint;
  v_vat bigint;
  v_expected bigint;
  v_other numeric;
begin
  if not mealdeck_ops_private.can(p_tenant,p_location,'finance.manage') then
    raise exception 'mealdeck_ops_forbidden';
  end if;
  select * into v_inv from public.mealdeck_ops_supplier_invoices inv
    where inv.id=p_invoice and inv.tenant_id=p_tenant
      and inv.location_id=p_location for update;
  if not found then raise exception 'mealdeck_ops_invoice_not_found'; end if;

  select * into v_po from public.mealdeck_ops_purchase_orders po
    where po.id=v_inv.purchase_order_id and po.tenant_id=p_tenant
      and po.location_id=p_location for update;
  if not found or v_po.supplier_id<>v_inv.supplier_id then
    raise exception 'mealdeck_ops_invoice_supplier_mismatch'; end if;

  if p_action='submit' then
    if v_inv.status<>'draft' then
      raise exception 'mealdeck_ops_invoice_not_submittable'; end if;
    select count(*),coalesce(sum(l.net_pence),0),coalesce(sum(l.vat_pence),0)
      into v_count,v_net,v_vat
      from public.mealdeck_ops_supplier_invoice_lines l
      where l.invoice_id=p_invoice and l.tenant_id=p_tenant
        and l.location_id=p_location;
    if v_count=0 or v_net<>v_inv.declared_net_pence
      or v_vat<>v_inv.declared_vat_pence then
      raise exception 'mealdeck_ops_invoice_totals_mismatch'; end if;
    update public.mealdeck_ops_supplier_invoices inv
      set status='submitted',updated_at=now() where inv.id=p_invoice;

  elsif p_action='match' then
    if v_inv.status<>'submitted'
      or v_po.status not in ('approved','partially_received','received')
    then raise exception 'mealdeck_ops_invoice_not_matchable'; end if;
    select count(*) into v_count
      from public.mealdeck_ops_supplier_invoice_lines l
      where l.invoice_id=p_invoice and l.tenant_id=p_tenant
        and l.location_id=p_location;
    if v_count=0 then raise exception 'mealdeck_ops_invoice_no_lines'; end if;

    for v_row in
      select l.purchase_line_id,l.base_quantity,l.net_pence,l.vat_pence,
        l.tax_category,pl.received_base_units,pl.base_units_per_pack,
        pl.price_per_pack_pence
      from public.mealdeck_ops_supplier_invoice_lines l
      join public.mealdeck_ops_purchase_lines pl
        on pl.id=l.purchase_line_id and pl.tenant_id=p_tenant
          and pl.location_id=p_location
          and pl.purchase_order_id=v_po.id
      where l.invoice_id=p_invoice and l.tenant_id=p_tenant
        and l.location_id=p_location
    loop
      if v_row.base_quantity>v_row.received_base_units then
        raise exception 'mealdeck_ops_invoice_unreceived_goods'; end if;
      v_expected:=round(v_row.base_quantity*v_row.price_per_pack_pence/
        v_row.base_units_per_pack)::bigint;
      if abs(v_row.net_pence-v_expected)>
        greatest(1,ceil(v_expected*0.01)::bigint) then
        raise exception 'mealdeck_ops_invoice_price_variance'; end if;

      select coalesce(sum(other_line.base_quantity),0) into v_other
        from public.mealdeck_ops_supplier_invoice_lines other_line
        join public.mealdeck_ops_supplier_invoices other_invoice
          on other_invoice.id=other_line.invoice_id
          and other_invoice.tenant_id=p_tenant
          and other_invoice.location_id=p_location
        where other_line.purchase_line_id=v_row.purchase_line_id
          and other_line.tenant_id=p_tenant
          and other_line.location_id=p_location
          and other_invoice.id<>p_invoice
          and other_invoice.status in ('matched','approved');
      if v_row.base_quantity+v_other>v_row.received_base_units then
        raise exception 'mealdeck_ops_invoice_goods_already_claimed'; end if;
    end loop;
    update public.mealdeck_ops_supplier_invoices inv
      set status='matched',updated_at=now() where inv.id=p_invoice;

  elsif p_action='approve' then
    if v_inv.status<>'matched' or not v_inv.tax_document_reviewed
      or v_inv.created_by=(select auth.uid())
      or not mealdeck_ops_private.can(p_tenant,null,'finance.manage') then
      raise exception 'mealdeck_ops_invoice_second_approver_required';
    end if;
    update public.mealdeck_ops_supplier_invoices inv
      set status='approved',approved_by=(select auth.uid()),
        approved_at=now(),updated_at=now()
      where inv.id=p_invoice;

  elsif p_action='void' then
    if v_inv.status not in ('draft','submitted','matched') then
      raise exception 'mealdeck_ops_invoice_cannot_void'; end if;
    update public.mealdeck_ops_supplier_invoices inv
      set status='void',updated_at=now() where inv.id=p_invoice;
  else
    raise exception 'mealdeck_ops_invoice_action_invalid';
  end if;

  insert into public.mealdeck_ops_audit_log(
    tenant_id,location_id,actor_id,action,entity_type,entity_id,
    previous_value,next_value
  ) values(
    p_tenant,p_location,(select auth.uid()),'invoice.'||p_action,
    'supplier_invoice',p_invoice,
    jsonb_build_object('status',v_inv.status),
    jsonb_build_object('status',case p_action
      when 'submit' then 'submitted'
      when 'match' then 'matched'
      when 'approve' then 'approved'
      else 'void' end)
  );
  return true;
end;
$$;

-- Manual tax-document evidence review is distinct from actual tax filing.
-- Invoice creator may inspect rates; approval still requires a DIFFERENT
-- authorised finance manager after the paper invoice has been checked.
create or replace function public.mealdeck_ops_review_invoice_tax(
  p_tenant uuid,p_location uuid,p_invoice uuid,p_reviewed boolean
) returns boolean
language plpgsql security definer set search_path=''
as $$
declare
  v_invoice public.mealdeck_ops_supplier_invoices%rowtype;
begin
  if not mealdeck_ops_private.can(p_tenant,p_location,'finance.manage') then
    raise exception 'mealdeck_ops_forbidden';
  end if;
  select * into v_invoice from public.mealdeck_ops_supplier_invoices inv
    where inv.id=p_invoice and inv.tenant_id=p_tenant
      and inv.location_id=p_location for update;
  if not found or v_invoice.status<>'matched' or p_reviewed is null then
    raise exception 'mealdeck_ops_invoice_tax_not_reviewable';
  end if;
  if p_reviewed and exists(
    select 1 from public.mealdeck_ops_supplier_invoice_lines l
      where l.invoice_id=p_invoice and l.tenant_id=p_tenant
        and l.location_id=p_location and l.tax_category='unreviewed'
  ) then raise exception 'mealdeck_ops_invoice_tax_category_missing'; end if;
  update public.mealdeck_ops_supplier_invoices inv
    set tax_document_reviewed=p_reviewed,
      tax_reviewed_by=case when p_reviewed then (select auth.uid()) else null end,
      tax_reviewed_at=case when p_reviewed then now() else null end,
      updated_at=now()
    where inv.id=p_invoice;
  insert into public.mealdeck_ops_audit_log(
    tenant_id,location_id,actor_id,action,entity_type,entity_id,next_value
  ) values(
    p_tenant,p_location,(select auth.uid()),'invoice.tax_document_review',
    'supplier_invoice',p_invoice,jsonb_build_object('reviewed',p_reviewed)
  );
  return true;
end;
$$;

create or replace function public.mealdeck_ops_create_supplier_credit(
  p_tenant uuid,p_location uuid,p_invoice uuid,p_number text,
  p_issued date,p_reason text,p_net bigint,p_vat bigint
) returns uuid
language plpgsql security definer set search_path=''
as $$
declare
  v_inv public.mealdeck_ops_supplier_invoices%rowtype;
  v_id uuid;
begin
  if not mealdeck_ops_private.can(p_tenant,p_location,'finance.manage') then
    raise exception 'mealdeck_ops_forbidden';
  end if;
  select * into v_inv from public.mealdeck_ops_supplier_invoices inv
    where inv.id=p_invoice and inv.tenant_id=p_tenant
      and inv.location_id=p_location;
  if not found or v_inv.status<>'approved' then
    raise exception 'mealdeck_ops_credit_requires_approved_invoice'; end if;
  if nullif(trim(coalesce(p_number,'')),'') is null
    or length(trim(p_number)) not between 2 and 100
    or length(trim(coalesce(p_reason,''))) not between 3 and 500
    or p_issued is null or p_issued>current_date+interval '31 days'
    or p_net is null or p_net<0 or p_net>v_inv.declared_net_pence
    or p_vat is null or p_vat<0 or p_vat>v_inv.declared_vat_pence
    or p_net+p_vat=0 then raise exception 'mealdeck_ops_credit_invalid'; end if;

  insert into public.mealdeck_ops_supplier_credits(
    tenant_id,location_id,supplier_id,invoice_id,
    credit_number,issued_on,reason,net_pence,vat_pence,created_by
  ) values(
    p_tenant,p_location,v_inv.supplier_id,p_invoice,
    trim(p_number),p_issued,trim(p_reason),p_net,p_vat,(select auth.uid())
  ) returning id into v_id;
  return v_id;
end;
$$;

create or replace function public.mealdeck_ops_credit_action(
  p_tenant uuid,p_location uuid,p_credit uuid,p_action text
) returns boolean
language plpgsql security definer set search_path=''
as $$
declare
  v_credit public.mealdeck_ops_supplier_credits%rowtype;
  v_inv public.mealdeck_ops_supplier_invoices%rowtype;
  v_credited_net bigint;
  v_credited_vat bigint;
begin
  if not mealdeck_ops_private.can(p_tenant,p_location,'finance.manage') then
    raise exception 'mealdeck_ops_forbidden';
  end if;
  select * into v_credit from public.mealdeck_ops_supplier_credits c
    where c.id=p_credit and c.tenant_id=p_tenant
      and c.location_id=p_location for update;
  if not found then raise exception 'mealdeck_ops_credit_not_found'; end if;
  select * into v_inv from public.mealdeck_ops_supplier_invoices inv
    where inv.id=v_credit.invoice_id and inv.tenant_id=p_tenant
      and inv.location_id=p_location for update;
  if not found or v_inv.status<>'approved' or v_inv.supplier_id<>v_credit.supplier_id
  then raise exception 'mealdeck_ops_credit_invoice_invalid'; end if;

  if p_action='submit' then
    if v_credit.status<>'draft' then
      raise exception 'mealdeck_ops_credit_not_submittable'; end if;
    update public.mealdeck_ops_supplier_credits c
      set status='submitted',updated_at=now() where c.id=p_credit;
  elsif p_action='approve' then
    if v_credit.status<>'submitted'
      or v_credit.created_by=(select auth.uid())
      or not mealdeck_ops_private.can(p_tenant,null,'finance.manage')
    then raise exception 'mealdeck_ops_credit_second_approver_required'; end if;

    select coalesce(sum(c.net_pence),0),coalesce(sum(c.vat_pence),0)
    into v_credited_net,v_credited_vat
    from public.mealdeck_ops_supplier_credits c
    where c.invoice_id=v_credit.invoice_id and c.tenant_id=p_tenant
      and c.location_id=p_location and c.status='approved';
    if v_credit.net_pence+v_credited_net>v_inv.declared_net_pence
      or v_credit.vat_pence+v_credited_vat>v_inv.declared_vat_pence then
      raise exception 'mealdeck_ops_credit_exceeds_invoice'; end if;

    update public.mealdeck_ops_supplier_credits c
      set status='approved',approved_at=now(),
        approved_by=(select auth.uid()),updated_at=now()
      where c.id=p_credit;
  elsif p_action='void' then
    if v_credit.status not in ('draft','submitted') then
      raise exception 'mealdeck_ops_credit_cannot_void'; end if;
    update public.mealdeck_ops_supplier_credits c
      set status='void',updated_at=now() where c.id=p_credit;
  else raise exception 'mealdeck_ops_credit_action_invalid';
  end if;
  insert into public.mealdeck_ops_audit_log(
    tenant_id,location_id,actor_id,action,entity_type,entity_id,
    previous_value,next_value
  ) values(
    p_tenant,p_location,(select auth.uid()),'credit.'||p_action,
    'supplier_credit',p_credit,
    jsonb_build_object('status',v_credit.status),
    jsonb_build_object('status',case p_action
      when 'submit' then 'submitted'
      when 'approve' then 'approved' else 'void' end)
  );
  return true;
end;
$$;

create or replace function public.mealdeck_ops_credit_list(
  p_tenant uuid,p_location uuid,p_from date,p_to date
) returns table(
  credit_id uuid,invoice_id uuid,credit_number text,issued_on date,
  reason text,net_pence bigint,vat_pence bigint,gross_pence bigint,
  status text,created_by uuid
)
language plpgsql stable security definer set search_path=''
as $$
begin
  if not mealdeck_ops_private.can(p_tenant,p_location,'finance.read') then
    raise exception 'mealdeck_ops_forbidden';
  end if;
  if p_from is null or p_to is null or p_to<p_from
    or p_to-p_from>366 then raise exception 'mealdeck_ops_invalid_period'; end if;
  return query
    select c.id,c.invoice_id,c.credit_number,c.issued_on,c.reason,
      c.net_pence,c.vat_pence,c.gross_pence,c.status,c.created_by
    from public.mealdeck_ops_supplier_credits c
    where c.tenant_id=p_tenant and c.location_id=p_location
      and c.issued_on between p_from and p_to
    order by c.issued_on desc,c.created_at desc limit 300;
end;
$$;

create or replace function public.mealdeck_ops_invoice_summary(
  p_tenant uuid,p_location uuid,p_from date,p_to date
) returns jsonb
language plpgsql stable security definer set search_path=''
as $$
declare
  v_invoices bigint;
  v_net bigint;
  v_vat bigint;
  v_unmatched bigint;
  v_credits bigint;
  v_credit_vat bigint;
begin
  if not mealdeck_ops_private.can(p_tenant,p_location,'finance.read') then
    raise exception 'mealdeck_ops_forbidden';
  end if;
  if p_from is null or p_to is null or p_to<p_from
    or p_to-p_from>366 then raise exception 'mealdeck_ops_invalid_period'; end if;

  select count(*),coalesce(sum(inv.declared_net_pence),0),
    coalesce(sum(inv.declared_vat_pence),0)
    into v_invoices,v_net,v_vat
    from public.mealdeck_ops_supplier_invoices inv
    where inv.tenant_id=p_tenant and inv.location_id=p_location
      and inv.invoice_date between p_from and p_to
      and inv.status='approved';

  select count(*) into v_unmatched
    from public.mealdeck_ops_supplier_invoices inv
    where inv.tenant_id=p_tenant and inv.location_id=p_location
      and inv.invoice_date between p_from and p_to
      and inv.status in ('draft','submitted','matched');

  select coalesce(sum(c.net_pence),0),coalesce(sum(c.vat_pence),0)
    into v_credits,v_credit_vat
    from public.mealdeck_ops_supplier_credits c
    where c.tenant_id=p_tenant and c.location_id=p_location
      and c.issued_on between p_from and p_to
      and c.status='approved';

  return jsonb_build_object(
    'approvedInvoiceCount',v_invoices,
    'approvedSupplierNetPence',v_net,
    'supplierVatDeclaredPence',v_vat,
    'unmatchedInvoiceCount',v_unmatched,
    'approvedCreditNetPence',v_credits,
    'approvedCreditVatPence',v_credit_vat,
    'bankPaymentVerified',false,
    'vatReturnVerified',false,
    'accountingPosted',false,
    'periodFrom',p_from,'periodTo',p_to
  );
end;
$$;

do $$
declare sig text;
begin
  foreach sig in array array[
    'mealdeck_ops_invoice_list(uuid,uuid,date,date)',
    'mealdeck_ops_invoice_line_list(uuid,uuid,uuid)',
    'mealdeck_ops_create_invoice(uuid,uuid,uuid,text,date,date,bigint,bigint,text)',
    'mealdeck_ops_save_invoice_line(uuid,uuid,uuid,uuid,numeric,bigint,bigint,text)',
    'mealdeck_ops_invoice_action(uuid,uuid,uuid,text)',
    'mealdeck_ops_review_invoice_tax(uuid,uuid,uuid,boolean)',
    'mealdeck_ops_create_supplier_credit(uuid,uuid,uuid,text,date,text,bigint,bigint)',
    'mealdeck_ops_credit_action(uuid,uuid,uuid,text)',
    'mealdeck_ops_credit_list(uuid,uuid,date,date)',
    'mealdeck_ops_invoice_summary(uuid,uuid,date,date)'
  ] loop
    execute format('revoke all on function public.%s from public,anon,authenticated',sig);
    execute format('grant execute on function public.%s to authenticated',sig);
  end loop;
end $$;
