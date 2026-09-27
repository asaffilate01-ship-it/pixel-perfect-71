# MealDeck

**One Order. Every Craving.**

MealDeck is the customer-facing multi-brand ordering platform for the 313 Brands food portfolio. Customers enter a postcode, choose the fulfilment they want, move freely between available brands, keep one basket and checkout once. Dishbee is the restaurant operating engine underneath.

This repository is connected to Lovable. Keep normal Git history: do not force-push, rebase or amend published commits.

## Customer flow

1. Choose **Delivery**, **Pickup** or **Kerbside**.
2. Enter a postcode.
3. Dishbee serviceability resolves the MealDeck kitchen serving that postcode.
4. The site shows the location-specific brands, menu and live opening state.
5. Customers switch between brands without losing the basket.
6. Product modifiers are handled in a simple mobile-friendly sheet.
7. Icova and Moktl can be surfaced as cross-menu add-ons.
8. Checkout creates a `payment_pending` order.
9. **Normal orders do not enter KDS until payment confirmation.**
10. Once paid, Dishbee creates the station KDS tickets and the kitchen starts work.

Unsupported areas receive a clear coming-soon response. Manchester postcodes currently receive a Manchester-specific coming-soon message in the sample/fallback resolver.

## Launch model

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
- Icova and Moktl are add-on brands.
- Delivery, Pickup and Kerbside can be enabled by the location.

### St Albans
- The same 9 primary brands.
- Café1 is the 10th primary brand for St Albans.
- Icova and Moktl remain add-ons.
- MealDeck channel: **Delivery only, Monday-Friday 09:00-16:00**.
- Café1's own website and in-store menu remain separate from its curated MealDeck delivery menu.

## KDS handoff

The Dishbee KDS uses brand colour cues and fulfilment information.

- **Pickup:** customer name + handoff code.
- **Kerbside:** customer name + vehicle registration + handoff code.
- **Delivery:** customer name + handoff code.

The code is created with the order, but the order is not released to the KDS until payment is confirmed.

## Platform integration

### Dishbee
Restaurant operating layer:
- menus and modifiers
- channel pricing and opening hours
- EPOS/POS and KDS
- stock and operations
- checkout and payment state
- paid-only KDS release
- pickup / kerbside / delivery orchestration
- tenant subscriptions and add-on entitlements

### Haccora
Food-safety and compliance layer:
- HACCP workflows
- compliance records and evidence
- supplier/compliance controls
- location-level assurance

### Omniqora
Intelligence and communications layer:
- AI assistants
- CRM
- WhatsApp and voice
- automation
- marketing and loyalty
- analytics and agentic workflows

Dishbee remains the tenant-facing billing/entitlement gateway for optional Haccora, Omniqora and other add-ons.

## Development

```sh
npm install
npm run dev
```

For live Dishbee data, copy `.env.example` into your environment and add the Dishbee Supabase URL/key plus the Luton and St Albans tenant/location IDs.

```sh
npm run build
npm run lint
```

## Lovable

The project is synced with the Lovable project attached to this repository. Normal commits and merges sync back into Lovable.
