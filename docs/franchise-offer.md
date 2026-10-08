# MealDeck turnkey operator-franchise offer

Public offer version: **2026-10-08-poa**. Underlying territory-fee revision: **2026-10-06-r2**. Public route: `/franchise`.

This is an **internal commercial and implementation brief** in the private repository. It is not a public brochure, a signed franchise agreement or an active billing configuration. Do not import its numeric commercial schedule into client code, serve it from `public/`, or include it in anonymous API responses.

## Public presentation

The website displays one headline range:

**All-inclusive franchise launch package: £18,750–£27,500, depending on location and territory. VAT is additional where applicable.**

The range covers the agreed franchise entry and territory package, kitchen equipment, specified KDS/printer hardware, opening supplies and branded packaging, and the agreed launch setup. A written proposal itemises the package. “All-inclusive” describes this agreed franchise launch package; it does not include the operator's rent, wages, utilities, ongoing supplies, working capital or separately agreed works outside the launch schedule.

All ongoing MealDeck charges are **POA — price on application**. Public copy explains what the monthly support package provides, without publishing any percentage, monthly amount, per-order rate, supply markup or individual territory price. The upfront components below are also private; the website shows only the overall from-to range.

The public route, FAQs, territory search/cards, enquiry summary, acknowledgements, shared browser configuration and anonymous API must follow the same rule. The optional investment-budget field is the applicant's own input, not another published franchise price.

## Turnkey offer and operator responsibilities

MealDeck provides the shared brand portfolio, menus and operating guidance; location and territory assessment; onboarding and launch coordination; the agreed kitchen equipment, opening stock and packaging; technology and hardware setup; training; food-safety systems and compliance support; ongoing franchise support; supply arrangements; local and national marketing; and the agreed accounts and administration services.

Kitchens operate from approved commercial dark-kitchen premises. Preserve the existing premises arrangement: MealDeck holds the lease and pays the premises deposit, which it recovers at the end of the term. The franchisee does not fund that premises deposit. The written premises schedule sets rent, access, rates, installation, site works, repairs, equipment care and the parties' obligations.

The franchisee runs kitchen operations, recruits and manages staff, prepares and packs food to the agreed standards, completes the required food-safety checks and records, and dispatches orders on time. The franchisee pays the upfront package and agreed ongoing charges, rent, salaries and employer costs, utilities, ongoing food and packaging, operating bills, taxes and working capital.

MealDeck can administer approved salary and bill payments using the franchisee's funds. This does not make MealDeck the funder of those obligations or replace the franchisee as employer. The franchisee supplies accurate records, approves payroll and payment instructions, and funds any shortfall before due dates.

All shared MealDeck brands form part of the offer. The existing marketing collection remains separate from operational menus; each location activates the brands/products it is equipped and trained to fulfil. Café1 remains specific to St Albans. This revision does not change ordering menus, postcode eligibility or customer checkout.

## Upfront commercial components — internal only

| Component | Amount and scope |
| --- | --- |
| Reduced franchise / territory fee | £3,750–£12,500, determined for the individual location and territory |
| Equipment and opening supplies package | £15,000 for the agreed kitchen equipment, specified hardware, opening food and packaging |
| Complete launch package | £18,750–£27,500 payable upfront |

The £15,000 is one package, not separate equipment and opening-stock charges. KDS screens, printers or other hardware already included must not be charged again as technology setup. The written inventory specifies equipment, opening stock, installation, training, ownership or hire terms, warranties, maintenance, replacement and any separately agreed work outside scope. Recoverable VAT is not part of a cost markup base; the proposal states applicable VAT separately.

## Ongoing commercial schedule — internal only

The following records the latest commercial direction for private proposals. The website displays POA. The final signed fee schedule governs a franchisee's liabilities; deploying this page must not silently change an existing contract or begin collecting these charges.

| Sales channel | MealDeck royalty | Dishbee technology | MealDeck marketing | Total variable charge |
| --- | ---: | ---: | ---: | ---: |
| Direct orders | 8% | 5% | 5% | 18% |
| Aggregator orders | 3% | 2% | 0% | 5% |

The aggregator total is the revised **5%** recommendation adopted for this brief: 2% technology and 3% royalty. It replaces the previously discussed 3% total for MealDeck. It does not change the separate ChefzHub / Dishbee agreement or add another layer of ChefzHub fees.

Percentage technology pricing replaces the earlier 35p-per-order and fixed monthly technology proposals. Do not stack those superseded tariffs on top. Haccora is included in the agreed technology offer.

| Accounts and administration | Monthly amount |
| --- | ---: |
| Accounts package | £100 |
| Administration package | £100 |
| Combined accounts and administration package | £200 total |

The combined £200 is the sum of those two services, not an extra £200 added to the existing £100 accounts charge. Written scopes define the included work and any additional services.

### Percentage calculation: card processing first

Calculate charges on the relevant adjusted food and drink sales **excluding sales VAT**, after applicable discounts and refunds and excluding tips, pass-through delivery and other amounts outside the agreed sales definition. Where the kitchen has an eligible actual card-processing expense, deduct that expense **before** applying the MealDeck/Dishbee percentages. This is a change to the calculation base, not just payout priority.

```text
Direct fee base = adjusted direct food/drink sales excluding VAT
                - eligible actual direct card-processing cost

MealDeck royalty   = direct fee base × 8%
Dishbee technology = direct fee base × 5%
MealDeck marketing = direct fee base × 5%
```

For aggregator sales, use the adjusted food/drink sales excluding VAT **before marketplace commission**. Deduct a separately identifiable eligible card-processing charge only if the kitchen actually bears it and it is not already counted elsewhere. Do not invent a second processing cost where payment processing is included in the aggregator's commission.

```text
Aggregator fee base = adjusted aggregator food/drink sales excluding VAT
                    - eligible separately identified card-processing cost, if any

Dishbee technology = aggregator fee base × 2%
MealDeck royalty   = aggregator fee base × 3%
```

Marketplace commissions remain the operator's separate expense. Supplies, accounts/admin fees and recovery of earlier aggregator fees do not reduce the direct percentage base again.

Use the actual processor's agreed charges, excluding recoverable VAT. Any contracted 0.2% processor revenue share is distinct from the total processing expense; it is not an invented additional franchisee fee and is not configured by this change. Public wording remains **“Card processing fees charged by third parties.”**

The signed schedule must define eligible transactions, partial refunds, chargebacks, discounts, processor costs retained on refunds, timing, VAT on service invoices and rounding. Use integer minor units and deterministic allocation so split amounts add up. Link adjustments to the original order/statement and retain credits; do not erase negative adjustment balances or collect the same fees twice.

## Supply pricing — internal only

| Supply class | Pricing formula |
| --- | --- |
| Packaging | Agreed delivered cost × 1.05 |
| MealDeck-prepared food | Agreed fully costed delivered production cost × 1.10 |
| Direct bought-in supplies | Agreed delivered cost × 1.00 |

These are **markups on cost**, not gross-margin percentages. The prepared-food 10% markup replaces the earlier 15% proposal.

For bought-in items and packaging, delivered cost includes the agreed purchase and delivery-related costs, with supplier credits/rebates deducted. For prepared food, it includes ingredients, production labour, agreed production overhead allocation, normal wastage, production packaging and transport. Exclude recoverable VAT. Define the allocation method in the catalogue and do not charge embedded packaging or transport twice.

Ongoing food and packaging are purchased by the franchisee. The monthly support offer includes supply coordination, procurement and replenishment administration; it does not promise free stock.

Use a funded supply balance or an agreed credit limit and payment timetable. Month-end reconciliation does not grant unlimited unsecured supplier credit.

## What the ongoing package provides

### Technology, brands and support

- MealDeck ordering and the agreed Dishbee integrations.
- Dishbee Buzz and the agreed customer engagement tools.
- Haccora food-safety and compliance software.
- Web and app ordering, WhatsApp and phone ordering.
- KDS, order routing, printing software and support for the specified hardware.
- Delivery management and agreed provider integrations.
- Aggregator onboarding assistance and supported order integrations.
- Agreed AI, reporting and operational tools.
- Brand/menu support, configuration, onboarding, training and franchise support.
- Food-safety systems, records and compliance support under the agreed service schedule.
- Coordinated local and national marketing.

Software integration does not include a third party's transaction, marketplace or courier charge. Provider approval, supported capability, configuration and location readiness are required before activation. The public offer must not imply every integration is already live or every aggregator application is automatically approved.

The service schedule identifies support arrangements, included usage and any exceptional services agreed in advance. Haccora software remains included; operator food-safety obligations and the scope of human compliance support are stated separately.

### Accounts and administration

The combined service can include bookkeeping, bank and aggregator reconciliations, monthly reporting, fee and supply reconciliation, the agreed VAT/accounts/tax-return work, payroll and pension administration from approved inputs, approved bill and salary payment administration, funding reminders, and routine local menu/price/availability administration within central brand policy.

Central brand recipes, master menus and publishing are part of the brand/technology offer. Routine site administration should not charge for the same central menu work again.

Confirm the company/kitchen/PAYE scope, staff allowance, payroll frequency, payment runs, reporting and filing scope, submission deadlines and approval responsibilities. Exceptional manual work, historical cleanup, off-cycle corrections, investigations or specialist advice need a separately agreed scope. Avoid promising unlimited manual accounting, HR, legal or tax work; do not treat every automatically imported food order as a separate manual-work allowance.

Run payroll, pensions, tax and supplier payments by their actual due dates. Monthly reconciliation is not permission to postpone wages or bills.

## Settlement and reconciliation design

This is an implementation specification only. The MealDeck franchise website and enquiry API do not execute these transfers.

Direct-order fees allocate to the agreed MealDeck royalty, Dishbee technology and MealDeck marketing destinations. Establish the relevant accounts and provider configuration separately; no real account identifier is inferred from these labels.

Aggregator fees are calculated from aggregator orders and can be collected weekly from the **same franchisee's available direct-sale proceeds**. The recovery consists of 2% aggregator technology to Dishbee and 3% aggregator royalty to MealDeck. Direct proceeds are the collection source, not a second percentage-calculation base.

Before an eligible direct payout, the ledger must distinguish processor costs, direct fees, due aggregator fees, other authorised recoveries, taxes/credits and the remaining operator balance. Already-paid direct proceeds are not assumed still available on the following collection date. If funds are insufficient, retain a part-paid/outstanding balance and use the agreed funded retention, later receipts or separately authorised fallback; do not take another operator's funds or mark an unsuccessful transfer paid.

Reconcile the following at month-end:

- Direct fees already collected.
- Aggregator fees accrued and weekly amounts already recovered.
- Supply invoices, deliveries and credits.
- The accounts/admin charge and other agreed service invoices.
- Applicable VAT, payroll/bills administered, credits and prior payments.
- Opening balance, funds received, closing balance and any remaining amount due.

Collect only the unpaid balance. Every fee and transfer needs an order/statement reference, recipient allocation and idempotency key. Payment confirmation, reversals and partial collection must be recorded.

Salary and third-party bill administration should use the franchisee's bank or an appropriately established supported payment-provider arrangement with approved instructions and sufficient funds. Do not route pooled payroll/rent through MealDeck's ordinary trading account as a shortcut. Confirm the provider mandates and actual custody/initiation role before enabling third-party payments.

## Public API and enquiry behaviour

`src/lib/franchise-offer.ts` is imported by the browser. `DEFAULT_PROGRAMME` therefore contains only identity/version information, the total upfront range, upfront payment/VAT presentation, POA status/display and Haccora inclusion. It contains no individual territory or launch-component price and no ongoing charge amounts.

`normaliseTerritories` publishes only location identity, region, status, currency and verified sellability, retaining `fee: null` for compatibility. It discards upstream prices, commercial fields and free-text notes. Known allocated anchors cannot be made sellable by contradictory upstream data, and conflicting duplicate availability fails closed.

The server adapter also returns the canonical public programme, ignoring old, current or unexpected upstream pricing. Since this page no longer publishes or calculates territory prices, it does not convert legacy tariffs. Private quotation systems own price revisions.

The enquiry records contact details, preferred area, kitchen/business experience, operator model, optional budget and timing, plus acknowledgements of the launch package and operator responsibilities. The required contact permission is for handling this enquiry; it does not opt the applicant into marketing.

The server authors the **public POA offer snapshot** and stamps `answers.offerVersion: "2026-10-08-poa"`. It strips caller-supplied commercial amounts and snapshots. `selectedTerritoryFee` remains null: a private location quote has not been shown to or accepted by the applicant. When a live territory is selected, the adapter verifies fresh availability and replaces the caller's label with the verified territory name.

The current Omniqora public intake accepts and persists an arbitrary answers record, so the new POA presentation version is compatible without changing that repository. Its existing internal commercial catalogue is not updated by this MealDeck-only change. A written proposal and any future billing implementation must use the correct commercial schedule rather than treating the public enquiry snapshot as fee acceptance.

Keep the existing safeguards: exact programme/source binding, validated and bounded payloads, no arbitrary upstream URL or forwarded caller credentials, private-error sanitisation, timeout/size limits, explicit consent, honeypot, no invented territory reservation and a success response only when the intake returns a persisted receipt identifier.

## Validation and release boundary

The verification workflow runs the franchise offer/enquiry regressions, production build and focused ESLint checks. Regressions cover the public price allowlist, suppression of upstream and caller-supplied financial data, preservation of allocated/contradictory territory rules, the POA snapshot, rejection of superseded public offers, consent and confirmed receipts.

Review the rendered page at desktop and mobile widths. Confirm that the only published franchise amount is the total upfront range, that all ongoing pricing reads POA, and that operator responsibilities and the MealDeck lease/deposit arrangement remain clear.

Committing/merging this revision updates the website and enquiry presentation. It does not deploy an upstream database migration, activate provider integrations, alter existing franchise contracts or configure live card splits, aggregator recovery, supplies, payroll or bill payments.

