# MealDeck — verified own-driver pickup notifications

**11 November 2026. Source-only staged release. Not a GPS or real-time ETA launch.**

## Current state and missing feature

MealDeck has a private Web Push pipeline with explicitly opted-in order/account endpoints, durable outbox, service-worker templates for `with_driver` and `on_the_way`, and a payment/KDS-proven order status projection. However, the existing `mealdeck_private.push_current_order_stage` excluded `delivery`, and no driver-pickup event was queued. No drivers are currently approved/on shift in the independent production database, and no order-specific subscriptions were present in the latest read.

## Built in this phase

- Guarded migration `deploy/mealdeck/post-install-migrations/20261111100000_mealdeck_verified_driver_push.sql` extends the private delivery stage projection while preserving the old pickup/kerbside rules.
- For delivery, stage `with_driver` requires **payment verified, the KDS order released, staff handover marked `with_driver`, and the authenticated assigned driver recorded `collected`**. Merely offering a job, opening navigation or marking a bag ready never emits it.
- One private after-update trigger on the existing assignment state queues exactly one `with_driver` event with a 20-minute expiry, selecting recipients through the **existing consent checked `push_order_recipients`**. The existing worker independently rechecks the current stage, endpoint and consent before sending.
- The customer device notification message contains only the existing limited order-stage metadata, not customer address/phone, driver identity, GPS coordinates, provider secrets or a delivery ETA. Its icon-click opens the existing authenticated/guest order.
- Staff confirmation of actual delivery remains authoritative and unchanged; the existing delivery `completed` stage is recognised only from canonical KDS-completed status and a real delivered timestamp.
- Updated the customer order-notification opt-in card to describe the optional driver-collected stage accurately.
- Native disposable PostgreSQL tests cover real driver accepted/collected transitions, exact recipient count, queue idempotency, stage preflight, address/contact redaction, and old acceptance/packing behaviour.

## Activation and acceptance gates

1. Verify **independent MealDeck** Supabase profile; confirm current `push_current_order_stage(uuid)` function hash `430986ee742a413f4fb3d0aa24a76946` and no matching trigger already installed. Reject mismatched source or existing installation.
2. Run native PostgreSQL 17 driver-plus-notifications integration, customer-push suite, front-end tests, full build/TypeScript and permission audit. No test posts to a real Web Push provider.
3. Deploy the migration as one atomic transaction only after checks pass. Verify trigger, denied direct permissions and unchanged payment/KDS/receipt authority. The server push feature and send credentials remain controlled by existing runtime switches and explicit consent.
4. Have a *real approved driver* and a consenting test order. Verify kitchen acceptance, preparing, packed/ready, staff handover, driver collection, customer notification, delivery and withdrawal on a test Android/iOS phone. Confirm no notification on an unpaid/cancelled order or after withdrawal and no duplicate on driver retry.
5. Test no driver / no subscription / no network and old-session cases. Never claim receipt of an alert simply because the push service accepted a message.

## Still outstanding

No verified approved driver is in the live roster yet; no real-world driver arrival or tracking is possible without manager approval. Continuous **background location** and customer maps need a separate explicit per-assignment location-consent backend, short-lived authenticated access, bounded retention, native/background OS permissions, real route/ETA provider, privacy review and physical device tests. The one-tap GPS readiness check already shipped is **not** customer location sharing. WhatsApp/Sunmi marketplace integrations are separate.

Direct MealDeck Luton own-fleet delivery remains £0, £15 payable-food minimum after discounts and 4 km postcode coverage; Uber Eats is independent. This source change never alters charge, driver roster, order or KDS state.
