# MealDeck turnkey operator-franchise offer

Offer version: **2026-10-06-r3**. Franchise-fee version: **2026-10-06-r2**. Public route: `/franchise`.

## Commercial model

MealDeck is a turnkey multi-brand kitchen franchise. The offer brings together the existing 15-brand shared portfolio and menus, a selected location and agreed territory, kitchen equipment and opening supplies/packaging, the full technology offer including Haccora, training, compliance support, administration, ongoing support, marketing and accountancy.

MealDeck provides the setup and systems. The franchisee operates the kitchen, employs and manages the team, and funds the agreed startup and operating costs. Setup follows an agreed launch plan, with the location's approvals, training and operational readiness confirmed before opening. Kitchens operate from commercial dark-kitchen sites: the site provides part of the fit-out, and MealDeck supplies the equipment needed to run the kitchen. MealDeck arranges the premises, holding the lease and paying the premises deposit, which it recovers at the end of the term; the franchisee does not pay a deposit.

This revision sets the technology fee at **35p per completed customer order**, covering all listed MealDeck software including Haccora. The **£15,000 equipment and opening supplies/packaging package is payable upfront, in addition to the reduced territory fee**. The previous fee reduction, £100 monthly accountancy, marketing and supply terms remain. A higher royalty has been requested, but its numerical rate has not been agreed; the public offer requires a written royalty quote.

## Startup quotation

**£15,000 is one upfront package charge for the agreed kitchen equipment plus opening supplies and packaging.** Equipment and opening stock are itemised within that single package; no separate price split has been invented.

| Line | Scope | Current pricing |
| --- | --- | --- |
| Base franchise / territory fee | Franchise rights, shared brand portfolio and agreed territory | £3,750–£12,500, confirmed for the individual location and payable upfront |
| Equipment package | Kitchen equipment supplied to the approved schedule, including any specified KDS screens and printers | Itemised within the single £15,000 upfront equipment and opening-stock package |
| Technology setup | Configuration, onboarding and training for the agreed tools and channels | Scope recorded in writing; any additional implementation or hardware outside the package must be separately itemised and agreed |
| Opening supplies and packaging | Initial food, ingredients, approved consumables and branded packaging | Itemised within the same £15,000 upfront package |

### Base fee and package subtotal

| Calculation | Payable upfront |
| --- | ---: |
| £3,750 base fee + £15,000 equipment/opening-stock package | £18,750 |
| £12,500 base fee + £15,000 equipment/opening-stock package | £27,500 |

**£18,750–£27,500 is the upfront subtotal for the reduced base fee and package.** Any separately agreed implementation or hardware outside the package, premises rent and working capital are additional. The franchisee also funds recruitment, wages, utilities and other operating costs; the premises deposit is paid by MealDeck, which recovers it at the end of the term. The full written quote confirms the selected location's base fee, package contents and all agreed additional costs before commitment.

Each quotation must identify the equipment/stock itemisation, setup and training scope, VAT treatment, equipment ownership or hire/finance terms, installation and site works, warranties, maintenance and replacement responsibilities, the premises deposit arrangement and working-capital requirement. The territory fee and £15,000 package are payable upfront. Equipment and opening stock must not each be presented as a separate £15,000 charge. Hardware is recorded once: any KDS screen, printer or other item already included in the package must not be charged again under technology setup.

All shared MealDeck brands are part of the operator offer. The existing 15-brand marketing collection shows the portfolio without changing operational menus or promising every menu is active at every location. Café1 remains specific to St Albans. Site activation must match the agreed equipment, training, supply and menu readiness.

## Ongoing charges

| Charge | Current commercial basis | Scope to confirm |
| --- | --- | --- |
| Royalty | **To be confirmed in written quote** | Numerical rate, net-sales definition, applicable channels and billing terms |
| Marketing contribution | **1.5% of Net Sales** | Contract-defined treatment of refunds, discounts, sales channels, campaign budgets and any extra local media spend |
| Full technology, including Haccora | **35p per completed customer order** | All listed MealDeck software, configured tools and channels, onboarding and support scope |
| Accountancy | **£100 per month** | Included work, reporting frequency, transaction/payroll limits and any additional work |
| Bought-in supplies and packaging | **Purchase cost; 0% supply markup** | Relevant item purchase-cost basis, catalogue classification and any explicitly agreed separate charges |
| MealDeck-manufactured products | **Fully costed production plus 15% markup** | Ingredients, production labour and other allocable production costs included before adding the markup |
| Administration and human compliance support | Written service quote for any work beyond the included package | Included services, responsibilities, frequency and additional charges; Haccora software remains covered by the technology fee |
| Card processing fees charged by third parties | **Third-party rates** | The card provider's processing charges, separate from the MealDeck software fee |
| Marketplace commissions and courier delivery fees | **Provider terms** | Actual marketplace and delivery services, separate from the included connection and delivery-management software |
| Exceptional voice, AI or messaging usage | **Only if explicitly agreed in writing** | Written quote defining exceptional usage allowances, rates and limits before activation |

The technology charge counts **one completed customer order per kitchen, regardless of brand count or ordering channel; cancelled and fully refunded orders are excluded**. A basket containing several MealDeck brands from the same kitchen attracts one technology charge. The billing schedule defines statement timing and adjustments.

**The 35p fee covers the full listed software offer, including Haccora. There is no separate monthly MealDeck technology fee or Haccora subscription.** It replaces the former technology tariff; do not add an earlier technology fee or aggregate per-order charge on top. No unquoted exceptional voice, AI or messaging tariff is implied, and the offer makes no unlimited-usage promise.

The £100 monthly accountancy price requires a clear service scope; no unlimited workload or unquoted additional service is implied.

The unconfirmed royalty is stored as `royaltyPercent: null`, `royaltyStatus: "quote_required"` and `royaltyDisplay: "To be confirmed in written quote"`. Public copy, API responses and enquiry snapshots must not substitute an earlier or privately recommended numerical rate.

Agreements and catalogues define the cost basis, billing intervals, any separately agreed delivery charges and the treatment of refunds and discounts.

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

The franchisee runs shifts, recruits and manages staff, prepares/packs orders, completes operational food-safety records, maintains service standards, funds rent, wages, utilities and local operating costs, purchases supplies/packaging, and pays the agreed startup and ongoing charges. The written premises arrangement specifies rent, rates, repairs and access; MealDeck holds the lease and pays the premises deposit, which it recovers at the end of the term.

Compliance support does not transfer the operator's day-to-day food-business responsibilities. Accountancy services require timely and accurate records from the franchisee; tax, payroll and operating liabilities remain those of the relevant business.

## Technology and accountancy packages

The 35p per completed customer order technology fee covers the full listed MealDeck software offer:

- Kitchen display system, order routing and printing software.
- Online ordering through the website and app.
- WhatsApp and phone ordering.
- Delivery management and configured delivery-provider connections.
- Aggregator order integrations.
- Haccora food safety and compliance software for the checks and records agreed for each kitchen.
- Agreed AI tools supporting ordering, customer enquiries, sales analysis, demand planning and operational insights.
- Reporting and administration tools, with configuration, training and support according to the agreed scope.

Haccora is included in the same 35p technology charge. There is no separate Haccora subscription or monthly MealDeck technology fee. The written scope defines configured platform and Haccora access, included tools, support and onboarding. Physical hardware is itemised once in the setup schedule; KDS screens and printers already included in the £15,000 package must not be charged again. Any additional implementation or hardware requires an explicit itemised quote.

Card processing fees charged by third parties, marketplace commissions and actual courier delivery fees are separate external service charges. The technology fee covers the listed software connections and management tools. Any exceptional voice, AI or messaging usage charge requires an explicit written quote setting out allowances, rates and limits before activation.

Human compliance support is specified in the compliance service schedule. The franchisee remains responsible for completing the kitchen's checks, maintaining its records and carrying out its day-to-day operating responsibilities.

The £100 monthly accountancy package must identify which bookkeeping, payroll, accounts and reporting work is included, its frequency and any workload limits. Additional work must be separately agreed and priced. Do not imply unlimited transactions, employees, filings or advisory work.

The public page describes the offered package. Each location still needs configuration, testing, provider approvals and onboarding before its agreed channels are activated. It does not establish that every external provider, native app, AI feature or tenant configuration is already live.

## Territory behaviour

Known allocations remain Taken: Luton LU4 8NU, St Albans AL1 3JU, Bedford Elstow Road, Milton Keynes and Islington/Camden N7 8XH.

The local fallback contains planned London search areas with no available/sellable flag and no made-up location fee. Exact protected polygons, boundaries/overflow and neighbouring-kitchen checks are confirmed against the selected premises. Area enquiries do not reserve territory.

The public normaliser allowlists fields, protects known allocations, rejects conflicting duplicate codes and does not expose internal scores or negotiation notes. The page omits planned fallbacks whenever a matching live code, normalized name or exact known alias exists, including when the live entry is taken, reserved or unavailable. Acton remains distinct from Alperton; Bow/Mile End remains distinct from Stratford/Leyton.

An application sends a territory code only for a confirmed selectable live entry. Otherwise it records a preferred-area enquiry. Fees displayed for live locations use the server's canonical current-offer values.

## Versioned repricing and integration

### One server-side conversion

`OFFER_VERSION` and `DEFAULT_PROGRAMME.offerVersion` are **2026-10-06-r3**. `FRANCHISE_FEE_VERSION` and `DEFAULT_PROGRAMME.franchiseFeeVersion` remain **2026-10-06-r2**. The r3 changes to technology and the upfront package must not trigger another reduction of an already reduced territory fee.

The browser and shared public `normaliseTerritories` function validate canonical current fees within £3,750–£12,500. **They never divide a fee.** Browser refreshes and repeated normalization therefore cannot halve an already repriced fee again.

The private API adapter is responsible for recognizing the price version and applying the authorized base-fee reduction:

1. An explicitly recognized legacy row with a valid legacy-range fee is converted once at 50%.
2. An unversioned row may be converted only when the unversioned/legacy programme still has the exact recognized legacy bounds of £7,500 and £25,000.
3. An explicitly current franchise-fee-version row keeps its valid current fee. A row already carrying the r2 franchise-fee version remains current when the overall offer moves to r3.
4. An unknown version, or an unmarked row under a current programme, produces a null fee requiring a quote rather than a guessed or repeated reduction.

The adapter returns the canonical current `DEFAULT_PROGRAMME`, rather than forwarding stale upstream commercial fields. The page likewise uses the shared current programme: `techFeePerOrder: 0.35`, `techIncludesHaccora: true`, `techFeeBasis: "per_completed_order"` and the shared `techOrderDefinition`; `equipmentOpeningSuppliesFee: 15000`; and `equipmentOpeningSuppliesPaymentTiming` and `franchiseFeePaymentTiming` both `"upfront"`. The superseded monthly technology and equipment-estimate fields are removed. No client-side royalty rate or stale technology tariff is substituted.

This conversion must remain idempotent. Do not overwrite an executed agreement or an existing historical offer snapshot merely because the public offer version has changed.

### Application intake

The `/api/franchise` route continues to use the server-side `OMNIQORA_PUBLIC_API_URL` setting. Configure it to the actual deployed public network-expansion endpoint, including its path. Do not expose this setting or service credentials through `VITE_` variables.

The enquiry records contact details, preferred area, existing kitchen/business, operator model, budget, timing, operating experience and acknowledgements of the startup package and operator responsibilities. Submitted answers include `offerVersion: "2026-10-06-r3"`.

The server generates the authoritative `answers.offerSnapshot` and verifies the selected-territory fee against fresh inventory. Caller-supplied commercial amounts are ignored. The snapshot must retain the r3 offer version, r2 franchise-fee version, quote-required royalty, 35p technology fee including Haccora and its completed-order definition, £15,000 package and upfront payment timing, £100 monthly accountancy, marketing and supply terms.

The public handler retains bounded validation, request deadlines, filtered public data, fresh selected-territory checks and safe errors. Missing configuration, malformed responses and upstream failures do not produce a successful receipt. The page confirms receipt only after an affirmative successful API response.

Contact permission concerns the franchise application and its follow-up. Marketing consent remains separate, and existing stored marketing preferences must be preserved.

## Verification and rollout

The MealDeck verification workflow includes:

- `bun test tests/franchise-offer.test.ts tests/franchise-api.test.ts`
- `bun run build`
- Focused ESLint checks for the franchise route, service, shared offer and tests.

The shared/API checks should cover current fee bounds, recognized legacy conversion, repeated normalization, r2 franchise-fee preservation under the r3 offer, unknown-version quote fallback, the completed-order technology fee and Haccora inclusion, upfront package terms, canonical offer snapshots and the existing availability/consent protections.

Before accepting real applications, the deployed endpoint must successfully persist an enquiry and a staff member must be able to find it in the franchise pipeline. Test external channels against the individual location's configured accounts. Source-code merge, production publishing and third-party onboarding are separate milestones.

The public route presents the turnkey offer, upfront package and territory fee, and agreed service prices. It does not publish profit forecasts, payback claims, guaranteed sales levels or a card-fee income share.

## Reference guidance

- [GOV.UK: Food-business responsibilities](https://www.gov.uk/running-food-business)
- [CAP Code: Business opportunities, rules 20.7–20.8](https://www.asa.org.uk/type/non_broadcast/code_section/20.html)

These references inform clear presentation of operator responsibilities and costs. They do not turn the website into a franchise agreement or support an earnings forecast.
