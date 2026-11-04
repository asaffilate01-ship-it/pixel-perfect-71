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
- [ ] Provision the independent MealDeck Supabase project, connect the staff operations portal and verify authorised staff access in staging.
- [ ] Review and publish canonical launch menu records so admin changes can feed the public menu.
- [x] Build one shared kitchen board: one master-order card containing all brands, atomic preparation and inline packing/sealing; preserve location scoping for future kitchens.
- [ ] Connect and accept the canonical paid-release evidence adapter, hosted operations migrations and live staff/kitchen workflow before production KDS activation.

## Independent database — 4 November 2026

- [x] Record the owner decision: MealDeck will have its own database; Dishbee supplies the technology.
- [x] Show “MealDeck is a trading name of 313 Brands Ltd.” and “Powered by Dishbee” in the site footer; align structured organisation data.
- [x] Prepare the fresh-project database installation, independent connection settings and staff session isolation; verify the actual database installation and admin permissions in disposable tests.
- [x] Let authorised menu staff assign a draft product to the shared kitchen before activating it, while retaining one kitchen display for all brands.
- [ ] Provision a separate MealDeck project in the owner-selected Supabase organisation and apply the reviewed standalone profile.
- [ ] Configure the first verified staff owner and kitchen, then review and publish real catalogue prices and modifiers.
- [ ] Complete and accept MealDeck's own verified payment/release, refund, group-payment and delivery integrations before enabling real orders.
