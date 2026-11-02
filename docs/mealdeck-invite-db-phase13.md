# Phase 13: group invitation storage foundation

Migration `20261102220000_mealdeck_group_invite_foundation.sql` creates private, tenant-scoped group checkout plans and invitations. **It does not activate an invitation endpoint or payment processing.**

Tables:
- `mealdeck_checkout_groups`: tenant, location, order, authenticated owner, allocation totals, revision and state.
- `mealdeck_checkout_invites`: authenticated invited participant, amount, SHA-256 token digest, expiry and status. Raw bearer tokens must never be stored.

Security:
- RLS enabled; no browser/anonymous policies; direct grants revoked.
- All writes require an audited, authenticated server handler, verifying tenant and location membership, owner role and order ownership.
- Hash cryptographically random single-use tokens on the server with SHA-256. Rotate/revoke on acceptance and never log raw tokens.
- Within a transaction: lock group row, check expected revision, owner and invite status, validate exact allocation and expiry using Phase 12 rules; update revision and state atomically.
- The `token_hash` column must never be returned to public or invited-person endpoints; the table is not readable by browser clients.
- Rate-limit, protect against replay and abuse, return uniform invalid-invite errors; record invite acceptance audit events.
- The groups order ID is *not* currently constrained to Dishbee orders: map and validate its tenant/location and status in the reviewed server implementation before any production deployment.
- No direct payment or KDS release can be triggered by these tables; Phase 11's paid-only gate must be evaluated after verified Adyen webhooks with an idempotent KDS outbox.

## Review gates
1. Confirm the target Supabase project, migration sequence, schema ownership, and service-role deployment path.
2. Add FK integration to the actual order/tenant/location models and consider group membership uniqueness across tenants.
3. Deploy authenticated server endpoints for create/invite/accept/revoke/lock and add per-user/tenant authorization tests, concurrent updates, expiry and replay tests.
4. Implement privacy-safe public projections and notifications.
5. Execute migrations and staging end-to-end validation before production.

Do not run this migration against an unrelated Supabase project.
