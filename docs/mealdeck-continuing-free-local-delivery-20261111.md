# MealDeck Luton — continuing free own-driver delivery

**11 November 2026. Owner-confirmed operating rule, release gate.**

## Pricing

Direct MealDeck Luton delivery stays **free (£0)** for eligible orders with **£15 or more of payable food after discounts**, within **4 km straight-line postcode coverage of LU4 8NU**, when the checkout backend says kitchen/own-driver delivery is available. Pickup and kerbside remain available without a delivery minimum. The Uber Eats store is a separate marketplace channel and its fees are not governed by MealDeck's direct-delivery rule.

There is **no automatic 1 December 2026 change** to a £10 minimum plus quoted courier fee. A different fee model would require an explicit new commercial decision, server-authorised pricing and payment integration, a signed booking/quote process and its own separate activation. A future-dated code or database trigger is not an approved way to silently change the terms.

## What was wrong

- `src/lib/mealdeck-delivery-pricing-policy.ts` automatically changed to `quoted_delivery` on 1 December 2026 and reduced the food minimum to £10.
- `src/components/launch-checkout.tsx` would disable delivery checkout and announce a live courier quote that was not actually connected.
- The independent MealDeck production database has a **future-dated trigger** named `mealdeck_december_paid_quote_gate` on `public.orders`. It would reject new Luton direct delivery after 1 December, regardless of existing validated free-delivery quotations. The trigger was still installed and its source hash was observed as `b30716663152ef181423c903058d28e3` on 11 November.
- Public delivery terms, member banners and the customer-facing footer all described ongoing free delivery, conflicting with that future code and trigger.

## Source correction

- The browser helper now returns `own_driver_free` at a £15 food minimum for dates from the November launch onward; it never switches simply because of the calendar. Quoted courier pricing remains a *deliberate future integration mode*, not a default.
- The checkout no longer blocks delivery or displays the unapproved December pricing copy, but still requires live server fulfilment availability, verified address/postcode and at least £15 after discounts.
- The existing independent own-driver backend retains all radius checks, server-priced quote, signed payment, idempotent fulfilment and staff delivery-authorisation gates. No user-supplied amount or location grants delivery permission.

## Database correction and installation gate

The additive, **one-time** migration
`deploy/mealdeck/post-install-migrations/20261111070000_mealdeck_keep_free_own_driver_delivery.sql`
requires a precise independent MealDeck installation profile, a real `public.orders` table, the existing `local_driver_quotes` backend and the *exact installed function hash and trigger definition* before it drops **only** `mealdeck_december_paid_quote_gate`.

The historical private trigger function is intentionally retained, revoked and disconnected. No other order trigger, RLS policy, payment ledger, receipt, user record or dispatch instruction is removed.

**Before applying to production:** run the targeted delivery-pricing and hosted-checkout tests, all delivery verification workflow checks, full application build/TypeScript and the main MealDeck suite; repeat the profile/trigger/function-hash preflight; confirm no independent backend drift. Apply SQL as one atomic transaction and verify the named trigger alone is gone, no changes to live payment records, the remaining delivery/payment triggers and checkout readiness. Check that a £14.99 discounted order fails, £15 passes *only* with a permitted postcode and enabled backend, and collection still works.

No real payment/order must be initiated by CI or by this migration. If a physical driver is not approved/on shift, checkout may still correctly pause delivery for operational reasons. The source code and tests cannot promise driver capacity.

## Regression acceptance

- 30 November, 1 December, January and British Summer Time dates all retain £0 delivery / £15 discounted-food minimum.
- Alternative `quoted_delivery` pricing is never automatically selected, cannot use an expired/unserviceable quote, and requires future server-authorised enablement.
- Customer-facing delivery choices never show a £10 December quote warning or accept a forged discount-based amount.
- Source migration drops only the verified future-cutover trigger. All real order and charge rows stay untouched.
- Verify the public website only *after* the Lovable-connected branch is synchronised and the publish request succeeds; verify on a real UK mobile, a qualifying postcode and an excluded postcode.
