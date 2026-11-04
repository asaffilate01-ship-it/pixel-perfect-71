# Phase 47 — independent MealDeck backend

## Decision and current readiness

The owner authorised an independent MealDeck database on 4 November 2026. MealDeck is a trading name of **313 Brands Ltd** and uses the technology credit **Powered by Dishbee**. The new MealDeck project owns its Auth users, staff permissions, catalogue, recipes, inventory, supplier records, orders and kitchen records. Cafe 1 and the existing Dishbee project remain separate applications.

This change supplies a deployable **fresh-project operations foundation**. It does not create or alter a hosted Supabase project, copy another business's records, publish a catalogue, connect a payment provider or enable ordering. After installation and explicit owner provisioning, staff administration can operate without a Dishbee database. The kitchen screen remains in setup-required mode until MealDeck has its own accepted, verified payment-release integration.

The initial business has **one shared kitchen**. Its KDS presents **one complete card per master order**, grouping all brands together through preparation and packing. The tenant/location relationships support future kitchens with their own authorised screens; no second kitchen is inferred from a marketing city or an environment-variable name.

## Deployable sources

The entry point is [deploy/mealdeck/build.mjs](../deploy/mealdeck/build.mjs). Its [manifest](../deploy/mealdeck/manifest.json) records the exact installation order and SHA-256 hashes of all reused historical migrations.

| Order | Source                                                | Responsibility                                                                                                                                  |
| ----- | ----------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| 1     | `20261104213833_mealdeck_standalone_foundation.sql`   | Fresh-project guard, independent tenant/catalogue/order/KDS tables, private installation marker and closed group-payment boundary.              |
| 2     | `20261102191000_mealdeck_ops_core.sql`                | Staff permissions, audit, menu administration and location/taxonomy reads.                                                                      |
| 3     | `20261102191500_mealdeck_ops_recipe_finance.sql`      | Recipes, ingredients, inventory, order administration and reporting.                                                                            |
| 4     | `20261102202500_mealdeck_ops_procurement_batches.sql` | Suppliers, purchase approvals, goods receipts and recipe batches.                                                                               |
| 5     | `20261102214500_mealdeck_ops_invoice_matching.sql`    | Supplier invoices and matching controls.                                                                                                        |
| 6     | `20261102220000_mealdeck_group_invite_foundation.sql` | Reserved group-invitation persistence.                                                                                                          |
| 7     | `20261102224500_mealdeck_fulfilment_foundation.sql`   | Reserved fulfilment outbox and handoff persistence.                                                                                             |
| 8     | `20261104210005_mealdeck_ops_kds_workspace.sql`       | Scoped kitchen board, atomic master-order preparation, packing and immutable staff audit.                                                       |
| 9     | `20261104213840_mealdeck_standalone_runtime.sql`      | Independent authority boundary, owner bootstrap, stronger scope constraints, routing administration, recipe correction and final ACL hardening. |

The new foundation and runtime files are in [deploy/mealdeck/source-migrations](../deploy/mealdeck/source-migrations). Their filenames were generated with the Supabase CLI's `migration new` command. They are deliberately outside the default root migration directory: they must be installed together with their dependencies using this reviewed profile.

### Build and integrity checks

Run from the repository root:

```sh
node deploy/mealdeck/build.mjs --check
node deploy/mealdeck/build.mjs --out deploy/mealdeck/generated/install.sql
```

The builder reads repository files only. It does not read credentials, contact Supabase, link a project or run SQL. The output path must be new; it refuses to overwrite an existing installer. Generated output is ignored by Git. The builder prints the output's SHA-256 so the reviewed installer can be matched to the file applied later.

All seven historical source files remain unchanged and hash-pinned. The generated installer has two explicit, count-checked compatibility normalisations:

1. The historical KDS migration's sole top-level `begin;` and `commit;` lines become comments. One outer transaction covers the foundation, every reused migration and the runtime overlay. A failure near the end rolls back the complete installation.
2. One historical analytics expression, `o2.paid_at::date day`, becomes `o2.paid_at::date as "day"`. PostgreSQL rejects the original bare reserved-word alias. The builder verifies the exact historical function and replacement count. Function-body validation stays **on throughout installation**.

The runtime separately replaces `mealdeck_ops_save_recipe` with the same scoped/versioned implementation and the correct `8-4-4-4-12` UUID validation. Its historical validator required an extra four-character group, rejecting real ingredient UUIDs. This correction does not alter historical migration content or relax ingredient ownership, quantities, waste percentages or recipe-history rules.

## Fresh-project boundary

Apply the generated installer only to an explicitly selected **new dedicated MealDeck Supabase project**, using a privileged database operator. Verify the selected project in the dashboard before executing SQL. Do not run the root historical migration chain directly against a new MealDeck project and do not apply this profile to Dishbee, Cafe 1 or an existing populated application database.

Before creating application objects, the installer requires PostgreSQL 15 or later, Supabase Auth and the expected API roles. It rejects existing application tables, views, sequences, functions and enum/domain/range/composite types in `public`, existing MealDeck or Dishbee private schemas, and those application objects in non-platform private schemas. This includes an Auth/Storage-backed application that has private functions but no tables of its own. Supabase-managed platform and extension objects are allowed. The installer never drops or resets a schema to make these checks pass.

The private installation marker prevents a second installation and binds the later business bootstrap to this profile. Re-running the installer is intentionally an error. After successful initial deployment, future schema changes need reviewed incremental migrations for the independent project; reinstalling the fresh profile is not an upgrade procedure.

All public application tables have RLS enabled and direct privileges explicitly revoked from `PUBLIC`, `anon`, `authenticated` and `service_role`. Staff use named RPCs that verify `auth.uid()` and current tenant/location permissions. The profile also revokes inherited table/sequence privileges that some Supabase projects grant by default. Private helper schemas and functions are unavailable to browser and service API roles. A service key is not a shortcut to staff ownership or kitchen release.

Composite foreign keys bind menu categories and products to their tenant/brand; routes and tickets to their tenant/kitchen; ticket lines to the exact order and purchased line; and group, fulfilment and handoff records to the exact scoped order. The runtime adds tenant/location constraints to the reused operations tables, plus scoped recipe/history relationships.

## Explicit first-owner provisioning

Installation creates **no business, staff assignment or Auth account**. An authorised operator first creates or invites the intended owner's account through the new project's normal Auth administration and verifies the account's identity. Account creation and invitation are separate actions; the database profile sends no email.

The one-time bootstrap is private and **SECURITY INVOKER**:

```sql
-- Run as the authorised database operator in the NEW MealDeck project.
-- Supply the reviewed existing Auth user UUID and the real kitchen name.
select mealdeck_private.bootstrap_business(
  p_owner => '<confirmed-owner-auth-user-uuid>'::uuid,
  p_kitchen_name => '<actual shared kitchen name>'
);
```

The owner must already exist in `auth.users`, have a nonempty confirmed email, be non-anonymous, not deleted and not currently banned. An unknown or unconfirmed user cannot receive this bootstrap. The function is not executable by `anon`, `authenticated` or `service_role`; it does not derive ownership from a supplied email or the first signup. It locks the singleton installation record, rejects duplicate activation and records a `business.bootstrap` audit event identifying the database-operator action.

It creates:

- One MealDeck tenant, legally **313 Brands Ltd**.
- One named location and one active **Shared kitchen** station.
- Five draft brand identities: **Skorch, Souvano, Load’d, Moktl and Tavo Chicken**, each with a draft Menu category.
- One global owner staff assignment for the exact confirmed user.
- One **disabled** MealDeck ordering channel.

The response contains `tenant_id`, `location_id`, `station_id`, `owner_user_id`, `brand_count: 5` and `ordering_enabled: false`. Store those actual UUIDs in the deployment record. It creates **zero products, prices, orders, supplier transactions or payment receipts**.

Existing staff-assignment RPCs can then grant explicit roles to other verified Auth accounts. Global menu names/prices and recipes require global permissions; location staff cannot use a location permission to edit the shared catalogue or elevate their own role.

## Application connection

The application uses one explicitly configured backend pair, supplied on the application server:

| Variable                                                       | Purpose                                                                                                                                                |
| -------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `MEALDECK_SUPABASE_URL`                                        | HTTPS origin of the independent MealDeck project.                                                                                                      |
| `MEALDECK_SUPABASE_PUBLISHABLE_KEY`                            | That project's public publishable key or supported legacy anon key. Never a secret/service key.                                                        |
| `MEALDECK_TENANT_ID`                                           | Tenant UUID returned by the business bootstrap.                                                                                                        |
| `MEALDECK_LUTON_LOCATION_ID` / `MEALDECK_STALBANS_LOCATION_ID` | Real, reviewed kitchen bindings for applicable service areas. Configure only verified mappings; the bootstrap creates one location.                    |
| `MEALDECK_CHECKOUT_SERVER_KEY`                                 | Future server-only credential from the same MealDeck project. Leave unset until the separate payment/checkout integration is implemented and accepted. |

The staff browser obtains the same validated public pair through `getMealDeckPublicBackend`; it does not use an independently configured Vite database target. Sessions use project-specific browser storage. There is no Dishbee, Vite or generic Supabase credential fallback. Legacy-only configuration is unconfigured; conflicting stale aliases are rejected. Matching stale aliases are tolerated during migration, then should be removed. See [.env.example](../.env.example) and [the runtime validator](../src/lib/mealdeck-runtime-config.ts) for the complete contract.

Keep `COMING_SOON=true` and leave `MEALDECK_CHECKOUT_INTEGRATION_APPROVED` unset. Configuring a valid database connection, enabling a product or signing a basket estimate does not establish payment readiness.

## Populate the real catalogue through administration

The existing public coming-soon catalogue is not automatically imported into this fresh database. The supplied menu artwork identifies dishes and upgrades but supplies no approved prices. No price is inferred and an unpriced dish is never converted to £0.

After bootstrap, the owner can use **/ops → Menu → Add product** with an approved brand, category, name, description and real price. Products start as drafts. Before activation, assign their route to the shared kitchen, review recipe/ingredient/allergen data and review visibility for the intended kitchen. The Menu panel's kitchen routing control uses these scoped APIs:

| API                                                                              | Permission and result                                                                                          |
| -------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| `mealdeck_ops_kitchen_stations(p_tenant,p_location)`                             | `menu.read`; active matching location and stations only. Returns `station_id`, `station_name`, `station_code`. |
| `mealdeck_ops_set_station_route(p_tenant,p_location,p_item,p_station,p_enabled)` | `menu.write`; validates the item's tenant and active station's kitchen, audits the change, returns `true`.     |

Routing changes lock the menu item and are rejected while accepted/preparing/ready orders at that kitchen use it. Removing an active product's final route is rejected. Assigning a route does not create a ticket, publish an ordering channel or mark a payment verified.

Draft brand/category identities and the overall ordering channel also need a reviewed publication decision before future live browsing. Existing administration covers dishes, recipes and history, ingredients, stock adjustments, suppliers, second-actor purchase approval, goods receipts, batch records, invoices and reports. It does not yet provide a complete provider settlement ledger, arbitrary modifier/taxonomy editor or customer checkout implementation.

## Independent kitchen release and payments

The KDS reuses the complete existing master-order preparation and packing logic. Its dependency is changed from the historical Dishbee adapter to **MealDeck's own private authority**:

```text
mealdeck_private.kds_release_authority(uuid) → jsonb
mealdeck_private.group_payment_authority(uuid) → boolean
```

Neither authority function is installed by this profile. There is no production test adapter, paid-order flag, synthetic capture or UI override. The board reports `setup_required`, and preparation/packing mutations fail closed. Staff/menu/recipe administration remains usable while payment integration is pending.

Any future authority must be a reviewed server-owned `STABLE` function, inaccessible to anon, authenticated and service API callers. Kitchen evidence must include `schema_version: 1`, strict `eligible: true`, the exact order/tenant/location/source, a UUID release ID and a finite verification timestamp within the order's lifetime. The current wrapper also requires MealDeck source, the permitted order lifecycle, recorded paid status/time, and—where applicable—the exact submitted group/master-order relation plus independently verified group financial readiness. Missing, malformed, mismatched or failed evidence is ineligible.

These shape checks are necessary but are **not payment verification themselves**. The future adapter must derive approval from immutable server-priced order/share records and authenticated provider events, including captured amounts, currency, replay/idempotency, refunds and group completion. It must not manufacture an eligible response from mutable `paid_at`/status columns alone. Full provider acceptance and concurrent refund/release checks remain a separate implementation and staging requirement.

After legitimate release, one action starts the entire order, another marks all its routed lines ready, and the same card proceeds through packing to **sealed**. Exact versions, route coverage, quantities, complete preparation instructions and current staff permissions are rechecked in the database. The initial staff workflow stops at sealed and calls no courier or dispatch function.

The old finance RPC's `hive_refund_allocations` name is retained only as a **local security-invoker compatibility view** over `mealdeck_refund_allocations`. There is no Hive connection or imported settlement ledger. The legacy response field `settledHiveRefundsPence` consequently describes those local recorded allocations. Reports still identify unreconciled amounts; they do not assert verified bank settlement, VAT calculation or actual COGS.

## Verification and deployment acceptance

The [standalone PostgreSQL suite](../tests/postgres/standalone-behavior.mjs) imports and executes the same `buildStandaloneSql()` output used for deployment. Its only platform shim supplies Supabase Auth and API roles. It does not install the earlier canonical/Dishbee test fixture or a payment-release double.

```sh
npm ci --prefix tests/postgres
npm run test:standalone --prefix tests/postgres
```

Coverage includes full fresh installation, late-failure rollback, rejection of existing application schemas, protected owner bootstrap, account confirmation/bans, inherited grant revocation, staff scope, real menu routing and CRUD, valid-UUID recipe saving and history, stock/costs, purchase receipt idempotency, invoice administration, actual analytics execution, composite foreign keys and the closed payment/KDS boundary. The native PostgreSQL 17.6 CI job runs against a separate fresh database; the earlier KDS suite retains its independent-session concurrency checks. See [tests/postgres/README.md](../tests/postgres/README.md) for native execution and guard details.

Local PostgreSQL success establishes source installation and bounded administration. Hosted Auth settings, the actual owner account, production catalogue/allergens/prices, provider credentials, signed webhooks, group payment, refunds and courier dispatch still require explicit configuration and staging acceptance in the chosen new project. Until that work is complete, retain the public coming-soon experience and the kitchen setup-required state.
