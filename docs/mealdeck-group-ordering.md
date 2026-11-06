# MealDeck group ordering rooms

## Current room flow — 6 November 2026

The current `/group-order` experience uses one server-backed room from invitation through payment. It replaces the earlier local reply-link planner recorded below. The organiser creates a room for up to ten people, including themselves, chooses collection or kerbside and selects either **everyone pays for their own food** or **organiser pays for everyone**. The ordinary personal basket remains separate.

1. The organiser adds short names and shares each person's private invitation link. Copying a link does not send an email or message automatically. There is no return-link or message-thread step.
2. Each invitee explicitly accepts and joins before the server's three-minute join deadline. Their short name is confirmed for packing. Opening an invitation preview alone does not join the room.
3. Joined people choose their own dishes, portions, flavours, included drinks and attached extras from the current five-brand menu, save their choices and mark themselves ready. Server versions prevent a stale tab from silently replacing newer choices.
4. Unaccepted invitations expire when the server deadline passes. Server reads/actions enforce expiry even if the browser countdown is closed. People who already joined remain in the room while choosing. The organiser can close invitations early; joined people must become ready or be explicitly resolved before the order is frozen.
5. Once no invitations remain pending and every remaining person is ready, the organiser reviews and finalises the complete current room revision. The server validates current catalogue choices, calculates canonical prices and freezes picks, named packing and person/share assignments. After this point, food choices cannot change.
6. Each payer reviews the exact server bill. In separate-payment mode, each person pays their own food share; in organiser mode, the organiser funds the whole order. Both modes retain per-person itemisation. New rooms do not offer equal split.
7. Only full verified funding releases one complete master order to the shared kitchen. Each food line keeps its person's name and numbered bag, including every flavour and attached extra. Staff acceptance, cooking, packing and handoff remain distinct stages; partial funding does not create smaller kitchen orders.

The three-minute join deadline is separate from the payment room's funding and claim deadlines. It never drops a joined person, removes a paid share or unlocks an unknown payment attempt. Existing payer-owned sessions resume with the same attempt and provider binding. Cancellation, late captures and refunds retain the common ledger's review rules.

## Room access, privacy and names

- The server stores room membership, short packing names, exact choices, versions and payment progress. Organisers can review the group's food; other participants receive only their own private choices and authorised room progress. No other person's email, phone, account credentials or payment details belong in the room response.
- A room URL may identify its room. The invitation capability stays in the fragment and is redeemed only by an explicit join action. It is removed from the visible URL after successful joining; raw capabilities must not enter durable browser storage, logs or Auth return URLs. Invitation access is not a payer identity or proof of payment.
- Creating/finalising the order and paying use the existing verified member or eligible guest rules. An invalid supplied member token never falls back to guest authority. A friend joining to choose food does not gain account, staff or payment permissions.
- Names are canonical escaped text of 1–32 Unicode code points, with control/bidi characters rejected. `bags[].name` and the bag number survive review, customer receipts, KDS and printer snapshots. For example, **Amer · Bag 1** remains distinguishable from another Amer in Bag 2. Older unnamed bags keep **Bag 1** labels.
- Every item quantity belongs to exactly one person's bag. Cross-brand extras stay with their parent's quantity and choices. The ordinary checkout input cannot invent a room participant or attach a client-supplied name to its packing snapshot.
- Email sign-in returns only to `/account?returnTo=%2Fgroup-order`, resolving to the fixed `/group-order` page. Room IDs, invitation tokens, extra query fields and fragments are not allowed in the Auth return. The room restores its own authorised context; if it is unavailable in another browser, reopen the original room link.

## Setup and activation

Install `deploy/mealdeck/post-install-migrations/20261105235509_mealdeck_ordering_rooms.sql` only in the independent MealDeck project, after the existing Checkout-domain migration `20261105194218_mealdeck_checkout_domain.sql` and its shared-payment prerequisites. The guarded builder is `deploy/mealdeck/ordering-rooms.mjs`. Use `buildOrderingRoomsSql()` for the standalone transaction, or `buildManagedOrderingRoomsSql({ runnerOwnsTransaction: true, singleMigration: true })` when the migration runner owns one atomic transaction. Never split the migration into separately committed fragments.

The room flow reuses `MEALDECK_SHARED_PAYMENTS_ENABLED=true`, the existing high-entropy `MEALDECK_GROUP_LINK_SECRET`, dedicated MealDeck connection/scope and canonical online checkout/kitchen readiness. There is no extra room feature flag or secret. Keep the group-link secret stable while existing rooms need access. Source publication and schema installation do not establish merchant acceptance, live payment success or physical printing.

`GET /api/group-orders` reports current availability. `POST /api/group-orders` handles scoped creation, invitation preview/join, status, own-choice saving/readiness, membership resolution, organiser finalisation and the existing payment/recovery path. The new room route and API are private and uncached; do not put room URLs or invitation capabilities in public sitemaps or analytics.

Add the exact `https://mealdeck.co.uk/account?returnTo=%2Fgroup-order` return URL to the current Auth host's supported production redirect configuration. Keep existing fixed destinations for old checkout/payment sessions. See [authentication email setup](mealdeck-auth-email-resend.md) and the [shared-payment contract](mealdeck-shared-payments.md).

## Release verification

Room acceptance must cover explicit preview-versus-join, the server deadline with closed/stale browser tabs, expiry of unjoined people only, owner/member isolation, stale revision rejection, all-ready finalisation, immutable choices after freeze, separate and organiser funding, retained names/flavours/extras, and one kitchen release after full verified funding. Authentication checks must prove the fixed room return survives signed email delivery while identifier-bearing returns are rejected.

The packing and Auth regression suites can be run without sending mail or making a charge:

```sh
bun test tests/mealdeck-packing-name.test.ts tests/mealdeck-printer.test.ts tests/mealdeck-kds.test.ts tests/mealdeck-customer-return.test.ts tests/mealdeck-auth-email.test.ts
node --test tools/receipt-bridge/test/*.test.mjs
```

The complete release also needs the room API tests, ordering-room PostgreSQL fixture, application type/build checks and browser acceptance. Record actual hosted installation, deployment, device and payment evidence separately; do not infer them from fixture tests.

## Superseded local planner record — 5 November 2026

The following preserves the earlier implementation and its historical verification. Its local-only names, reply-link workflow, payment choices and future-work notes are superseded by the current room flow above. Retained compatibility code must not become the default room experience.

Implemented 5 November 2026 in response to the owner's request to open group ordering. The initial release made local group selection and one-payer checkout preparation usable with the confirmed five-brand catalogue. The later [shared-payment implementation](mealdeck-shared-payments.md) adds durable payment rooms, pay-by-bag/equal funding and organiser cover at reviewed checkout when configured. Neither source release activates an unconfigured paid-ordering channel.

### Historical customer flow

1. Open `/group-order` from the menus or homepage. Create an organiser draft and add people, up to ten in total.
2. Share each person's individual invitation link. Each participant chooses exact dishes, portions, flavours, included drinks and named extras using the same menu customiser as the regular basket.
3. The participant makes a return link and sends it back to the organiser. The link does not send a message automatically and there is no background synchronisation.
4. The organiser opens or pastes the link, reviews the choices and explicitly accepts them. A replacement updates that person's choices instead of duplicating them. A matching reply can be acknowledged, and already reviewed old replies cannot silently replace newer selections.
5. Review the complete basket and each numbered bag. Only nonempty people become bags; attached extras follow their parent quantities. The organiser confirms the review and continues to one collection/kerbside checkout.
6. Existing server pricing, member/guest eligibility, opening hours, kitchen availability and provider verification apply. A prepared basket is not a paid order, a kitchen ticket or a reserved collection slot.

The organiser reviews the final total and chooses the available payment option at checkout. A shared payment room is durable server state after that explicit review; the earlier food-choice planner remains a local invite/reply flow. There is no claim of background basket synchronisation or automatic invitation messages.

### Historical storage and link boundaries

- The organiser's draft and participant replies have their own local storage keys and do not overwrite the ordinary menu basket. Person labels remain local; checkout receives numbered bags, not those labels.
- Invitation links contain random group/invitation identifiers. Reply links add exact catalogue identifiers, quantities and choices. These values are in the fragment and are decoded locally; arbitrary external URLs are never fetched.
- Links contain no customer contact details, account credential, price, paid flag or payment token. Anyone holding a reply link can read its food choices; the UI explains sharing it with the organiser.
- Strict schemas reject extra fields, wrong versions, invalid IDs, retired items, missing required choices, incompatible options and excessive quantities. The server remains the final price and availability authority.
- Current draft storage is checked when saving and immediately before checkout. A newer draft in another tab invalidates review and requires reloading/reviewing the current choices.
- Storage failure, unreadable drafts and oversized links have visible recovery paths. There is no claim that a local unsaved draft is backed up remotely.

### Historical checkout integrity

`buildGroupCheckout()` combines identical canonical selections while allocating every parent quantity exactly once across sequential bags. The existing server normaliser expands attached choices into the same bag as their parent; it does not accept browser-supplied amounts.

`readLaunchCheckoutTransfer()` restores the group basket and packing together. `/checkout?group=1` preserves the expected group context even if storage is missing. A retired item, changed invalid option or mismatching packing snapshot produces an explicit return-to-draft error and blocks checkout. It never cleans a group down to a partial personal basket.

Only `/menus`, `/checkout` and `/checkout?group=1` are valid customer return destinations. Email authentication returns through the account page using the fixed, encoded destination. Arbitrary origins, identifiers, extra query parameters and encoded redirect variants are rejected.

The checkout preserves the original personal basket when a group order is completed. Existing review acknowledgement, cutlery, collection/kerbside details, immutable order snapshots, receipt access and payment/KDS gates remain unchanged.

### Historical verification

The focused suites are:

```sh
bun test tests/mealdeck-group-plan.test.ts tests/mealdeck-group-handoff.test.ts tests/mealdeck-customer-return.test.ts
```

Coverage includes forged choices and prices, strict saved-state restoration, wrong/revoked invitations, replay of acknowledged matching replies, current draft conflicts, exact Tavo variant combinations, extras/replacements, parent-to-bag quantities, server normalisation, personal-basket isolation, lost/quota-blocked storage and the fixed authentication return destinations. These tests use local state and do not create customers, charges or hosted group records.

Independent source review resolved stale handoff fallback, old reply rollback, outdated-tab checkout, modal error visibility, return focus, scroll-to-review behaviour and modal contrast/viewport constraints. Root's release workflow also runs the complete application suite, TypeScript, build and native publication checks. Physical-phone and live-payment acceptance are separate outstanding work.

The integrated source with the published November offers passed 754 tests across 77 files (6,519 assertions), TypeScript, the production build, scoped group/authentication lint and the existing changed-surface lint on 5 November 2026. All three offers and both generated routes were retained. Publication and browser acceptance are recorded in the release pull request after deployment.

### Superseded server-synchronisation planning note

The installed independent database contains reserved group/invitation tables and a closed financial-ready guard, not a working invitation or share-settlement API. A future release must provide authenticated/scoped create/join/update operations, immutable canonical item/share records, full-funding checks, verified provider share receipts, expiry/cancellation/refund recovery and idempotent kitchen release. Historical Adyen decision models do not establish compatibility with the current single-payer Stripe implementation.

The verified owner account, actual kitchen/bootstrap, published catalogue and configured/accepted payment provider remain required before any group or personal paid order can be accepted. See the [current launch checklist](../roadmap.md) and [hosted deployment record](mealdeck-cloud-deployment-status.md).
