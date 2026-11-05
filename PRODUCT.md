# MealDeck product truth

## Responsibility and deployment boundary

- Owner decision, 4 November 2026: **MealDeck is a trading name of 313 Brands Ltd**, with the technology credit **Powered by Dishbee**.
- MealDeck must use its **own Supabase project and database**, separate from Dishbee and Cafe 1. Its reviewed independent foundation was installed atomically on 5 November 2026; confirmed owner bootstrap and authenticated acceptance are still pending. See `docs/mealdeck-cloud-deployment-status.md` for the precise deployment state. MealDeck owns its customer experience, tenants/kitchens/brands, menu records and modifiers, server prices, staff access, recipes, inventory, operational reporting, orders and shared kitchen display.
- Dishbee supplies the technology and may provide explicitly configured integrations. The technology credit does not make Dishbee's shared database a runtime dependency or authorize copying other merchants' records.
- Payment, release, refund and courier authority belongs to the verified server-side integration in the configured MealDeck backend. A fresh database and the foundation schema do not themselves implement or approve those integrations.
- Omniqora: optional cross-product communications/WhatsApp/voice, AI-assisted intents, customer CRM, messages, event/usage infrastructure and human escalation. Omniqora is not an alternative catalogue or payment authority.
- Cafe 1 EPOS: a separate merchant operation whose counter till, inventory, vouchers, SumUp and staff controls must remain isolated. Only explicitly mapped, authorised MealDeck catalogue/order integrations may share operational events.

Use the standalone deployment profile described in `docs/mealdeck-independent-backend-phase47.md` for a fresh MealDeck database. Historical migrations and integration documents describe the previous shared-Dishbee deployment; do not apply them alone to a new project or use them to override this decision. No data migration from Dishbee is implied.

The current kitchen uses one display for all brands, with one complete master-order card and preparation/packing together. Future kitchens get separately authorised views of their own orders; adding a brand does not require another screen.

## Launch and safety

Admin Overview and Finance provide one saved kitchen state: Online, Busy, Paused or Closed. State changes are immediate authenticated owner/admin actions. Online and Busy retain every payment, menu and schedule requirement; Busy displays the actual configured pickup estimate. Paused and Closed stop new orders until the operator changes the state, while existing payment reconciliation, kitchen work and private receipts continue. A changed estimate expires unprepared quotes so customers review the current pickup time. Already prepared provider sessions retain their original estimate. See `docs/mealdeck-kitchen-availability.md`.

The owner's latest detailed Skorch, Tavo, Load’d, Moktl and Souvano menu and prices on 5 November 2026 supersede the earlier £20 placeholders. Souvano has three mains at £6.50/£6.99/£9.99, each including fries/rice/naan. Tavo wings and tenders use exact flavour/portion combinations. A cross-brand replacement is charged once as an upgrade; a separately added product is charged as an extra. Brand-specific drinks, add-ons and side prices must remain distinct. Milkshake upgrades retain the supplied £2.99 price but remain unavailable until the owner supplies their flavour choices. The catalogue import preserves subsequent administrator price edits when rerun; any explicit price revision checks the expected old value and reports conflicts.

The opening-weekend campaign is 30% off all available food, drinks and upgrades, no minimum order, for guests and registered members choosing collection or kerbside in Luton. The owner confirmed Friday 6 November 2026, 15:00–23:00, and Saturday 7 and Sunday 8 November, 13:00–23:00, Europe/London. New checkout is closed between those daily windows. Browser time, registration time and marketing consent cannot establish offer eligibility.

The owner's latest consumer promotion list contains exactly three offers: that 30% entire-menu opening offer on 6–8 November; milk cake for 99p with every order on Sunday 8 November; and double loyalty points when customers register and spend £15 or more by and including Friday 13 November 2026. Earlier free-burger, half-price, 2-for-1, multibrand money-off, group-bonus and 10× streak promotions are retired. Registration does not imply marketing consent. No cake flavour/size, extra cap, stacking rule, base points rate or spend calculation basis has been invented. The public terms live in `src/lib/mealdeck-offers.ts` and `/offers`. The canonical cake product/pricing and automatic points awards still need setup; their source configuration remains inactive. See `docs/mealdeck-offers-20261105.md` for the precise activation gaps.

Guests may order without registering during those exact opening windows. Guest orders earn no loyalty points, create no Auth/member account and do not grant member-only offers or marketing consent. A necessary 30-day secure HttpOnly cookie protects same-browser guest receipts; only its hash is persisted in the private database. Matching a member's email never grants access to that member's orders. Guest receipt access continues after the opening window closes until the session expires or is ended; creating new guest quotes or payment sessions does not. After the weekend, member ordering follows the existing configured channel controls. Registered, verified membership is required for member offers and optional promotional email/push preferences.

Delivery is unavailable for this launch; checkout displays that message and allows collection or kerbside only. The customer receives their order number, a configured kitchen pickup estimate and progress from placed through accepted, preparing, ready and completed. Payment confirmation releases a queued KDS order; staff acceptance is a separate action. Every purchased item must be marked ready before whole-order readiness, with packing and handoff checks intact. A dedicated printer PWA handles the acceptance receipt queue separately from the one shared kitchen display.

The local receipt bridge verifies the canonical paid receipt independently before one bounded printer send. Refreshes and reconnects do not reprint; uncertain sends require operator paper confirmation and an audited explicit replacement if needed. Each detailed receipt item includes its bag allocation alongside its flavours and extras. The physical printer model, local certificate, printer configuration and paper/cutter behaviour still require commissioning; network transmission alone is never proof of a printed receipt. See `tools/receipt-bridge/README.md`.

Customer registration asks for name, email and phone, verifies the email and keeps optional email marketing, promotional notifications and order alerts separate. Marketing starts unticked and is never required for the discount. An address is requested only for delivery. Kerbside requires car make, colour and the last four registration characters. Customer sessions and permissions remain separate from staff access. Loyalty earning and redemption require configured published rules; do not fabricate a points value.

Before paying, customers review exactly what they ordered, including quantities, flavours, extras and the final total. Cutlery is optional. Customers can request numbered bags and assign item quantities to Bag 1, Bag 2, Bag 3 and so on. Every quantity must be assigned exactly once, with attached meal extras kept alongside their main. The same bag numbers and cutlery request must reach the immutable paid order, customer receipt, kitchen display and printer receipt. WhatsApp ordering is coming soon; there is no active order link until that channel is configured and approved.

The owner confirmed that **only Luton launches in this phase**. St Albans and Bedford remain coming soon. The Luton payment scope includes online ordering plus planned staff-assisted walk-in and kerbside collection through Stripe Terminal. Phone Tap to Pay needs a native staff integration; a future server-driven smart-reader flow can extend the PWA. Neither staff sale entry nor Terminal payment collection is implemented by the online checkout or receipt bridge. Both future collection routes must share current canonical prices, the original order and verified payment evidence before releasing the one shared kitchen display. See `docs/mealdeck-in-person-payments.md`.

The owner has requested checkout and backend activation, and confirmed that the project belongs to a separate Lovable account. Access to that project has been restored. Repository changes alone cannot establish hosted activation. Public launch-menu prices remain source-owned until the canonical public catalogue and its stable item mapping are installed and connected. Do not claim admin edits already update the public menu.

The historical ordering path retains `COMING_SOON = true`. Customer registration has its own configured readiness and can open before paid ordering. Browse-only sample menus are not live availability. The new checkout must use its actual server/database/payment readiness; never advertise provider acceptance or KDS release merely because a route or publishable key exists.

Normal paid MealDeck orders require an accepted server-priced ordering/payment pathway in the independent MealDeck backend. A chat, browser redirect, model response, or client-side state update must **never** be used to mark an order paid or create kitchen tickets. The St Albans MealDeck channel's declared launch scope is delivery-only; Cafe 1's direct ordering modes are separate. Existing payment contracts can be adapted to the independent backend, but need their own provider, refund, replay and group-payment acceptance checks before activation.

## WhatsApp enquiry contract

The optional MealDeck handoff prepares **dish names, quantities, modifiers, location and requested fulfilment only**. It must not send the customer's phone, address, account data, prices, discounts, payment state or access tier in a URL. The official business number is supplied by server-only location configuration after operations approval. The chat is an **enquiry**, not an order.

Future automated agents require scoped, explicit tools; tenant/location routing; current server-read pricing; safe modifier selection; idempotent checkout; verified payment webhooks; and handoff to humans for ambiguity, allergens or unsupported requests. Agent text cannot confer order authority.

## Franchise and brand controls

Maintain approved franchise brand selection, territory protections, private commercial data and public POA disclosures separately. Marketing showcase and live kitchen menus must not share a hard-coded availability assumption.

## Build method

Work against the GitHub repository and run tests; do **not** invoke a Lovable project build. Preserve branch and migration history and avoid enabling payments/provider links without a signed-off staged acceptance test.
