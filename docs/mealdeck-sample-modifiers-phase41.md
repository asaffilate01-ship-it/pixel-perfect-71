# MealDeck Phase 41 — sample dish extras

This phase adds **nontransactional** customisation to the coming-soon sample basket.

## Behaviour
- Choose optional extras (e.g. sauce, cheese, size) in the expanded basket line. Selections apply to **all units of that dish** in the sample deck; distinct customised variants are intentionally not supported in this preview.
- Use only the existing sample menu's modifier group IDs and configured price deltas. Group minimum/maximum selections, duplicates and invalid prices fail closed.
- Recalculate illustrative goods subtotal from per-serving item price plus modifiers, multiplied by quantity. One master basket can still contain multiple brands.
- Customer can edit quantity, remove and undo, or clear the basket from the earlier phases. No fulfilment charge, payment session, order, KDS ticket or courier booking is produced.
- This is not an allergen safety assertion or a promise of live menu availability. Real options, stock, prices and allergen details require operator-approved Dishbee records and server revalidation.

## Before enabling real orders
Implement unique variant line identity, modifier-aware menu and cart RPC payloads, mandatory group validation on the canonical Dishbee service, server repricing, allergen confirmations, and Adyen/KDS staging acceptance. Do not submit these sample selections to live checkout.

Regression: `bun test tests/mealdeck-sample-modifiers.test.ts`.
