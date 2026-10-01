# MealDeck homepage and promotions

This phase delivers the consumer homepage only. `/` is a public marketing and menu preview. No order submission, payment, account creation, serviceability request, promo redemption or reward issuance is triggered by this page. Existing `/order`, `/track`, Dishbee server functions and operational configuration are unchanged.

## Frontend behaviour

- Crimson/ivory card identity with the approved brand-reveal artwork and a generated transparent wordmark derived from the selected logo. Artwork is stored locally in `public/`; the homepage does not depend on Lovable's private asset resolver.
- Responsive brand cards and food/drink/vegetarian filters. St Albans adds Café 1; other locations do not display it. Icova and Moktl remain cross-menu drinks.
- A postcode selects an **illustrative** LU/AL location preview. This is not delivery-zone validation and makes no serviceability promise. Other valid UK postcodes show the general preview.
- Accessible location, brand and offer dialogs; keyboard focus handling comes from the existing Radix Dialog component. Reduced-motion preferences are respected.
- Three featured offers, plus an expandable, filterable collection containing the other twelve proposals.
- Every offer opens its terms. Build Your Deck includes a local main/side/drink picker with sample prices, a £20 bundle minimum, 20% saving and a £5 cap. Nothing is saved or sent to the backend.
- The existing brand sample menus and bundle preview fixtures are illustrative and intentionally independent; they are not a production pricing catalogue. Replace both together at integration.

## Campaign catalogue

The 15 campaigns live in `src/lib/promotions.ts`, separate from the presentation components:

House Offer; Build Your Deck; Snap; Perfect Pair; Happy Families; Share the Deck; Lunch Shuffle; Fresh Pick; First Pick; New Card; Complete Your Deck; Back in the Deck; Pass the Deck; Birthday Card; Collect Your Deck.

They are all proposed offers. `promotionPolicy.mode` is `preview`. `featured` only determines merchandising placement, not activation or eligibility. Minimums, savings caps and terms are reviewable campaign copy, not a server-side entitlement engine. Do not activate the offers by simply changing a frontend flag.

## Later Dishbee / Omniqora handoff

Dishbee should provide a tenant/location/channel-scoped catalogue of eligible products and campaigns. Tenant and location identity must come from verified routing/session context. Landlord configuration and tenant entitlements determine which modules and offers are available. Omniqora can later provide eligible audiences, journeys and communications through that shared platform.

Before making any offer live, the backend must:

1. Replace preview products with canonical item IDs, verified prices, modifiers, allergens, stock and fulfilment availability.
2. Authoritatively quote the basket in integer pence. Apply Build Your Deck only to a complete eligible bundle and Snap only to one identical eligible pair. Never trust `quoteDeckPreview` or a submitted browser total.
3. Enforce one promotional benefit per order and one redemption per verified customer per local calendar day; prevent stacking with reward redemption and discounted bundles. Exclude delivery, service fees and paid upgrades from minimums and savings. Check reward, audience and anti-abuse eligibility server-side.
4. Enforce campaign/location dates, Europe/London schedules, approved product margins, daily redemption quotas and monetary budgets. Use atomic reservations and idempotent redemption to prevent concurrent over-redemption.
5. For group orders, validate all participating payments and apply the offer once to the complete group basket, never once per split payer.
6. Issue stamps/referral rewards after fulfilment, and define reversal/adjustment behaviour for cancellation, full refunds, partial refunds and previously spent rewards.
7. Provide clear unavailable/expired/budget-exhausted states, final customer terms, and a quote expiry/revalidation step before payment.

Do not add tenant secrets or provider credentials to the frontend. This change does not provision backend resources or change existing backend functions.

## Verification

- `npm run build`
- `npx tsc --noEmit`
- `npx eslint src/routes/index.tsx src/components/mealdeck-homepage.tsx src/components/promo-preview.tsx src/lib/promotions.ts`
- `node --test tests/promotions.test.ts` (Node 22.18+ / Node 24)

Browser checks cover desktop/mobile layout, missing images, page errors, menu filters, St Albans/Luton brand visibility, invalid postcode handling, modal dismissal, all offer detail dialogs, and discount minimum/cap/reset behaviour. Screenshots in `docs/previews/` show the implemented page.
