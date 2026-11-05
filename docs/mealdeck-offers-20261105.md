# MealDeck November offers — publication and activation

Owner decision: 5 November 2026. These are the only three advertised consumer promotions.

| Offer                 | Confirmed terms                                                                                                                                                                     |
| --------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Opening weekend       | 30% off the entire menu, Friday 6 through Sunday 8 November 2026. Existing no-minimum, guest/member, Luton collection and kerbside terms remain.                                    |
| Sunday milk cake      | Milk cake for 99p with every order on Sunday 8 November 2026. No flavour, size, quantity cap or further minimum has been supplied.                                                  |
| Double loyalty points | Register and spend £15 or more by and including Friday 13 November 2026 for 2× loyalty points. Marketing opt-ins are separate and optional. No base earning rate has been supplied. |

All campaign dates are Europe/London. Opening hours remain Friday 6 November 15:00–23:00; Saturday 7 and Sunday 8 November 13:00–23:00. The double-points campaign's exclusive end is Saturday 14 November 00:00; that deadline does not establish kitchen hours or permit checkout when the kitchen is unavailable.

## Source implemented

`src/lib/mealdeck-offers.ts` is the shared public campaign catalogue. `/offers`, the homepage cards and the offer-explainer blog use the same three records. Header, footer, menu and opening-offer links expose the page. Retired sample discounts and invented loyalty streak/group bonuses have been removed from current public copy. Historical non-routed UI archives remain historical files.

The module also records the 99p price and double-points threshold/deadline/multiplier as inactive setup data. It is not imported by checkout pricing or a points issuer. Publishing it cannot change a pending or paid order, activate payments, mint a reward, or alter a customer's stored points. Account rendering still follows the server's real `loyalty.enabled` value.

## Existing 30% path

The 30% campaign already has its shared server/database quotation path. This update preserves that path, the confirmed daily windows, guest/member separation, kitchen Online/Busy/Pause/Closed controls, payment readiness and verified payment reconciliation. Existing paid receipts retain their historical prices.

## Manager setup needed: Sunday milk cake

1. Supply the canonical MealDeck milk-cake product and approve its menu/catalogue mapping. It is absent from both `src/lib/launch-menu-catalogue.ts` and `deploy/mealdeck/catalogue/launch-catalogue.json` in this source snapshot. Do not invent a flavour, serving size or brand assignment.
2. Confirm how the stated 99p price interacts with the simultaneous 30% entire-menu offer. No stacking rule, exclusion or quantity cap has been assumed in source or public terms.
3. Implement server-priced, date- and kitchen-scoped eligibility for the product through the existing quotation/Stripe/packing/KDS flow. Browser prices and a generic promotional card cannot establish a charge.
4. Verify the price shown in order review, immutable payment snapshot, customer receipt, KDS and printer receipt. Test guest and member orders, outside-Sunday requests, retries, and existing paid-order preservation before enabling the rule.

`MILK_CAKE_CAMPAIGN.canonicalItemId` remains null and `automaticPricingEnabled` remains false. No purchasable placeholder product was added.

## Manager setup needed: double points

1. Publish the base earning and redemption rules. Confirm whether the £15 threshold refers to an individual purchase or accumulated spend, and whether it is measured before or after discounts. These details are not inferred from the brief.
2. Implement an authenticated member-only, idempotent award linked to verified paid-order evidence, with appropriate cancellation/refund adjustments and the inclusive Friday deadline. Guest contact details or a matching email must never create membership or award points.
3. Apply the 2× multiplier only to the approved base earning calculation. Keep marketing consent, app installation, push permission and game results independent from eligibility.
4. Verify the member's ledger and account balance using actual issued points before claiming automatic crediting. Do not flip the existing loyalty readiness flag solely to support promotional copy.

`DOUBLE_POINTS_CAMPAIGN` records a 1,500-pence threshold, multiplier 2 and the deadline. The base rate and spend basis remain null; `automaticAwardsEnabled` remains false. No database migration or loyalty ledger write is included in this update.
