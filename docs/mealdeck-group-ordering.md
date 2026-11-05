# MealDeck group choices and host-pays checkout

Implemented 5 November 2026 in response to the owner's request to open group ordering. This release makes group selection and one-payer checkout preparation usable with the confirmed five-brand catalogue. It does not activate the currently unconfigured paid-ordering channel or implement split settlement.

## Customer flow

1. Open `/group-order` from the menus or homepage. Create an organiser draft and add people, up to ten in total.
2. Share each person's individual invitation link. Each participant chooses exact dishes, portions, flavours, included drinks and named extras using the same menu customiser as the regular basket.
3. The participant makes a return link and sends it back to the organiser. The link does not send a message automatically and there is no background synchronisation.
4. The organiser opens or pastes the link, reviews the choices and explicitly accepts them. A replacement updates that person's choices instead of duplicating them. A matching reply can be acknowledged, and already reviewed old replies cannot silently replace newer selections.
5. Review the complete basket and each numbered bag. Only nonempty people become bags; attached extras follow their parent quantities. The organiser confirms the review and continues to one collection/kerbside checkout.
6. Existing server pricing, member/guest eligibility, opening hours, kitchen availability and provider verification apply. A prepared basket is not a paid order, a kitchen ticket or a reserved collection slot.

The page clearly explains that one person pays. Separate payments, a server-synchronised shared basket, timed group cutoffs and automatic invitation messages are not available in this release.

## Storage and link boundaries

- The organiser's draft and participant replies have their own local storage keys and do not overwrite the ordinary menu basket. Person labels remain local; checkout receives numbered bags, not those labels.
- Invitation links contain random group/invitation identifiers. Reply links add exact catalogue identifiers, quantities and choices. These values are in the fragment and are decoded locally; arbitrary external URLs are never fetched.
- Links contain no customer contact details, account credential, price, paid flag or payment token. Anyone holding a reply link can read its food choices; the UI explains sharing it with the organiser.
- Strict schemas reject extra fields, wrong versions, invalid IDs, retired items, missing required choices, incompatible options and excessive quantities. The server remains the final price and availability authority.
- Current draft storage is checked when saving and immediately before checkout. A newer draft in another tab invalidates review and requires reloading/reviewing the current choices.
- Storage failure, unreadable drafts and oversized links have visible recovery paths. There is no claim that a local unsaved draft is backed up remotely.

## Checkout integrity

`buildGroupCheckout()` combines identical canonical selections while allocating every parent quantity exactly once across sequential bags. The existing server normaliser expands attached choices into the same bag as their parent; it does not accept browser-supplied amounts.

`readLaunchCheckoutTransfer()` restores the group basket and packing together. `/checkout?group=1` preserves the expected group context even if storage is missing. A retired item, changed invalid option or mismatching packing snapshot produces an explicit return-to-draft error and blocks checkout. It never cleans a group down to a partial personal basket.

Only `/menus`, `/checkout` and `/checkout?group=1` are valid customer return destinations. Email authentication returns through the account page using the fixed, encoded destination. Arbitrary origins, identifiers, extra query parameters and encoded redirect variants are rejected.

The checkout preserves the original personal basket when a group order is completed. Existing review acknowledgement, cutlery, collection/kerbside details, immutable order snapshots, receipt access and payment/KDS gates remain unchanged.

## Verification

The focused suites are:

```sh
bun test tests/mealdeck-group-plan.test.ts tests/mealdeck-group-handoff.test.ts tests/mealdeck-customer-return.test.ts
```

Coverage includes forged choices and prices, strict saved-state restoration, wrong/revoked invitations, replay of acknowledged matching replies, current draft conflicts, exact Tavo variant combinations, extras/replacements, parent-to-bag quantities, server normalisation, personal-basket isolation, lost/quota-blocked storage and the fixed authentication return destinations. These tests use local state and do not create customers, charges or hosted group records.

Independent source review resolved stale handoff fallback, old reply rollback, outdated-tab checkout, modal error visibility, return focus, scroll-to-review behaviour and modal contrast/viewport constraints. Root's release workflow also runs the complete application suite, TypeScript, build and native publication checks. Physical-phone and live-payment acceptance are separate outstanding work.

The integrated source with the published November offers passed 754 tests across 77 files (6,519 assertions), TypeScript, the production build, scoped group/authentication lint and the existing changed-surface lint on 5 November 2026. All three offers and both generated routes were retained. Publication and browser acceptance are recorded in the release pull request after deployment.

## Remaining server-synchronised groups and split payments

The installed independent database contains reserved group/invitation tables and a closed financial-ready guard, not a working invitation or share-settlement API. A future release must provide authenticated/scoped create/join/update operations, immutable canonical item/share records, full-funding checks, verified provider share receipts, expiry/cancellation/refund recovery and idempotent kitchen release. Historical Adyen decision models do not establish compatibility with the current single-payer Stripe implementation.

The verified owner account, actual kitchen/bootstrap, published catalogue and configured/accepted payment provider remain required before any group or personal paid order can be accepted. See the [current launch checklist](../roadmap.md) and [hosted deployment record](mealdeck-cloud-deployment-status.md).
