# MealDeck operator-franchise offer

Offer version: **2026-10-06-r2**. Public route: `/franchise`.

## Commercial model

The franchisee operates the kitchen and employs/manages its staff. MealDeck provides the shared brand portfolio, selected location and mapped territory, kitchen equipment, technology, supply and packaging arrangements, Haccora food safety tools, compliance support, administration, ongoing support, marketing and accountancy services.

“Provided” identifies the supplier and service responsibility. Equipment, technology setup and opening stock/packaging remain chargeable parts of the startup quotation.

This revision reduces each identifiable legacy location's base franchise fee by 50%, changes technology to a fixed monthly fee, sets a monthly accountancy fee and distinguishes bought-in products from MealDeck-manufactured products. A higher royalty has been requested, but its numerical rate has not been agreed. The public offer therefore requires a written royalty quote.

## Startup quotation

**Approximately £15,000 is one combined planning estimate for kitchen equipment plus opening supplies and packaging.** Equipment and opening stock must be itemised within that combined budget; no fixed split between them has been assumed.

| Line | Scope | Current pricing |
| --- | --- | --- |
| Base franchise / territory fee | Franchise rights, shared brand portfolio and agreed territory | £3,750–£12,500, confirmed for the individual location |
| Equipment package | Kitchen equipment supplied to the approved schedule | Itemised within the single approximate £15,000 combined equipment and opening-stock estimate |
| Technology setup and hardware | KDS, printer, configuration, web/app ordering, channel and delivery onboarding, Haccora setup and training within the agreed scope | Separate itemised quotation |
| Opening supplies and packaging | Initial food, ingredients, approved consumables and branded packaging | Itemised within the same combined equipment and opening-stock estimate |

### Planning subtotal

| Calculation | Approximate subtotal |
| --- | ---: |
| £3,750 base fee + £15,000 combined equipment/opening-stock estimate | £18,750 |
| £12,500 base fee + £15,000 combined equipment/opening-stock estimate | £27,500 |

**£18,750–£27,500 is a planning subtotal, not the full investment or a fixed site quotation.** Technology setup and hardware, premises and deposits, VAT where applicable, and working capital are additional. The franchisee also funds recruitment, wages, utilities and other operating costs. The site-specific equipment and stock estimate may differ once requirements are assessed.

Each quotation must identify the final equipment/stock itemisation, technology setup and hardware, applicable VAT treatment, equipment ownership or hire/finance terms, installation and site works, warranties, maintenance, replacement responsibilities, deposits, payment schedule and working-capital requirement. Equipment and opening stock must not each be presented as a separate £15,000 charge.

All shared MealDeck brands are part of the operator offer. The existing marketing collection shows the portfolio without changing operational menus. Café1 remains specific to St Albans. Site activation must match the agreed equipment, training, supply and menu readiness.

## Ongoing charges

| Charge | Current commercial basis | Scope to confirm |
| --- | --- | --- |
| Royalty | **To be confirmed in written quote** | Numerical rate, net-sales definition, applicable channels and billing terms |
| Marketing contribution | **1.5% of Net Sales excluding VAT** | Contract-defined treatment of refunds, discounts, sales channels, campaign budgets and any extra local media spend |
| Technology | **£199 per month** | Included platform and Haccora access, channels, AI tools, support, allowances and additional usage/provider costs |
| Accountancy | **£100 per month** | Included work, reporting frequency, transaction/payroll limits and any additional work |
| Bought-in supplies and packaging | **Purchase cost; 0% supply markup** | Relevant item purchase-cost basis, catalogue classification and any explicitly agreed separate charges |
| MealDeck-manufactured products | **Fully costed production plus 15% markup** | Ingredients, production labour and other allocable production costs included before adding the markup |
| Administration and human compliance support | Written service quote for any work beyond the included package | Included services, responsibilities, frequency and additional charges |
| External usage and provider charges | Provider terms / written quote | Payment processing, aggregator commissions, couriers, connectors, telecom/WhatsApp and AI usage where applicable |

The £199 monthly technology fee replaces the former per-order technology model. Do not add a recurring per-order technology fee or the earlier illustrative aggregate per-order charge on top. The £100 monthly accountancy price requires a clear service scope; no unlimited workload or unquoted additional service is implied.

The unconfirmed royalty is stored as `royaltyPercent: null`, `royaltyStatus: "quote_required"` and `royaltyDisplay: "To be confirmed in written quote"`. Public copy, API responses and enquiry snapshots must not substitute an earlier or privately recommended numerical rate.

Business fees are displayed excluding VAT where applicable. Agreements and catalogues define the cost basis, billing intervals, any separately agreed delivery charges and the treatment of refunds and discounts.

### Supply pricing

For directly purchased items, the supply price uses the item's purchase cost and a zero supply markup.

For MealDeck-manufactured products:

```text
Production cost = ingredients
                + production labour
                + other allocable production costs

Supply price = production cost × 1.15
```

The 15% is a markup on the complete production cost. It is not a 15% margin calculation and must not be applied to ingredient cost alone.

The approved catalogue should identify bought-in and manufactured items, cost inclusions, the allocation basis for production costs and any separately quoted delivery or tax charges. Avoid charging the same cost twice where it is already included in a product's documented cost basis.

## Responsibility split

MealDeck selects/assesses the location and territory, provides brands/recipes/standards, supplies equipment and technology, organises approved supply/packaging, gives training and compliance tools, and supplies the agreed administration, support, marketing and accountancy services.

The franchisee runs shifts, recruits and manages staff, prepares/packs orders, completes operational food-safety records, maintains service standards, funds rent, wages, utilities and local operating costs, purchases supplies/packaging, and pays the agreed startup and ongoing charges. The written premises arrangement specifies rent, deposits, rates, repairs and access.

Compliance support does not transfer the operator's day-to-day food-business responsibilities. Accountancy services require timely and accurate records from the franchisee; tax, payroll and operating liabilities remain those of the relevant business.

## Technology and accountancy packages

The technology offer retains:

- Kitchen display system, printer and order routing.
- Online ordering and web/app customer experience.
- WhatsApp and phone ordering.
- Delivery management and configured delivery-provider connections.
- Aggregator order integrations.
- Haccora food safety and compliance tools for the checks and records agreed for each kitchen.
- AI-assisted ordering/customer support, reporting, demand planning and operational insights according to the agreed rollout.
- Training, configuration and support for the agreed tools and channels.

Haccora remains part of the technology offer. The £199 monthly package's written scope defines platform and Haccora access, included features, service support, usage allowances and any separately agreed work or provider costs. Setup, hardware and implementation remain separately quoted. Human compliance support is specified in the compliance service schedule. This revision does not invent a separate Haccora tariff.

The £100 monthly accountancy package must identify which bookkeeping, payroll, accounts and reporting work is included, its frequency and any workload limits. Additional work must be separately agreed and priced. Do not imply unlimited transactions, employees, filings or advisory work.

The public page describes the offered package. Each location still needs configuration, testing, provider approvals and onboarding before its agreed channels are activated. It does not establish that every external provider, native app, AI feature or tenant configuration is already live.

## Territory behaviour

Known allocations remain Taken: Luton LU4 8NU, St Albans AL1 3JU, Bedford Elstow Road, Milton Keynes and Islington/Camden N7 8XH.

The local fallback contains planned London search areas with no available/sellable flag and no made-up location fee. Exact protected polygons, boundaries/overflow and neighbouring-kitchen checks are confirmed against the selected premises. Area enquiries do not reserve territory.

The public normaliser allowlists fields, protects known allocations, rejects conflicting duplicate codes and does not expose internal scores or negotiation notes. The page omits planned fallbacks whenever a matching live code, normalized name or exact known alias exists, including when the live entry is taken, reserved or unavailable. Acton remains distinct from Alperton; Bow/Mile End remains distinct from Stratford/Leyton.

An application sends a territory code only for a confirmed selectable live entry. Otherwise it records a preferred-area enquiry. Fees displayed for live locations use the server's canonical current-offer values.

## Versioned repricing and integration

### One server-side conversion

`OFFER_VERSION`, `DEFAULT_PROGRAMME.offerVersion` and `DEFAULT_PROGRAMME.franchiseFeeVersion` are **2026-10-06-r2**.

The browser and shared public `normaliseTerritories` function validate canonical current fees within £3,750–£12,500. **They never divide a fee.** Browser refreshes and repeated normalization therefore cannot halve an already repriced fee again.

The private API adapter is responsible for recognizing the price version and applying the authorized base-fee reduction:

1. An explicitly recognized legacy row with a valid legacy-range fee is converted once at 50%.
2. An unversioned row may be converted only when the unversioned/legacy programme still has the exact recognized legacy bounds of £7,500 and £25,000.
3. An explicitly current-version row keeps its valid current fee.
4. An unknown version, or an unmarked row under a current programme, produces a null fee requiring a quote rather than a guessed or repeated reduction.

The adapter returns the canonical current `DEFAULT_PROGRAMME`, rather than forwarding stale upstream commercial fields. The page likewise uses the shared current programme, with no client-side fallback royalty rate or per-order technology tariff.

This conversion must remain idempotent. Do not overwrite an executed agreement or an existing historical offer snapshot merely because the public offer version has changed.

### Application intake

The `/api/franchise` route continues to use the server-side `OMNIQORA_PUBLIC_API_URL` setting. Configure it to the actual deployed public network-expansion endpoint, including its path. Do not expose this setting or service credentials through `VITE_` variables.

The enquiry records contact details, preferred area, existing kitchen/business, operator model, budget, timing, operating experience and acknowledgements of the startup package and operator responsibilities. Submitted answers include `offerVersion: "2026-10-06-r2"`.

The server generates the authoritative `answers.offerSnapshot` and verifies the selected-territory fee against fresh inventory. Caller-supplied commercial amounts are ignored. The snapshot must retain the quote-required royalty and the current monthly and supply terms.

The public handler retains bounded validation, request deadlines, filtered public data, fresh selected-territory checks and safe errors. Missing configuration, malformed responses and upstream failures do not produce a successful receipt. The page confirms receipt only after an affirmative successful API response.

Contact permission concerns the franchise application and its follow-up. Marketing consent remains separate, and existing stored marketing preferences must be preserved.

## Verification and rollout

The MealDeck verification workflow includes:

- `bun test tests/franchise-offer.test.ts tests/franchise-api.test.ts`
- `bun run build`
- Focused ESLint checks for the franchise route, service, shared offer and tests.

The shared/API checks should cover the new current fee bounds, recognized legacy conversion, repeated normalization, current-version preservation, unknown-version quote fallback, canonical offer snapshots and the existing availability/consent protections.

Before accepting real applications, the deployed endpoint must successfully persist an enquiry and a staff member must be able to find it in the franchise pipeline. Test external channels against the individual location's configured accounts. Source-code merge, production publishing and third-party onboarding are separate milestones.

The public route provides startup estimates and service prices. No profit forecast, payback claim or guaranteed sales level has been added.

## Reference guidance

- [GOV.UK: Food-business responsibilities](https://www.gov.uk/running-food-business)
- [CAP Code: Business opportunities, rules 20.7–20.8](https://www.asa.org.uk/type/non_broadcast/code_section/20.html)

These references inform clear presentation of operator responsibilities and costs. They do not turn the website into a franchise agreement or support an earnings forecast.
