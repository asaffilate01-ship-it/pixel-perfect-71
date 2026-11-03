# MealDeck Phase 27 — current Dishbee menu and delivery estimates

## Built in GitHub, not activated for customer orders

- The read-only estimate server function rechecks postcode and canonical
  tenant+location through public_mealdeck_serviceability.
- It loads the current public_mealdeck_catalogue, verifies each selected
  item, modifiers, group selection limits and unit price using Dishbee's
  current catalogue (not browser-supplied values).
- It asks public_mealdeck_delivery_fee for the single Dishbee location
  policy charge. If the policy does not exist or the RPC fails, it returns
  unavailable, not a fabricated free/flat quote.
- The cart displays one **estimated** delivery amount and total only while
  the quote is supported. Otherwise checkout remains unavailable.
- placeOrder no longer accepts or forwards a browser delivery amount; the
  legacy p_delivery_pence argument is deliberately sent as zero, and only
  Dishbee may compute the real configured fee. The upstream database
  price-integrity migration is in Dishbee draft PR #83 and is a RELEASE
  PREREQUISITE, not deployed by this MealDeck change.
- No live orders, provider sessions, payments or courier bookings activated.

## Go-live blockers

1. Prove draft Dishbee PR #83's schema migration on approved staging with
   the real Dishbee migration chain. Current connected read-only DB queries
   fail 28P01 and this was not run against any database.
2. Do not enable COMING_SOON=false until there is a dedicated Dishbee
   MealDeck Adyen for Platforms payment session, correct capture/refund
   handling and signed webhook events for **each** participant share.
3. Verify KDS release only after full captured payment, complete station
   pass, one courier booking and secured handoff. No fallbacks to browser
   delivery fees, estimated menu prices, chats or redirects.
4. Test accessibility and live device checkout, stale basket, closed
   kitchen, wrong postcode, unavailable options, free delivery threshold,
   failed webhook and replay/idempotency in sandbox.
5. St Albans MealDeck remains delivery-only; Café1 standalone EPOS rules
   are separate.

Note: An estimated catalogue price must be confirmed against the
canonical order total before the customer authorises their actual payment.
