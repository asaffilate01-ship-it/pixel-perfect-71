# Easier marketplace-style demo ordering

## Goal
Make the demo menu faster to understand and browse while keeping MealDeck’s dark red, gold, and subtle playing-card identity.

## What will change
- Replace the large postcode-first panel with a compact delivery/location control so food and brands appear much sooner.
- Let demo customers browse the sample marketplace immediately, with location selection remaining clear and editable.
- Rework brand navigation into recognisable logo-led restaurant selectors with active states and cuisine labels.
- On desktop, use a spacious marketplace layout: compact controls, scannable brand navigation, two-column food listings, and a persistent basket.
- On mobile, use familiar delivery-app patterns: compact top controls, horizontally scrollable restaurant logos, clear brand sections, large food photography, quick-add buttons, and a sticky basket summary.
- Keep one mixed-brand basket, one delivery fee, fulfilment choices, customisation, and checkout behaviour unchanged.
- Preserve Café1 as St Albans-only and all current location/service rules.

## Interaction details
- Selecting a brand jumps directly to its food and clearly identifies the restaurant and cuisine.
- “All brands” becomes an easy discovery view rather than a long undifferentiated list.
- Added items show an immediate quantity control instead of making customers hunt in the basket.
- Mobile customers can open the basket from a persistent bottom summary without covering the existing navigation.
- Empty, closed, loading, and preview-menu states remain clear and polished.

## Validation
- Test browsing, switching brands, adding/customising food, changing quantities, and opening checkout.
- Check desktop and phone layouts for clipped text, hidden controls, image problems, and overlap with the mobile navigation.
- Confirm the project builds without errors.

## Technical details
- Refactor the existing `/order` presentation only; retain current ordering functions and validation.
- Add focused order-page styles using the existing semantic theme tokens and shared controls.
- Keep the route’s current SEO metadata and backend integration boundaries.
