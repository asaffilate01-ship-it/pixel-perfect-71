# MealDeck app experience and Cloud installation — phase 48

## Scope

This update aligns the public menu, saved basket, customer tracking and protected staff workspace with MealDeck's existing identity. It preserves the five approved launch brands, cross-brand upgrades, one shared kitchen screen and the coming-soon ordering gate. It also prepares the complete independent database installer for Lovable's transaction-owning migration interface.

Source readiness and hosted readiness are separate. Lovable has provisioned the dedicated database, but this change does not apply the application schema, create or confirm an Auth account, assign an owner, publish menu prices, take a payment or release kitchen work. The precise deployment record is `docs/mealdeck-cloud-deployment-status.md`.

## Mobile menus and basket

At widths up to 800px, the menu owns a four-action navigation bar: **Menus, Brands, Basket, More**. The basket shows its saved quantity; the Brands sheet presents all five approved logos. Both use the existing menu and basket state, so switching brands preserves dish choices, quantities, meal replacements and separate extras. The desktop basket dock remains above that breakpoint.

The bar uses safe-area spacing and controls at least 44px high. It hides during menu search and when the site navigation is expanded. Dialog focus returns to a visible control. The Brands and More sheets explicitly remove the shared dialog's centring translations, so they anchor to the bottom edge at every mobile width.

Simple one-step items use a compact customiser. Multi-step meal builders retain a bounded body scroll area and persistent Back/Next/Add controls. Meal upgrades remain replacements of the included side or drink; separate extras remain additional items. Existing empty-basket Undo restores the saved configurations.

## Protected staff workspace

Sign-in, operations navigation, menu administration, recipe/stock/procurement panels and the KDS share the approved logo, black header, cream canvas, paper surfaces and red primary actions. Styles are explicitly scoped to `.md-ops`, independently of the legacy dark customer theme.

Meaningful preparation, ready and packing colours retain their visible labels. Search still returns the whole master order, including other brands. Preparation and packing remain on one screen, with existing tenant/kitchen authorisation, version checks, permission checks and payment-release boundaries unchanged.

## Installable app

`public/manifest.webmanifest` opens `/menus` in standalone mode. Its icons wrap the unchanged approved MealDeck artwork; no replacement logo is generated. The More sheet offers a native install prompt when the browser supplies one, or platform instructions otherwise. An accepted prompt is not treated as proof of installation; the app-installed event or standalone display state confirms it.

The service worker caches exactly the static offline screen and approved icon files. It does **not** cache application HTML, menu availability, prices, API/server-function replies, authentication, staff/KDS data, tracking or checkout. Public top-level navigation is network-first and receives a clearly labelled static offline page only on network failure. An already open menu can retain its locally saved basket choices; offline navigation is not an order or payment confirmation. There is no background order replay or background payment synchronisation.

Updates wait for a user action. The provider observes both existing and newly installing workers, reconciles another tab's activation and removes lifecycle listeners on unmount. Only the tab requesting an update reloads itself. When changing offline assets in a later release, increment the worker's own cache version; do not delete other application caches.

Chromium automated checks can verify the manifest and worker behaviour. Actual iOS/Android home-screen installation and platform-specific browser UI still require a device acceptance check after publication.

## Customer order progress

The tracking presentation distinguishes placement/payment, kitchen acceptance, preparation, packing, handoff readiness and completion. Collection and kerbside orders end with handoff; delivery adds courier transport and reported delivery. Payment alone does not claim preparation has started. Sealing a pack does not claim it is ready for customer/courier handoff, and a courier booking does not claim collection.

The server DTO includes the actual recorded `created_at` when supplied by the tracking RPC and a server observation timestamp. It never substitutes an update timestamp for placement time. The elapsed display advances from that server observation using monotonic browser time. Invalid, missing or future timestamps do not generate invented times, and final states show the elapsed duration at the check rather than a guessed completion time. No preparation or delivery ETA is invented.

The tracking route remains behind `COMING_SOON`. This UI is ready for the independent MealDeck integration contract; it does not install a payment provider, status writer or fulfilment adapter.

After a successful lookup, status refreshes about every 20 seconds while the page is visible and online, with at most 180 automatic checks before a manual refresh. Editing the reference/code, leaving the page or losing visibility cancels/discards the active request. A missing order, denied access, closed service or unknown response clears the prior order. Only explicit availability/transport failures retain a labelled last confirmed status. The server parser rejects malformed or ambiguous RPC records and never coerces arrays or objects into a paid/delivered status.

## Independent Cloud installer

The default standalone installation remains byte-identical to phase 47. The explicit command

```sh
node deploy/mealdeck/build.mjs --managed-transaction --out deploy/mealdeck/generated/install-managed.sql
```

produces the same canonical SQL without the builder's two outer transaction-control lines. The execution contract requires the **complete file in one atomic migration** owned by the runner. Never send this mode through an autocommit query tool or split it into requests. Fresh-project guards, body validation, timeouts, grants and RLS remain intact.

The local PostgreSQL suite verifies artifact equality, rejected unsafe execution acknowledgements, rollback of all application objects and the same-transaction journal fixture, then all existing administration/security checks after a managed installation. These controlled tests do not prove that a particular hosted tool follows that execution contract; Lovable must supply the actual migration receipt and hosted integrity checks.

## Acceptance boundaries

Local acceptance for this source update passed 605 application tests, TypeScript, focused lint, the frozen dependency lock and the production build. The real embedded PostgreSQL suites passed 28 kitchen groups and 26 complete standalone-profile groups; native PostgreSQL 17 and concurrency remain enforced by the repository's separate CI jobs.

Browser checks covered 320, 390, 768 and 1440px layouts; staff sign-in, operations, menus and the shared KDS; five-brand switching; meal-side/drink replacements; empty-basket Undo; visible focus restoration; compact simple-item dialogs; manifest installability with the final PNG icons; explicit installation events; and the actual worker's static fallback/reconnect on a deliberately disconnected local HTTP origin. Tracking used local synthetic transport fixtures while production gates remained closed, verifying automatic refresh, offline/unavailable labels, access-denial clearing, hidden-tab pause and stale-response discard after credential edits. No real customer orders or hosted database writes were used.

- Keep `COMING_SOON=true` and checkout integration approval unset.
- Install and verify the complete schema in the dedicated MealDeck Cloud project, then verify the confirmed owner account before the private bootstrap.
- Review real menu prices, modifiers, recipes and allergens before catalogue publication.
- Accept the independent payment, release, refund, group-order and delivery pathways before enabling paid orders or production kitchen release.
- Publish the merged source and check the actual domain, phone installation, offline/reconnect experience and authorised staff workflow.
