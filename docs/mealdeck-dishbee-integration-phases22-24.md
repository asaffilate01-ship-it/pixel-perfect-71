# MealDeck / Dishbee integration phases 22–24 — 3 November 2026

## Built in GitHub

- **Phase 22: canonical kitchen selection.** Postcode lookup now resolves
  only by the trusted, server-configured Dishbee tenant + location UUID pair,
  never a city name, postcode prefix or browser-supplied kitchen label.
  Unknown/ambiguous/missing responses and RPC outages fail closed. Sample
  coverage is only a clearly gated Coming Soon preview.
- **Phase 23: secure order receipt and checkout gating.** Only canonical UUID
  order references with a four-digit handoff code are accepted. These mean
  payment pending, not paid. In addition to the compile-time COMING_SOON
  switch, the server requires MEALDECK_CHECKOUT_INTEGRATION_APPROVED to equal
  signed-off before a customer order may be created.
- **Phase 24: deterministic pipeline rehearsal tests.** Compose verified
  provider-event inputs, group capture gate, two-station paid-only KDS
  planning, master pass, one courier selection, replay/idempotency and
  six-digit server-HMAC delivery proof. No external provider is called.

## Canonical integration flow (future live launch)

1. Check public_mealdeck_serviceability against actual Dishbee location UUIDs.
2. Load current authorised Dishbee catalogue; do not treat a sample menu
   or browser-computed price as a live offer.
3. Dishbee create_mealdeck_checkout_order creates one payment_pending order.
   The customer sees the actual Dishbee amount and a secure payment session
   supplied by a **dedicated MealDeck payment endpoint**, not an untrusted URL.
4. Adyen for Platforms completes and confirms each group contribution using
   signed provider events. Only the server-owned complete captured ledger
   can release KDS. A redirect, chat message or success callback is NOT proof.
5. Dishbee routes brand-specific station tickets; only after all are ready
   can one delivery provider be booked. Handoff requires proof appropriate
   to delivery, pickup or kerbside, plus code and plate where applicable.
6. Refunds, chargebacks, failed deliveries, idempotency and audited
   reconciliation are enforced by Dishbee, not the public website.

## Current blockers and no-go gates

- The only connected DISHBEE Supabase project is active but its read-only
  database authentication returned 28P01. Its schema/migration history,
  grants, RLS, safety advisers and staged data cannot yet be verified here.
- Dishbee draft Phase 6 PR #81 depends on unmerged upstream branches; do
  not merge it blindly to resolve missing capabilities.
- Dishbee Hive has an Adyen payment session flow; that flow is scoped to
  Hive orders and must **not** be reused with MealDeck source orders until
  their own account/split/session contract has been implemented and reviewed.
- Dishbee's existing SQL create_mealdeck_checkout_order uses a
  caller-supplied delivery fee **fallback** when the authoritative location
  delivery policy is absent. The public RPC is callable with an anon key.
  The database function must be patched to fail closed before checkout
  may be opened; MealDeck's server-side fee check alone is not sufficient.
- A server-confirmed provider session and real Adyen Web payment UI are not
  available in this repository. The second checkout approval flag MUST
  remain unset until those are implemented and sandbox-proven.
- Verify actual automatic capture policy vs AUTHORISATION, Standard and
  Balance Platform webhook signatures, merchant accounts and splits, full
  and partial refunds, settlement, replay and operator reconciliation.
- Real KDS station routing, kitchen readiness, courier credentials, webhook
  authenticity, six-digit handoff, rate limits and consumer accessibility
  must be accepted in a separate approved Dishbee staging environment.
- St Albans MealDeck remains delivery only, separate from Café1's own
  counter and EPOS ordering; Luton modes are governed by Dishbee configuration.

## Go-live checklist

Do not change COMING_SOON, enable the server approval switch, process real
funds, or run production SQL without all of the following:

- Signed-off Dishbee staging schema and tenant/location cross-access tests
- Dedicated MealDeck Adyen for Platforms sessions and merchant split rules
- Verified payment/capture events, group holds, refunds and retries
- End-to-end kitchen station and one-courier sandbox reconciliation
- Staff-access and handoff proof review, mobile / keyboard acceptance
- Merchant finance approval, production rollback, monitoring and support

No Lovable credits, customer payments, courier bookings, order mutations
or database migrations were performed by this source-only phase.
