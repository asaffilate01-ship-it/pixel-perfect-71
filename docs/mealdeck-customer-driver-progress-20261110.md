# MealDeck customer delivery-progress release — 10 November 2026

**GitHub source-only candidate. Not proof that a customer has received a driver message, push notification, or GPS update.**

## Why

The registered-customer account already privately polls `mealdeck_customer_orders()` every 20 seconds while the app is visible. It shows the kitchen stages, but currently says "Packed for delivery" even after staff confirm the meal was handed to a driver. This phase adds a **minimal, read-only driver-handoff status**, without public GPS, dispatch permissions, messaging permissions or new direct table access.

## Changes

- `deploy/mealdeck/post-install-migrations/20261110120000_mealdeck_member_local_driver_status.sql`: guarded function replacement against the verified independent MealDeck backend. The function remains authenticated and calls `mealdeck_private.customer_registration_authority(auth.uid())` before loading any order. It returns `localDriverStatus` from the matching tenant/location of an **owned, source=mealdeck, paid delivery order** only, with no address, coordinate, driver name or phone in the new response field.
- `src/lib/mealdeck-customer-orders.ts`: strict optional status parser (`awaiting_driver`, `with_driver`, `delivered`), with payment/hold/fulfilment guards and conservative copy. Existing backends lacking the field stay compatible.
- `src/components/customer-orders.tsx`: clarifies that current order progress is staff/KDS evidence, **not** a real-time map or guaranteed ETA.
- `tests/mealdeck-customer-orders.test.ts`: verified payment, delivery-only status, no arbitrary fields, payment/refund holds and no false GPS tracking.

## What the customer sees

| Verified private evidence | Status in account |
| --- | --- |
| Ready bag, delivery awaiting driver | Packed · awaiting driver |
| Driver handoff confirmed | With your driver |
| Driver marked delivered, staff completion not yet recorded | Delivery confirmation pending |
| Driver delivered and canonical completion recorded | Delivered |
| Held/refunded/unpaid order | Existing payment/review wording takes precedence |
| No local driver assignment/legacy backend | Existing Packed for delivery and checkout status remain |

## Deployment and acceptance

1. Run full Bun, TypeScript, web build, and checkout tests. Confirm zero change to public permissions and no bypass of `auth.uid()` order ownership.
2. Before applying SQL, compare the exact function hash, `mealdeck_private.installation`, `local_driver_orders`, and grants. Abort on any source drift; never force-replace a different function.
3. Use a disposable database clone for the SQL. Then apply to the independent MealDeck project only after review and verify that `anon` / `service_role` cannot invoke the customer RPC.
4. Complete a registered, paid, own-driver delivery and test statuses on the customer's private Account page and the kitchen KDS. Test another customer cannot see it, including another browser and an expired session.
5. Publish the Lovable-connected branch and verify what actually loads on `mealdeck.co.uk`; no PWA/OS-specific push guarantee is implied.

**Still outstanding:** driver GPS opt-in and tracking backend, customer map authorization/retention, physical push device enrollment, WhatsApp ordering commissioning, group payment acceptance, Uber/Just Eat Sunmi connector and scheduled payment-backed orders.

November direct delivery terms remain free for eligible £15+ food orders after discounts within 4 km of LU4 8NU. Uber Eats continues as a separate channel.
