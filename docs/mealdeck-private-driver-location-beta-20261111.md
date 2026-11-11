# MealDeck private own-driver location BETA — privacy and activation gates

**11 November 2026. Source-only, off by default.** This is a bounded foreground driver-location foundation, **not** production customer tracking or turn-by-turn driving navigation.

## Scope and customer truth

- The driver must have an approved MealDeck account, be on shift, be assigned an independently paid delivery, have accepted that assignment, and have completed authenticated pickup after the kitchen confirms sealed-bag handover. Only then may they **explicitly choose Start sharing** on that individual job. Turning on a shift or checking GPS readiness never starts broadcasting.
- Captures only while the installed /driver PWA is **in the foreground**. The driver may Stop anytime; hide, disconnect or exit stops the local watch. Last position expires after 30 seconds, and a private one-minute cleanup clears old coordinates. No location history is retained and no marketing/analytics/push payload contains coordinates.
- The MealDeck backend verifies every submission independently against signed-in driver identity, tenant/location, paid order, assignment, KDS handover, consent, recent accurate fix, Luton bounding box and rate limit. No driver may query private tracking rows or share location before collecting food. No GPS movement is allowed to mark an order paid, prepared, completed or delivered.
- **Only a registered authenticated owner of their own still-active paid delivery** can request the last, unexpired position. Guest tracking is intentionally not enabled in this first beta; a handover code or mere order UUID is never enough.
- When eligible, the customer sees a last observation timestamp, accuracy and **an optional external Google Maps link opened only after their click**, not an embedded live map or road ETA. Opening the external link shares that position with Google and is labelled. Stale/absent data fails closed to the ordinary verified order timeline.

## Implementation

- `deploy/mealdeck/post-install-migrations/20261111113000_mealdeck_private_driver_location.sql` — private table, RLS, denied direct API grants, owner-scoped writer/reader RPCs, explicit stop, 30-second point expiry, single-point retention, pg_cron purge. Source-only until native PostgreSQL security/regression tests pass.
- `src/lib/mealdeck-driver-live-location.ts` — strict age, accuracy, location and response validation; no storage or ETA calculation.
- `src/components/driver/driver-live-location.tsx` — explicit per-delivery Start/Stop, foreground-only `watchPosition`, visible/offline/permissions cleanup, server revocation best effort, no location disclosure in logs.
- `src/components/customer-driver-position.tsx` — registered-customer private order viewer with server polling only while visible and click-gated Google Maps link.
- `src/components/{driver/driver-workspace,customer-orders}.tsx` — independently hidden behind `import.meta.env.VITE_MEALDECK_DRIVER_LOCATION_BETA === "true"`, which **must remain unset** on production until approved.
- `tests/postgres/local-driver-delivery-behavior.mjs` and `tests/mealdeck-driver-live-location.test.tsx` — disposable native database, consent, privacy, stale GPS, staff and driver handover requirements, no guest access, revocation and retention tests.

## Production gates — no automatic activation

1. Require all targeted Bun, TypeScript/build, native PostgreSQL 17, full MealDeck CI and ACL/RLS checks green. The dependent verified-pickup notification phase must merge first.
2. Verify the standalone MealDeck profile and existing driver/job permissions and run SQL in a disposable native PostgreSQL schema; reject unexpected source fingerprints or installed objects. Inspect database advisors and access policies.
3. Review UK GDPR basis, privacy notice and retention. Install backend in a controlled release only after review and rollback instructions; **leave the browser beta flag OFF**.
4. Approve a real verified driver's identity through the manager flow. With an explicitly authorised paid test order, test before/after sealed handover, foreground permission, inaccurate/stale fixes, revocation, customer owner/cross-owner/guest/expired session, multi-device race, offline/hidden/minimised PWA and 30-second expiry.
5. On Android/iPhone, verify permission changes, OS battery restrictions, installed PWA, accidental tab navigation and Maps handoff. Foreground PWA is **not** continuous background GPS; native app and OS background permissions, GPS battery policy and an external routing/ETA provider would be needed for reliable turn-by-turn customer tracking.
6. Only then consider setting `VITE_MEALDECK_DRIVER_LOCATION_BETA=true` for a small controlled cohort. Monitor failed requests, withdrawals, privacy and availability; disable immediately if an unsafe state arises.

## Preserved policies

The existing direct MealDeck Luton offer is £0 delivery for £15+ payable food after discounts within 4 km of LU4 8NU. Stripe/payment, KDS acceptance, printer, driver approval and final staff delivery authority are unchanged. Uber Eats remains a separate order channel. Unapproved background data collection, location in public push messages, external automatic maps and fabricated ETAs are prohibited.
