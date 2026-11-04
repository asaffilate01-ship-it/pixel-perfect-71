# MealDeck product truth

## Responsibility and deployment boundary

- Owner decision, 4 November 2026: **MealDeck is a trading name of 313 Brands Ltd**, with the technology credit **Powered by Dishbee**.
- MealDeck must use its **own Supabase project and database**, separate from Dishbee and Cafe 1. The standalone deployment is prepared; hosted provisioning and activation are still required. MealDeck owns its customer experience, tenants/kitchens/brands, menu records and modifiers, server prices, staff access, recipes, inventory, operational reporting, orders and shared kitchen display.
- Dishbee supplies the technology and may provide explicitly configured integrations. The technology credit does not make Dishbee's shared database a runtime dependency or authorize copying other merchants' records.
- Payment, release, refund and courier authority belongs to the verified server-side integration in the configured MealDeck backend. A fresh database and the foundation schema do not themselves implement or approve those integrations.
- Omniqora: optional cross-product communications/WhatsApp/voice, AI-assisted intents, customer CRM, messages, event/usage infrastructure and human escalation. Omniqora is not an alternative catalogue or payment authority.
- Cafe 1 EPOS: a separate merchant operation whose counter till, inventory, vouchers, SumUp and staff controls must remain isolated. Only explicitly mapped, authorised MealDeck catalogue/order integrations may share operational events.

Use the standalone deployment profile described in `docs/mealdeck-independent-backend-phase47.md` for a fresh MealDeck database. Historical migrations and integration documents describe the previous shared-Dishbee deployment; do not apply them alone to a new project or use them to override this decision. No data migration from Dishbee is implied.

The current kitchen uses one display for all brands, with one complete master-order card and preparation/packing together. Future kitchens get separately authorised views of their own orders; adding a brand does not require another screen.

## Launch and safety

Current source has `COMING_SOON = true`. Browse-only sample menus are not live availability. No registration, WhatsApp-order placement, customer payment or KDS release should be represented as operational. Do not remove this gate in a design or marketing PR.

Normal paid MealDeck orders require an accepted server-priced ordering/payment pathway in the independent MealDeck backend. A chat, browser redirect, model response, or client-side state update must **never** be used to mark an order paid or create kitchen tickets. The St Albans MealDeck channel's declared launch scope is delivery-only; Cafe 1's direct ordering modes are separate. Existing payment contracts can be adapted to the independent backend, but need their own provider, refund, replay and group-payment acceptance checks before activation.

## WhatsApp enquiry contract

The optional MealDeck handoff prepares **dish names, quantities, modifiers, location and requested fulfilment only**. It must not send the customer's phone, address, account data, prices, discounts, payment state or access tier in a URL. The official business number is supplied by server-only location configuration after operations approval. The chat is an **enquiry**, not an order.

Future automated agents require scoped, explicit tools; tenant/location routing; current server-read pricing; safe modifier selection; idempotent checkout; verified payment webhooks; and handoff to humans for ambiguity, allergens or unsupported requests. Agent text cannot confer order authority.

## Franchise and brand controls

Maintain approved franchise brand selection, territory protections, private commercial data and public POA disclosures separately. Marketing showcase and live kitchen menus must not share a hard-coded availability assumption.

## Build method

Work against the GitHub repository and run tests; do **not** invoke a Lovable project build. Preserve branch and migration history and avoid enabling payments/provider links without a signed-off staged acceptance test.
