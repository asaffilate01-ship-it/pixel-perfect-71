-- Test-only Supabase platform shim. The independent production profile, not
-- this file, must create every MealDeck table, policy, function and constraint.
-- There is no canonical business fixture and no payment/release test double.
create role anon;
create role authenticated;
create role service_role bypassrls;
create schema auth;
create table auth.users (
  id uuid primary key,
  email text unique,
  email_confirmed_at timestamptz,
  phone_confirmed_at timestamptz,
  confirmed_at timestamptz generated always as
    (least(email_confirmed_at,phone_confirmed_at)) stored,
  is_anonymous boolean not null default false,
  deleted_at timestamptz,
  banned_until timestamptz,
  raw_app_meta_data jsonb not null default '{}',
  raw_user_meta_data jsonb not null default '{}'
);
create function auth.uid() returns uuid language sql stable as $$
  select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid
$$;
grant usage on schema auth to anon,authenticated,service_role;
grant execute on function auth.uid() to anon,authenticated,service_role;
revoke all on auth.users from public,anon,authenticated,service_role;

-- Some hosted Supabase projects have broad legacy default grants. The actual
-- profile must revoke these explicitly, as RLS alone does not remove grants.
alter default privileges in schema public
  grant all on tables to anon,authenticated,service_role;
alter default privileges in schema public
  grant all on sequences to anon,authenticated,service_role;
