-- MealDeck registered-member loyalty and one-use offer controls, 9 November 2026.
-- Additive; apply ONLY to the verified independent MealDeck database as owner.
-- A source commit does not install these objects or activate hosted email.
begin;
set local lock_timeout='5s';
set local statement_timeout='30s';
set local check_function_bodies=on;

do $guard$
begin
  if pg_catalog.to_regnamespace('dishbee_private') is not null
    or pg_catalog.to_regclass('mealdeck_private.installation') is null
    or pg_catalog.to_regclass('mealdeck_private.customer_profiles') is null
    or pg_catalog.to_regclass('mealdeck_private.customer_features') is null
    or pg_catalog.to_regclass('mealdeck_private.customer_loyalty_ledger') is null
    or pg_catalog.to_regclass('mealdeck_private.stripe_orders') is null
    or pg_catalog.to_regprocedure('mealdeck_private.customer_registration_authority(uuid)') is null
  then raise exception 'mealdeck_loyalty_independent_checkout_membership_required'; end if;
  if current_user in ('anon','authenticated','service_role')
    or not exists(
      select 1 from pg_catalog.pg_class c
      where c.oid='mealdeck_private.installation'::pg_catalog.regclass
        and pg_catalog.pg_has_role(current_user,c.relowner,'USAGE')
    )
  then raise exception 'mealdeck_loyalty_database_owner_required'; end if;
  if not exists(
    select 1 from mealdeck_private.installation i
    where i.singleton and i.profile='mealdeck-independent-v1'
  ) then raise exception 'mealdeck_loyalty_wrong_installation'; end if;
end $guard$;

-- A unique per-order ledger key with one payment-authoritative writer.
-- The order row is locked by Stripe reconciliation, so sequential adjustment
-- numbers are stable under webhook concurrency/replay.
create or replace function mealdeck_private.reconcile_member_loyalty_for_order()
returns trigger language plpgsql security definer set search_path=''
as $loyalty$
declare
  v_stripe mealdeck_private.stripe_orders%rowtype;
  v_authority jsonb;
  v_enabled boolean;
  v_issued integer;
  v_adjustments integer;
  v_target integer;
  v_difference integer;
  v_remaining_pence integer;
  v_prefix text;
begin
  if new.source::text<>'mealdeck' or new.customer_id is null
    or coalesce(new.guest_checkout,false)
    or new.total_pence<=0
    or new.paid_at is null
    or new.paid_at < timestamptz '2026-11-09 00:00:00+00'
  then return new; end if;

  select * into v_stripe from mealdeck_private.stripe_orders s
    where s.order_id=new.id and s.customer_id=new.customer_id
      and s.guest_id is null and s.verified_at is not null
      and s.captured_pence=new.total_pence
      and s.refunded_pence between 0 and s.captured_pence;
  if not found then return new; end if;

  v_authority:=mealdeck_private.customer_registration_authority(new.customer_id);
  if v_authority is null or v_authority->'registered' is distinct from 'true'::jsonb
    then return new; end if;

  v_prefix:='mealdeck:order:'||new.id::text||':loyalty:';
  select coalesce(sum(l.points),0)::integer,count(*)::integer
    into v_issued,v_adjustments
    from mealdeck_private.customer_loyalty_ledger l
    where l.user_id=new.customer_id and l.event_key like v_prefix||'%';

  select coalesce(f.loyalty_enabled,false) into v_enabled
    from mealdeck_private.customer_features f where f.singleton;
  -- Disabling new earning must never suppress corrections to existing awards.
  if not coalesce(v_enabled,false) and v_adjustments=0 then return new; end if;

  v_target:=0;
  if new.payment_status::text in ('paid','partially_refunded')
    and new.status::text not in ('cancelled','refunded')
    and coalesce(v_stripe.void_reason,'')<>'dispute'
  then
    v_remaining_pence:=greatest(0,v_stripe.captured_pence-v_stripe.refunded_pence);
    -- One point per complete GBP 1 of the ACTUAL net payment, not menu gross.
    v_target:=v_remaining_pence / 100;
  end if;
  v_difference:=v_target-v_issued;

  if v_difference<>0 then
    insert into mealdeck_private.customer_loyalty_ledger(
      user_id,event_key,points,reason
    ) values(
      new.customer_id,
      v_prefix||(v_adjustments+1)::text,
      v_difference,
      case when v_difference>0 then 'Verified MealDeck paid order points'
        else 'MealDeck refund, cancellation or dispute adjustment' end
    );
  end if;
  return new;
end;
$loyalty$;
revoke all on function mealdeck_private.reconcile_member_loyalty_for_order()
  from public,anon,authenticated,service_role;

drop trigger if exists mealdeck_customer_loyalty_paid_order on public.orders;
create trigger mealdeck_customer_loyalty_paid_order
after insert or update of paid_at,payment_status,status on public.orders
for each row execute function mealdeck_private.reconcile_member_loyalty_for_order();

update mealdeck_private.customer_features
set loyalty_enabled=true,
  loyalty_terms='From 9 November 2026, registered customers with verified email earn 1 point per complete £1 actually paid after discounts on eligible MealDeck orders. Only confirmed paid member orders qualify; guest orders do not. Refunded or disputed amounts do not earn points. Points are not cash and cannot currently be spent.'
where singleton;

-- Future one-off campaigns remain dormant until the owner approves exact
-- economics and the checkout verifies the redemption against payment.
create table if not exists mealdeck_private.customer_offer_campaigns(
  campaign_id text primary key check(campaign_id~'^[a-z0-9][a-z0-9-]{2,63}$'),
  enabled boolean not null default false,
  starts_at timestamptz not null,
  ends_at timestamptz not null check(ends_at>starts_at),
  created_at timestamptz not null default clock_timestamp()
);
create table if not exists mealdeck_private.customer_whatsapp_verifications(
  user_id uuid primary key references mealdeck_private.customer_profiles(user_id) on delete cascade,
  phone text not null unique check(phone~'^[+][1-9][0-9]{7,14}$'),
  provider_reference text not null check(length(provider_reference) between 8 and 200),
  verified_at timestamptz not null,
  check(verified_at<=clock_timestamp())
);
create table if not exists mealdeck_private.customer_offer_claims(
  campaign_id text not null references mealdeck_private.customer_offer_campaigns(campaign_id),
  user_id uuid not null references mealdeck_private.customer_profiles(user_id) on delete cascade,
  email text not null check(email=lower(email) and length(email) between 4 and 254),
  phone text not null check(phone~'^[+][1-9][0-9]{7,14}$'),
  claimed_at timestamptz not null default clock_timestamp(),
  primary key(campaign_id,user_id),
  unique(campaign_id,email),
  unique(campaign_id,phone)
);
create index if not exists customer_offer_claim_user
  on mealdeck_private.customer_offer_claims(user_id,claimed_at desc);

alter table mealdeck_private.customer_offer_campaigns enable row level security;
alter table mealdeck_private.customer_whatsapp_verifications enable row level security;
alter table mealdeck_private.customer_offer_claims enable row level security;
revoke all on mealdeck_private.customer_offer_campaigns,
  mealdeck_private.customer_whatsapp_verifications,
  mealdeck_private.customer_offer_claims
  from public,anon,authenticated,service_role;

-- Customer input can NEVER attest WhatsApp verification. The private
-- verifications table is populated only after provider-side proof, via a
-- separately reviewed trusted operator integration (not included here).
create or replace function public.mealdeck_customer_claim_one_use_offer(p_campaign text)
returns jsonb language plpgsql security definer set search_path=''
as $claim$
declare
  v_user uuid:=auth.uid();
  v_member jsonb;
  v_profile mealdeck_private.customer_profiles%rowtype;
  v_email text;
  v_created integer;
begin
  if v_user is null then raise exception 'mealdeck_offer_registration_required' using errcode='42501'; end if;
  v_member:=mealdeck_private.customer_registration_authority(v_user);
  if v_member is null or v_member->'registered' is distinct from 'true'::jsonb
    then raise exception 'mealdeck_offer_registration_required' using errcode='42501'; end if;
  select * into v_profile from mealdeck_private.customer_profiles where user_id=v_user;
  if not found then raise exception 'mealdeck_offer_registration_required' using errcode='42501'; end if;
  v_email:=lower(v_member->>'email');
  -- A supplied WhatsApp number is not proof of WhatsApp ownership.
  if not exists (
    select 1 from mealdeck_private.customer_whatsapp_verifications w
    where w.user_id=v_user and w.phone=v_profile.phone and w.verified_at<=now()
  ) then raise exception 'mealdeck_offer_whatsapp_verification_required' using errcode='42501'; end if;
  if p_campaign is null or not exists(
    select 1 from mealdeck_private.customer_offer_campaigns c
    where c.campaign_id=p_campaign and c.enabled
      and now()>=c.starts_at and now()<c.ends_at
  ) then raise exception 'mealdeck_offer_unavailable' using errcode='42501'; end if;

  -- Atomic unique indexes block repeat claims across accounts sharing an email
  -- or phone as well as across repeated sessions on the same account.
  insert into mealdeck_private.customer_offer_claims(campaign_id,user_id,email,phone)
    values(p_campaign,v_user,v_email,v_profile.phone)
    on conflict do nothing;
  get diagnostics v_created=row_count;
  if v_created<>1 then raise exception 'mealdeck_offer_already_claimed' using errcode='23505'; end if;
  return jsonb_build_object('claimed',true,'campaign',p_campaign);
end;
$claim$;
revoke all on function public.mealdeck_customer_claim_one_use_offer(text)
  from public,anon,authenticated,service_role;
grant execute on function public.mealdeck_customer_claim_one_use_offer(text)
  to authenticated;

commit;
