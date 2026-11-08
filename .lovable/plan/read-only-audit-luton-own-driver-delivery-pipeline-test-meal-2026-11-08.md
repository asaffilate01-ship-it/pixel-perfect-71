# Read-only audit: Luton own-driver delivery pipeline (test@mealdeck.co.uk → 14 Guardian Way, LU1 1BU)

Audit only. No code edits, deploys, publishes, database writes, orders, notifications, print jobs, charges or driver dispatch.

## Checks to run (each reported as PASS / FAIL / UNTESTABLE with evidence)

1. **Deployment status** – compare published site build vs current source (HTTP fetch of public pages and `/api/checkout` availability GET only); note last publish evidence.
2. **Backend status** – backend health read; confirm which database the runtime points at (independent MealDeck vs other) from config names only, no secret values.
3. **Account state** – read `test@mealdeck.co.uk` existence, email verified, customer (not staff) role.
4. **Kitchen/location gates** – read Luton tenant/location, Online/Busy/Paused/Closed state, opening window vs server clock, delivery enabled flag, checkout release switches (names/states only).
5. **Quote prerequisites** – inspect `mealdeck_create_checkout_quote*` and `mealdeck_bind_local_delivery_quote` definitions; confirm required inputs (address, fulfilment, items, signed quote secret presence).
6. **3 km radius geocoding** – inspect geocoder code/function and kitchen coordinates; compute distance for LU1 1BU via a public postcode lookup (read-only) and compare to 3 km rule. No quote created.
7. **Order-payment guard** – inspect `mealdeck_bind_order_payment`, webhook handler and KDS release conditions; confirm only verified paid orders reach KDS.
8. **KDS acceptance and receipt queue** – inspect `mealdeck_ops_kds_accept_order` for exactly-once receipt enqueue; read-only query of recent queue shape (no rows changed).
9. **Printer v0.2.3 path** – inspect `apps/mealdeck-printer` version, claim/verify RPCs and published APK/checksum files; device paper output marked UNTESTABLE.
10. **Own-driver handoff** – inspect `mealdeck_ops_kds_transition_local_driver`, `mealdeck_local_delivery_ready`, outbox; confirm whether delivery is actually enabled for customers (project rules say delivery is unavailable/coming soon).
11. **Existing tests** – run only unit tests that use no live backend (pure/pglite), listing which cover the above.
12. **Isolated simulation** – determine whether a fully isolated end-to-end harness (local DB + mocked Stripe/printer/driver) exists, or only partial unit coverage.

## Output
A single report table of the 12 checks with status, evidence (file:line or query result) and anything that blocks an end-to-end live run.

## Known constraint to flag up front
Project rules state delivery is currently unavailable (collection/kerbside only), so an own-driver delivery quote is expected to be refused by design; the audit will confirm whether that is still true.
