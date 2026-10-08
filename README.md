# MealDeck

**One Order. Every Craving.**

MealDeck is the customer-facing multi-brand ordering platform for the 313 Brands food portfolio. Customers enter a postcode, choose Delivery / Pickup / Kerbside where available, browse every active brand for that kitchen, keep one basket and checkout once.

This project is connected to Lovable. Do not rewrite published Git history.

## Runtime architecture

MealDeck is the consumer experience. Dishbee is the operational engine underneath.

### MealDeck
- postcode-first customer journey
- brand switching and one cross-brand basket
- customer checkout and tracking UI
- loyalty/offers/account experience

### Dishbee
- tenant/location configuration
- serviceability and live opening hours
- brand/menu/channel availability
- modifiers and pricing
- payment state
- paid-only KDS release
- kitchen/station routing
- delivery orchestration
- subscription/add-on entitlement

### Haccora
Food-safety and compliance software included in the MealDeck franchise technology offer, with location access, configuration and training arranged through Dishbee.

### Omniqora
Optional AI/CRM/WhatsApp/voice/automation/analytics layer requested and billed through Dishbee.

## Launch location rules

### Luton
9 primary brands:
- Tavo Chicken
- Paratique
- Taconelle
- Load'd
- Vyta
- Tarka Box
- Fyrra
- Sabzora
- Skorch Burgers

Icova and Moktl are cross-menu add-ons.

Delivery, Pickup and Kerbside may be enabled by the location.

### St Albans
The same 9 primary brands + Café1 as the 10th.

Icova and Moktl remain add-ons.

Current MealDeck service:
- Delivery only
- Monday-Friday
- 09:00-16:00

Café1's direct/in-store menu remains separate from the curated Café1 MealDeck menu.

## Order/KDS rule

Checkout creates a Dishbee `payment_pending` order and a short handoff code.

**Normal MealDeck orders do not appear on KDS until payment is confirmed server-side.**

After payment:
1. Dishbee marks the order paid.
2. Dishbee creates KDS station tickets.
3. KDS shows brand colour, customer name and handoff code.
4. Kerbside additionally shows vehicle registration.
5. Delivery additionally enters the Dishbee last-mile orchestration flow.

## Delivery

Dishbee delivery orchestration can compare:
- MealDeck/Dishbee own fleet
- Uber Direct
- Deliveroo Express
- Just Eat Go
- Stuart where available

The customer sees one MealDeck delivery experience. Provider selection is internal.

## Customer tracking

`/track` uses the Dishbee public tracking RPC with:
- order UUID
- 4-digit handoff code

The public response is normalized and does not expose provider credentials or kitchen secrets.

## Configuration

Copy `.env.example` into your environment and add:

- Dishbee Supabase URL
- Dishbee public/anon key
- Luton tenant + location IDs
- St Albans tenant + location IDs

Payment and courier provider secrets stay server-side and are configured separately.

## Development

```bash
npm install
npm run dev
npm run build
npm run lint
```

## Franchise recruitment

The public `/franchise` hub offers two routes: the **full MealDeck concept** or **one, two, three or more individual brands**. The full concept retains its approved all-inclusive launch range, with the location/territory, equipment, technology setup, opening supplies and support described within that option. Individual brands and custom combinations are **POA**, as are all ongoing charges. No monthly prices, percentages, per-order charges, individual territory prices or launch-price components are exposed by the page or its public API.

Each of the 15 approved shared brands has its own promotional page at `/franchise/{brandId}`, including `/franchise/skorch`. Applicants can select and remove brands, compare the full package without losing their custom shortlist during the visit, and identify an existing kitchen or a new food business. Café1 remains exclusive to St Albans and is not offered as a standalone franchise in this catalogue; legacy ordering brands do not enter recruitment automatically.

Package selections use shareable `package=brands&brands=skorch,loadd` or `package=full` query parameters. Canonical SEO URLs stay specific to the hub or brand page, and supported campaign tags follow the applicant into the enquiry. The intake validates `answers.franchisePackage` and `answers.selectedBrandIds` before forwarding them to the configured service. A selected-brand enquiry requires at least one approved, unique ID; full MealDeck carries an empty individual-brand list. All existing territory protections still apply. See [brand recruitment integration notes](docs/franchise-brand-recruitment.md).

The private commercial brief and integration notes are in [docs/franchise-offer.md](docs/franchise-offer.md). They cover the revised channel fees, card-processing-first calculation, delivered-cost supply pricing and accounts/admin package. This document is for internal quotation and implementation planning; it is not imported into the website or an active billing configuration.

Set `OMNIQORA_PUBLIC_API_URL` on the server to the complete deployed franchise intake endpoint. Missing configuration produces an honest service-unavailable response; the site never confirms an application that has not been accepted by the service.

Run the franchise regressions with `bun test tests/franchise-offer.test.ts tests/franchise-api.test.ts tests/franchise-selection.test.ts`. The verification workflow also builds the site and checks the franchise implementation with ESLint.

