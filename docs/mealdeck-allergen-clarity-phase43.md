# MealDeck Phase 43 — allergy and dietary information clarity

## Safety gap resolved
The public order route is intentionally browse-only, and its sample menus do not carry operator-verified ingredient, allergen, cross-contact or modifier allergen declarations. A missing or empty `allergens` array must not be presented as "allergen free".

## Customer experience
- Each preview item makes the **unverified allergen status** visible.
- The basket displays a plain-language warning to confirm ingredients and cross-contact risks with the kitchen before ordering.
- Customised lines explain that sauces, sizes, toppings and other extras can change ingredients and allergens, so the exact version must be checked.
- Vegetarian and other dietary category labels carry an explicit disclaimer when present.
- We do not derive ingredient or allergen data from item names, categories, brand claims or sample modifier names.

## Production requirements
Do not treat this preview as an authoritative allergen matrix. The Dishbee production menu needs per-item and per-modifier reviewed ingredient declarations, validated cross-contact and preparation notices, versioned records, role-based approval and revalidation when a customer changes any customisation. A customer allergy notice is not a substitute for the operator's food information responsibilities. Payment and KDS remain gated.

Run `bun test tests/mealdeck-preview-allergens.test.ts` and GitHub CI. No menu, payment, database or kitchen writes occur in this phase.
