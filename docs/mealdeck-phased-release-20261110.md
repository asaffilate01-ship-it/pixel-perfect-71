# MealDeck Luton — 10 November 2026 phased release and acceptance

This is an operational checklist, not a claim that all integrations are live.
Maintain the existing independently verified Stripe, KDS, printer and checkout authorities.
**Do not disable current paid ordering or change production feature flags to make a screenshot look right.**

## Confirmed merchant policies

- MealDeck **direct own-driver** delivery is offered for eligible postcodes within a **4 km straight-line** radius of **LU4 8NU**, subject to current kitchen/driver availability at checkout.
- Through November 2026, the customer minimum is **£15 actually payable for food after discounts**, and the direct own-driver delivery charge is **£0**. This release does not change canonical quote, payment, radius, or postcode authority.
- MealDeck Luton has a separately operated **Uber Eats** store: https://www.ubereats.com/gb/store/meal-deck-luton/IWmoPuRPWUW1kbGPDpKswg?diningMode=DELIVERY. Uber Eats fees, serviceability, payments and fulfilment are set by that platform and are **not** the direct £0 delivery promise. A store listing alone does not activate a two-way KDS connector.
- The existing repository contains a future **1 December 2026** delivery policy (minimum £10 plus provider-verified courier fee), with a fail-closed checkout gate for unquoted charges. **Get a fresh owner decision before any future pricing switch**; this website-copy release does not alter the dated backend controls.

## Phase A — truthful live website (this PR)

- Remove expired 8 November launch copy and the permanently false "delivery coming soon" label.
- Show the 4 km/£15 direct-delivery *offer* consistently on the homepage, footer, Luton, offers and terms.
- Keep a separately checked **available now** status from `GET /api/checkout`; when closed, show "check availability", never treat a closed kitchen or a failed status request as permanent service withdrawal.
- Link prominently to the exact Uber Eats Luton store in the homepage and Luton page, preserving the existing footer link.
- Remove the obsolete "groups start Monday" assertion. Group checkout still requires a successful live readiness test.
- Regression test these marketing distinctions and keep payment/Stripe untouched.
- Publish and browser-verify the Lovable-connected branch only after tests and merging. Confirm what was *actually* served at `mealdeck.co.uk`.

## Phase B — driver app commissioning and status-based progress

Already in source: private `/driver` PWA, verified-driver enrolment, shift, jobs, pickup confirmation, proof-of-handover steps and staff KDS delivery authority. This PR adds accepted-job mobile turn-by-turn navigation through the phone's maps app without sharing GPS.

Still required:
1. Verify the public deployment of `/driver`, then approve **one real verified driver** in Operations (the earlier production check found no approved drivers).
2. Complete an authorised paid test delivery: assignment -> accept -> sealed kitchen handover -> collected -> arrived -> driver reports drop-off -> staff confirms delivered. Test wrong account, expired offer, missing seal, duplicate click and return-to-shift.
3. Confirm printer v0.2.3 is installed on the actual H10S and prints one complete delivery receipt without a mid-paper gap. Successful signed APK publication is not an H10S installation test.
4. Ensure receipt/order status actually updates for the customer and KDS on physical phones.
5. Build consented **live customer map tracking** separately: driver foreground GPS opt-in only while an assigned delivery is active; no location collection before accepted work; server ownership and assignment validation; bounded accuracy/rate/TTL; location stops when completed/revoked/off shift; signed, short-lived customer tracking access; no coordinates in marketing, push or analytics; map fallback to verified order stages without pretending live location. Test denial, stale GPS, battery/connection loss and privacy.

Turn-by-turn navigation **for the driver** is not the same thing as live **customer tracking**.

## Phase C — accounts, notifications and loyalty

- Real Android and iPhone signup, verification link/code, name and phone, returning account, redirect and logout.
- Resend sender domain and actual managed Auth SMTP/hook configuration verified on the same MealDeck project; prove *received* branded emails and logo asset. Source templates alone do not verify inbox delivery.
- Explicit independent marketing email, SMS, WhatsApp, app promotion and order-alert consent. Test save/reload/withdrawal, GDPR cookies, PWA bottom safe area. Marketing opt-in must remain optional for signup and points.
- Register a real opted-in physical phone endpoint; test push acceptance, lock screen, open/click, opt-out and staff role/MFA draft sending. Previous production checks reported zero opted-in endpoints, so campaign sending cannot be claimed operational from a configured worker alone.
- One **verified paid post-9-Nov member order** must award exactly 1 point per complete £1 after discounts, excluding guests, with refund adjustment and duplicate-event replay. Use owner-only reconciliation only if eligible live orders were missed.

## Phase D — group ordering and schedules

- Group rooms: two verified participant devices, invite expiry (3 minutes), unplaced room expiry (30 minutes), per-participant unpaid draft expiry follow-up (issue #210), split/organiser payment, one fully funded KDS release, receipt and handover closure. Never delete partially paid orders.
- Scheduled orders: user slot picker and payment-authoritative persistence are not yet available. Build with actual Mon–Thu 17:00 / Fri–Sun 16:00 kitchen hours and London DST; 15-minute slots, paid-time revalidation, KDS prep labels, and group scheduling. Do not advertise scheduling until Stripe + KDS acceptance passes.
- NHS/Blue Light/educator discounts remain OFF until a verified provider and commercial offer are approved; never use self-declared category for an active discount.

## Phase E — WhatsApp and marketplace Sunmi

- WhatsApp pickup/kerbside source is merged but `MEALDECK_WHATSAPP_ORDERING_ENABLED` stays OFF until official Meta coexistence and number/WABA/phone-number IDs, account-scoped tokens, signed webhook, supervised worker and inbound/outbound tests are completed. Keep 313 Brands Ltd merchant ownership and ensure the WhatsApp Business app is preserved if Meta supports coexistence for this number. A registered phone-app number is **not** Cloud API acceptance. After a safe paid/KDS/print test, add group and delivery to WhatsApp as separate phases.
- Uber Eats and Just Eat are on separate Sunmi terminals. The owned Appium bridge work (PR #126) is still unmerged/disabled, and its simulated CI does not prove actual merchant-app authorization or supported state changes. First commission each exact device, debugging authority, app package, merchant/store mapping and selectors with read-only observations. Only then implement inbound ticket to exact source order ID, idempotent actions and read-back acknowledgement. Never auto-accept a merchant order before verifying permitted platform behavior.
- Third-party courier toggles (Uber Direct, Deliveroo Express, Just Eat Go, Stuart) are configuration scaffolding, not live adapters or permission to charge a customer.

## Final go-live checklist for each phase

Run relevant Bun/TypeScript/PostgreSQL CI, inspect changed-file diff, merge normally to `main`, sync to the Lovable publishing branch, verify actual deployment/asset/version, test one authorised real device/order where required and record evidence. If any live operation is unverified, retain the old safe functionality and show a truthful disabled/pending state; do not mark the phase done because source was merged.
