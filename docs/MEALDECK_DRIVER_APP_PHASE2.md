# MealDeck Driver — Phase 2 handoff (8 November 2026)

## Built, but not switched on in production
- Installable, mobile-first `/driver` PWA with isolated MealDeck backend authentication (no Onyn database/account sharing), shift start/end, assigned jobs, two-minute offers, directions and issue-safe refresh.
- Authorised KDS staff can open **Own-driver dispatch** to see ready paid delivery orders, approve a previously created MealDeck Auth user and offer a job to an on-shift driver.
- Private roster, assigned-job and idempotent action receipt tables. All three have RLS enabled and no direct authenticated/anonymous/service-role table access.
- Only staff with `staff.manage` can approve/disable drivers. Only staff with `orders.status` can offer a ready, fully packed, independently payment-verified delivery. Driver actions cannot alter prices, payment or canonical delivered status.
- Driver addresses/phone numbers are redacted from offers and exposed only after acceptance, for the assigned on-shift driver. The PWA service worker caches no order, session, HTML or API content. There is **no GPS/location broadcasting** in this release.
- Driver report at customer is **not** authoritative proof of delivery; KDS must independently confirm delivered through its existing protected workflow. Avoid claiming customer tracking/ETA is live.

## Independent backend deployment
1. Confirm the **dedicated MealDeck standalone** Supabase project (not Onyn/Dishbee), Luton tenant and `shared-kitchen` location. Back up before applying.
2. Verify existing `20261107230000_mealdeck_local_driver_delivery.sql` and `20261108074000_mealdeck_printer_delivery_address.sql` were applied and tested first.
3. Apply `deploy/mealdeck/post-install-migrations/20261108154500_mealdeck_driver_pwa_dispatch.sql` as a single transaction, only with authorised database-owner credentials. Never execute this against an unverified live project.
4. Verify RLS, grants and that authenticated driver cannot query private tables or other tenant/location jobs. Confirm anonymous calls to driver RPCs reject. Run Postgres lifecycle and owner/manual access tests.
5. Create a dedicated invited Supabase Auth user in MealDeck for each driver; record its user UUID. In KDS, a `staff.manage` account opens Dispatch and approves that exact UUID and an approved display name. The driver signs in to `/driver` and explicitly starts a shift.
6. KDS must show the paid, **fully sealed** delivery job. An `orders.status` staff user offers it to an on-shift driver. Test accept, expiry, duplicate click, driver swap, offline and failed requests.
7. Staff scans bags and presses **Hand over to our driver** in KDS. Only then can the driver confirm collection. Driver may mark arrival at customer and **report** handover; staff separately confirms delivered in KDS. Verify customer receipt transitions only after staff confirmation.
8. Check the actual Luton printer app 0.2.3, one paid delivery receipt with full address, any existing collection/kerbside orders, and real-driver communication. Never switch on `MEALDECK_OWN_DRIVER_DELIVERY_ENABLED` merely because the app source was merged.

## Troubleshooting
- "Driver dispatch is not installed": migration not deployed or wrong MealDeck backend.
- "Not an approved driver": user is not in private driver roster / account disabled.
- "Handover pending": staff has not marked `with_driver` in KDS.
- Offer not accepted after two minutes: staff refreshes and reoffers to available driver.
- Unknown result after an action: **refresh** instead of blindly repeating it, to preserve idempotency.
- Stop shift is blocked during an unfinished accepted delivery.
- If the website fails, keep current manual KDS process; never advance customer fulfilment based on unverified driver actions.

## Next phases
- Driver PIN/photo proof held privately with retention and rate limits; staff reconciliation before final delivery.
- Owner driver enable/disable UI and audited reassignment/recovery flows.
- Consent-based location for an active assignment only; signed, time-limited customer tracking projection and driver incident reporting.
- Android Capacitor packaging and device testing after PWA workflow is stable.
