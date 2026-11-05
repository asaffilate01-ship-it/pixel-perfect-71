# Shared add-on and upgrade prices

The Menus workspace has a separate **Add-ons & upgrade prices** section. Staff
with business-wide `menu.read` can view every saved option, including inactive
and unattached replacement options. Business-wide `menu.write` permits changing
its integer-pence price. Kitchen-only grants do not authorize these global edits.

The editor shows the option group, draft/active state and actual number of menu
items linked to the group. The price is shared by all those items. `0.00` is a
valid deliberate price for an included choice. A save changes only the price;
it does not attach options, activate items or options, open an ordering channel,
create payments or release orders to the kitchen.

Each write locks the option, rechecks permission and compares the staff member's
expected saved price. A stale edit is rejected. The interface retains the entered
price and requires reviewing the current record before another save. Successful
changes and the actor, previous/new prices and affected-item count are recorded
in the operations audit log. An audit failure rolls back the price change too.

## Separate installation

Install the reviewed independent MealDeck profile first. This extension is not
part of its frozen source manifest and does not change the base artifact hash.
The SQL filename was created with `supabase migration new` using CLI 3.0.0:

`deploy/mealdeck/post-install-migrations/20261105071120_mealdeck_ops_modifier_prices.sql`

That complete file is for an owner-run SQL session and contains its own outer
transaction. For a runner that owns the transaction and rejects explicit
transaction statements, generate the unchanged body with:

```js
import { buildManagedModifierPriceSql } from "./deploy/mealdeck/modifier-prices.mjs";
const sql = buildManagedModifierPriceSql({
  runnerOwnsTransaction: true,
  singleMigration: true,
});
```

Submit the complete result as **one migration in one runner-owned atomic
transaction**. These acknowledgements describe the execution contract; the
builder does not detect or create a hosted runner's transaction. Split requests
and autocommit execution are unsupported. No local builder contacts a project.

The installation requires the independent MealDeck marker and its owner, rejects
a shared Dishbee schema and retains all existing table grants. The two RPCs
revoke default `PUBLIC`, `anon` and `service_role` execution, then grant only
`authenticated`; their bodies check the verified user and existing staff
permission records. No direct table access is granted.

The catalogue PostgreSQL suite invokes
`tests/postgres/modifier-price-behavior.mjs` after its real profile/import checks.
It verifies permissions, tenant isolation, shared counts, price-only writes,
intentional zero pricing, stale writes, audit atomicity and unchanged launch
gates. Native PostgreSQL additionally checks two-session contention and
permission revocation while waiting on the row lock.

The public coming-soon menus still read source-owned launch prices. This editor
saves canonical database prices for the future live catalogue; publication-aware
public reads and stable SKU/modifier mapping must be installed and connected
before admin changes can appear there. A source merge does not install this
extension or activate checkout in the separate Lovable account.

Security references: [Supabase database functions](https://supabase.com/docs/guides/database/functions)
and [intentional authenticated security-definer APIs](https://supabase.com/docs/guides/observability/advisors?queryGroups=lint&lint=0029_authenticated_security_definer_function_executable).
