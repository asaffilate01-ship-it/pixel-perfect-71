# Phase 12 — Group invitations and payment allocation safety

This phase adds a pure TypeScript allocation validator and privacy-minimised participant view for shared MealDeck orders. It builds on Phase 11's paid-only KDS release check.

## Behaviour
- MealDeck order owner covers a positive or zero share of an order; each invited participant covers a positive allocation.
- The sum of all allocated integer-pence shares must equal the GBP order total exactly.
- Duplicate invitation IDs, duplicate participant identities, expired/revoked/declined invites, locked plans and invalid revision numbers are rejected.
- Guest-facing data includes only the guest's own amount and status; other guests' shares and the full basket amount are not exposed to them.
- This module is a pure decision helper, not an actual invitation service, checkout session or card-payment integration.

## Required next implementation
1. Store invitations server-side with hashed single-use invitation tokens and expiry. Use authenticated principals or a verified recipient-binding mechanism.
2. Enforce owner-only write permissions, one-per-participant invite uniqueness, server-generated IDs and revision-based concurrency protection under a database transaction.
3. On allocation approval, lock the plan and persist payment shares before creating Adyen payment sessions.
4. Process Adyen verified webhook events idempotently, map captures to their respective shares and use Phase 11 KDS release checks within an atomic server transaction.
5. Add invite acceptance, revocation, opt-out, participant reminder, abandoned invite and timeout experiences across website, app and WhatsApp notifications.
6. Verify role-based and cross-tenant isolation with integration tests. Avoid exposing payment tokens, sensitive invitee identity and provider details in public tracking.

Unit tests: `bun test tests/mealdeck-group-invitations.test.ts`.

Not included: deployed invitation endpoints, database schema, payment capture, live notifications or KDS dispatch. Deployment remains disabled until those components are reviewed.
