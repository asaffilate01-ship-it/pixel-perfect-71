# Phase 11 — Shared basket payment gate

This phase adds a pure, fail-closed `evaluateGroupKdsRelease` function and regression tests.

## Contract
- One multi-brand checkout may have one or more invited participant shares.
- All allocations are integer pence in one currency and must total the order total.
- **Payment-authorised is not payment-captured.** Every share must be fully captured, net of refunds, before KDS release.
- An order must also have the server-side `paid` state. Cancelled, pending, failed, underpaid, refunded, overcaptured, or misallocated orders remain blocked.
- This is only a decision helper, not proof of payment, an actual payment capture, a KDS enqueue, or a split-settlement integration.

## Required server integration
1. Verify Adyen webhook HMAC, merchant account, currency, amount and payment reference on a trusted server; process duplicates idempotently.
2. Resolve payment-share and order records from protected database keys; never trust a browser-supplied `paid` status or captured amount.
3. Use a single database transaction under an order lock to recheck the function decision, atomically transition order to paid, and create unique KDS tickets/outbox events once.
4. Use a transactional outbox with retry and idempotency keys for dispatch; an individual kitchen brand/station may not receive duplicate tickets.
5. Handle cancellations, partial captures, refunds, payment disputes, abandoned invitees, expired invitations and deadline notifications without leaking invitee details.
6. Confirm payments, KDS and courier integrations in staging. Roll out with a kill switch and alerting before enabling live orders.

Tests: `bun test tests/mealdeck-group-payment-gate.test.ts`

This branch is intentionally stacked on Phase 10. No actual Adyen integration, kitchen release, public checkout changes or production activation is part of this patch.
