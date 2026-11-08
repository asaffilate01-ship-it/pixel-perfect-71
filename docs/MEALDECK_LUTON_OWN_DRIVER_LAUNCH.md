# MealDeck Luton: own-driver free delivery (controlled launch)

**Release state (8 November 2026):** the dedicated MealDeck production migration is installed and has been read-verified. Delivery is still **disabled in the website runtime** until end-to-end acceptance, printer v0.2.3 installation and a driver on shift are verified. Existing collection and kerbside must remain unaffected.

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
9. Install the separate **printer-address** post-install migration `deploy/mealdeck/post-install-migrations/20261108074000_mealdeck_printer_delivery_address.sql` after the own-driver migration. It reads the immutable saved delivery quote using the existing printer claim identity, never includes the address in the priced receipt fingerprint or native journal, and returns no new public RPC. Build and install signed v0.2.3 H10S APK: prior APKs reject delivery. Verify one real staff-accepted paid delivery order prints **OWN DRIVER DELIVERY**, customer name/phone, full **DELIVER TO** address, all dishes and rotating footer on one complete receipt. Pickup/kerbside must remain unchanged. Missing/invalid address must hold, not silently print. Repeat on the website printer queue as well as the native bridge.
10. Mobile smoke test: menu, basket, postcode checks, guest checkout, Stripe, receipt, KDS, printer, collection and kerbside regression.
11. Only after successful real tests, set the **MEALDECK_OWN_DRIVER_DELIVERY_ENABLED** server environment setting to true. Redeploy and test again on the live domain.

## H10S v0.2.3 signed update (mandatory before enabling delivery)

The Android printer v0.2.2/build 4 rejects the new `delivery` receipt type.
v0.2.3/build 5 adds it **and** prints the independently authorised delivery destination and saved contact above the purchased items, while keeping the existing app ID
`uk.co.mealdeck.printer`, receipt journal and exact single-bitmap send protocol.

1. Complete source build, KDS, payment and Android instrumented tests on the delivery PR.
2. Preserve the original v0.2.2 signing identity. The old workflow which
   **generated a new private key on each run is removed**. A different
   certificate cannot update an installed v0.2.2 APK.
3. Recover the original private `mealdeck-printer-release.p12` and its
   store password *privately* from the existing encrypted owner backup.
   Configure the protected GitHub Actions repository secrets
   `MEALDECK_PRINTER_ORIGINAL_KEYSTORE_BASE64` (base64 of the original
   .p12) and `MEALDECK_PRINTER_ORIGINAL_STORE_PASSWORD`. Never put these
   secrets in source code, user-visible chat, issue bodies or logs.
4. After the PR is verified and merged to `main`, manually start
   **Publish signed MealDeck H10S printer v0.2.3** in GitHub Actions.
   It refuses to publish without the original key, refuses a certificate
   mismatch with both the *published* v0.2.2 APK and the pinned public
   release certificate, and refuses a debuggable or incorrectly versioned APK.
5. Only the successful signed release publishes both
   `/downloads/mealdeck-printer-h10s-0.2.3.apk` and its SHA-256 manifest.
   The private `/printer` page continues offering v0.2.2 until that
   manifest exists, then automatically offers the verified v0.2.3.
6. **On the actual H10S**, update the installed app *without uninstalling
   or clearing its data*. Check the app's existing printer history,
   explicitly allow auto-print, test one full delivery receipt including all
   items and footer in one piece, and confirm the paper output before resuming
   production delivery. If the owner signing identity is unavailable, stop:
   an unsigned/different-signer APK must not be advertised as an update.

## Rollback and privacy

- Turn the MEALDECK_OWN_DRIVER_DELIVERY_ENABLED switch off immediately if delivery cannot be fulfilled. If needed, also use the existing kitchen Pause/Closed switch.
- Do not delete paid order or payment audit records. Contact customers with already paid orders to deliver them or arrange a verified refund.
- Address data remains private in the scoped delivery table, is shown only on authorised kitchen tickets and is never copied into marketing analytics or broadcast push payloads.
- The server checks radius before quote and payment; an untrusted browser never supplies authoritative coordinates, serviceability, delivery fees or prices.
