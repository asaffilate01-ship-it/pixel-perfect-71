# MealDeck Phases 28-30 — signed quote + fresh checkout contract

3 November 2026 — source-only. These changes do **not** enable public
checkout or migrate Dishbee Supabase.

## Phase 28: two-minute signed quote

- Fetch the live MealDeck serviceability, canonical menu / modifier options
  and current delivery policy from Dishbee with server-owned identifiers.
- Issue a short-lived HMAC quote token bound to location, tenant, kitchen,
  fulfilment, postcode, selected item/option UUIDs, quantities, currency
  and the integer-pence subtotal, delivery fee and estimated total.
- The token contains a keyed fingerprint, not plaintext postcode or address.
  No browser-selected discount, item price or delivery amount is signed.
- A server secret of at least 32 bytes is mandatory; no configured secret
  means that a payable quote is unavailable.

## Phase 29: enforce freshness before creating even a pending order

- An order-creation request must include a valid signed token.
- The server compares the verified quote to the current canonical Dishbee
  menu, serviceability and fee, **again** before calling the existing
  create_mealdeck_checkout_order RPC.
- A changed item/option, kitchen, postcode, shipping mode or fee fails
  closed, requiring a fresh quote. Database enforcement remains separate.

## Phase 30: truthful checkout UX

- The future live ordering UI displays estimates for one delivery charge
  and all participating brands, never a fabricated total.
- Quote includes a two-minute deadline; the UI blocks stale prices and
  refreshes the quote while the basket is being reviewed.
- A customer can manually refresh prices. Pickup and kerbside receive a
  zero-delivery-fee signed quote only after Dishbee approves serviceability.
- St Albans MealDeck is delivery-only; Café1 EPOS remains separate.

## Required production work (not yet verified)

1. Dishbee draft PR #83 must undergo approved staging migration replay
   to secure the public checkout RPC against fee tampering; hosted SQL
   reads have been failing with read-only DB 28P01 authentication.
2. Implement and sandbox the dedicated MealDeck Adyen for Platforms
   checkout session endpoint, server ledger, signed capture/refund
   processing, group payment completeness and payout instructions.
3. Make pending-order creation **idempotent** under concurrent requests.
   Signed estimates can be reused while valid; without an atomic
   server-managed checkout attempt key, double requests may create two
   pending orders. Keep checkout disabled until this is addressed.
4. Confirm the final Dishbee order total against the signed amount before
   the customer authorizes payment. A signed estimate is not a
   reservation or a provider payment session.
5. Verify customer-facing payment method UI, CSP, accessibility, webhooks,
   RLS, cancellation/refund behaviour, KDS, single courier booking and
   handoff proofs in actual provider/Dishbee sandbox.
6. Preserve COMING_SOON=true and the separate MEALDECK_CHECKOUT_INTEGRATION_APPROVED
   gate OFF until staging approval. Keep signing secret server-only.

No Lovable credits, live Adyen transactions, courier bookings, customer
orders or migrations were performed to create this source update.
