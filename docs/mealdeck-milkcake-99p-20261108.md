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
