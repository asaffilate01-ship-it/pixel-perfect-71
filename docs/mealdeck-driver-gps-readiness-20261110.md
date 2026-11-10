# MealDeck — driver GPS readiness & five-minute group handoff regression

Date: 10 November 2026. **Source implementation only**; not live customer map tracking.

## What this phase builds

- Adds **Check GPS readiness** to the private `/driver` workspace after an approved MealDeck driver signs in. This button is enabled only while the driver is on shift and online.
- Uses exactly **one foreground browser location check** after the driver's explicit tap. It requests a fresh, high-accuracy fix and reports only a rounded accuracy value and whether the signal is usable, stale, weak, or unavailable.
- Does **not** return coordinates to UI state, browser storage, network services, Analytics, logs, notification payloads, customer pages, or MealDeck's backend. It never starts an ongoing GPS watch, creates tracking links or claims an ETA. The driver must choose again for another check.
- Clears status on signed-in identity/shift/connection change or when the app is hidden. Late location callbacks are ignored.
- Preserves existing paid driver dispatch, customer addresses, staff-confirmed delivery, Google Maps directions and production feature flags.

## Group checkout CI repair

The existing `tests/mealdeck-group-handoff.test.ts` fixture saved an obsolete version-1 personal basket without the five-minute expiry evidence introduced on 9 November. Four later assertions expected checkout to resurrect that basket even though live code rightly rejects it.

This change uses the actual version-2 timed basket envelope in those tests and supplies valid per-quantity expiry when preparing ordinary transfers. Group choice snapshots and frozen split payments remain separate; no production personal basket can bypass the five-minute expiry. A new regression checks that an expired ordinary transfer fails without destroying a valid group handoff.

## Future live customer tracking — deliberately not enabled

A secure next release must first provide an approved production backend contract and privacy review:

1. **Driver consent:** clear explicit opt-in for sharing location while on a verified, paid, accepted delivery; ability to stop; on-shift and kitchen-sealed proof required. A GPS readiness check is *not* that consent.
2. **Server authority:** location updates scoped to one authenticated approved driver, one assignment, one Luton kitchen and one active order; reject spoofed scope, stale/poor fixes, rate-limit updates and hold uncertain transitions. Never let GPS advance KDS/payment or mark delivery completed.
3. **Customer authority:** private short-lived tracking session bound to the customer's *verified paid* order/guest cookie or authenticated member, not merely a four-digit handover code. No public table/API data exposure. Stop tracking on delivery, cancellation, revoke, sign-out or expiry; ensure bounded retention.
4. **Customer interface:** truthful recent-fix timestamp and map position only while permitted, fallback to verified delivery stages and no invented live GPS/ETA when stale. Route guidance for the driver stays in Google Maps and is distinct from the customer map.
5. **Acceptance:** disposable native PostgreSQL concurrency tests, RLS/ACL audit, real Android/iPhone consent and permission-denial test, battery/network/interrupted shift behaviour, live paid driver handover and customer privacy test. Keep tracking OFF until all conditions pass.

Direct Luton delivery remains **free within 4 km of LU4 8NU for £15+ after discounts** during November. The separate Uber Eats listing and all payment/receipt policies are unchanged.
