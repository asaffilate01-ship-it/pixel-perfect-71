# Phase 15: Paid-only KDS outbox planning

Adds pure `planPaidKdsDispatch` validation with deterministic keys per order/brand/station. It depends on the Phase 11 payment gate and therefore rejects unpaid or incompletely captured group orders.

## Production deployment requirements
1. Derive order and shares from locked server-side database records updated only after authenticated Adyen webhook validation. Never trust browser payment statuses.
2. Obtain brand/station routing from enabled location configuration, not from a customer request.
3. In a single database transaction, verify the order is paid, insert KDS events using `UNIQUE(tenant_id,location_id,order_id,brand_id,station_id)` and `ON CONFLICT DO NOTHING`, and commit. `existingKeys` is only a planning hint, not a concurrency-safe duplicate prevention mechanism.
4. Use a transactional outbox worker with bounded retry, visibility timeout, dead-letter review, idempotent downstream KDS processing and monitoring.
5. Carry item/modifier notes, order notes, allergens, brand display, fulfilment method, customer display name, pickup/kerbside code and vehicle registration only to authorized kitchen screens with proper privacy retention.
6. Handle refunds, disputes, cancellation and partial fulfilment with explicit post-dispatch policy. Never silently retract a ticket that a kitchen may have started.
7. Run `bun test tests/mealdeck-kds-outbox.test.ts`, the full CI suite, real database concurrency and permission tests, and staging KDS acceptance before deployment.

No database outbox, provider integration or live kitchen dispatch is implemented by this module.
