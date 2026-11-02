# MealDeck multi-brand ordering — storefront phase 6

Source branch only, 2 November 2026. All work committed in the MealDeck GitHub repository, not Lovable. The site is intentionally still COMING_SOON=true. No payment, provider credential, live Postgres migration or delivery booking was changed.

## Implemented in MealDeck

- Premium browse-only discovery layout with per-brand navigation, location selector, postcode entry, filtered menu cards and Luton delivery/pickup/kerbside preview. St Albans MealDeck is delivery-only; Café1 St Albans has a separate channel/merchant.
- One **sample** multi-brand basket with illustrative item prices, add/remove controls and categories.
- Source-defined cross-brand offer rules. Example Skorch burger -> Load'd loaded side and Moktl mocktail, only if that target item exists in the currently supplied location catalogue. No discount or replacement is invented. At launch, real merchant-approved offer rules, stock, modifier and allergen validations must come from Dishbee.
- Invitee/group payment **preview**, with a pure, tested payment-progress function. The full group order engine already exists in Dishbee; no actual invite is sent from the MealDeck launch preview.
- Pickup, kerbside and delivery handoff checklists including payment verification, QR/order code, customer or courier proof, vehicle registration and delivery confirmation. These are future requirements, not live capabilities.
- Accessible, responsive cards and strong visual separation of preview and checkout. WhatsApp remains an enquiry, not a placed order.

## Repositories audited

- Cafe1 St Albans live EPOS/KDS software: asaffilate01-ship-it/cafe1-connect-dash. Its existing touchscreen KDS ticket model includes source/order number, item notes, timestamps, provider monitoring, staff and juror permissions, and Uber/Deliveroo/Just Eat bridge work.
- Cafe1 St Albans auxiliary repo: asaffilate01-ship-it/cafe1st (migration-heavy; not the full KDS UI).
- Dishbee Hive: asaffilate01-ship-it/dishbee-helper already provides group rooms and payment modes, delivery-orchestrator adapters, paid-only KDS release migrations, Adyen for Platforms session/split functions, and gated WhatsApp order work.
- MealDeck: asaffilate01-ship-it/pixel-perfect-71 storefront and existing PR #24.

The two separate Cafe1 locations and their live vendor/merchant credentials must be verified before any cross-tenant integration. The repository search returned cafe1st and cafe1-connect-dash; a separate independently identifiable Cafe1 Luton repository was **not verified**. Avoid claiming its KDS is integrated.

## Next implementation gates

1. True postcode to live Dishbee eligible location/brands/menu; do not derive delivery radius from sample addresses. Live stock, hours, allergens and branded modifiers must be tested for every channel.
2. Source-driven merchandising rules with actual item/option IDs, mutually-exclusive upgrade removal, maximum offers and staff-approved offers. Test correct price, tax, and per-brand discounts from the canonical server.
3. Multi-brand basket to single Hive master order, each brand's vendor KDS tickets, packaging, pickup proof and central pass; do not send to KDS before confirmed provider payment or authorised staff/account rules.
4. Split/group order room, unique invitee tokens and expiry, partial payments, host balance, no kitchen release until master paid, one delivery charge, missed-invitee handling, refunds and disputes.
5. Adyen for Platforms merchant/submerchant verification and real sandbox Apple Pay/Google Pay where merchant and domain are eligible. These wallets are *payment methods*, not equivalent to verified customer login.
6. Delivery orchestration across Uber Direct, Deliveroo Express, Just Eat Go, Stuart and own fleet, using approved partner contracts, capacity, quotes, ETA and price; fail closed on unsupported/unapproved providers. Driver QR scan, optional packing and delivery photo, handoff codes and liability audit.
7. Provider marketplace imports from Uber Eats/Deliveroo/Just Eat: canonical external order ID, notes/modifiers, acceptance and cancel flows, timestamps, prep status, paid confirmation and reconciliation. Importing an aggregator order is distinct from choosing a courier for a direct order.
8. Customer account, passkey/social sign-in (Google and Apple Sign In, not wallet login), consented marketing/loyalty, wallet, refunds, secure notifications, opt-out and account deletion/privacy.
9. Staging KDS with provider/source labels, one-card master pass, kitchen station/ticket routing, accepted/prep/ready/handed-over and delivered states, precise driver vs customer actions and safe immutable audit.
10. Full CI, cross-tenant RLS, database replay, sandbox provider payments, sandbox courier bookings, cancellation and chargeback tests. Production activation requires explicit signed operational sign-off.

No connected payment gateway or kitchen tickets were activated in this frontend phase.
