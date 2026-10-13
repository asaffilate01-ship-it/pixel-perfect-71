# MealDeck — category-first, multi-brand ordering

## Customer experience (October 2026)

Order route: `/order`. The flow now starts with **postcode/location → food category → participating brand → dish/customisation → shared basket**. Customers can also search by dish, brand, category or description and choose **Browse all dishes** rather than selecting a single kitchen.

This is an original MealDeck interface informed by mainstream delivery-app usability, not a clone of their protected visual assets or brand language.

### Browse experience

- Category chips are derived from the actual selected-location catalogue; empty categories are not displayed.
- French tacos use MealDeck's **approved French-taco suit illustration**, never a conventional taco emoji.
- Restaurant tiles use the existing approved brand logo, the existing cover image and the real count of matching items.
- All eligible primary and add-on brands (including Icova and Moktl) are accessible in the ordering discovery, without duplicating menus or creating separate orders.
- The customer can switch category or brand, or search across all brands, without clearing the basket.
- Switching location clears the basket if it contains items, so dishes cannot be sent to a different venue; this remains the existing safety behaviour.

### Basket, modifiers and cross-selling

- Items are grouped visually by their brand, with their own subtotals.
- One checkout and one delivery fee remain the existing MealDeck calculation; checkout sends all line item IDs and chosen modifiers together to Dishbee.
- Basket and menu show **contextual optional suggestions** drawn from that location's returned catalogue only. They prefer a missing drink, side and dessert, followed by a different brand. Suggested prices are actual returned prices and any item with existing modifiers still opens the proper customisation dialog.
- No item is auto-added. No hidden discounts, invented free food, fabricated popularity or claims that a deal is live.
- Checkout is visibly gated when Dishbee returns a preview/sample menu, or when the channel is closed.

### Live order & promotion integrity

This feature **does not** change Dishbee's order/session contracts, payment, fulfilment routing, KDS release, delivery, commission or invoice systems. The same server RPC `create_mealdeck_checkout_order` remains the single authoritative order creator.

Dishbee has a `promotions` table, but MealDeck still needs a **public, server-validated promotion eligibility + final-price API** before it can offer promotions or display saved-price claims. Do not show a discount badge based only on marketing text. Backend must validate location, tenant, customer limits, item eligibility, stock, channel, VAT and basket total and must ensure the same discount is applied in authoritative checkout. All purchases can later earn guaranteed Dishbee loyalty points, independently of games.

### Fulfilment constraints

Dishbee's current MealDeck St Albans channel is **delivery-only**. The order page and location page now reflect this limitation; pickup/kerbside/dine-in options require Dishbee channel activation before being advertised as online fulfilment.

### Acceptance checks

1. Luton: choose Burgers → Skorch → add customised smashburger → switch to French tacos → Taconelle → add one taco → Drinks → Icova. Basket remains one order grouped by brand.
2. Search `Taconelle`, search `lasagne` in St Albans, clear search, and return to categories; results must come only from the selected location's menu.
3. Only approved brand logos are shown. French tacos must use the correct grilled folded-wrap icon, not a Mexican taco shell.
4. Remove and adjust quantities in each brand group; line prices, subtotal and one fee recalculate.
5. Check `Complete your meal` suggestions, click Add, open modifiers and confirm an explicit add. Cross-sells must never become orders automatically.
6. Switch location with items in basket and verify warning/reset; St Albans disabled online fulfilment modes must stay disabled.
7. In sample mode, checkout is disabled and correctly labelled. In live mode, confirm backend acceptance and payment handoff independently before release.
8. Run `bun test tests/order-discovery.test.ts`, `bun run build`, `bunx tsc --noEmit`, and browser/device QA at 360 px, 390 px, tablet and desktop widths.

## Known external blockers

- CI job on GitHub currently reports runner_id=0/steps=[] rather than executing tests. Re-run validation after Actions runner provisioning is fixed.
- Live promotions/discount claims require Dishbee API + settlement checks.
- Fulfilment and menu opening times are authoritative in Dishbee; static sample fallback cannot certify real-time restaurant availability.
