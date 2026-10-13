# MealDeck — Premium View & Order Journey (Phase 2)

## Goal

Bring MealDeck's customer browse experience closer to modern food ordering apps while maintaining the unique **one basket across many MealDeck brands** proposition. The design is MealDeck-original rather than a pixel copy of Careem, Talabat, Uber Eats or Just Eat.

### End-to-end customer journey

1. Choose fulfilment (delivery, pickup, kerbside or dine-in where available), town and postcode serviceability.
2. Select a food category. The taxonomy is defined in `src/lib/marketplace-discovery.ts`, with dish-first classification so a coffee does not appear as a dessert just because the same brand sells cakes.
3. Choose a brand using **photo-led tiles with existing approved MealDeck logo assets**. The exact same logo source in `src/lib/mealdeck.ts` is reused; no AI recreation of trademarks.
4. Browse that brand's dish menu, choose modifier options when required and add to the **same multi-brand cart**.
5. Discover drinks, desserts and other brand add-ons from the **real location catalogue**, with the actual current menu price and without invented deals or automatic extras.
6. On mobile, open the basket from the persistent bottom action; check all brands, quantities, delivery and pricing, then continue through the **existing** Dishbee payment-gated checkout.

### Phase 2 changes

- More restaurant-style brand cover photography and logo cards, including a selected-brand hero.
- Dish photo resolution: actual `item.imageUrl` takes priority; otherwise use existing illustrative MealDeck category/brand photography with the label `Illustrative`. Never imply the fallback image is an exact product shot.
- Local-device favourites. Favourites are **not** a synced account feature.
- Explicit **Save basket for later** and **Add saved basket** actions. The browser stores only item/option IDs and quantities, never customer personal information or prices.
- Saved basket restoration requires the **same location** and revalidates every current item, modifier group, option ID, price and quantity using the current catalogue; missing/changed options are skipped with a message.
- Correct French taco category icon sourced from approved `card-suit-french-taco.png`.
- Loading placeholders, keyboard focus rings, reduced motion and responsive layouts.
- Next-brand and brand-drawer controls use actual category/search results and correct current menu counts.
- Previous CSS token bug corrected: marketplace styles now use valid OKLCH `var(--...)` theme tokens, not `hsl(var(--...))`.

### Guarantees and exclusions

- Do not trust local favourite or saved-basket data to set order prices. Keep final checkout prices, taxes, fees, permitted modifiers and order status validated on the server.
- No discount is offered unless a real campaign/promotion backend supplies an eligible offer and the order service confirms eligibility.
- Do not imply MealDeck takes orders if a catalogue is only a browsing preview. Closed channels allow browsing, not checkout.
- Save basket is **not** verified prior order history. Reorder history, cross-device favourites, personalised customer-level AI recommendations, notification campaigns and live promotional codes require Dishbee identity, order-history and campaign services and are **not** enabled here.
- Restaurant category and saved-basket UI are MealDeck tenant front-end additions only. No Dishbee API contract, payment provider, KDS flow or database migrations are changed.

### Manual QA before live release

- On mobile 320px, 375px, 390px, 430px; tablets; laptop.
- Test each category → brand → menu → item options → add to basket → change brand → second item → one checkout.
- Confirm saved-basket restoration correctly handles price changes, removed items, missing modifiers and location mismatch.
- Confirm brand logos are approved, images are credited as illustrative where appropriate, accessibility names are sensible.
- Test postal-code failures and closed locations, preview catalogue blocks live payment, mobile drawer and basket overlay do not collide.
- Verify redirect to the real Dishbee payment process and KDS release occurs only after confirmed payment.

### Validation

Unit tests: `bun test tests/marketplace-discovery.test.ts tests/marketplace-preferences.test.ts`.
Full checks: `bun run build && bunx tsc --noEmit`, then a mobile smoke test. Existing GitHub Actions verification may report a runner-allocation failure before any steps execute; that is not a passing test.
