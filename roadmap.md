# Roadmap

- [x] Footer: "Prefer the big apps?" strip with Deliveroo, Uber Eats & Just Eat logos
- [x] Reduce section gaps / inner gaps on homepage, keep polished mobile + desktop
- [x] Card flip: MealDeck card uses new uploaded emblem, "M" corner ranks, crossed-cutlery suit marks in corners

- [x] Make homepage hero food-led while preserving current colours; add food background and fan-to-deck card sequence.
- [x] Rework demo ordering into a browse-first restaurant marketplace on desktop and mobile.

- [x] Add Forvello (Artisan Pizza) to homepage and every location; align brand cards/logos across desktop and mobile.

## Open
- [x] Replace flat Play food and ingredient icons with realistic isolated food artwork.
- [x] Answered: ordering layout scales via brand filter + grouped sections; offered search/category chips when live menus go large

- [x] Mobile ordering flow: sticky restaurant row, slide-up basket/checkout, scrollable dish options
- [x] Add Pastarivo, Nusara, Rise & Griddle, Souvano to ordering
- [x] Branded in-app success messages
- [x] Play page: remove Fanzeno / fixture-based scheduling and "predictions for prizes" wording
- [x] Play: make "Play as" brand skins meaningful (each brand deals its own dishes) + further table polish

- [x] Preserve Bedford as a coming-soon location in the site navigation and location pages.
- [x] Franchise brand cards lead with approved brand logos on an ivory panel.
- [x] Restore the published branch to the five launch menus at /menus; ordering stays coming soon. The previous order screen remains archived under src/_archive/current-ui/routes/order.tsx.
- [x] Instagram and TikTok links use @mealdeckofficial.
- [x] Mobile launch menus: canonical /menu link, all five brands visible, compact header and persistent brand/section/search controls.
- [x] Empty the entire saved basket in one action, with Undo that restores quantities, upgrades and extras.
- [ ] Complete the provisioned independent MealDeck database installation, connect the staff operations portal and verify authorised staff access in staging.
- [ ] Review and publish canonical launch menu records so admin changes can feed the public menu.
- [x] Build one shared kitchen board: one master-order card containing all brands, atomic preparation and inline packing/sealing; preserve location scoping for future kitchens.
- [ ] Connect and accept the canonical paid-release evidence adapter, hosted operations migrations and live staff/kitchen workflow before production KDS activation.

## Independent database — 4 November 2026

- [x] Record the owner decision: MealDeck will have its own database; Dishbee supplies the technology.
- [x] Show “MealDeck is a trading name of 313 Brands Ltd.” and “Powered by Dishbee” in the site footer; align structured organisation data.
- [x] Prepare the fresh-project database installation, independent connection settings and staff session isolation; verify the actual database installation and admin permissions in disposable tests.
- [x] Let authorised menu staff assign a draft product to the shared kitchen before activating it, while retaining one kitchen display for all brands.
- [ ] Apply the reviewed standalone profile to the owner-selected dedicated MealDeck Lovable Cloud database.
- [x] Create a fresh dedicated MealDeck Lovable Cloud database and save the explicit server-owned public connection pair.
- [x] Add an explicit managed-transaction installer for Lovable's atomic migration runner; retain the original standalone installer and canonical SQL unchanged.
- [ ] Submit the complete managed installer in one atomic Cloud migration and verify its receipt, schema, RLS and grants; no hosted installer SQL has yet been applied from this workspace.
- [ ] Verify the confirmed owner account info@mealdeck.co.uk and bootstrap the kitchen named MealDeck: waiting for schema installation and a verified Auth account; ownership has not been assigned.
- [ ] Configure the first verified staff owner and kitchen, then review and publish real catalogue prices and modifiers.
- [ ] Complete and accept MealDeck's own verified payment/release, refund, group-payment and delivery integrations before enabling real orders.

## App experience — 4 November 2026

- [x] Align staff sign-in, operations, menu administration and the single shared kitchen board with MealDeck's approved site theme.
- [x] Add Menus / Brands / Basket / More navigation and branded bottom sheets to the mobile launch menus; retain saved cross-brand choices and the desktop basket dock.
- [x] Add the installable app manifest, approved icons, browser installation guidance, explicit app updates and a private-data-safe offline screen.
- [x] Build the customer progress timeline, real placement/elapsed time and guarded status refresh; ordering remains coming soon and hosted integration acceptance is still required.
- [ ] Publish the merged source through Lovable and verify installed-app behaviour on actual iOS/Android devices.

## Stripe checkout — 5 November 2026

- [x] Enable built-in Stripe payments in test mode with the owner's confirmation; preserve all ordering and kitchen-release gates.
- [x] Owner approved £20 per launch-menu item and £20 per add-on, meal and upgrade, including named cross-brand replacements.
- [ ] Create payment products from the approved canonical catalogue: prices are now approved; hosted installation, publication and provider mapping are still required.
- [ ] Implement and verify MealDeck checkout and signed payment reconciliation using the actual test integration in the owning account; no checkout form or webhook handler has been implemented.

## Prices and interface finishing — 5 November 2026

- [x] Display the approved £20 prices on all 77 launch-menu items and each chargeable option, with quantity-aware basket/review subtotals and no duplicate cross-brand upgrade charges.
- [x] Keep basket feedback visible, make saving failures recoverable, restore focus after row removal and distinguish repeated product names by menu section.
- [x] Distinguish staff/kitchen loading, failed and empty states; make editing a menu product easy to reach on mobile.
- [x] Finish the tracking form with solid brand-red controls, visible focus and readable mobile entry fields.
- [x] Prepare an independent-database draft import for all 77 items and 66 option records, preserving later admin edits on reruns.
- [x] Add protected, audited add-on and upgrade price editing, including shared-use counts and conflict recovery; provide the separate post-install SQL and managed-runner variant.
- [ ] Activate the hosted backend, canonical menu and checkout in the separate owning Lovable account; the current connector cannot access that project. See `docs/mealdeck-launch-prices-and-polish-phase49.md`.

## Luton in-person payments — owner scope, 5 November 2026

- [x] Record Luton-only launch scope and the Stripe Terminal contract for staff-assisted walk-in and kerbside payments; St Albans and Bedford remain coming soon.
- [ ] Select staff phone platform or smart reader and complete native Terminal/device setup in the owning Stripe account.
- [ ] Add authenticated Luton staff sale entry, server-priced pending orders, idempotent Terminal collection and verified payment-to-KDS reconciliation.
- [ ] Verify already-paid pickup cannot be charged again, and interrupted or concurrent attempts cannot duplicate a charge or kitchen release.
