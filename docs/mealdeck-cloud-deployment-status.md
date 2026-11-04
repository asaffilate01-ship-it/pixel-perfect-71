# Independent MealDeck Cloud deployment — 4 November 2026

## Completed

- Provisioned a fresh, dedicated Lovable Cloud backend for this project; no external backend connection prevented provisioning.
- Confirmed PostgreSQL 17.11, zero public application tables and no confirmed Auth account matching the intended owner at inspection time.
- Current source includes merged PR #67.
- Generated `deploy/mealdeck/generated/install.sql` from the reviewed phase-47 builder: nine sources, one transaction, 190403 bytes; SHA-256 `1f6f09e3057ca71bb60b646173d1ab48f7b0a0ef7bdbdbcd3bcf7abd724df8cf`.
- Saved `MEALDECK_SUPABASE_URL` and `MEALDECK_SUPABASE_PUBLISHABLE_KEY` from the same newly provisioned backend. No cross-project fallback was introduced.
- Enabled email/password authentication without disabling email confirmation.
- Public ordering remains coming soon; no checkout approval or payment-release authority was configured.
- Existing `/ops` and `/kds` staff sign-in screens render without browser runtime errors. This is not an authenticated administration acceptance check.

## Installation blocker

The available `lov_database.migration` interface requires SQL **without transaction-control statements** and owns its transaction and migration journal. The reviewed installer explicitly contains its own outer `begin;` and `commit;`. The owner requested preservation and execution of the complete generated installer unchanged. No compatible SQL-file installation interface is available through the documented CLI or loaded database tools.

**No installer SQL has been submitted or applied.** Do not strip the transaction, split the installer, apply historical migrations independently, weaken the fresh-project guard, or create a privileged browser/service RPC to work around this blocker. Use an authorised installation interface that supports the complete reviewed transaction, or obtain an explicitly reviewed installation procedure compatible with the managed migration transaction and freshness checks.

## Owner and kitchen

The owner confirmed `info@mealdeck.co.uk` as the intended admin account and `MealDeck` as the actual shared kitchen name. A confirmed Auth account must exist and its exact UUID must be verified before the private owner bootstrap is run. No Auth account was created, invited or automatically confirmed; no ownership was assigned.

After successful schema installation and account verification, use the documented private bootstrap once to create the five draft brands, one kitchen/station, one owner assignment and disabled ordering channel. Store its actual returned UUIDs in the deployment record; do not infer city-to-kitchen bindings.

## Remaining acceptance

- Complete installer application and database integrity/permission checks.
- Confirm the owner account, perform the private bootstrap and configure actual tenant/kitchen bindings.
- Authenticated `/ops` checks: menu editing, draft routing, recipes, stock and staff permissions using approved inputs/prices.
- Authenticated `/kds` must report setup required until accepted independent payment-release authority exists; never fabricate paid orders for testing.
- Catalogue prices/allergens/publication and real payments remain separately blocked pending approval and integration acceptance.