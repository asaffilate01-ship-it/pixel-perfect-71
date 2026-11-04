# MealDeck Phase 42 — independent sample dish versions

The **browse-only** multi-brand basket can now contain several customisations of the same dish. Example: one Skorch burger with extra cheese and another without it.

## Behaviour
- **Another version** duplicates the selected dish as a separate one-serving line; diners can then customise its extras and change that version's quantity independently.
- The original line and every custom line retain distinct stable, UI-local variant IDs; two customised lines of the same dish count as separate lines but still belong to the same brand.
- Quantity, removal and undo work on the exact selected version. Undo re-reads the currently displayed sample catalogue rather than trusting removed price snapshots.
- Menu Add/Remove buttons target the uncustomised/base line. The dish summary counts all variants of that dish. Extras prices remain derived from the sample catalogue and multiplied by each line's own quantity.
- Basket totals remain capped at 60 sample dishes and 10,000,000 pence, with item/brand/pricing consistency and modifier group validation.
- Group sample splits use the total illustrative goods price from all variants.

## Important boundaries
No order, payment, live checkout, delivery booking, promotion, allergen claim or KDS dispatch is created. Variant IDs have no security significance and must **not** be reused as canonical Dishbee payment or order identifiers.

For production: reconcile all variants with current Dishbee menu IDs and modifier groups, enforce price and allergen constraints on the server, include variant line identity in group-payment shares and Adyen checkout idempotency, and confirm paid-only KDS routing under real staging tests.

Validation: `bun test tests/mealdeck-sample-variants.test.ts` and full GitHub verification.
