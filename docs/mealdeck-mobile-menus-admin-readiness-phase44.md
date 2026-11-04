# Phases 44–45 — mobile menu navigation, basket controls and admin readiness

## Mobile findings and repair — 4 November 2026

Touch-enabled production checks against commit `d760da4` found:

- `/menu` returned 404 while `/menus` worked.
- Directly opening the Moktl menu left the selected brand outside the phone's horizontal rail.
- At a 390 × 844 viewport, the first dish began below the initial screen. Large repeated status/header areas and two horizontal control rails made the food difficult to reach.
- Search used a 14px input, unsuitable for a phone control that should avoid focus zoom.

The item customiser itself accepted touch input and scrolling at 390 × 844 and 320 × 568. Its fixed action footer and modal scroll lock worked, so this phase preserves that flow.

The repair redirects `/menu` to `/menus`, retaining only menu brand/section choices. A shared route check handles trailing slashes consistently. Menu routes use their inline ordering status instead of the repeated global banner. On screens up to 800px, all five brand tiles are visible, a compact header leaves more room for dishes, and sticky native brand/section selectors provide navigation without horizontal scrolling. Search opens on demand with 16px input text. The header dropdown scrolls within the available screen, and the basket dock is hidden while the navigation dropdown or search keyboard is in use. Short landscape screens release sticky controls to leave room for the menu.

No menu recipes, prices, availability or payment/dispatch gates change in this phase.

## Phase 45 — empty basket with Undo

Populated baskets offer an **Empty basket** action above the items. It clears the complete saved selection, including attached cross-brand choices, and persists the empty result. The empty state offers **Undo**, which restores the exact previous selections, quantities and upgrades in the current session. Starting a new basket invalidates the old Undo snapshot so it cannot overwrite newer choices. Reloading retains the cleared basket. Focus moves between the clear and Undo controls in the basket the customer used.

## Admin status verified during this work

The public `/ops` route is deployed, but the live page reported that staff operations is not configured. No staff login, database write or migration was attempted.

| Area                 | Present in MealDeck source                                                                               | Remaining work                                                                                                     |
| -------------------- | -------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| Menu administration  | Create inactive product drafts; edit name, description, price and active state; location-level show/hide | Configure the approved backend; complete modifiers, dish-level review and publication                              |
| Recipes              | Ingredients, quantities, yield, preparation instructions/time, waste and versioned saves                 | Verify authorised database access and operational acceptance                                                       |
| Stock and purchasing | Ingredients, ingredient allergens, stock movements, supplier costs, POs, approvals, receipts and batches | Apply/verify the documented migration chain in approved staging                                                    |
| Finance and staff    | Order history, analytics, costs, supplier invoices/credits, scoped roles and audit                       | Verify real access and data; staff Auth account provisioning remains separate                                      |
| KDS                  | Paid-only planning and integration contracts                                                             | MealDeck has no working KDS board or station/pass controls; verify and connect Dishbee's existing KDS capabilities |

The five public launch menus still come from `src/lib/launch-menu-catalogue.ts`. Operational `/ops` menu edits target canonical Dishbee records and do not yet publish into this launch-preview catalogue. The next backend phase should connect and verify the existing Dishbee authority, then map the approved launch products and modifiers into a reviewed publishing flow. It must not create a parallel menu/order authority or enable checkout before the existing approvals.

Sources: `src/routes/ops.tsx`, `src/components/ops/ops-panels.tsx`, `src/lib/mealdeck-ops-browser.ts`, `docs/MEALDECK_OPERATIONS_BACKEND_PHASE7.md` and `docs/mealdeck-kds-outbox-phase15.md`.
