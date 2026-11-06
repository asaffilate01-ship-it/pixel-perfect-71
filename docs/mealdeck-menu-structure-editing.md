# Editing existing categories and add-ons

The 6 November menu update adds authenticated editing for existing category
names/availability and existing add-on names/prices/availability. It preserves
category, brand, group, option and SKU identifiers, item links, kitchen routes,
selection requirements and historical paid-order snapshots.

## Authority and conflicts

The three new RPCs use the installed independent MealDeck tenant and the existing
verified-user permission helper. Category listing requires global `menu.read`;
category and add-on changes require global `menu.write`. Location-only staff,
disabled users, denied writers and unrelated tenants cannot edit global records.
Only `authenticated` has execute permission. Anonymous and service-role callers
have no write RPC access, and base-table grants remain unchanged.

- `mealdeck_ops_menu_categories(p_tenant)` returns category and brand IDs/names,
  the saved active state and the number of affected items.
- `mealdeck_ops_update_menu_category` accepts the category and brand IDs, the new
  name/active state and the expected saved name/active state.
- `mealdeck_ops_modifier_update_option` accepts the option and group IDs, the new
  label/integer-pence price/active state and all three expected saved values.

Each update locks its row, rechecks permission and compares every expected field
before writing. Stale edits return a conflict instead of overwriting another
screen. Unchanged saves create no duplicate audit event. Changed saves record
the actual Auth actor, tenant, entity, previous/new values and shared item count
in the same transaction; a failed audit rolls back the edit.

Category names are 2–140 trimmed characters; option names are 1–140. Control
characters are rejected. Prices remain whole pence from 0 through 1,000,000.
Neither RPC accepts a new identifier, relationship, publication override or
payment state.

## Public menu and checkout

The service-only public catalogue projection adds `categoryName` to item rows
and `label` to normal and replacement option rows. Existing source-approved ID
mappings and scope/publication filters remain authoritative. The browser adapter
accepts these fields optionally during rollout and never receives arbitrary
database identifiers as new selectable choices.

An inactive category excludes its products from the public catalogue. An inactive
option cannot be selected by canonical checkout. Shared option edits apply to
every item linked to that group. The displayed affected-item count measures direct
group links; cross-brand replacement options may be offered without a direct link.
Disabling every option in a required group retains the requirement and prevents
checkout. Public hydration disables unconditional required-choice products with no
available selection; conditional choices remain validated when that branch is used.
New quotes use the saved values; preparation
rejects a stale quote when its priced snapshot changed. Existing paid order items
retain their original names, prices and modifiers.

## Installation and verification

Apply the complete additive migration
`deploy/mealdeck/post-install-migrations/20261106113333_mealdeck_menu_structure_editing.sql`
atomically after the independent profile, modifier-price extension and public
catalogue extension. It does not change any category/option row during installation.
`deploy/mealdeck/menu-structure.mjs` provides the complete SQL and a strictly
validated runner-owned transaction variant.

Run `node tests/postgres/menu-structure-behavior.mjs` for the disposable PostgreSQL
behavior suite. It checks rollback/idempotent installation, execution/table ACLs,
global and tenant/brand/group boundaries, stale changes, category publication,
public labels, option repricing, preservation of paid snapshots and audit failure
rollback. It also disables and restores all options in a required group, proving
that missing, stale and inactive selections cannot create an order or KDS ticket.
CI runs the same suite with both embedded PostgreSQL and native PostgreSQL 17.
These checks make no hosted requests or real provider payments.

### Hosted installation — 6 November 2026

The dedicated MealDeck project accepted the complete modifier-price prerequisite
and category/add-on extension as separate atomic transactions. The first structure
attempt correctly rolled back because the earlier price-editing extension was not
yet installed. After installing that missing prerequisite, the unchanged structure
migration succeeded. No historical foundation installer was rerun.

Read-only verification confirmed all three new RPCs have an empty `search_path`,
are security definers, and allow execution only to authenticated callers among
the API roles. Their own verified-staff/global-menu permission checks remain
required. Digests of all existing category and modifier-option rows matched before
and after installation; the database still contained zero orders.

| Migration | SHA-256 |
| --- | --- |
| `20261105071120_mealdeck_ops_modifier_prices.sql` | `1e70e09e307b9fd65fc9e2cedcee48e78c833854deead3a0e5d36ee49e58fa2f` |
| `20261106113333_mealdeck_menu_structure_editing.sql` | `5089f3e7341d251a74c05d099ccb2ddc3d1b989307837b3c684bed87936b58fb` |

This verifies installation and permissions. Authenticated browser acceptance and
the requested real paid test order must be recorded separately from schema checks.
