# MealDeck checkout delivery-charge integrity

## Issue addressed
The public checkout previously passed the browser's `deliveryPence` directly into the Dishbee `create_mealdeck_checkout_order` RPC. A modified browser request could ask for a lower delivery charge (including zero) even where the customer selected delivery.

## Fix
- The server now computes the launch delivery charge from the canonical MealDeck configuration.
- Client-submitted fees must exactly match that amount; stale or tampered requests receive a generic refresh/retry error.
- Pickup, kerbside and dine-in requests must specify zero delivery fee.
- The RPC only receives the server-calculated fee, never an amount taken directly from an untrusted form.
- Regression tests cover discounts, overcharging, channel switching and invalid numeric amounts.

## Important limits and next integration
This is the **fixed-fee launch policy**, not a live courier quotation or a provider booking. Future delivery surcharges, dynamic pricing, courier availability, discounts, credits and taxes must be calculated/validated by Dishbee on the **server**. A live delivery quotation should be bound to tenant, location, destination, order, currency, expiry and a one-time quote identifier; it must be revalidated under a transaction before payment finalisation and dispatch.

**The canonical order and amount must still be rechecked inside the Dishbee database.** Browser validation and a public server function alone do not prove trusted payment or permission to print KDS tickets. Paid-only kitchen release, Adyen webhook verification, rate limiting, fraud controls and secure pickup/handoff remain separate release gates.

The production launch is still controlled by `COMING_SOON`. No payment collection, live courier booking, production database migrations or provider credentials were added.

## Verification
```sh
bun test tests/mealdeck-checkout-delivery-fee.test.ts
bunx tsc --noEmit
bun run build
```
The repository GitHub Actions verification workflow runs these checks and its existing regression suite.
