# Public menu browsing independent of checkout

`public.mealdeck_public_menu()` is a no-argument, read-only projection for anonymous
and authenticated public browsing. The API calls it with the explicit MealDeck
publishable configuration; no checkout server key, caller tenant, caller kitchen,
customer identity or payment readiness is required.

The function resolves the installed independent MealDeck business and its sole
active `shared-kitchen`. An ambiguous or inactive installation fails closed. It
requires the existing `extensions.uuid_generate_v5(uuid,text)` function to map
reviewed source choices to their existing canonical records internally.

The frozen allowlist in migration
`20261106170330_mealdeck_public_menu_milkcakes.sql` is generated from the reviewed launch
catalogue. It contains source identifiers and source availability rules only.
The generator and SHA-256 are included for review; changing the source catalogue
does not rewrite this migration or automatically extend public access.

The 6 November dessert extension adds the ten approved Biscoff/Oreo milkcake source
keys, two per launch brand. It retains the original read function's scope,
publication checks, output shape and permissions. The original
`20261106115120_mealdeck_public_menu_read.sql` remains unchanged in migration history.
The separate [dessert importer](mealdeck-milkcake-desserts.md) inserts the canonical
products; updating the read allowlist alone never publishes or prices a product.

Only exact reviewed SKU/brand matches can appear. Their item, brand and category
must be active, their MealDeck channel rule visible, and their shared-kitchen
station route active. Duplicate SKUs and dishes with unknown required groups are
excluded. Options must have the exact reviewed identifier, expected group and
per-item association. Source-blocked milkshake choices stay unavailable even if
their database active flag is changed. Known inactive options may retain their
public label and price with `available:false`; an inactive replacement has a null
replacement price. Neither can be selected through the public catalogue.

The JSON contains only `{available:true,checkedAt,items}`. Items use reviewed source
SKU/option keys and current public names, descriptions, category names, prices and
availability. It returns no database UUIDs, tenant/kitchen scope, customer/staff
data, internal selection groups, orders, or payment state. There are no new table
grants, and the existing raw catalogue remains service-role only.

Apply the complete additive migration atomically using
`deploy/mealdeck/public-menu-read.mjs`. It changes only the public read function,
its execute ACL, its comment, and the PostgREST schema-reload notification. It does
not publish drafts or change business rows. The extension is independent of the
category-editing migration and of configured checkout/provider credentials.

`node tests/postgres/public-menu-read-behavior.mjs` checks the frozen manifest,
transaction rollback, ACL and existing-authority preservation, exact output shape,
scope rejection, publication/route/source restrictions, canonical prices, blocked
choices and zero read mutations while checkout is disabled. CI also runs the same
suite on native PostgreSQL 17 using the standard UUID extension.

## Hosted installation — 6 November 2026

The complete migration was installed atomically in the dedicated MealDeck project.
Its SHA-256 is
`677c5b2859b0079935a73363e4e52d526bdab348e9c0f5a9807f1af946f3e8a2`.
A separate anonymous HTTP request to the new RPC returned 200 with 77 currently
published products and no database UUIDs. A read-only database check confirmed the
new public read permission, the unchanged private raw-catalogue permission, and
zero orders. This read does not enable checkout or satisfy the real paid-order
and physical-printer acceptance requirements.

Before this release, the website API returned `menu_unconfigured` because public
browsing required checkout scope and a privileged checkout credential. The new
HTTP adapter needs only the explicit public MealDeck connection. Checkout keeps
its independent scope, provider credentials, opening and acceptance checks.
