# MealDeck November offers — publication and activation

Owner decision: 5 November 2026; double-points dates updated 6 November and Sunday milkcake pricing clarified 8 November 2026. These are the only three advertised consumer promotions.

| Offer                 | Confirmed terms                                                                                                                                                                               |
| --------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Opening weekend       | 30% off the entire menu, Friday 6 through Sunday 8 November 2026. Existing no-minimum, guest/member, Luton collection and kerbside terms remain.                                              |
| Sunday milk cake      | One Biscoff or Oreo milkcake per order is 99p after the 30% discount on Sunday 8 November 2026, 15:00–23:00 UK time. Additional milkcakes are £3.99 each before the ordinary 30% discount.    |
| Double loyalty points | Register and spend £15 or more from Monday 9 to Friday 13 November 2026 inclusive for 2× loyalty points. Marketing opt-ins are separate and optional. No base earning rate has been supplied. |

All campaign dates are Europe/London. Confirmed opening hours are Friday 6 and Saturday 7 November 15:00–midnight, and Sunday 8 November 15:00–23:00. The double-points campaign begins Monday 9 November 00:00 and ends exclusively Saturday 14 November 00:00, covering Monday 9 through Friday 13 November 2026 inclusive. These dates do not permit checkout when the kitchen is unavailable.

## Source implemented

`src/lib/mealdeck-offers.ts` is the shared public campaign catalogue. `/offers`, the homepage cards and the offer-explainer blog use the same three records. Header, footer, menu and opening-offer links expose the page. Retired sample discounts and invented loyalty streak/group bonuses have been removed from current public copy. Historical non-routed UI archives remain historical files.

The module records the owner-approved campaign details. Public copy is not pricing authority: the independent database owns timed milkcake pricing and the ordinary checkout discount. Publishing text cannot change a prepared or paid order, activate payments, mint a reward, or alter a customer's stored points. The double-points setup remains incomplete, and account rendering follows the server's real `loyalty.enabled` value.

## Existing 30% path

The 30% campaign already has its shared server/database quotation path. This update preserves that path, the confirmed daily windows, guest/member separation, kitchen Online/Busy/Pause/Closed controls, payment readiness and verified payment reconciliation. Existing paid receipts retain their historical prices.

## Sunday milkcake pricing — clarified 8 November

The owner confirmed **99p as the final amount after the 30% discount**, with only **99p · T&Cs apply** on customer displays. The terms explain that the displayed price already includes the discount. The 99p offer applies to one milkcake per entire order, across every brand and flavour. No second reduction is applied to that unit. Additional milkcakes cost £3.99 each before the ordinary 30% discount, which still applies to other eligible items.

The existing Biscoff and Oreo products across all five launch menus are the exact eligible identities. Their normal £3.99 catalogue records and current stock remain authoritative outside the Sunday promotion. The owner specified the one-per-order 99p cap. No serving size, recipe, allergen declaration or extra minimum has been added.

The timed database rule, public menu metadata, checkout presentation, monetary tests and installation/publication evidence are documented in [the Sunday rollout record](mealdeck-milkcake-99p-20261108.md). That record distinguishes source readiness from actual live installation.

## Manager setup needed: double points

1. Publish the base earning and redemption rules. Confirm whether the £15 threshold refers to an individual purchase or accumulated spend, and whether it is measured before or after discounts. These details are not inferred from the brief.
2. Implement an authenticated member-only, idempotent award linked to verified paid-order evidence, with appropriate cancellation/refund adjustments and the Monday 9 November start and inclusive Friday 13 November deadline. Guest contact details or a matching email must never create membership or award points.
3. Apply the 2× multiplier only to the approved base earning calculation. Keep marketing consent, app installation, push permission and game results independent from eligibility.
4. Verify the member's ledger and account balance using actual issued points before claiming automatic crediting. Do not flip the existing loyalty readiness flag solely to support promotional copy.

`DOUBLE_POINTS_CAMPAIGN` records a 1,500-pence threshold, multiplier 2 and the Monday 9–Friday 13 November 2026 inclusive date window. The base rate and spend basis remain null; `automaticAwardsEnabled` remains false. No database migration or loyalty ledger write is included in this update.
