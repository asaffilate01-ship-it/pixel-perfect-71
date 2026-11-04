# MealDeck

**One Order. Every Craving.**

MealDeck is the customer-facing multi-brand ordering platform for the 313 Brands food portfolio. Customers enter a postcode, choose Delivery / Pickup / Kerbside where available, browse every active brand for that kitchen, keep one basket and checkout once.

**MealDeck is a trading name of 313 Brands Ltd. Powered by Dishbee.**

This project is connected to Lovable. Do not rewrite published Git history.

## Runtime architecture

MealDeck is configured to use an independent Supabase project for its own data and staff access. Dishbee is the technology provider. There is no required runtime connection to Dishbee's shared database. The standalone installation is prepared in this repository; the hosted project still needs provisioning and connection.

### MealDeck
- postcode-first customer journey
- brand switching and one cross-brand basket
- customer checkout and tracking UI
- loyalty/offers/account experience
- tenant/location configuration
- serviceability and live opening hours
- brand/menu/channel availability
- modifiers and pricing
- payment state
- paid-only KDS release
- kitchen/station routing
- delivery orchestration
- subscription/add-on entitlement

### Dishbee

Technology credit and explicitly configured service integrations. Any future Dishbee integration must use a scoped API boundary; it must not silently switch MealDeck back to a shared merchant database.

The fresh-project deployment profile, owner bootstrap and remaining activation work are in [the independent backend guide](docs/mealdeck-independent-backend-phase47.md). A prepared schema is not a provisioned database or a working payment integration. Historical `supabase/migrations` files remain unchanged for existing deployments and are composed by the standalone profile; do not run them alone against a new project.

### Haccora
Food-safety and compliance software included in the MealDeck franchise technology offer, with location access, configuration and training arranged through Dishbee.

### Omniqora
Optional AI/CRM/WhatsApp/voice/automation/analytics layer requested and billed through Dishbee.

## Launch location rules

### Luton
The five public launch menus are:
- Tavo Chicken
- Load'd
- Skorch Burgers
- Souvano
- Moktl

Other brands are presented as coming in a later deck. Cross-brand extras can be browsed together; published availability and prices still require review in the new backend.

Delivery, Pickup and Kerbside may be enabled by the location.

### St Albans
Brand availability must be configured for this kitchen independently. Cafe 1's merchant data and EPOS remain separate.

Current MealDeck service:
- Delivery only
- Monday-Friday
- 09:00-16:00

Café1's direct/in-store menu remains separate from the curated Café1 MealDeck menu.

## Order/KDS rule

The checkout contract creates a MealDeck `payment_pending` order and a short handoff code. The independent backend's provider path still needs implementation and acceptance before customer checkout is enabled.

**Normal MealDeck orders do not appear on KDS until payment is confirmed server-side.**

The intended live flow is:
1. The verified server-side payment integration records accepted payment/release evidence.
2. MealDeck creates the master order's kitchen tickets.
3. One shared KDS card shows all brands, quantities, modifiers and kitchen notes.
4. Preparation and packing advance on the same screen: start order, ready to pack, start packing, seal order.
5. A separately verified handoff/delivery integration completes fulfilment. Sealing a kitchen order is not a courier booking or customer handoff.

Future kitchens receive separately authorised views; each brand does not need a separate screen.

## Delivery

The planned delivery integration can compare:
- MealDeck/Dishbee own fleet
- Uber Direct
- Deliveroo Express
- Just Eat Go
- Stuart where available

The customer sees one MealDeck delivery experience. Provider selection is internal.

## Customer tracking

`/track` uses the configured backend's public tracking RPC contract with:
- order UUID
- 4-digit handoff code

The public response is normalized and does not expose provider credentials or kitchen secrets.

## Configuration

Copy `.env.example` into your environment and add:

- `MEALDECK_SUPABASE_URL` for the independent MealDeck project
- `MEALDECK_SUPABASE_PUBLISHABLE_KEY` from that same project
- Luton tenant + location IDs
- St Albans tenant + location IDs

Staff sign-in obtains the same validated public connection from the MealDeck server. Old `DISHBEE_*` or independently configured staff project credentials must not silently become a fallback. Payment and courier provider secrets stay server-side and are configured separately. Keep `COMING_SOON` and checkout approval gates closed until the independent deployment is accepted.

## Development

```bash
npm install
npm run dev
npm run build
npm run lint
```

## Franchise recruitment

The public `/franchise` hub offers two routes: the **full MealDeck concept** or **one, two, three or more individual brands**. The full concept shows an **indicative deposit-inclusive launch range**, with location/territory, the agreed premises rent deposit, equipment, technology setup, opening supplies and support described within that option. The range uses a two-month deposit allowance; the actual landlord deposit and launch scope determine the final quote, which may fall outside that range. MealDeck holds the lease for its arranged premises and pays the landlord from the included deposit. First-month and subsequent rent are funded separately. The FAQ explains conditional recovery of the landlord deposit. Existing premises are reflected in a custom proposal. Individual brands and custom combinations are **POA**, as are all ongoing charges. No monthly prices, ongoing fee percentages, per-order charges, individual territory prices or launch-price components are exposed by the page or its public API.

Each of the 15 approved shared brands has its own promotional page at `/franchise/{brandId}`, including `/franchise/skorch`. Applicants can select and remove brands, compare the full package without losing their custom shortlist during the visit, and identify an existing kitchen or a new food business. Café1 remains exclusive to St Albans and is not offered as a standalone franchise in this catalogue; legacy ordering brands do not enter recruitment automatically.

Package selections use shareable `package=brands&brands=skorch,loadd` or `package=full` query parameters. Canonical SEO URLs stay specific to the hub or brand page, and supported campaign tags follow the applicant into the enquiry. The intake validates `answers.franchisePackage` and `answers.selectedBrandIds` before forwarding them to the configured service. A selected-brand enquiry requires at least one approved, unique ID; full MealDeck carries an empty individual-brand list. All existing territory protections still apply. See [brand recruitment integration notes](docs/franchise-brand-recruitment.md).

The private commercial brief and integration notes are in [docs/franchise-offer.md](docs/franchise-offer.md). They cover the revised channel fees, card-processing-first calculation, delivered-cost supply pricing and accounts/admin package. This document is for internal quotation and implementation planning; it is not imported into the website or an active billing configuration.

Set `OMNIQORA_PUBLIC_API_URL` on the server to the complete deployed franchise intake endpoint. Missing configuration produces an honest service-unavailable response; the site never confirms an application that has not been accepted by the service.

Run the franchise regressions with `bun test tests/franchise-offer.test.ts tests/franchise-api.test.ts tests/franchise-selection.test.ts`. The verification workflow also builds the site and checks the franchise implementation with ESLint.



## WhatsApp basket assistance (gated)

A separate optional contact handoff prepares a privacy-minimised message with
MealDeck location, preferred fulfilment and multiple brands' dish quantities
and modifier **names**. It is a conversation enquiry, not an order, price quote
or payment.

`src/lib/whatsapp-assistance.ts` builds and validates the message.
`src/lib/whatsapp-assistance.functions.ts` returns only a verified
public E.164 business number after the server-side release and location gates
are satisfied. The basket component is hidden while `COMING_SOON`
is enabled. No public WhatsApp credentials or operational secrets are stored
in the browser.

See `docs/whatsapp-omniqora-dishbee-cafe1.md` for the staged
Dishbee/Omniqora/Cafe1 runtime contract and activation checks, `DESIGN.md`
for retained visual rules, and `PRODUCT.md` for source-of-truth boundaries.

Tests: `bun test tests/whatsapp-assistance.test.ts`

## Phase 27: read-only delivery fee estimates

Once the existing launch gate is independently lifted, the ordering UI
retrieves **estimated** item prices and delivery fees from the current
MealDeck catalogue and its canonical kitchen policy. The backend validates
postcode serviceability, tenant/location identity, item/option IDs and
quantity before asking the public fee RPC. Unknown policies and unavailable
items fail closed, and the customer cannot send their own delivery fee to
create a MealDeck order. This does not yet provide an Adyen session or
activate payments. See docs/mealdeck-dishbee-pricing-phase27.md.
