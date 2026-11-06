# Canonical meal contents and branded receipts

Source and verification record: 6 November 2026. The owner asked the kitchen to see what “Make it a meal” includes and asked for the approved MealDeck logo on receipts. The compatible client can be released before the meal database extension. This document does not claim that the new cash/meal migrations have been installed or that any printer has produced paper.

## What the kitchen sees

The database derives `mealComponents` from the purchased quote's frozen SKU, modifier group/option UUIDs and modifier kind. Editable display names never determine whether a meal, side or drink was purchased. The reviewed manifest contains 16 parent SKUs and 73 option bindings.

| Purchased choice                                                                           | Canonical inclusion summary                                                     |
| ------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------- |
| A Tavo adult main or one of the four Skorch burgers with the exact “Make it a meal” choice | Fries and the selected included can or water                                    |
| Tavo or Skorch Little Jacks nuggets meal                                                   | 6 nuggets, fries and the selected included drink                                |
| Peri salt selected for the included fries                                                  | Fries with peri salt; no additional side                                        |
| A named side replacement                                                                   | The selected loaded fries or mac and cheese replaces the standard side          |
| A named drink replacement                                                                  | The selected Moktl drink replaces the standard drink                            |
| Souvano Stir Fry Donner, Heatwave or Lamb Chops                                            | The actual selected fries, rice or naan; no invented included drink             |
| An extra side or drink                                                                     | Remains its own purchased child line; the main's included component is retained |

The seven Tavo adult identities are Cruncher, Twin Crunch, Flame, Big Flame, Fried Chicken Wings, Fried Chicken Tenders and Grilled Chicken Wings. The four Skorch identities are The Ace, Double Deal, Triple Stack and Four of a Kind. Portion and flavour choices remain visible in their original frozen modifiers. This projection does not turn a variant's internal price difference into a separately purchased item.

Each component has `slot`, `name`, `quantityPerParent` and `replacement`. A parent quantity of two therefore shows two included side portions and two selected drinks. The kids' main is described as “6 nuggets” per parent, rather than inventing a second priced line. Unknown, ambiguous or unsafe historical choices omit the inferred summary while retaining the original purchased text. A missing `mealComponents` field is valid legacy data.

Generic historic source upgrades can retain their exact frozen purchased label. They do not enable currently blocked milkshakes, choose an unspecified flavour, alter stock or grant a free extra. New availability still belongs to the canonical pricer and included-drink stock helper.

## Projection and receipt boundaries

The additive migration wraps the existing private KDS card and receipt snapshot functions. Active tickets, Done tickets and the paid-orders-awaiting-acceptance printer view receive the same optional component data. The original payment evidence, routing, staff authorization, item readiness and packing gates stay in place.

Only a future acceptance snapshot gains meal components. Existing `receipt_jobs.receipt` payloads, hashes, copy numbers, delivery attempts and paper confirmations are not rewritten. Reprinting an existing snapshot retains that snapshot. No order, quote, price, payment, stock or receipt-job row is updated by this migration.

The cash migration supplies one private quote lookup covering ordinary Stripe, shared/Terminal and cash sources. It returns a quote only when exactly one source exists. The meal projection uses that lookup and preserves the cash receipt label supplied by the canonical cash snapshot. A meal component contains no money or payment authority.

## Installation order and exact guards

Use the reviewed complete migration in one transaction. Numbering, included-drink stock and order notes are prerequisites for the cash extension. Apply:

1. `20261106201017_mealdeck_staff_cash_orders.sql`.
2. `20261106201311_mealdeck_meal_components.sql`.

The separate receipt-archive extension may already be installed; meal contents do not change archive or print-delivery handling. `buildManagedMealComponentsSql` removes the transaction wrapper only when its caller explicitly owns one atomic transaction for one complete migration.

The meal migration requires these reviewed function bodies and refuses an unknown definition:

| Function before meal installation                     | Required `md5(prosrc)`             |
| ----------------------------------------------------- | ---------------------------------- |
| `mealdeck_private.order_checkout_quote_id(uuid)`      | `ad869575c58ca66ef8e00b23290438fa` |
| `mealdeck_ops_private.kds_order_card(uuid,jsonb)`     | `82df803179b9a6ba38c629cc80cda25e` |
| `mealdeck_ops_private.receipt_snapshot(uuid)`         | `880995efe09dfd02f710ea2a87cfd6a4` |
| `public.mealdeck_printer_acceptance_board(uuid,uuid)` | `ffbf0371323dda3ca7b6d61281f8d83d` |

Frozen meal migration SHA256: `7ab065a28d6cfab9fe5cd3b1ab44b5e9fcb3b6309acd1f6725f94382d58b510e`.

Reviewed manifest SHA256: `19eba51ff903ecc59b7ed958d146a00e93a4c0f55672eddf192e613274475f77`.

Private helpers and preserved aliases have no execute grant for `PUBLIC`, `anon`, `authenticated` or `service_role`. The existing pending printer board retains authenticated execution and its existing printer-scope checks. No new anonymous or service-role entry point is introduced.

An authorized database owner can verify installation without fetching customer details:

```sql
select n.nspname as schema_name, p.proname, md5(p.prosrc) as body_md5,
       p.prosecdef as security_definer, p.proconfig,
       has_function_privilege('anon', p.oid, 'EXECUTE') as anon_execute,
       has_function_privilege('authenticated', p.oid, 'EXECUTE') as authenticated_execute,
       has_function_privilege('service_role', p.oid, 'EXECUTE') as service_execute
from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where p.oid in (
  to_regprocedure('mealdeck_private.meal_components(uuid,jsonb)'),
  to_regprocedure('mealdeck_ops_private.kds_order_card(uuid,jsonb)'),
  to_regprocedure('mealdeck_ops_private.receipt_snapshot(uuid)'),
  to_regprocedure('public.mealdeck_printer_acceptance_board(uuid,uuid)')
)
order by n.nspname, p.proname;
```

Expected post-install body hashes are respectively `5f46ada643542e03e8b56fd8fe8d6205`, `58fd2c865f6eae94384cbc7c8a32f192`, `dabd8842f5ecedab177917950de317e5` and `ada5cdbd34a941c603d4c32935aa0cc8`. Check an explicitly selected paid order through its ordinary authorized KDS/printer reads; do not create a synthetic paid order for visual verification. Compare any pre-existing receipt payload digest before and after installation to establish that it was preserved.

## Approved logo and printer output

Browser receipts use the complete local approved asset `src/assets/approved-logos/mealdeck.webp`. Its decoded RGBA SHA256 is `189f6d001fc02fae56197c6f9d771892ca1f6fae79625600c5596ad4f47639c3`. The existing print path preloads the image and waits for the rendered receipt image before `begin_send`. A logo failure does not authorize a physical send. Closing a print dialog still does not prove paper was produced.

The supported Node ESC/POS renderer uses `tools/receipt-bridge/build-logo.py` to verify the approval manifest and derive the complete artwork on a white background, proportionally resized to 256×258 and thresholded to monochrome. It does not crop or redraw the branding. Reproduce it from the repository root with `python3 tools/receipt-bridge/build-logo.py` in the existing Pillow environment. The raster SHA256 is `c0fbaa3f0d4df08e0ab3841f1489868b4bb17a3ad213b6da745a95d64db233d0`.

The fixed graphics frame uses Epson's documented [GS ( L function 112 raster buffer](https://download4.epson.biz/sec_pubs/pos/reference_en/escpos/gs_lparen_cl_fn112.html) and [function 50 print buffer](https://download4.epson.biz/sec_pubs/pos/reference_en/escpos/gs_lparen_cl_fn50.html), checked on 6 November 2026. The renderer emits one trusted logo, the receipt text and the configured cut. Receipt data cannot supply image URLs, markup or raster bytes. The canonical claimed-receipt comparison, payload fingerprint and durable one-copy journal are unchanged.

These commands require commissioning against the actual configured printer. The Node/POSIX/TCP bridge is not a built-in Senraise Android adapter, and the receipt logo does not establish integrated-device compatibility. See [the Senraise status record](./mealdeck-senraise-printer-status.md) and [the sound and receipt client release](./mealdeck-staff-audio-and-receipt-logo.md).

## Focused verification

`tests/postgres/meal-components-behavior.mjs` passed seven actual PostgreSQL/PGlite behavior groups: frozen generation and rollback/replay; all 16 parent identities; peri and all 17 named replacements; extras/unknown/unsafe choices; unpaid exclusion through paid acceptance and Done; cash composition; and private ACL/guard failure. It compares historical business and receipt digests across installation.

The receipt client suite passed 14 tests with 123 assertions. All 31 Node bridge tests passed, including fixed-raster framing/hash, strict optional fields, unchanged canonical receipt comparison, transport and durable-journal behavior. These establish source and local protocol behavior, not actual speaker volume, printer pairing or physical paper output. Native PostgreSQL release gates and production installation are recorded separately by the release owner.
