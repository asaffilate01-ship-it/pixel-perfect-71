-- MealDeck collection/kerbside two-way communication. No payment, kitchen status or handoff mutation.
-- Separate private schema, service-authenticated customer endpoint, staff JWT permission RPC.
BEGIN;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='60s';
DO $guard$ BEGIN
  IF current_user IN ('anon','authenticated','service_role')
    OR to_regnamespace('dishbee_private') IS NOT NULL
    OR (SELECT COUNT(*) FROM mealdeck_private.installation WHERE singleton AND profile='mealdeck-independent-v1')<>1
    OR NOT EXISTS (SELECT 1 FROM public.tenants WHERE slug='mealdeck' AND legal_name='313 Brands Ltd')
    OR to_regprocedure('mealdeck_ops_private.kds_assert_scope(uuid,uuid,text)') IS NULL
    OR to_regprocedure('mealdeck_private.checkout_receipt_for_identity(uuid,uuid,uuid)') IS NULL
  THEN RAISE EXCEPTION 'mealdeck_order_comms_scope_unavailable'; END IF;
END $guard$;

CREATE TABLE IF NOT EXISTS mealdeck_private.order_contact_state(
  order_id uuid PRIMARY KEY REFERENCES public.orders(id) ON DELETE CASCADE,
  state text NOT NULL CHECK (state IN ('on_my_way','arrived')),
  parking_note text CHECK (parking_note IS NULL OR length(parking_note)<=120),
  latitude numeric(9,6),
  longitude numeric(9,6),
  pin_expires_at timestamptz,
  arrived_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK ((latitude IS NULL AND longitude IS NULL AND pin_expires_at IS NULL) OR
         (latitude BETWEEN 49 AND 61 AND longitude BETWEEN -9 AND 3 AND pin_expires_at IS NOT NULL))
);
CREATE TABLE IF NOT EXISTS mealdeck_private.order_contact_messages(
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  sender text NOT NULL CHECK (sender IN ('customer','staff')),
  body text NOT NULL CHECK (length(body) BETWEEN 1 AND 500),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS order_contact_messages_recent_idx
  ON mealdeck_private.order_contact_messages(order_id,created_at DESC,id DESC);
REVOKE ALL ON TABLE mealdeck_private.order_contact_state,mealdeck_private.order_contact_messages
  FROM PUBLIC,anon,authenticated,service_role;
ALTER TABLE mealdeck_private.order_contact_state ENABLE ROW LEVEL SECURITY;
ALTER TABLE mealdeck_private.order_contact_messages ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION mealdeck_private.order_comms_snapshot(p_order uuid)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $snapshot$
WITH state AS (
  SELECT c.* FROM mealdeck_private.order_contact_state c WHERE c.order_id=p_order
), latest AS (
  SELECT m.id,m.sender,m.body,m.created_at FROM mealdeck_private.order_contact_messages m
  WHERE m.order_id=p_order ORDER BY m.created_at DESC,m.id DESC LIMIT 50
)
SELECT jsonb_build_object(
 'state',coalesce((SELECT s.state FROM state s),'not_arrived'),
 'arrivedAt',(SELECT s.arrived_at FROM state s),
 'parkingNote',(SELECT s.parking_note FROM state s),
 'pin',(
    SELECT CASE WHEN s.pin_expires_at>now() AND s.latitude IS NOT NULL THEN
       jsonb_build_object('latitude',s.latitude,'longitude',s.longitude,'expiresAt',s.pin_expires_at)
    ELSE null END FROM state s
 ),
 'messages',coalesce((SELECT jsonb_agg(jsonb_build_object(
     'id',q.id,'sender',q.sender,'body',q.body,'createdAt',q.created_at)
     ORDER BY q.created_at,q.id) FROM (SELECT * FROM latest ORDER BY created_at,id) q),'[]'::jsonb),
 'serverNow',now()
)
$snapshot$;
REVOKE ALL ON FUNCTION mealdeck_private.order_comms_snapshot(uuid) FROM PUBLIC,anon,authenticated,service_role;

-- Only the server-side checkout handler may supply the independently verified customer/guest actor.
-- Never expose this RPC to browsers; a browser cannot claim an arbitrary customer UUID.
CREATE OR REPLACE FUNCTION public.mealdeck_order_comms_customer(
 p_order uuid,p_customer uuid,p_guest uuid,p_action text,
 p_body text DEFAULT NULL,p_parking_note text DEFAULT NULL,
 p_latitude numeric DEFAULT NULL,p_longitude numeric DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $comms$
DECLARE o public.orders%rowtype;receipt jsonb;note text;
BEGIN
 IF num_nonnulls(p_customer,p_guest)<>1 OR p_order IS NULL
   OR p_action NOT IN ('read','on_my_way','arrived','message','pin')
 THEN RAISE EXCEPTION 'mealdeck_comms_invalid'; END IF;
 SELECT * INTO o FROM public.orders WHERE id=p_order AND source='mealdeck'
   AND fulfilment IN ('pickup','curbside')
   AND customer_id IS NOT DISTINCT FROM p_customer
   AND guest_checkout=(p_guest IS NOT NULL);
 IF NOT FOUND THEN RAISE EXCEPTION 'mealdeck_comms_order_unavailable'; END IF;
 PERFORM mealdeck_private.checkout_identity(o.tenant_id,o.location_id,p_customer,p_guest);
 IF p_guest IS NOT NULL AND NOT EXISTS(
   SELECT 1 FROM mealdeck_private.stripe_orders s WHERE s.order_id=o.id AND s.guest_id=p_guest
   UNION SELECT 1 FROM mealdeck_private.payment_orders m
     WHERE m.order_id=o.id AND m.guest_id=p_guest AND m.staff_id IS NULL)
 THEN RAISE EXCEPTION 'mealdeck_comms_order_unavailable'; END IF;
 receipt:=mealdeck_private.checkout_receipt_for_identity(p_order,p_customer,p_guest);
 IF receipt->'verifiedPaid' IS DISTINCT FROM 'true'::jsonb
   OR receipt->'held' IS DISTINCT FROM 'false'::jsonb
   OR o.paid_at IS NULL OR o.payment_status<>'paid'
 THEN RAISE EXCEPTION 'mealdeck_comms_payment_unverified'; END IF;
 IF p_action<>'read' AND (o.status::text IN ('cancelled','refunded','failed','fulfilled','completed')
    OR (SELECT s.status='handed_off' FROM public.mealdeck_pass_orders s WHERE s.order_id=o.id))
 THEN RAISE EXCEPTION 'mealdeck_comms_order_closed'; END IF;
 IF p_action='message' THEN
   note:=btrim(coalesce(p_body,''));
   IF length(note) NOT BETWEEN 1 AND 500 OR note ~ '[[:cntrl:]]'
      OR p_parking_note IS NOT NULL OR p_latitude IS NOT NULL OR p_longitude IS NOT NULL
   THEN RAISE EXCEPTION 'mealdeck_comms_invalid_message'; END IF;
   IF EXISTS (SELECT 1 FROM mealdeck_private.order_contact_messages m
      WHERE m.order_id=p_order AND m.sender='customer' AND m.created_at>now()-interval '3 seconds')
      OR (SELECT count(*) FROM mealdeck_private.order_contact_messages m WHERE m.order_id=p_order AND m.sender='customer')>=60
   THEN RAISE EXCEPTION 'mealdeck_comms_rate_limited'; END IF;
   INSERT INTO mealdeck_private.order_contact_messages(order_id,sender,body)
     VALUES(p_order,'customer',note);
 ELSIF p_action IN ('on_my_way','arrived','pin') THEN
   IF p_body IS NOT NULL OR length(coalesce(p_parking_note,''))>120
     OR coalesce(p_parking_note,'') ~ '[[:cntrl:]]'
     OR (p_latitude IS NULL)<>(p_longitude IS NULL)
     OR (p_latitude IS NOT NULL AND (o.fulfilment<>'curbside'
       OR p_latitude NOT BETWEEN 49 AND 61 OR p_longitude NOT BETWEEN -9 AND 3))
   THEN RAISE EXCEPTION 'mealdeck_comms_invalid_arrival'; END IF;
   IF p_action='pin' AND (o.fulfilment<>'curbside' OR p_latitude IS NULL)
   THEN RAISE EXCEPTION 'mealdeck_comms_invalid_pin'; END IF;
   INSERT INTO mealdeck_private.order_contact_state AS s(
     order_id,state,parking_note,latitude,longitude,pin_expires_at,arrived_at,updated_at)
   VALUES (p_order,case when p_action='pin' then 'on_my_way' else p_action end,
     nullif(btrim(coalesce(p_parking_note,'')),''),
     p_latitude,p_longitude,
     CASE WHEN p_latitude IS NOT NULL THEN now()+interval '30 minutes' ELSE NULL END,
     CASE WHEN p_action='arrived' THEN now() ELSE NULL END,now())
   ON CONFLICT(order_id) DO UPDATE SET
     state=CASE WHEN p_action='pin' THEN s.state ELSE EXCLUDED.state END,
     parking_note=COALESCE(EXCLUDED.parking_note,s.parking_note),
     latitude=EXCLUDED.latitude,longitude=EXCLUDED.longitude,
     pin_expires_at=EXCLUDED.pin_expires_at,
     arrived_at=CASE WHEN p_action='arrived' THEN now()
        WHEN p_action='on_my_way' THEN NULL ELSE s.arrived_at END,
     updated_at=now();
 ELSE
   IF p_body IS NOT NULL OR p_parking_note IS NOT NULL OR p_latitude IS NOT NULL OR p_longitude IS NOT NULL
   THEN RAISE EXCEPTION 'mealdeck_comms_invalid'; END IF;
 END IF;
 RETURN mealdeck_private.order_comms_snapshot(p_order);
END $comms$;
REVOKE ALL ON FUNCTION public.mealdeck_order_comms_customer(uuid,uuid,uuid,text,text,text,numeric,numeric)
  FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.mealdeck_order_comms_customer(uuid,uuid,uuid,text,text,text,numeric,numeric)
  TO service_role;

-- Staff access is verified by the same tenant/location/MFA/permission authority as KDS.
CREATE OR REPLACE FUNCTION public.mealdeck_ops_order_comms(
 p_tenant uuid,p_location uuid,p_order uuid,p_action text DEFAULT 'read',p_body text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $staff$
DECLARE o public.orders%rowtype;note text;evidence jsonb;
BEGIN
 PERFORM mealdeck_ops_private.kds_assert_scope(p_tenant,p_location,
   CASE WHEN p_action='message' THEN 'orders.status' ELSE 'orders.read' END);
 IF p_action NOT IN ('read','message') OR p_order IS NULL THEN
   RAISE EXCEPTION 'mealdeck_comms_invalid'; END IF;
 SELECT * INTO o FROM public.orders WHERE id=p_order AND tenant_id=p_tenant
   AND location_id=p_location AND source='mealdeck' AND fulfilment IN ('pickup','curbside')
   AND payment_status='paid' AND paid_at IS NOT NULL;
 IF NOT FOUND THEN RAISE EXCEPTION 'mealdeck_comms_order_unavailable'; END IF;
 evidence:=mealdeck_private.kds_release_authority(o.id);
 IF evidence->'eligible' IS DISTINCT FROM 'true'::jsonb THEN
   RAISE EXCEPTION 'mealdeck_comms_payment_unverified'; END IF;
 IF p_action='message' THEN
   note:=btrim(coalesce(p_body,''));
   IF length(note) NOT BETWEEN 1 AND 500 OR note ~ '[[:cntrl:]]' THEN
     RAISE EXCEPTION 'mealdeck_comms_invalid_message'; END IF;
   IF o.status::text IN ('cancelled','refunded','failed','fulfilled','completed')
      OR EXISTS (SELECT 1 FROM public.mealdeck_pass_orders p WHERE p.order_id=o.id AND p.status='handed_off')
   THEN RAISE EXCEPTION 'mealdeck_comms_order_closed'; END IF;
   IF EXISTS (SELECT 1 FROM mealdeck_private.order_contact_messages m
      WHERE m.order_id=p_order AND m.sender='staff' AND m.created_at>now()-interval '2 seconds')
      OR (SELECT count(*) FROM mealdeck_private.order_contact_messages m WHERE m.order_id=p_order AND m.sender='staff')>=100
   THEN RAISE EXCEPTION 'mealdeck_comms_rate_limited'; END IF;
   INSERT INTO mealdeck_private.order_contact_messages(order_id,sender,body)
     VALUES(p_order,'staff',note);
 ELSIF p_body IS NOT NULL THEN RAISE EXCEPTION 'mealdeck_comms_invalid'; END IF;
 RETURN mealdeck_private.order_comms_snapshot(p_order);
END $staff$;
REVOKE ALL ON FUNCTION public.mealdeck_ops_order_comms(uuid,uuid,uuid,text,text)
  FROM PUBLIC,anon,service_role;
GRANT EXECUTE ON FUNCTION public.mealdeck_ops_order_comms(uuid,uuid,uuid,text,text)
  TO authenticated;

-- Expired coordinates and old chat content are physically purged. No continuous tracking.
CREATE OR REPLACE FUNCTION mealdeck_private.order_comms_purge()
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $purge$
BEGIN
 UPDATE mealdeck_private.order_contact_state SET latitude=NULL,longitude=NULL,pin_expires_at=NULL
 WHERE pin_expires_at<=now() AND pin_expires_at IS NOT NULL;
 DELETE FROM mealdeck_private.order_contact_messages WHERE created_at<now()-interval '7 days';
END $purge$;
REVOKE ALL ON FUNCTION mealdeck_private.order_comms_purge() FROM PUBLIC,anon,authenticated,service_role;
-- Apply cron scheduling explicitly after permission review; until then all reads hide expired pins.
COMMIT;
