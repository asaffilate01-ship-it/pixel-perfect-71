# Milkcakes on each launch menu

The owner approved **Biscoff Milkcake £3.99** and **Oreo Milkcake £3.99** on
6 November 2026 for all five current menus: Skorch Burgers, Tavo Chicken, Load’d,
Moktl and Souvano. Each brand has a `desserts` section and two stable SKU keys:
`<brand>-desserts-biscoff-milkcake` and `<brand>-desserts-oreo-milkcake`.

They are ordinary standalone products with no required modifiers. A dessert
upsell adds a separate basket line, so its flavour/name and quantity flow through
canonical checkout, the shared kitchen display and receipts. No meal replacement
or attached-extra selection model changes are required. Future brands and
locations retain their existing launch controls.

## Additive canonical installation

`deploy/mealdeck/milkcake-desserts.mjs` generates a bounded insert-only addition
for ten products. It requires the verified existing MealDeck tenant, sole active
`shared-kitchen` location and active `SHARED` station UUIDs. Its guard also checks
the independent installation, `313 Brands Ltd`, GBP, five active brand mappings
and the existing MealDeck ordering channel. It never enables a channel or changes
checkout/payment settings.

New categories are appended after each brand's current categories. New items use
399 pence, an active MealDeck channel rule and a `prep` route to the shared
station, including Moktl desserts. No preparation time, dietary assurance or
allergen list is invented. The schema's empty allergen array means no supplied
allergen data; the importer records `allergenDataProvided:false` in its audit.
Kitchen staff still own the product ingredient/allergen information.

An existing matching product and all its settings are left untouched, including
subsequent prices, stock flags, allergens and removed routes. Duplicate SKUs or a
SKU assigned to another brand/category abort the complete change. Existing
category names, activity and ordering are also preserved.

Use `buildMilkcakeDessertsImportSql({tenantId, locationId, stationId})` for an
explicit SQL transaction. For a runner that owns the transaction, use
`buildManagedMilkcakeDessertsImportSql` with those three bindings plus
`runnerOwnsTransaction:true` and `singleMigration:true`. Submit the entire result
in one atomic request. Do not rerun the original closed-channel draft importer
or the historical £20 price revision against the operating kitchen.

The public SKU allowlist is separately extended by the CLI-created migration
`20261106170330_mealdeck_public_menu_milkcakes.sql`. The original public-read
migration remains unchanged. `buildPublicMenuReadSql` now returns this latest
frozen migration; its managed equivalent permits the data addition and read
extension to run in the same transaction. No new public-table permission is
granted and no private checkout/payment function is replaced.

This addition does not activate the separate Sunday 99p campaign or invent its
quantity/stacking rules. Existing whole-order discounts remain server-owned.

## Verification

`node tests/postgres/milkcake-desserts-behavior.mjs` exercises the addition with an
enabled kitchen, atomic rollback, wrong-scope rejection, preservation of existing
business records and permissions, anonymous visibility after the new mapping,
canonical 399-pence pricing and retries after staff edits. It supports `--native`
for the repository's disposable PostgreSQL 17 runner. The existing
`public-menu-read-behavior.mjs` suite checks the new frozen manifest with its full
scope, source and permission restrictions.

Source tests and a generated migration do not establish hosted installation or
publication. Confirm the actual public menu response contains both desserts at
399 pence under each brand after the complete approved change is installed and
the application is published.

### Hosted catalogue verification — 6 November 2026, 17:08 UTC

The bounded importer and new public mapping were applied together in one explicit
transaction to the verified independent MealDeck Luton project. A separate read
confirmed all ten milkcakes active and visible at 399 pence, each in its brand's
Desserts category with the shared `prep` route. The anonymous database menu
projection returned all ten SKUs at 399 pence. Checksums of all 79 pre-existing
products, their channel rules and station routes were identical before and after.
Application publication and browser acceptance are separate release steps.
