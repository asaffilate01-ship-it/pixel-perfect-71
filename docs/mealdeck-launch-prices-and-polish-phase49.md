# MealDeck launch prices and interface finishing — 5 November 2026

## Owner-approved prices

The owner requested £20 for every item in the five launch menus, then explicitly extended that instruction to every upgrade. The starting prices are:

- Every standalone item, including sides, cans and mocktails: **2000 pence**.
- Every selected optional add-on, Make it a Meal choice or upgrade: **2000 pence per parent unit**.
- A named Load’d or Moktl meal replacement: **2000 pence per parent unit**, replacing the corresponding generic upgrade charge.
- A separately added Load’d or Moktl product: its standalone catalogue price for each parent unit.
- Required flavour, portion and included base choices: included in the item's price. They are choices within the dish, rather than additional products.

All 77 standalone products use the same approved initial price. Integer-pence calculations multiply both the main item and its additions by quantity. Saved browser amounts are never trusted; the displayed subtotal is rebuilt from catalogue identifiers. Delivery is not an assumed zero or a fixed client-selected fee.

Examples: a £20 burger with a £20 meal, a £20 Load’d upgrade and a £20 Moktl upgrade has an **£80 items subtotal**. Two of that configuration have a **£160 items subtotal**. Adding one £20 rasher add-on to each makes **£200**. Selecting a named replacement must not retain a second generic charge for the same upgrade.

## Public menu and basket

Menu rows, cross-brand recommendations, item customisation and the basket display the same approved prices. Included choices and chargeable additions are labelled separately. The basket and review show item amounts, selected additions and an items subtotal; they do not claim that an order was accepted or payment was collected.

Basket confirmations remain visible above the mobile navigation or desktop basket dock. View basket, Undo and dismiss actions have reachable controls. Storage failures keep this visit's choices and explain that saving has failed, with an explicit retry. Removing a row moves focus to a remaining row or the empty-basket heading. Repeated Load’d names now include their menu section so Loaded Fries and The Full House can be distinguished.

## Staff and tracking finishing

Staff access and kitchen loading distinguish a pending request, a failed connection and a successful empty response. Recovery buttons retry the correct lookup; late responses cannot restore a previous business or signed-out state.

The menu editor focuses the selected product's heading and brings it into view. Choosing the same item again preserves unsaved fields. Controls announce the product and brand. Staff copy describes the workflow without implying that a particular payment provider is already integrated.

Customer tracking uses the solid MealDeck red action, clear keyboard focus and 16px entry fields with practical touch heights. Existing evidence-driven progress and elapsed time behavior is unchanged.

## Admin pricing and deployment boundary

The separate catalogue import is generated from the same launch catalogue. It is intended for an already installed and bootstrapped **independent MealDeck database**. Initial records are drafts. Rerunning the import preserves later administrator edits rather than resetting every price to £20. See [the catalogue import guide](mealdeck-launch-catalogue-import.md) for the exact preconditions and verification commands.

The existing protected menu administration can edit a canonical product's base price. Location-specific overrides can take precedence. The current launch menu still uses the source catalogue: a canonical public catalogue RPC and stable product/modifier mapping must be installed and connected before admin price edits can update the public menu. Do not describe that synchronization as live.

The new **Add-ons & upgrade prices** panel lets staff with a business-wide menu role search shared options, filter by group and edit their integer-pence prices. It shows each option's draft/active state and how many menu items use its group. Saving a price preserves availability and records an audit entry. If another editor has changed the price, the panel retains the attempted entry and requires reviewing the latest saved value before trying again. The separate guarded post-install extension provides these two RPCs without changing the frozen foundation installer or activating ordering.

## Stripe and activation status

The owner requested backend and checkout activation. The connected branch includes the existing Stripe **test** publishable configuration and notes recording test-account/webhook provisioning. A publishable key is not a server-side checkout implementation.

A subsequent connected-branch update also supplied a different **live-mode publishable key** for production and basket/checkout logo branding. Those commits are preserved. Neither public key is consumed by the application payment flow, and the new configuration does not establish live account readiness. The owner has also limited the launch to Luton; St Albans and Bedford remain coming soon.

At this review, the application has no Stripe Checkout Session creator, payment component or authenticated Stripe webhook reconciliation. The existing pending-order pathway also requires an independent, idempotent checkout RPC and verified payment-to-kitchen release adapter. The standalone foundation deliberately does not fabricate those authorities.

The owner confirmed that MealDeck belongs to a **separate Lovable account**. The currently connected Lovable account returns `404 project_not_found` for the recorded MealDeck project, and the Supabase connection exposes Dishbee rather than MealDeck. No hosted schema, account, catalogue, payment or permission change was attempted against another project.

Completing activation therefore requires access to the owning MealDeck account, followed by verified installation and owner setup, canonical catalogue publication, the actual Stripe payment adapter and reconciliation, and customer-to-kitchen acceptance. Until then, the site remains browse-only and the checkout/release switches remain closed. This is an access and implementation limitation, not a request for another price approval.

## Verification

The accompanying pricing tests cover quantity multiplication, included choices, separate extras, meal replacements, duplicate generic upgrades, malformed prices and forged saved amounts. The database import has its own transaction and rerun checks. Responsive and keyboard browser checks exercise the real interface with isolated local fixtures; these are not hosted payment or staff acceptance tests.

Final local application verification, including the subsequent Luton-only policy, passed **628 tests with 5,218 assertions**, TypeScript validation, focused lint and the production build. Browser checks covered all five menus at 320px, 390px, 768px and 1440px, with no horizontal overflow. They also verified the £200 two-burger configuration above, cross-brand basket continuity, empty/undo, removal focus, storage failure/retry and persistence after recovery. The modifier editor was exercised with isolated backend fixtures, including £20 → £17.50, a concurrent £18 edit, retry, deliberate zero pricing and narrow layouts. These fixtures performed no hosted writes.

The combined catalogue and modifier extension suite passed **31 database behavior groups** on embedded PostgreSQL 18.6. PostgreSQL 17 CI also passed its **34 groups**, including three independent-session locking and permission-revocation checks. Both the original and managed standalone installers retain their reviewed sizes and hashes; the catalogue and price administration extension are separate installation steps.

The Luton-only policy is enforced at customer catalogue, serviceability, quote and final-order boundaries. Opening the global ordering switch or adding valid future location settings cannot admit St Albans or Bedford. The public pages, navigation and structured data distinguish their future launches. A separate regression verifies that the marketing alias for Skorch remains among all five launch brands. The latest Lovable basket logos are preserved, with a scoped 42px mobile logo to keep space for the basket contents.
