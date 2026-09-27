# MealDeck

**One Order. Every Craving.**

MealDeck is the customer-facing multi-brand ordering platform for the 313 Brands food portfolio. It behaves like an aggregator from the customer's point of view, while using Dishbee as the restaurant operations and ordering engine underneath.

This repository is connected to Lovable. Do not rewrite published Git history.

## Current customer flow

1. Choose **Delivery**, **Pickup** or **Kerbside**.
2. Enter a postcode.
3. MealDeck resolves the serving location through Dishbee serviceability.
4. The page shows only the primary brands and add-ons available at that kitchen.
5. Move between brands without losing the basket.
6. Customise items with a simple modifier sheet.
7. Checkout once.
8. The order is created as `payment_pending`.
9. Dishbee releases the order to KDS **only after payment confirmation**.
10. Pickup, kerbside and delivery use the customer name plus a short handoff code; kerbside also carries the vehicle registration.

Unsupported areas receive a clear coming-soon response rather than an empty menu.

## Launch location model

### Luton

- 9 primary brands:
  - Tavo Chicken
  - Paratique
  - Taconelle
  - Load'd
  - Vyta
  - Tarka Box
  - Fyrra
  - Sabzora
  - Skorch Burgers
- Icova and Moktl are cross-menu add-ons.
- Delivery, Pickup and Kerbside can be enabled subject to Dishbee location configuration.

### St Albans

- The same 9 primary brands plus **Café1** as the 10th.
- Icova and Moktl remain add-ons.
- Current MealDeck channel: **Delivery only, Monday-Friday 09:00-16:00**.
- Café1's own website/in-store menu remains separate; MealDeck exposes its curated delivery menu.

## Platform integration

### Dishbee

Dishbee is the operational backbone:

- menus and modifiers
- location/channel pricing and opening hours
- EPOS/POS and KDS
- stock and restaurant operations
- checkout and payment state
- paid-only KDS release
- delivery/pickup/kerbside handoff
- last-mile orchestration and tenant subscriptions

### Haccora

Haccora plugs into the food-safety/compliance layer:

- HACCP and compliance workflows
- operational records and evidence
- supplier/compliance controls
- location-level compliance visibility

### Omniqora

Omniqora supplies optional intelligence and communications:

- AI assistants and customer intelligence
- CRM
- WhatsApp and voice
- automation
- marketing and loyalty
- analytics and agentic workflows

Dishbee remains the tenant-facing billing/entitlement layer for these add-ons.

## Development

```sh
npm install
npm run dev
```

For live Dishbee data, copy `.env.example` to your local environment and configure the Dishbee Supabase URL/key. Location tenant/location IDs can also be set explicitly.

```sh
npm run build
npm run lint
```

## Repository / Lovable

This project was built with Lovable and remains synced with the Lovable project connected to this repository. Normal commits and merges are safe; do not force-push, rebase or amend published history.
