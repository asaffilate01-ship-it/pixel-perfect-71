# MealDeck — Single-delivery courier booking guard

## Scope
The new `planCourierBooking` pure function consumes server-owned order state and trusted provider quotes, reuses `chooseDelivery` to select the lowest valid offer, and produces **one stable booking intent for the entire multi-brand basket**. The customer-facing order never exposes provider credentials or receives a second delivery fee.

It refuses dispatch for unpaid/refunded/cancelled orders, kitchens that have not completed all stations, non-delivery fulfilment, any order already booked or with an in-flight/uncertain booking request, expired or non-serviceable quotes, and malformed identifiers.

## Production integration requirements
1. Put order payment state, brand station readiness, fulfilment and quote selection behind authenticated Dishbee server services; do not accept these from web or mobile clients.
2. Lock the tenant/location/order transaction and create a durable courier-booking outbox row with a unique key on `(tenant_id,location_id,order_id)` before contacting a delivery provider. Handle concurrent attempts with `ON CONFLICT DO NOTHING`.
3. The provider's booking idempotency key must be the stable order-level key, reused for retries. Recover any timed-out/ambiguous provider response with provider status lookup rather than sending a second booking to another courier.
4. Refresh an expired quote and explicitly evaluate service area, pickup readiness, vehicle capacity, availability, delivery promises and provider contract limits. Compare prices only on trusted current quotes, not browser inputs.
5. Persist provider booking reference and provider status into the durable order record, and expose only customer-safe tracking; verify webhook origin, event deduplication, cancellation and proof-of-delivery rules.
6. Test concurrent fulfilment, partial kitchen completion, cancelled/refunded orders, expired offers, provider timeouts and cross-tenant authorization in staging.
7. **Do not activate live courier dispatch or charge a customer based on this pure function.** External API integration, database outbox and staging tests are still separate prerequisites.

Unit regression: `bun test tests/mealdeck-courier-booking-guard.test.ts`.
