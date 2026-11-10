# MealDeck — server-owned unpaid group choice expiry

**10 November 2026. Source-only release candidate. Do not install in a live database until the native PostgreSQL checks and owner acceptance pass.**

## Objective

The five-minute *personal* checkout basket already expires. A separate group room saves each participant's choices in private PostgreSQL tables, so the personal browser timer cannot govern these choices. This release implements **five minutes after each participant's most recent successful save** while the room remains in the collecting phase.

- A participant remains joined, but their saved unpaid food selection is cleared after five minutes. Their readiness resets and their version advances. Others' saves, state, and expiry timers are unchanged.
- Saving again starts only that person's five-minute timer. Marking Ready or opening a tab does not refresh it. The three-minute **invitation** and 30-minute **unfrozen room** deadlines are different rules.
- Every room action already locks the room row. Expiry runs after the lock is held, using the database wall clock; a stale save, ready, or finalise request cannot revive an expired draft without reconciling the new version.
- The existing one-minute `expire_unpaid_ordering_rooms()` pg_cron worker also processes overdue saved choices even when all clients are offline, using `SKIP LOCKED` and a 200-room upper bound per run. No new cron schedule or background provider is required.
- **Never** modify a room in the frozen/payment phase; never clear paid/processing/held/disputed payment shares, quotes, captured totals, KDS orders or physical receipts. No user account/driver/order access was broadened.

## Source changes

- `deploy/mealdeck/post-install-migrations/20261110113000_mealdeck_group_saved_choices_ttl.sql`: profile-guarded migration, indexed private `choices_saved_at`, server stamp trigger, scoped expiry helper, lifecycle locked RPC and idempotent worker update; private ACLs remain denied.
- `src/lib/mealdeck-group-rooms.ts`: optional strict per-person `choicesExpiresAt` field, compatible with a temporarily unupgraded backend.
- `src/lib/mealdeck-group-rooms.server.ts`: only the organiser and own participant can receive the choice deadline; no third-party private draft or expiry data leaks.
- `src/components/group-order-room.tsx`: local clock anchored to server observation shows the choice expiry without claiming a browser timer is authoritative; room reads still reconcile actual server expiry.
- `tests/postgres/ordering-rooms-behavior.mjs`: disposable database tests for independent source, per-person expiry, stale version, offline cron, frozen payment and default-deny grants.
- `tests/mealdeck-group-rooms.test.ts`: browser field projection privacy.

## Activation gates

1. Confirm independent MealDeck backend profile and the existing `20261109194000` / `194100` / `194200` group lifecycle installations. A zero-room preflight was observed in production on 10 November; repeat it at installation.
2. Require full GitHub CI and disposable **native** PostgreSQL tests, including test transaction rollback on a live-schema clone. Keep exact function-definition guards; do not force-install a drifted migration.
3. In one controlled low-traffic transaction install `20261110113000`, check new column, functions, grants, trigger, room clock, cron job, and no changes to existing paid/financial objects. Never alter the existing cron schedule; its function body is replaced in-place.
4. Test a real two-phone unpaid room: each joins before the three-minute invitation deadline, saves choices, watches five-minute expiry without navigation, gets an explicit stale-version conflict, chooses again, and finalises separately. Ensure the other person's saved food persists.
5. In a controlled paid-group test confirm the frozen room, separate and organiser payments, one KDS release and printer receipt are never expired. Verify refunds and late provider events are unaffected.
6. Publish latest verified GitHub code to the Lovable-connected branch and inspect the public site. Source merge or migration installation alone is **not** live acceptance.

## Other phases

- Customer live GPS tracking still needs explicit active-delivery driver consent, authenticated per-order write/read APIs, short TTL, privacy retention, and Android/iPhone tests.
- WhatsApp Cloud API commissioning, staff driver approval, verified Resend signup emails, first physical push subscription, marketplace Sunmi connectors and scheduled paid orders remain separate work.
- November direct delivery continues at £0 for eligible £15-after-discount food orders within 4 km of LU4 8NU. Uber Eats fees are separate. The future 1 December rule needs a fresh merchant decision.
