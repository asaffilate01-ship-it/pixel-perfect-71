# Approved launch catalogue and activation contracts — 5 November 2026

## Owner decision and delivered source

The owner requested **£20 for every standalone menu item**, then clarified **£20 for every optional add-on, meal deal and upgrade**, and asked to activate ordering/backend administration so prices can be changed later. This is approved starting-price data; it supersedes the earlier absence of price approval. Included flavour, portion and base selectors describe an already priced dish and add £0.

`src/lib/launch-menu-catalogue.ts` is the single source for the five launch menus and their initial prices. `deploy/mealdeck/catalogue-import.mjs` derives the complete reviewable `deploy/mealdeck/catalogue/launch-catalogue.json` and a bound SQL import from that source. No separate manually transcribed product/price list exists.

| Import records | Count | Initial state |
| --- | ---: | --- |
| Existing launch brands required | 5 | No brands created, renamed or activated |
| Actual menu sections | 20 | Missing categories inserted as drafts |
| Standalone items, including cans, water, sides and drinks | 77 | £20 each; inactive |
| Source modifier groups/options | 15 / 49 | Included choices £0; optional choices £20; all options inactive |
| Named cross-brand replacement groups/options | 2 / 17 | Nine Load’d sides and eight Moktl drinks; £20 replacement surcharge; inactive and unattached |
| Source item-to-group links | 49 | Original source group associations, subject to the conditional-rule limitation below |
| Item-to-kitchen routes | 77 | The explicitly selected existing `SHARED` station |
| Channel visibility rules | 77 | New rules hidden; existing rules preserved |

The five existing bootstrap `Menu` categories remain untouched; importing twenty real sections therefore leaves twenty-five categories in a fresh bootstrapped profile. Shared toppings/descriptions are included in each imported item's description. No serving sizes, recipes, allergens, preparation times, tax codes or delivery charges are invented.

Standalone extras use their target item's price. A named replacement uses its own £20 surcharge, independent of that target's full standalone price. Generic and named replacements must not both charge for the same included component.

## Scope and execution

The importer never connects to a database itself. Its SQL is for an authorised database owner in the dedicated MealDeck project, after the [independent profile](mealdeck-independent-backend-phase47.md) is installed and its real confirmed owner/business bootstrap has succeeded. It does not create users, confirm emails, assign roles, create tenants, open channels or claim a payment account.

The generator requires the **actual returned tenant, kitchen and station UUIDs**. Its SQL verifies all of the following before importing:

- The private `mealdeck-independent-v1` installation marker and completed owner bootstrap exist, and their business matches the explicit tenant UUID.
- The business is MealDeck / 313 Brands Ltd in GBP. The supplied location is its active `shared-kitchen` and the tenant's only active kitchen. This first-launch import must not alter a second kitchen's shared catalogue.
- The supplied station belongs to that location, has code `SHARED`, and is its only active station.
- The existing MealDeck ordering channel is disabled, and no MealDeck channel elsewhere in the same tenant is enabled (including at an inactive location). An enabled/missing channel aborts; the importer never changes its setting.
- The five exact launch-brand slugs already exist. The presence of a `dishbee_private` schema rejects the import.
- The executing role owns the installation table or inherits its owner role. Anonymous, authenticated and service-role API identities are rejected.

The complete import is atomic. It uses bounded table locks because the existing schema has no unique SKU constraint; checking duplicates without those locks would permit competing writes between the check and insert. A five-second lock timeout aborts instead of indefinitely waiting behind staff edits. It does not change schema, RLS, grants or function permissions.

Use Node 22.18+ or the project's supported Bun runtime; the generator imports the existing TypeScript data module directly.

```sh
node deploy/mealdeck/catalogue-import.mjs --check
node deploy/mealdeck/catalogue-import.mjs --json
```

The reviewed JSON is committed at `deploy/mealdeck/catalogue/launch-catalogue.json`. After an intentional source catalogue change, regenerate that derived file and keep the source-parity test green. To create a new export without overwriting any existing artifact:

```sh
node deploy/mealdeck/catalogue-import.mjs --json \
  --out deploy/mealdeck/generated/launch-catalogue-review.json
```

Set the three task-specific variables below from the verified bootstrap receipt. They are database identifiers, not a substitute for choosing the correct hosted project or obtaining database-owner access.

```sh
node deploy/mealdeck/catalogue-import.mjs \
  --tenant "$MEALDECK_IMPORT_TENANT_UUID" \
  --kitchen "$MEALDECK_IMPORT_KITCHEN_UUID" \
  --station "$MEALDECK_IMPORT_STATION_UUID" \
  --out deploy/mealdeck/generated/launch-catalogue-import.sql
```

This output owns its `BEGIN`/`COMMIT`. For Lovable's documented runner-owned migration transaction, add `--managed-transaction` and use a different output filename. Submit that entire generated body in **one atomic migration**; do not split it into requests or execute it through an autocommit tool. The JavaScript managed builder additionally requires `runnerOwnsTransaction: true` and `singleMigration: true`. These are an execution contract, not a claim that an arbitrary runner is transactional.

## Reruns and later price editing

Each product's existing source ID becomes its `sku`. Existing SKU rows are preserved; a duplicate source SKU, wrong brand/category or conflicting kitchen route aborts the whole import. Modifier groups/options have deterministic UUIDv5 identifiers scoped to the actual tenant and stable source ID. A conflicting identifier or unrelated same-name record is reported rather than adopted.

Rerunning inserts only missing categories, items, groups, options, routes, visibility rules and associations. It does **not** overwrite existing names, descriptions, item prices, option surcharges, channel overrides, active flags, visibility, quantity limits or preparation times. A no-op rerun creates no additional import audit entry. A rerun does restore missing source associations, so do not use this as an automatic reconciliation job after deliberately retiring source content; keep retired records inactive or review the changed source first.

The current item-price administration RPC is `mealdeck_ops_update_menu_item`, with global `menu.write` permission and an audit record. The separate modifier-price administration extension, `deploy/mealdeck/post-install-migrations/20261105071120_mealdeck_ops_modifier_prices.sql`, adds `mealdeck_ops_modifier_prices` and a conflict-checked `mealdeck_ops_modifier_update_price` with the same global permission boundary. Its migration must be installed before that editor can operate; the draft importer does not install additional RPCs. Neither an edit nor this import publishes products or supplies checkout authority.

For the transaction-owning Lovable runner, generate this extension using its explicit managed builder:

```sh
node --input-type=module <<'NODE'
import { mkdirSync, writeFileSync } from 'node:fs';
import { buildManagedModifierPriceSql } from './deploy/mealdeck/modifier-prices.mjs';

mkdirSync('deploy/mealdeck/generated', { recursive: true });
writeFileSync(
  'deploy/mealdeck/generated/modifier-prices-managed.sql',
  buildManagedModifierPriceSql({ runnerOwnsTransaction: true, singleMigration: true }),
  { flag: 'wx', mode: 0o600 },
);
NODE
```

The builder removes only the two known outer transaction statements; guards, function bodies, access checks and grants remain unchanged. Submit the complete generated body in one runner-owned atomic migration. The exclusive file write deliberately refuses to replace an already reviewed output.

## Conditional modifiers and cross-brand replacements

The generated JSON retains the exact source `when` dependencies, required/single/multiple choices, source item associations, and named replacement target brand/item IDs. Required groups with no condition import with minimum one. A conditional group imports with minimum zero because the generic database columns cannot represent “required only when this other choice is selected.” All new products/options remain inactive.

The two named replacement groups are **not attached unconditionally to products**. Their editable draft price records and target SKU mappings are ready, but the server must apply `src/lib/launch-menu-upsells.ts`'s eligibility and substitution rules against current approved records: one side and one drink per parent, meal-triggered upgrades, Heatwave's single base, preserving Rice/Naan, and removal of conflicting generic upgrades. It must price extras and replacements differently and multiply each selected child by its parent quantity exactly once.

Publishing these generic rows without that rule adapter would lose the conditional/whole-meal behavior. A public catalogue response must also distinguish draft/inactive options from selectable ones. Empty imported allergen arrays mean **not yet supplied**, not an allergen-free declaration.

## Exact remaining runtime contracts

The user's activation request authorises the intended outcome. These missing runtime contracts still need implementation and verification; price approval alone does not supply them.

| Runtime dependency | Required behaviour and current source gap |
| --- | --- |
| Hosted installation and identity | The dedicated project must contain the actual independent profile, confirmed owner/bootstrap receipt, approved catalogue import and modifier-price administration extension. No hosted installation or owner bootstrap is claimed by local source tests. |
| Published catalogue and routing | `public_mealdeck_serviceability`, `public_mealdeck_catalogue` and `public_mealdeck_delivery_fee` must implement the existing server contracts for the independently configured tenant/kitchen. The standalone installer does not define these customer APIs. Source SKUs must resolve to canonical UUIDs, and the UI must read current published prices when live; the static launch display cannot reflect later database edits by itself. |
| Pending order creation | `create_mealdeck_checkout_order_once` must atomically persist an idempotent, freshly server-priced pending order, approved modifiers/substitutions and one delivery fee. It is called by `placeOrder` but not defined by the standalone profile. Its receipt must never mean paid. |
| Stripe session and confirmation | The recorded test publishable token is unused by app source. An actual adapter needs either the verified Lovable built-in payment contract or same-account server Stripe credentials, server-created payment sessions, an authenticated raw-body webhook, merchant/mode/currency/amount/order binding, duplicate/concurrent event handling and reconciliation. No API endpoint, secret, product or provider protocol can be inferred from the public token. The current client only displays a pending-order receipt. |
| Payment-to-kitchen authority | `mealdeck_private.kds_release_authority(uuid)` and, for split payments, `mealdeck_private.group_payment_authority(uuid)` must read accepted immutable payment/release evidence, including refund/replay handling. They are intentionally absent in the standalone profile. A mutable paid flag or return-page URL cannot release the kitchen. |
| Customer tracking | `public_mealdeck_order_tracking_v2` must provide the verified order, preparation, packing and fulfilment state using the private handoff code. The UI/progress presentation exists; the standalone installer does not define this public tracking API. |

The separately connected Lovable account is the owner-confirmed destination. The available connected tools did not expose that MealDeck project; the visible Dishbee project is not an alternative. No hosted SQL, payment products, charges, emails or account changes were made by this work. `COMING_SOON` and the server checkout-approval switch remain closed until the real path above works; opening the switches now would expose an incomplete checkout rather than activate it.

## Verification

```sh
npm ci --prefix tests/postgres
npm run test:catalogue --prefix tests/postgres
```

The suite executes the full actual independent profile plus the generated import in disposable PostgreSQL. It verifies the committed JSON matches the source, all £20/zero-included prices, complete sections and shared routing, blocked wrong-project/role/kitchen imports, closed channels, duplicate/collision rejection, late atomic rollback, idempotent reruns and preservation of an item price changed through the real owner RPC. The native path adds an independent-session locking check using `pg_blocking_pids()`.

The same suite then installs the separate modifier-price extension and checks scoped staff access, tenant isolation, exact price/audit writes, stale-price rejection, rollback and unchanged publication. Its managed variant is verified for complete wrapper-only transformation and atomic rollback. Native PostgreSQL additionally verifies competing price edits and permission revocation while an update waits on a row lock.

```sh
MEALDECK_KDS_TEST_DATABASE_URL='postgresql://postgres:DISPOSABLE_PASSWORD@127.0.0.1:5432/mealdeck_kds_test_catalogue' \
  npm run test:catalogue:postgres --prefix tests/postgres
```

Use a fresh local database/server fixture. The shared harness rejects external hosts and nonempty databases; it never clears an existing application. Local/native results do not attest hosted deployment or Stripe acceptance.

Technical references: [Stripe fulfillment](https://docs.stripe.com/checkout/fulfillment.md?ui=full-page), [Stripe webhook verification](https://docs.stripe.com/webhooks), [Supabase RLS and grants](https://supabase.com/docs/guides/database/postgres/row-level-security). The implementation keeps the existing profile's table/RPC boundary rather than granting browser imports.
