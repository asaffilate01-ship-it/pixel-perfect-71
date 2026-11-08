# Sunday milkcake offer — 8 November 2026

## Owner decision

During Sunday 8 November 2026, **15:00–23:00 Europe/London**, one milkcake per order costs **99p after the 30% opening discount**. This is one allowance across the entire checkout, including both flavours and all five brands. Any additional milkcakes on the same checkout are **£3.99 each before the ordinary 30% discount**.

The customer headline is **99p · T&Cs apply**. The terms state the one-per-order limit, that the 99p already includes the 30% discount, and the £3.99 before-discount price of additional milkcakes. The owner's initial £1.29 calculation would give approximately 90p after 30%; it is not used or advertised. The explicit 99p final requirement governs.

Eligible products are the existing Biscoff and Oreo milkcake SKUs under `loadd`, `moktl`, `skorch-burgers`, `souvano` and `tavo-chicken`. The rule does not create new products, require registration, introduce another purchase or minimum spend, change stock, or open the kitchen.

## Exact money and the single allowance

Canonical catalogue and frozen line amounts retain the normal 399p unit amount and ordinary `unit × quantity` arithmetic. The server selects one eligible unit once across the complete selection. Its line receives a frozen promotion marker containing the exact eligible quantity and 300p promotional adjustment. Other milkcake lines remain ordinary items.

For an eligible basket with raw subtotal `G`:

```
single milkcake adjustment = 300p
ordinary opening discount = round((G - 399p) × 30%)
total = G - 300p - ordinary opening discount
```

The existing whole-basket rounding rule is preserved for all other eligible units. The 99p promoted unit is not discounted again.

| Basket, before any separate fees      | Final total |
| ------------------------------------- | ----------: |
| One milkcake                          |       £0.99 |
| Two milkcakes                         |       £3.78 |
| Three milkcakes                       |       £6.58 |
| One milkcake + £10.00 ordinary items  |       £7.99 |
| Two milkcakes + £10.00 ordinary items |      £10.78 |

The three-cake total reflects one whole-basket discount on the two ordinary £3.99 cakes; additional cake units are not independently rounded and then summed. Mixed flavours, brands, separate lines and quantities within one line share the same single allowance.

Public menu rows retain their ordinary price plus validated offer metadata. Customer presentation may show the one promoted unit at 99p and the remaining units at £3.99 before the ordinary discount. Quote presentation subtracts the frozen 300p adjustment from the displayed subtotal and from the remaining discount line together, so the displayed total stays identical to the canonical quote.

For an existing pay-by-bag path, the one promoted unit belongs to the lowest-numbered bag containing quantity from the selected line. That bag retains the fixed 99p while the ordinary discount is allocated across other eligible amounts. Equal splits retain their existing meaning. This does not enable group ordering earlier than its existing availability rules.

## Installation and boundaries

The reviewed additive operation is `deploy/mealdeck/operations/20261108_milkcake_99p_offer.sql`, exposed by `deploy/mealdeck/milkcake-offer.mjs`. It must run atomically only against the independent MealDeck database after its installation identity and original function definitions have been verified. It preserves normal menu records, current kitchen settings, existing authentication/permissions and current stock checks.

The clock window is inclusive at 15:00 and exclusive at 23:00. The database decides eligibility; cached browser amounts cannot grant the offer. After expiry, normal prices apply to new quotes. Existing prepared payment attempts retain their original frozen amounts and recovery identity. Existing paid orders, receipts and print evidence are not rewritten.

## Verification and rollout record

Before changes, read-only checks confirmed the independent MealDeck installation, ten active Biscoff/Oreo milkcake products at 399p, and the Luton kitchen currently Closed. The operation must preserve that kitchen setting. The public API also returned 399p without promotion metadata before installation.

The focused PostgreSQL suite is `tests/postgres/milkcake-offer-behavior.mjs`, with both the disposable PGlite runner and native PostgreSQL 17 CI. Frontend/server-boundary checks are in `tests/mealdeck-milkcake-promotion.test.ts`; Stripe parameter tests verify that the provider receives the canonical final amount once. The source workflow also includes existing pricing, packing, checkout, guest, receipt and recovery checks.

Source validation, live database installation, site publication and a real charged customer order are separate outcomes. The final rollout evidence is appended after those operations complete; no real purchase is required merely to verify pricing logic.

### Source verification, 8 November

- TypeScript, the production build and ESLint for all 27 changed code files passed.
- The combined frontend, public-menu, checkout and provider suite passed **156 tests with 3,257 assertions**. The focused milkcake tests include rendered menu, modal, basket and checkout output.
- The disposable PostgreSQL suite passed **all ten integrated checks**, including one allowance across all ten SKUs and duplicate lines; 1/2/3/20-cake totals; guest, member and cash pricing; materialisation and prepared-payment recovery; precise time boundaries; by-bag and equal shares; guarded atomic rerun; and unchanged historical data, base prices, permissions and kitchen controls.
- Existing CI failures inherited from main were corrected narrowly: two navigation assertions now match the existing Ordering navigation label, and six KDS files received formatting-only changes required by their lint gate.
- When those gates passed, the full workflow exposed a missing Python/Pillow setup for existing receipt artwork checks and three stale KDS wording assertions. CI now uses Python 3.12 with Pillow 13.0.0, matching the verified regeneration runtime. The three active-ticket expectations now match the already-approved uppercase flavour/portion presentation; the 23-test KDS view suite and its 213 assertions pass.
- All 80 remaining source test/lint steps were exercised. One stale mobile-navigation label expectation was updated to the existing Order Now accessible label; the remaining 79 steps passed unchanged. The complete 48-test receipt-bridge suite also passed with the pinned Python dependency.

### Live pricing installation, 07:03 UTC

The complete reviewed transaction from source commit `b7e680206b6796e716abb701351ebac0049d2aa9` was installed through the existing MealDeck project database connection after the native PostgreSQL 17 milkcake CI job passed. Readback at 07:03:49 UTC confirmed all four expected financial/public function hashes, with no execute permission for application roles on the new private helpers.

The production helper returned no offer at 14:59:59, the capped 99p offer at exactly 15:00:00 and at 22:59:59, and no offer at exactly 23:00:00. All ten normal cake amounts remain 399p. Kitchen settings, including `checkout_enabled = false`, `availability_state = closed`, 30-minute collection estimate and the original update timestamp, remained identical.

The public menu before opening correctly continues to return ordinary 399p rows without active promotion metadata. A one-time read-only opening check is scheduled for 15:00 Europe/London. Frontend publication is tracked separately below.

### Published site, 07:18 UTC

Source PR [#153](https://github.com/asaffilate01-ship-it/pixel-perfect-71/pull/153) was merged to main as `70632f8fa8fb459e710361f7a49393ac575c25a6` after the full source verification job passed. Both source verify runs subsequently passed. Publication PR [#154](https://github.com/asaffilate01-ship-it/pixel-perfect-71/pull/154) merged the reviewed tree into the existing connected hosting branch as `bededd5127ab21d4fc9a70b755b0ca4f99e2246c`, preserving both histories and the hosting-specific environment, signup and schema changes. The merged production build passed.

The existing hosting project reported that exact commit ready before deployment `41e99557-ec76-4593-b970-73a6e15245f6` was requested. Production HTTP responses and a refreshed browser view at [mealdeck.co.uk/offers](https://mealdeck.co.uk/offers) subsequently showed the new 99p headline, T&Cs apply, the included 30% discount, one-per-order limit across both flavours/all brands, extra milkcakes at £3.99 before the ordinary 30%, and Sunday's 3pm–11pm hours. No £1.29 amount is advertised.

The pricing rule is installed and the customer site is published ahead of the offer window. Actual active-window menu metadata will be checked at opening by the scheduled read-only check. No live customer order or payment was created for this verification, and kitchen opening remains an ordinary staff action.
