# Approved launch menus and price revision — 5 November 2026

## Current approved menu

The owner's typed Skorch, Load’d, Moktl, Tavo and Souvano menus replace the earlier **£20 placeholders**. Prices are integer GBP pence in `src/lib/launch-menu-catalogue.ts`; generated database input is `deploy/mealdeck/catalogue/launch-catalogue.json`. The price revision is `owner-menu-20261105-v2`.

On 6 November, the owner added **Biscoff Milkcake £3.99** and **Oreo Milkcake £3.99** to a Desserts section in each of those five menus. The additive approval is `owner-desserts-20261106`; the previous menu revision remains unchanged. Each dessert is a standalone product with no meal, side or drink modifiers. Existing live kitchens use the separate additive dessert import; the full initial import below still creates drafts and requires ordering to be disabled.

| Menu | Main prices | Included choices and changes |
| --- | --- | --- |
| Skorch | The Ace £3.99; Double Deal £5.50; Triple Stack £7; Four of a Kind £8.99 | Lettuce included in the revised description. Nuggets Meal £5. Add-ons £1.99/£1.99/£0.50. |
| Load’d | Loaded fries £5.50; Ace Mac £5; other mac dishes £5.99; Full House £6.99 | Six sides added. Distinct named dishes retain their stable IDs. |
| Moktl | Seven mocktails £4.50; Rush Hour £6 | Named meal mocktail replacement is £2.99; a separate drink retains its standalone price. |
| Tavo | Cruncher £4.49; Twin Crunch £5.99; Flame £5.50; Big Flame £6.50 | Buttermilk/spicy grilled descriptions updated; caramelised onion removed from Tavo's common burger description. Nuggets Meal £5. A selected burger dip costs £1.50 once. |
| Souvano | Stir-Fry Doner £6.50; Heatwave £6.99; Lamb Chops £9.99 | Each includes one mandatory fries/rice/naan selection. Doner also requires a flavour. No extra meal charge or unapproved Souvano drinks. |

The original 5 November source lists were: Skorch/Load’d used Pepsi, Pepsi Max, Tango Orange, Tango Apple, Rubicon Mango, 7up and Water Bottle at £1. Tavo used Coke, Pepsi Max, Tango Apple, Miranda Orange, Miranda Strawberry, Barr Limeade and Water Bottle at £1. Red Bull’s retained source price is £2.20 in all three menus. Current stock is described in the 7 November update below. Tavo's six chicken nuggets are £3.50; Skorch/Load’d's are £4. Other corresponding sides retain the owner's supplied prices.

For Skorch/Tavo, a meal adds £2.50. Peri salt is £0.50, a Load’d fries replacement £2.99, a Load’d mac replacement £3.99, and mocktail/milkshake replacement £2.99. Named replacements remove the corresponding generic choice before pricing, so the same component is charged once. Standalone cross-brand extras use their full item price. Souvano's cross-brand additions are full-priced extras; its latest three-dish menu did not specify replacement surcharges.

The included standard meal-drink selector uses the brand's listed £1 cans/water. Red Bull is not an included can. A Moktl replacement removes that included drink selection. Kids meals follow the same rule without a paid meal toggle. Milkshake upgrades retain the supplied £2.99 display price but are unavailable until actual flavour choices are supplied. Their options have `available: false` and `unavailableReason: "Flavours coming soon"`; stale selections cannot be quoted and their database options stay inactive. No flavours or serving sizes are invented.

## 7 November names and current drink stock

The owner renamed only Load’d’s King of Hearts → Royal Flush, Queen of Hearts → Double Deck, Jack of Diamonds → All In and King of Spades → The Jackpot. This covers the four Loaded Fries products, four Full House products and four corresponding named side replacements. Existing SKUs, modifier IDs, descriptions and prices remain unchanged.

Coke, Pepsi Max, Tango Apple and Water Bottle are the current in-stock cans/water choices across Tavo, Load’d and Skorch. Coke is newly added to the Load’d and Skorch menus at the existing £1 can price; Skorch also has the corresponding £0 adult/kids included-drink options. Other drink identities and prices are retained, with local visibility controlling restocking.

The additive reviewed operations are `20261107_loadd_names.sql`, `20261107_coke_public_manifest.sql`, then `20261107_owner_drink_stock.sql` under `deploy/mealdeck/operations`. They were applied to the independent Luton catalogue and read back on 7 November. The public menu returned all eight renamed products, twelve available standalone drinks and sixteen distinct available included-drink choices. Existing product fields changed only for the requested names and Barr Limeade’s local visibility; existing prices were preserved. The stock operation’s completion audit prevents reruns from overriding later staff stock decisions.

## Exact Tavo portion/flavour pricing

These are full dish prices, not a flat portion surcharge. The same fried table applies to both fried wings and fried tenders.

| Dish/flavour | 3 pcs | 5 pcs | 8 pcs |
| --- | ---: | ---: | ---: |
| Fried, Plain | £2.99 | £5.50 | £6.49 |
| Fried, Korean BBQ | £3.50 | £6.50 | £7.99 |
| Fried, Dynamite | £3.50 | £6.50 | £7.99 |
| Fried, Fiery Sweet Chilli | £3.50 | £6.50 | £8.99 |
| Grilled, Plain | £2.49 | £4.49 | £6.49 |
| Grilled, Spicy Honey BBQ | £2.99 | £4.99 | £6.99 |
| Grilled, Dynamite | £2.99 | £4.99 | £6.99 |
| Grilled, Fiery Sweet Chilli | £2.99 | £4.99 | £6.99 |

Each of the three wing/tender products has twelve explicit source `priceVariants`. `getLaunchMenuPriceVariant(brandId, itemId, selections)` derives the single canonical pricing option from the two visible selectors. It never accepts a browser-provided amount or arbitrary hidden variant ID. `launchMenuConfiguredItemPrice` is a display/source calculation only; live checkout reads current canonical database prices.

The database import creates one hidden required `price-variant` modifier group per such item. The visible flavour/portion options carry £0; the derived hidden option carries `full variant price − minimum base price`. This makes every combination editable through canonical base and modifier prices without guessing additive flavour/portion prices. The server adapter must enforce the selector-to-variant mapping.

## Generated records

| Record | Count | Initial imported state |
| --- | ---: | --- |
| Approved brands | 5 | Existing bootstrap brand UUIDs resolved by stable slug |
| Menu sections | 25 | New sections inactive |
| Standalone items | 91 | Reviewed prices; new items inactive |
| Source modifier groups/options | 19 / 82 | Includes standard meal drinks and Souvano sides |
| Hidden price-variant groups/options | 3 / 36 | Twelve exact combinations for each Tavo wings/tenders item |
| Named cross-brand replacement groups/options | 2 / 17 | Nine Load’d sides and eight Moktl drinks; inactive and unattached |
| All modifier groups/options | 24 / 135 | New options inactive |
| Item/group associations | 62 | Includes hidden variant groups; replacement groups need the server adapter |
| Shared station routes | 91 | Actual existing `SHARED` station only |
| MealDeck visibility rules | 91 | New rules hidden |

Stable source item IDs remain the canonical `menu_items.sku`. Renamed kids meals and Souvano Doner retain their prior SKU. Modifier UUIDs use the existing tenant-scoped UUIDv5 scheme in `launchModifierDatabaseId`; public display names are never identifiers.

Conditional groups have canonical `min_select=0` when they depend on a meal or replaceable component. The server applies the stricter semantic requirement from `when`/`replacedBy`, using normalized source and cross-brand selections. This avoids forcing an extra can after a paid drink replacement. Required hidden price-variant groups remain `min_select=1`.

## Two distinct import operations

**Default insert-only import:** creates missing draft records and associations, preserves existing names, prices, activation, routing and administrator edits. It does **not** change existing £20 records. Its `catalogue.launch_import` audit event is not proof that every existing price is current.

**Reviewed menu revision:** run with `--apply-reviewed-prices`. It performs that import and a guarded update in the **same transaction**. The expected previous values are recorded in `catalogue/placeholder-price-baseline.json`, which is historical migration input rather than a current menu.

The revision:

- Updates an existing item/option price only when it is the known previous price or already the reviewed new price.
- Refuses unexpected item prices, option prices or MealDeck location price overrides, rolling back the whole operation so an administrator change is never silently erased.
- Updates an old price override when it still matches the expected placeholder, preventing a hidden £20 override from surviving the base-price change.
- Refreshes names/descriptions only when they still match the previous source. Unrelated administrator text remains intact.
- Removes only obsolete source-owned associations, including the old Souvano paid meal and the old grilled-wing flavour group.
- Hides retired Skorch/Load’d drinks and the unpriced old Souvano drinks, preserving their IDs and historical order references. It also disables the four milkshake upgrade options until their real flavours are configured.
- Writes an audited `catalogue.menu_revision` event with `next_value.priceRevision = 'owner-menu-20261105-v2'`, source hash, changed prices and retired SKUs.
- Runs once. A repeat revision preserves price edits made afterwards.

Checkout readiness may require the **`catalogue.menu_revision`** receipt. A fresh database must also run the reviewed revision to obtain this receipt; an insert-only import marker is insufficient because it could have left earlier £20 prices untouched.

## Database identity and execution

Use the independent MealDeck project only. The importer requires its installed standalone profile, verified owner bootstrap, the actual MealDeck tenant UUID, one active kitchen and its single shared station. It refuses a shared Dishbee schema, wrong tenant/kitchen/station, API roles, duplicate SKUs, conflicting routes, or any enabled MealDeck ordering channel. It cannot create a business or grant staff access as an import side effect.

Preview the source without accessing a database:

```sh
node deploy/mealdeck/catalogue-import.mjs --check
node deploy/mealdeck/catalogue-import.mjs --json
```

Generate a reviewed revision after obtaining the three real IDs from the verified MealDeck bootstrap:

```sh
node deploy/mealdeck/catalogue-import.mjs \
  --tenant "$MEALDECK_TENANT_UUID" \
  --kitchen "$MEALDECK_KITCHEN_UUID" \
  --station "$MEALDECK_STATION_UUID" \
  --apply-reviewed-prices \
  --out /tmp/mealdeck-reviewed-menu.sql
```

The output is a complete `BEGIN`/`COMMIT` transaction. Execute the whole file as the database owner in the correct project. Do not split it into multiple autocommit requests. The script locks the bounded catalogue tables and installation row; a short lock timeout aborts instead of waiting behind active edits.

For a migration runner that owns a single atomic transaction, add `--managed-transaction`, or use `buildManagedLaunchCataloguePriceRevisionSql({ tenantId, locationId, stationId, runnerOwnsTransaction: true, singleMigration: true })`. The equivalent standalone builder is `buildLaunchCataloguePriceRevisionSql(binding)`. The managed contract intentionally rejects missing transaction guarantees.

This operation never enables the ordering channel, publishes records, creates an order, marks a payment paid, releases KDS or sends customer messages. The frozen standalone foundational installer remains unchanged. Hosted execution and publication must be verified separately from source changes.

## Administrator price editing

The item editor uses `mealdeck_ops_update_menu_item`. The separately installed modifier-price extension exposes `mealdeck_ops_modifier_prices` and conflict-checked `mealdeck_ops_modifier_update_price`. Both require global menu permissions and retain audit records. Editing a price is separate from publishing a product or granting checkout authority.

After this revision, subsequent owner edits remain authoritative. A public menu display must read the current canonical catalogue to reflect later edits; a rebuilt static source file alone cannot establish that connection. The checkout adapter must always re-read current canonical prices and reject stale client quotes.

## Verification

The catalogue tests cover every standalone price, all 36 Tavo combinations, exact add-on prices, dip charging, brand-specific drinks/nuggets, included drink substitution, source references and saved-basket normalization.

The PostgreSQL suite executes the actual standalone profile and generated SQL on a disposable local database. It checks draft imports, stable IDs, correct variant deltas, denied roles/projects, closed-channel gates, scope collisions, duplicate SKUs, idempotence and administrator-edit preservation. Four additional revision cases exercise a fresh revision marker, unexpected-price rollback, real placeholder replacement and a late-error rollback. The native PostgreSQL path also exercises independent-session locking; the embedded engine has one connection.

```sh
node tests/postgres/catalogue-import-behavior.mjs
# Only against a fresh disposable localhost test database:
node tests/postgres/catalogue-import-behavior.mjs --native
```

