# MealDeck Phases 17 and 18 — fulfilment foundation

## Implemented in GitHub (not live)

- Phase 17: master kitchen pass for all ordered brands/stations. Unknown, missing, cancelled and duplicate tickets block courier booking. Every station must be ready or handed over.
- Paid-only courier plan: reuses the Phase 11 captured-funds gate, Phase 16 fresh provider quotes, a server-controlled budget/ETA limit and stable per-order idempotency key. Produces ONE candidate booking for a multi-brand order, not separate couriers or delivery fees. Does not call provider APIs.
- Phase 18: verified provider event state machine, duplicate-event and out-of-order guards, and a private customer tracking projection.
- Order completion: requires every kitchen and authenticated handoff. Delivery requires a delivered courier event plus verified code; pickup requires code; kerbside requires code and registration.
- Server-only HMAC-SHA256 proof binds six-digit cryptographically generated code to order/mode and kerbside registration. Maximum five attempts, expiry and constant-time verification.
- Source-only Supabase tables for blocked-by-default courier booking outbox, immutable provider receipts and proof HMAC/attempts. RLS is enabled with direct anon/authenticated access revoked.
- CI regression coverage is extended to legacy phases 11–16 and these new phases. COMING_SOON stays enabled.

## Required before activating

1. Review this migration in an approved existing Dishbee staging database, including tenant/location FK relationships, indexes, RLS grants, order linkage and revert plan. Do not apply blindly to production or an empty Supabase project.
2. Wire to canonical Dishbee server-side orders, payment captures/refunds, enabled stations, verified brand-to-KDS routes, actual courier quote adapters and provider secrets. Client-supplied flags are never payment or KDS authority.
3. Build a single authenticated and locked transaction: verify all shares captured, all kitchens completed, route/serviceability/quote still valid; insert exactly one outbox row with a unique order booking ID, and transition from blocked only after approval. Never book a second courier on a timeout: reconcile external provider state before retrying or choosing a different provider.
4. Run one bounded-retry outbox worker with per-provider authenticated integration, external idempotency key, exact provider/merchant/location match and source-aware event verification. Keep external integrations and customer notifications disabled until sandbox acceptance.
5. Verify provider events against actual signed webhooks, not a JSON 'verified' boolean. Persist idempotency, transitions and tenant locks; handle late webhooks, failures, cancellations, chargebacks, refunds and user support escalation.
6. Generate/send proof privately. Never expose code, HMAC secret, booking reference, customer address or plate in URL/analytics. Serialise and atomically increment failed verification attempts under row lock; audit proof reissue and define retention and erasure policies.
7. Staging tests: concurrent booking workers, concurrent code guesses, same order with multiple kitchens, cross-tenant access, provider timeout/replay, delivery ETA breach, kerbside plate mismatch and courier delivered without proof.
8. Retain separate Cafe 1 merchant/EPOS records and MealDeck St Albans delivery-only policy. No paid ordering is enabled by source changes.

## Checks
- bun test tests/mealdeck-fulfilment-planner.test.ts tests/mealdeck-fulfilment-status.test.ts tests/mealdeck-handoff.test.ts
- bunx tsc --noEmit
- bun run build
- GitHub verification workflow and approved staging Postgres replay.

Neither real payments nor booking/kitchen/notifications are started by these phases.
