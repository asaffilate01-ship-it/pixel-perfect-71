# Phase 33 — Recover uncertain courier bookings safely

MealDeck must create **one delivery for the entire multi-brand basket**. The new `reconcileCourierBooking` helper evaluates trusted provider booking lookups when the original courier booking response is delayed, missing, or ambiguous.

The pure helper accepts a persisted booking attempt and verified provider status lookup. It never calls a courier API, sends a booking, changes an order, settles a payment or exposes provider tracking secrets.

## Recovery rules
- An already confirmed, rejected or cancelled attempt cannot be retried.
- An uncertain request with no lookup, an unauthenticated lookup, or a provider outage remains on hold.
- A verified existing booking records its provider booking reference; never create a replacement.
- A verified `not_found` lookup can suggest retry **with the original provider and identical order-level idempotency key**, only after a configurable grace period.
- Explicit rejection, cancellation, unexpected provider response, or conflicting provider IDs require staff investigation.
- Validate tenant, location, order, quoted provider, timestamp and stable booking key against server-owned records.

## Required Dishbee runtime wiring
1. Store an immutable courier booking attempt and unique `(tenant_id,location_id,order_id)` request key in a durable transactional outbox.
2. Only create an attempt after authoritative payment and all-kitchens-complete checks.
3. Use signed/authenticated provider APIs and merchant credentials on the server; persist the provider-specific booking reference, outbound request and response status safely.
4. A worker holding a database lease may query status and act on the recovery decision. Protect state transitions with row locks, monotonic versions and idempotent provider submission. **Never** create a booking with another provider merely because an API timed out.
5. If a provider cannot guarantee idempotent submission and reliable status lookup, block automatic retry and escalate to operations.
6. Reconcile downstream courier events against the same canonical booking, never accept client-side delivery completion or proof.
7. Test simultaneous workers, repeated webhooks, service outages, provider status inconsistencies, role isolation, settlement disputes and actual provider sandbox booking scenarios before live rollout.

Unit tests: `bun test tests/mealdeck-courier-booking-recovery.test.ts`.

This patch adds source, regression tests and CI integration only. No real courier booking API or database worker is activated.
