# MealDeck Phase 32 — secure checkout intent retries (source only)

**Status:** Source-only, 3 November 2026. The customer site stays `COMING_SOON = true`; no payment or order may be created until independent end-to-end approval.

## Why this change

A customer can double-tap checkout or retry after a timeout, even when the original request succeeded. Browser button-disabling or an in-process promise lock cannot protect against concurrent requests to different application instances. The existing Dishbee RPC was not an at-most-once API.

MealDeck now uses a **fresh browser-generated UUIDv4 per customer-reviewed checkout snapshot** and holds it in a React ref for the visit. If the submitted location, fulfilment, basket, selected modifiers or customer details are identical, retrying uses the **same** UUID even if the two-minute signed quote has been refreshed. Any relevant change rotates the attempt UUID. The ID is never stored in URLs, a shared browser storage object or logs; no `Math.random` fallback is permitted.

The server validates the UUIDv4, the existing short-lived signed estimate and current canonical Dishbee pricing. It **will not call the legacy anonymous `create_mealdeck_checkout_order`** under any circumstance. Instead it requires `DISHBEE_MEALDECK_CHECKOUT_SERVER_KEY` from its server-only environment and calls the P27 database RPC `create_mealdeck_checkout_order_once` with `p_attempt_id`. Missing secrets/RPC cause a clear safe `unconfigured`/error status without creating a second order.

## Receipt states

| Dishbee server receipt | Customer experience |
| --- | --- |
| New `payment_pending` order | Show reference, private four-digit code and **payment still required**; no kitchen preparation |
| Exact-attempt replay while pending | Reuse **the same** reference/code; show existing pending order, never a second new order |
| Replay of already paid/accepted/preparing/ready/fulfilled order | Show **existing order found** and reference; do not request a new payment |
| Replay of cancelled/refunded/failed order | Show **support review required**; never assert a new checkout success |
| Mismatched tenant, location or request fields | Database rejects with a conflict and the MealDeck server reports an error without exposing internal details |
| Missing/malformed/ambiguous receipt | Reject; no success or paid claim |

The **Dishbee database transaction**, not the client fingerprint, enforces at-most-once order creation. The `checkoutSnapshotFingerprint` is only a transient local equality key: it contains customer information in application memory and must never be logged or persisted. The database uses its own SHA-256 request digest under the protected server-only RPC.

## Companion dependencies

- **Dishbee PR #83**: draft P25 authoritative delivery fee integrity guard, staging required.
- **Dishbee PR #84**: stacked draft P27 attempt table, atomic one-shot RPC and revoked legacy anonymous order creation; must be approved and staged after #83.
- **Dishbee SQL access:** still fails `28P01`, so migrations have **not** been run or tested in the hosted database.
- **Adyen for Platforms:** actual merchant/split setup, signed events, capture/replay/refund reconciliation and payment session endpoints remain unimplemented/unsigned-off for MealDeck.
- **KDS and courier:** never release on a browser redirect, checkout receipt, or unverified AUTHORISATION. All required shares/capture evidence, kitchen tickets and one courier booking must be tested.

## Testing and release gates

1. `tests/mealdeck-checkout-attempt.test.ts`: unchanged basket retry reuse, changed basket/notes/customer input rotation, cryptographic ID validation, no insecure fallback.
2. `tests/mealdeck-dishbee-contract.test.ts`: strict receipt, replay and terminal-order interpretation.
3. GitHub CI: Bun, build, TypeScript, targeted ESLint, existing end-to-end **synthetic** state-machine tests.
4. Required external staging: 20+ simultaneous POSTs via independent server instances, forced network timeouts, cancelled/paid/refunded original state, cross-tenant injection, wrong modifier, expired quotes, missing fee policy, and browser retries. Verify one master order, no duplicate customer charge and no KDS until full capture.
5. Security: service-role credential server-only, rate limits, CSRF protection, SQL security advisory, RLS, audit and full credential isolation. A broad `service_role` JWT is highly privileged; restrict access to the backend service environment, rotate and monitor it.
6. UI: screen-reader and mobile keyboard acceptance, real provider payment session tests, rollback/incident handling, final operations/finance approval.

**Not performed:** migrations, live payment, KDS, courier bookings, production flags, live order creation or Lovable build. The committed code is groundwork and is not a claim that a production checkout is functional.
