# Phase 46 — one shared MealDeck kitchen board

## Product decision

The current operation is **one kitchen preparing multiple brands**. The staff interface therefore shows **one card per master order with every brand's purchased items together**. Preparation and packing happen on that same screen. There are no separate brand, station or pass tabs to switch between.

The dedicated staff entry is `/kds`; the existing `/ops` console links to exactly the same Kitchen display component. These are two entry points to one workspace, not two operational displays. The consumer menu and basket do not contain this workspace.

When the business adds kitchens, each screen can select its own explicitly authorised canonical tenant/location pair. One kitchen's screen never combines records from another location. Station routing and ticket records remain in Dishbee so station-specific displays can be added later without replacing the underlying order data. The current release does not expose a station-screen mode or split a customer order across kitchens.

## Reference inspection

Read-only source review on 4 November 2026:

| Reference                     | Pinned source                                                                                           | Findings used                                                                                                  |
| ----------------------------- | ------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| Café1 St Albans               | `asaffilate01-ship-it/cafe1-connect-dash` at `1aad3af52a41f779c3c1c735f18f29572d36a56c`                 | Touch-friendly tickets, elapsed time, prominent notes/modifiers, retained stale board and clear connectivity   |
| Café1 Luton                   | `asaffilate01-ship-it/cafe-1-luton` at `8ad54d5ea181b387b4c8c75f59ffc7cc2e89a670`                       | Branch-scoped staff context, polling fallback, explicit preparation controls, admin menu/recipe/stock patterns |
| Dishbee canonical runtime     | `asaffilate01-ship-it/dishbee-helper` main at `4a267048b485aa7e8eef91e7341e86ae8e74ab7f`                | Actual orders, order items, kitchen stations/routes, tickets, ticket items and MealDeck pass records           |
| Dishbee payment evidence work | `feature/dishbee-mealdeck-hive-payment-evidence-20261103` at `f88d3cc6f5c2a62d955f1a5ca615151e4291f22c` | `docs/HIVE_ADYEN_EVIDENCE_GUARD_PHASE7.md` records outstanding capture, retry, group and refund acceptance     |

Relevant Café1 files are `src/routes/kds.tsx`, `src/lib/kds.functions.ts`, `src/lib/orders.functions.ts`, `src/lib/staff-site-access.server.ts`, `src/routes/admin.menu.tsx` and inventory modules. Their separate counter/house-tab, SumUp, vouchers and merchant controls are not MealDeck payment authority.

The Café1 KDS status writer inspected calls a direct order-table update, although a stricter transition RPC exists in its migrations. Station routing can also be inferred from dish names. Those patterns were not copied into MealDeck. No Café1 source, production data or settings were changed.

Public HTTP checks proved that the Café1 sites and their authenticated shells exist. They do not prove a signed-in production kitchen workflow was operationally tested.

## What is implemented

- Shared, authenticated staff shell for `/ops` and `/kds`, with no public checkout navigation on the kitchen screen. Both routes are noindex/noarchive and use the existing staff Auth client.
- Compact one-kitchen heading. Business/kitchen selectors appear only when the authenticated account has multiple choices. On small screens the wider operations navigation becomes a native select.
- One card for the whole order: handoff/display code, elapsed kitchen time, fulfilment, quantities, brand groups, modifier names, item instructions, order notes and supplied group participant names.
- Each purchased line appears once even if Dishbee routes it through multiple preparation stations. Distinct order lines and customised variants stay distinct.
- One next action for the entire order: **Start order → Ready to pack → Start packing → Seal order**. Sealing has a short inline check that every item and drink is packed. There is no mark-paid, refund, release, courier-booking or delivered button.
- Scoped search and stage filter, automatic refresh, visibility/resume refresh and explicit connection state. The board remains readable on transient failure, but order changes pause until a fresh response is confirmed. Revoked access removes the private board and notices.
- Mutations use one atomic server call for the whole master order. They do not fan out into independent browser updates for each brand. Double-clicks, stale versions, different kitchens and disallowed transitions are rejected or safely replayed without a duplicate audit.
- Kitchen actions end at **sealed, awaiting handoff**. Dishbee's separate accepted dispatch/handoff process retains ownership of booking, fulfilment and delivery.

## Database integration

Migration: `supabase/migrations/20261104210005_mealdeck_ops_kds_workspace.sql`, generated with `supabase migration new` (CLI 3.0.0). Apply only after the approved canonical Dishbee schema and the existing MealDeck operations core; this is not an empty-database installation.

It adds three staff endpoints:

| Endpoint                                                                                     | Purpose                                                                                  |
| -------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| `mealdeck_ops_kds_board(p_tenant,p_location)`                                                | Authorised, minimal kitchen projection with complete purchased items and readiness state |
| `mealdeck_ops_kds_transition_order(p_tenant,p_location,p_order,p_expected_version,p_status)` | Atomically start/complete preparation across all canonical tickets for one master order  |
| `mealdeck_ops_kds_transition_pass(p_tenant,p_location,p_order,p_expected_version,p_status)`  | Pack or seal the same order after all required preparation is complete                   |

Every endpoint verifies `auth.uid()`, effective MealDeck operations permissions and the exact active tenant/location pair. Private helpers are not executable by browser roles. No direct table privileges are granted. The existing canonical table RLS, broad Dishbee endpoints and payment/release functions are not replaced.

Writes lock the master order and child preparation state, compare the current version and record the actor/action in the existing operations audit in the same transaction. Versions cover purchased lines, quantities, notes/modifiers, routing and pass state; they are concurrency tokens, not payment signatures. A missing route, empty ticket, wrong quantity, foreign item/station, inactive station or incomplete group blocks progress.

Food instructions are never silently truncated. Notes up to 20,000 characters and names/labels up to 1,000 characters are preserved; malformed or excessive instructions pause the board and writes for operations review.

The projection deliberately excludes customer contact/address fields, amounts, card/provider credentials and raw payment evidence. Free-text preparation notes still require the existing operational privacy/retention policy.

### Required canonical release authority

**The new screen is not a payment implementation.** The inspected Dishbee code does not yet provide the accepted immutable capture/release evidence needed to claim live paid-order eligibility. A legacy `paid_at`/status flag alone is insufficient.

The migration fails closed until the approved Dishbee owner implements the private, read-only `dishbee_private.mealdeck_kds_release_authority(uuid)` adapter over actual immutable payment/release evidence. The migration documents the exact JSON contract. The adapter must verify the canonical order/tenant/location/source, release identity, refunds/revocation and all required group shares, and must not infer authority from client fields, this UI or a test fixture.

Missing authority produces **Kitchen connection needs setup**, not a misleading empty live board. Malformed, denied, mismatched or revoked order evidence never admits a ticket. Every read and mutation rechecks the authority.

**Do not deploy the deliberately synthetic adapter in `tests/postgres` to a hosted project.** Its only purpose is to test this consumer against controlled evidence in a disposable database.

## Validation and deployment status

Local verification on 4 November: **541 Bun tests passed**, strict TypeScript and changed-file ESLint passed, and the production build emitted the `/kds` client route and server bundle. The actual embedded PostgreSQL suite passed **28/28 behavioural groups**. Native PostgreSQL 17 CI adds six two-session race checks and must pass before merge. Browser checks use synthetic data, never production orders.

Validation scripts:

```sh
bun test tests/mealdeck-kds*.test.ts
bunx tsc --noEmit
bun run build
npm ci --prefix tests/postgres
npm test --prefix tests/postgres
```

The SQL suite executes the actual operations-core and KDS migrations, not string-only SQL assertions. It uses a minimal source-derived canonical fixture and synthetic staff/orders. The local embedded engine is PostgreSQL 18.6 via pinned PGlite 0.5.15; that does not establish native multi-session behaviour or compatibility with the hosted PostgreSQL 17 project.

The dedicated GitHub Actions job uses a disposable **PostgreSQL 17.6** service, runs the same behavioural suite plus real two-session concurrency checks:

```sh
MEALDECK_KDS_TEST_DATABASE_URL=postgresql://postgres:LOCAL_TEST_PASSWORD@127.0.0.1:5432/mealdeck_kds_test \
  npm run test:postgres --prefix tests/postgres
```

The native runner refuses non-local hosts, URL query overrides, database names outside `mealdeck_kds_test*` and nonempty databases. It never resets an existing schema. Test-only dependencies and their lockfile are isolated under `tests/postgres`; application dependencies are unchanged.

Browser validation uses the real React/Supabase client with a local synthetic staff session and intercepted local test responses. No customer orders, staff accounts or emails are created. It checks the single-card flow, stale/offline handling, revoked access, read-only roles, kitchen switching, touch widths and keyboard focus. These checks do not claim a live provider or production Auth acceptance.

### Live blockers observed on 4 November 2026

1. The connected Dishbee project is identifiable, but read-only database inspection returns PostgreSQL `28P01` password authentication failure. No hosted migration or schema write was attempted.
2. The public MealDeck operations shell reports missing approved staff Supabase configuration. Deployment needs `VITE_MEALDECK_OPS_SUPABASE_URL` and the public `VITE_MEALDECK_OPS_SUPABASE_ANON_KEY`, with the correct tenant/location staff assignments. A service-role key must never be placed in these variables.
3. The accepted canonical immutable release authority described above remains a separate backend prerequisite. Its capture/group/refund/replay acceptance cannot be substituted with a UI flag.
4. Repository merge/branch synchronisation does not itself prove Lovable publication. Confirm the published revision and `/kds` after publishing the connected branch.

`COMING_SOON=true` and the independent checkout integration release gate remain unchanged. This phase builds and tests the staff workspace; it does not activate customer ordering or claim that production KDS is connected.
