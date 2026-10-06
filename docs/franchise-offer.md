# MealDeck operator-franchise offer

Offer version: 2026-10-06. Public route: /franchise.

## Commercial model

The franchisee operates the kitchen and employs/manages its staff. MealDeck provides the brand portfolio, selected location and mapped territory, kitchen equipment, technology, supply and packaging arrangements, compliance systems and support, administration, ongoing support, marketing and accountancy services.

"Provided" identifies the supplier and service responsibility. Equipment, technology setup and opening stock/packaging are chargeable parts of the startup quotation.

### Startup quotation

| Line | Scope | Pricing |
| --- | --- | --- |
| Base franchise / territory fee | Franchise rights, shared brand portfolio and agreed territory | Existing proposed range £7,500–£25,000, confirmed for the individual territory |
| Equipment package | Kitchen equipment supplied to the approved equipment schedule | Separate location-specific quotation |
| Technology setup and hardware | KDS, printer, configuration, web/app ordering, channel and delivery onboarding, training | Separate itemised quotation |
| Opening supplies and packaging | Initial food, ingredients, approved consumables and branded packaging | Separate opening-stock quotation |

Each quotation must also identify the applicable VAT treatment, equipment ownership or finance terms, installation, warranties, maintenance and replacement responsibilities, utility/site works, deposits and the franchisee's working-capital requirement. No all-in startup total, free equipment claim, finance product or equipment ownership transfer has been invented.

All shared MealDeck brands are part of this operator offer. The existing marketing collection is used to show the portfolio without changing operational menus. Café1 remains specific to St Albans. Site activation must match the agreed equipment, training and menu readiness.

### Ongoing charges

| Charge | Current commercial basis |
| --- | --- |
| Royalty | 5.5% of contract-defined Net Sales |
| Marketing contribution | 1.5% of contract-defined Net Sales |
| Technology | £0.25 per completed order |
| Central supplies and packaging | Fully landed delivered cost plus 10%, subject to the agreed catalogue |
| Accountancy, administration and compliance support | Scope, frequency and any separate fee itemised in the agreed service schedule |
| External usage and provider charges | Payment processing, aggregator commissions, courier charges, telecom/WhatsApp and AI usage shown in the quotation/service schedule where applicable |

Do not also apply the superseded illustrative £1-per-order aggregate charge. Net Sales, completed orders, refunds, payment timing, campaign budgets and third-party inclusions must be defined consistently in the individual agreement. The base fee is not the total investment.

## Responsibility split

MealDeck selects/assesses the location and territory, provides brands/recipes/standards, supplies equipment and technology, organises approved supply/packaging, gives training and compliance tools, and supplies the agreed admin, support, marketing and accountancy services.

The franchisee runs shifts, recruits and manages staff, prepares/ packs orders, handles the operational food-safety records and service standards, funds rent, wages, utilities and local operating costs, purchases supplies/packaging, and pays the agreed setup and ongoing charges. The written premises arrangement specifies rent, deposits, rates, repairs and access.

Compliance support does not transfer the operator's day-to-day food-business responsibilities. Accountancy services require timely and accurate records from the franchisee; tax, payroll and operating liabilities remain those of the relevant business.

## Technology package

- Kitchen display system, printer and order routing.
- Online ordering and web/app customer experience.
- WhatsApp and phone ordering.
- Delivery management and configured delivery-provider connections.
- Aggregator order integrations.
- Haccora food safety and compliance tools for the checks and records agreed for each kitchen, with access, setup and training arranged during onboarding.
- AI-assisted ordering/support, reporting and operational insights according to the agreed rollout.
- Training, configuration and support for the agreed channels.

Haccora forms part of the technology offer and supports the agreed compliance provision. The technology and compliance service schedules specify software access, configuration, training, ongoing human support and applicable charges. This addition introduces no separate Haccora tariff and does not change the existing published rates. Kitchen teams remain responsible for completing checks and maintaining operating records.

The public page describes the offered package. It is not evidence that every external provider, native app, AI feature or tenant configuration is already live. Provider approvals, accounts, hardware quantities, subscriptions and usage allowances are specified during onboarding.

## Territory behaviour

Known allocations remain Taken: Luton LU4 8NU, St Albans AL1 3JU, Bedford Elstow Road, Milton Keynes, Islington/Camden N7 8XH.

The local fallback contains planned London search areas with no available/sellable flag and no made-up location fee. Exact protected polygons, boundaries/overflow and neighbouring-kitchen checks are confirmed against the selected premises. Area enquiries do not reserve territory.

The public normaliser allowlists fields, protects known allocations, rejects conflicting duplicate codes and never exposes internal scores or negotiation notes. The application sends a territory code only for a confirmed selectable live entry; otherwise it records a preferred-area enquiry.

## Application and integration

The /api/franchise route continues to use the existing server-side OMNIQORA_PUBLIC_API_URL setting. Configure this to the actual deployed public network-expansion endpoint, including its path. Do not expose this setting or service credentials in VITE_ variables.

The enquiry records contact details, preferred area, existing kitchen/business, operator model, budget, timing, operating experience and acknowledgements of the startup package and operating responsibilities. The submitted answers include offerVersion 2026-10-06.

The public handler uses bounded validation, request deadlines, filtered public data, fresh selected-territory checks and safe errors. Missing configuration, malformed responses and upstream failures do not produce a successful receipt.

The existing franchise CRM intake is corrected separately to distinguish application follow-up consent from optional marketing consent. The related change is in seamless-comms-suite PR #77. Existing stored marketing preferences are preserved.

## Verification

The MealDeck verification workflow runs:

- bun test tests/franchise-offer.test.ts tests/franchise-api.test.ts
- bun run build
- Focused ESLint checks for the franchise route, service, shared offer and tests.

Before accepting real applications, the deployed endpoint must successfully persist an enquiry and a staff member must be able to find it in the franchise pipeline. Test external channels against the individual location's actual configured accounts. Production publishing and third-party onboarding are separate from a source-code merge.

## Reference guidance

- GOV.UK, food-business responsibilities: https://www.gov.uk/running-food-business
- CAP Code, business opportunities, rules 20.7–20.8: https://www.asa.org.uk/type/non_broadcast/code_section/20.html

These references inform clear presentation of operator responsibilities and costs. They do not turn the website into a franchise agreement or justify an earnings forecast.
