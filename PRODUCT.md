# MealDeck product truth

## Responsibility and deployment boundary

- MealDeck: consumer-facing restaurant discovery, kitchen choice, one multi-brand basket, transparent checkout/tracking UX, offers and franchise marketing.
- Dishbee: authoritative tenant/location, live menus and modifiers, server prices and discount eligibility, payment/order state, KDS and station tickets, central pass, delivery selection, EPOS connectors and provider credentials.
- Omniqora: optional cross-product communications/WhatsApp/voice, AI-assisted intents, customer CRM, messages, event/usage infrastructure and human escalation. Omniqora is not an alternative catalogue or payment authority.
- Cafe 1 EPOS: a separate merchant operation whose counter till, inventory, vouchers, SumUp and staff controls must remain isolated. Only explicitly mapped, authorised MealDeck catalogue/order integrations may share operational events.

## Launch and safety

Current source has `COMING_SOON = true`. Browse-only sample menus are not live availability. No registration, WhatsApp-order placement, customer payment or KDS release should be represented as operational. Do not remove this gate in a design or marketing PR.

Normal paid MealDeck orders must reach Dishbee's existing server-priced ordering/payment pathway. A chat, browser redirect, model response, or client-side state update must **never** be used to mark an order paid or create kitchen tickets. The St Albans MealDeck channel's declared launch scope is delivery-only; Cafe 1's direct ordering modes are separate. Outstanding safety work is tracked in the existing draft MealDeck payment/tenant PR and its Dishbee counterpart.

## WhatsApp enquiry contract

The optional MealDeck handoff prepares **dish names, quantities, modifiers, location and requested fulfilment only**. It must not send the customer's phone, address, account data, prices, discounts, payment state or access tier in a URL. The official business number is supplied by server-only location configuration after operations approval. The chat is an **enquiry**, not an order.

Future automated agents require scoped, explicit tools; tenant/location routing; current server-read pricing; safe modifier selection; idempotent checkout; verified payment webhooks; and handoff to humans for ambiguity, allergens or unsupported requests. Agent text cannot confer order authority.

## Franchise and brand controls

Maintain approved franchise brand selection, territory protections, private commercial data and public POA disclosures separately. Marketing showcase and live kitchen menus must not share a hard-coded availability assumption.

## Build method

Work against the GitHub repository and run tests; do **not** invoke a Lovable project build. Preserve branch and migration history and avoid enabling payments/provider links without a signed-off staged acceptance test.
