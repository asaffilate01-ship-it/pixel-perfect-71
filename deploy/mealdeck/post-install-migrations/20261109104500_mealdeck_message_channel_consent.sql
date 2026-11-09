-- Add independent and revocable SMS / WhatsApp marketing consent.
-- The checkbox is NOT phone ownership verification, provider onboarding,
-- a WhatsApp template approval, or permission to send without PECR compliance.
begin;
set local lock_timeout='5s';
set local statement_timeout='30s';
do $guard$ begin
  if current_user in ('anon','authenticated','service_role','authenticator')
    or to_regnamespace('dishbee_private') is not null
    or to_regclass('mealdeck_private.installation') is null
    or to_regclass('mealdeck_private.customer_profiles') is null
    or to_regprocedure('mealdeck_private.customer_registration_authority(uuid)') is null
    or not exists(select 1 from mealdeck_private.installation i
                  where i.singleton and i.profile='mealdeck-independent-v1'
                    and i.business_id is not null)
    or not exists(select 1 from pg_class c
                  where c.oid='mealdeck_private.installation'::regclass
                    and pg_has_role(current_user,c.relowner,'USAGE'))
  then raise exception 'mealdeck_message_consent_wrong_database_or_actor'; end if;
end $guard$;

alter table mealdeck_private.customer_profiles
  add column if not exists sms_marketing boolean not null default false;
alter table mealdeck_private.customer_profiles
  add column if not exists sms_marketing_phone text;
alter table mealdeck_private.customer_profiles
  add column if not exists whatsapp_marketing boolean not null default false;
alter table mealdeck_private.customer_profiles
  add column if not exists whatsapp_marketing_phone text;

create table if not exists mealdeck_private.customer_message_consent_events(
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  channel text not null check(channel in ('sms_marketing','whatsapp_marketing')),
  allowed boolean not null,
  previous_allowed boolean not null,
  notice_version text not null check(notice_version='mealdeck-message-consent-2026-11-09'),
  source text not null check(source in ('registration','account')),
  occurred_at timestamptz not null default clock_timestamp()
);
create index if not exists message_consent_user_time
  on mealdeck_private.customer_message_consent_events(user_id,occurred_at desc);
alter table mealdeck_private.customer_message_consent_events enable row level security;
revoke all on mealdeck_private.customer_message_consent_events
  from public,anon,authenticated,service_role;

create or replace function public.mealdeck_customer_message_preferences()
returns jsonb language plpgsql stable security definer set search_path=''
as $read$
declare v_user uuid:=auth.uid(); v_member jsonb; p mealdeck_private.customer_profiles%rowtype;
begin
  if v_user is null then raise exception 'mealdeck_customer_unauthenticated' using errcode='42501'; end if;
  v_member:=mealdeck_private.customer_registration_authority(v_user);
  if v_member is null or v_member->'registered' is distinct from 'true'::jsonb
  then raise exception 'mealdeck_customer_registration_required' using errcode='42501'; end if;
  select * into p from mealdeck_private.customer_profiles where user_id=v_user;
  if not found then raise exception 'mealdeck_customer_registration_required' using errcode='42501'; end if;
  return jsonb_build_object(
    'smsMarketing',p.sms_marketing and p.sms_marketing_phone=p.phone,
    'whatsappMarketing',p.whatsapp_marketing and p.whatsapp_marketing_phone=p.phone);
end;
$read$;
revoke all on function public.mealdeck_customer_message_preferences()
  from public,anon,authenticated,service_role;
grant execute on function public.mealdeck_customer_message_preferences() to authenticated;

create or replace function public.mealdeck_customer_update_message_preferences(
  p_sms boolean,p_whatsapp boolean,p_notice_version text,p_source text)
returns jsonb language plpgsql security definer set search_path=''
as $write$
declare v_user uuid:=auth.uid(); v_member jsonb; p mealdeck_private.customer_profiles%rowtype;
  previous_sms boolean; previous_whatsapp boolean;
begin
  if v_user is null then raise exception 'mealdeck_customer_unauthenticated' using errcode='42501'; end if;
  if p_sms is null or p_whatsapp is null
    or p_notice_version is distinct from 'mealdeck-message-consent-2026-11-09'
    or p_source not in ('registration','account')
  then raise exception 'mealdeck_customer_message_preferences_invalid'; end if;
  v_member:=mealdeck_private.customer_registration_authority(v_user);
  if v_member is null or v_member->'registered' is distinct from 'true'::jsonb
  then raise exception 'mealdeck_customer_registration_required' using errcode='42501'; end if;
  select * into p from mealdeck_private.customer_profiles where user_id=v_user for update;
  if not found then raise exception 'mealdeck_customer_registration_required' using errcode='42501'; end if;
  previous_sms:=p.sms_marketing and p.sms_marketing_phone=p.phone;
  previous_whatsapp:=p.whatsapp_marketing and p.whatsapp_marketing_phone=p.phone;
  update mealdeck_private.customer_profiles set
    sms_marketing=p_sms,
    sms_marketing_phone=case when p_sms then p.phone else null end,
    whatsapp_marketing=p_whatsapp,
    whatsapp_marketing_phone=case when p_whatsapp then p.phone else null end,
    updated_at=clock_timestamp() where user_id=v_user;
  if previous_sms is distinct from p_sms then
    insert into mealdeck_private.customer_message_consent_events(
      user_id,channel,allowed,previous_allowed,notice_version,source)
    values(v_user,'sms_marketing',p_sms,previous_sms,p_notice_version,p_source);
  end if;
  if previous_whatsapp is distinct from p_whatsapp then
    insert into mealdeck_private.customer_message_consent_events(
      user_id,channel,allowed,previous_allowed,notice_version,source)
    values(v_user,'whatsapp_marketing',p_whatsapp,previous_whatsapp,p_notice_version,p_source);
  end if;
  return jsonb_build_object('smsMarketing',p_sms,'whatsappMarketing',p_whatsapp);
end;
$write$;
revoke all on function public.mealdeck_customer_update_message_preferences(boolean,boolean,text,text)
  from public,anon,authenticated,service_role;
grant execute on function public.mealdeck_customer_update_message_preferences(boolean,boolean,text,text)
  to authenticated;
commit;
