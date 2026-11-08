# MealDeck Luton: own-driver free delivery (controlled launch)

**Release state:** source code only. Not production-live until the dedicated MealDeck database migration, host flag and real-order tests pass. Existing collection and kerbside must remain unaffected.

## Business rules

- Kitchen postcode **LU4 8NU** (314–318 Selbourne Road, Luton).
- **3 km straight-line radius** from the origin postcode centroid to destination postcode centroid, using Postcodes.io. This is not a driving distance; edge cases may require a manual check.
- Free own-driver delivery when the canonical **payable total AFTER all discounts is £15 or more**. During the 30% opening offer this is the discounted figure, never the menu subtotal. £0 delivery fee.
- No registration required: guest name, WhatsApp/phone, full postcode, door or house number, road name and optional flat/building. Keep numbered bags, notes and cutlery.
- Default estimated delivery within 60 minutes of verified payment. Staff manually confirm driver handover then delivered. No live courier tracking or GPS location shown.
- Existing collection/kerbside KDS food checklists, customer review and Stripe verification remain unchanged.

## Safe go-live procedure

1. Ensure a real driver is on shift and the existing kitchen availability and manual overrides are configured.
2. Confirm the **dedicated MealDeck Supabase database** and its correct tenant and Luton location, not the separate DISHBEE project. Back up the database.
3. Apply existing post-install migrations in order. Apply deploy/mealdeck/post-install-migrations/20261107230000_mealdeck_local_driver_delivery.sql as one atomic transaction. The deploy/mealdeck/local-driver-delivery.mjs installer also offers a managed-transaction variant.
4. Verify the server-only MealDeck local-delivery-ready RPC confirms only the Luton kitchen and no public role can read private delivery tables.
5. Test one postcode inside and one outside 3 km; invalid/unavailable postcode lookups must reject delivery but preserve pickup checkout.
6. Test discounted payable amounts: £14.99 -> £0.01 short and blocked, £15.00 -> eligible, and a gross £16 basket discounted below £15 -> blocked. The server must reprice before Stripe.
7. Place a real guest order: phone/name and full street address, zero delivery charge, Stripe delivery wording, order receipt with 60-minute estimate.
8. Staff KDS: verify full address and contact, finish all brands and bag checklist, then explicitly Hand over to our driver, Confirm delivered, and review the guest receipt. Test stale cards, wrong roles and refunded orders cannot bypass permissions.
9. Mobile smoke test: menu, basket, postcode checks, guest checkout, Stripe, receipt, KDS, printer, collection and kerbside regression.
10. Only after successful real tests, set the **MEALDECK_OWN_DRIVER_DELIVERY_ENABLED** server environment setting to true. Redeploy and test again on the live domain.

## Rollback and privacy

- Turn the MEALDECK_OWN_DRIVER_DELIVERY_ENABLED switch off immediately if delivery cannot be fulfilled. If needed, also use the existing kitchen Pause/Closed switch.
- Do not delete paid order or payment audit records. Contact customers with already paid orders to deliver them or arrange a verified refund.
- Address data remains private in the scoped delivery table, is shown only on authorised kitchen tickets and is never copied into marketing analytics or broadcast push payloads.
- The server checks radius before quote and payment; an untrusted browser never supplies authoritative coordinates, serviceability, delivery fees or prices.
