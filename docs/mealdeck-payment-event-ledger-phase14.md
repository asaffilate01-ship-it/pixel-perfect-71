# Phase 14 — Adyen payment-event settlement ledger foundation

This phase adds a **pure reducer** to recognise and deduplicate verified capture/refund events for a specific payment share. It is not a webhook handler and does not integrate with Adyen or dispatch to a KDS.

## Required production integration
1. Authenticate the raw Adyen webhook using the correct environment-specific HMAC signature and merchant configuration. Verify event type, success status, payment reference, amount, currency and order association on the server. **Never accept `verified` from the browser or a client payload.**
2. Ensure a server-owned share/provider reference and one currency. Resolve the group, tenant, order and share from protected storage, not user-provided metadata.
3. Use a database uniqueness constraint scoped to provider, merchant and event identity (and, where appropriate, event kind) to deduplicate retries. The reducer's in-memory list is only a pure testable model, not durable idempotency.
4. In a single serializable transaction or equivalent locked workflow: insert verified event, update share ledger, check all shares and the order state, and enqueue uniquely keyed KDS outbox tickets **only when all confirmed net captures equal the allocations**.
5. Treat failed events, authorised-only payments, refunds, chargebacks and disputes distinctly. Reconcile against Adyen settlement and payout reports; capture is not cash settlement.
6. Implement audited admin review of ambiguous or out-of-order events, plus monitoring for webhook failures and stuck pending orders.
7. Run `bun test tests/mealdeck-payment-event-ledger.test.ts`, TypeScript, lint and integration tests against a staging Adyen merchant before enabling checkout.

## Release status
Pure helper and unit tests only. No network calls, provider credentials, payment changes, schema changes, checkout UI, Supabase Edge deployment or KDS release included.
