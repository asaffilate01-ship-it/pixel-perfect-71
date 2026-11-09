-- Server-enforced MealDeck email registration resumes at Monday 9 Nov 2026 13:00 UTC.
-- Safe to apply before midnight: existing members remain usable and guest orders unchanged.
BEGIN;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='20s';
DO $guard$ BEGIN
  IF current_user IN ('anon','authenticated','service_role')
    OR to_regnamespace('dishbee_private') IS NOT NULL
    OR (SELECT COUNT(*) FROM mealdeck_private.installation WHERE singleton AND profile='mealdeck-independent-v1') <> 1
    OR NOT EXISTS(SELECT 1 FROM public.tenants WHERE slug='mealdeck' AND legal_name='313 Brands Ltd')
    OR (SELECT md5(prosrc) FROM pg_proc WHERE oid='mealdeck_private.email_registration_available_at(timestamptz)'::regprocedure)
         <> 'e4d600976237a11f5efa99715736b8fa'
  THEN RAISE EXCEPTION 'mealdeck_registration_scope_or_definition_changed'; END IF;
END $guard$;
CREATE OR REPLACE FUNCTION mealdeck_private.email_registration_available_at(p_at timestamptz)
RETURNS boolean LANGUAGE sql IMMUTABLE SET search_path='' AS $policy$
  SELECT p_at IS NOT NULL AND
    (p_at<timestamptz '2026-11-06 00:00:00 Europe/London'
      OR p_at>=timestamptz '2026-11-09 13:00:00 Europe/London')
$policy$;
COMMIT;
