# Luton walk-in and kerbside payments with Stripe

## Owner direction and current state

The owner requested Stripe Tap to Pay for walk-in and kerbside customers on 5 November 2026, and confirmed that **Luton is the only launch location**. St Albans and Bedford remain coming soon. The five launch brands use one MealDeck basket, one master order and one shared kitchen screen. MealDeck is a trading name of 313 Brands Ltd; Powered by Dishbee remains the technology credit.

This document records the implementation contract. It does not install a native application, register a reader, enable a payment endpoint or claim that contactless collection works today. The repository currently contains a web/PWA application, staff order history and KDS management, but no staff sale-entry or Terminal collection flow. The independent customer catalogue, pending-order and payment-release adapters also remain to be completed in the owning MealDeck account.

## Supported integration routes

Stripe's current documentation lists Great Britain for both Tap to Pay on iPhone and Android. Direct phone acceptance uses its iOS, Android or React Native Terminal SDK. A native staff companion application can share MealDeck authentication, canonical menu, order records and KDS while the customer site remains a PWA. Installing the current website on a home screen does not install a Terminal mobile SDK. See [iPhone integration](https://docs.stripe.com/terminal/payments/setup-reader/tap-to-pay?platform=ios) and [Android integration](https://docs.stripe.com/terminal/payments/setup-reader/tap-to-pay?platform=android).

For iPhone, Apple development and distribution entitlements are required. Stripe currently specifies iPhone XS or later with a supported non-beta iOS version. Android requires a compatible NFC device meeting Stripe's current OS, security-patch and integrity requirements; Android 13 or later is currently listed. Validate actual staff devices against those pages at implementation time rather than hard-coding eligibility from a device name.

The existing browser/PWA can instead operate a supported smart reader through the backend. Stripe's [server-driven integration](https://support.stripe.com/questions/terminal-server-driven-integration?locale=en-GB) supports smart readers such as WisePOS E and S700/S710. It does not turn the browser itself into a phone NFC payment reader. This is a separate device option using the same MealDeck order/payment contract.

Recommended product direction: keep the staff checkout workflow shared, use a native companion for direct phone Tap to Pay, and allow a supported smart reader as a counter or fallback device. Do not purchase hardware or register devices from this specification alone. Confirm the staff device platform and the actual merchant account before installation.

## Staff workflow

| Situation | Required behavior |
| --- | --- |
| New walk-in | Staff opens a new Luton sale, adds products and cross-brand upgrades from the canonical menu, confirms the amount, and starts contactless collection. Verified payment produces one kitchen release. |
| New kerbside order | Use the same flow with canonical fulfilment `curbside`. Record only the operational handoff details needed by the team. A vehicle or bay note is optional order data, not a payment identifier. |
| Existing unpaid collection/kerbside order | Load the original order through authorised staff lookup, show its verified outstanding balance, and collect against that order. Do not create a replacement order merely to take payment. |
| Already paid order | Show **Paid — ready for handoff** only when the verified order/fulfilment state supports it. No collection action or second payment attempt is available. Existing KDS work is retained. |
| Unknown or delayed payment result | Show **Checking payment**. Reconcile the existing attempt before offering another collection. A timeout must not become an invitation to charge again. |

The native collection screen should show the order reference, Luton kitchen, fulfilment and current amount before handing control to Stripe. On return, the MealDeck screen reflects the backend's confirmed result. Successful payment, kitchen preparation, packing and customer handoff remain distinct statuses.

Walk-in orders do not require a fabricated customer delivery address or postcode. Location authority comes from the authenticated staff member's authorised Luton kitchen, not a browser-selected town. The current customer delivery serviceability route is not a substitute for a staff sale endpoint.

## Contracts to implement

1. **Authenticated staff sale entry.** Add a deliberate payment-collection permission and Luton kitchen scope. The existing order-history screen is not a create-order API. All five brands resolve to current canonical product/modifier UUIDs. Reprice server-side, including quantities and the £20 starting prices, before recording the immutable amount for the attempt.
2. **One pending master order.** Preserve the canonical `orders.source = 'mealdeck'` boundary. Record walk-in/kerbside entry and payment channel separately; do not invent `source = 'walk_in'` or copy Café1 EPOS records. Canonical fulfilments are `pickup` and `curbside` and the current customer handoff code is four digits. Historical six-digit/`kerbside` helpers must be reconciled before reuse.
3. **Server-owned payment attempt.** Bind the attempt to the exact order, price revision, unpaid balance, GBP currency, authorised kitchen, actual Stripe account and test/live mode. Prevent simultaneous online and in-person attempts from capturing the same balance. Browser/native inputs cannot select a merchant or dictate the payable amount.
4. **Device authority.** Native Terminal connection tokens require staff authentication and approved scope. Smart-reader commands require an explicit allowed reader-to-kitchen mapping. Do not expose secret Stripe credentials in the web/PWA or native bundle. A public live-mode key alone supplies none of these server permissions.
5. **Payment collection and reconciliation.** Create the appropriate Terminal PaymentIntent on the server. Resume the existing attempt after an ordinary decline or interrupted response; inspect Stripe's state before replacing a cancelled attempt. An acknowledged reader request is not a settled payment. Stripe documents asynchronous processing and reusing the existing PaymentIntent in [Collect card payments](https://docs.stripe.com/terminal/payments/collect-card-payment?terminal-sdk-platform=server-driven).
6. **Verified payment-to-kitchen release.** Validate provider events, re-fetch the bound provider object where required, and persist accepted payment evidence idempotently before releasing the original master order. Merchant, mode, currency, amount and order must match. Browser success screens and reader acknowledgements cannot release the kitchen. If provider payment succeeded but local persistence failed, reconcile it rather than charge again.
7. **Handoff and receipts.** A paid pickup/curbside order uses the existing full-order preparation and packing workflow. A staff-confirmed handoff changes fulfilment only; it never creates another payment or KDS ticket. Receipts and order status share the verified payment reference. Refunds require their own authorised, audited provider flow.

Luton, Stripe's receiving account and the reader location must use the permitted UK/GBP configuration. Stripe documents the country and local-currency relationship in [Regional considerations](https://docs.stripe.com/terminal/payments/regional?integration-country=GB). Future kitchens require separately authorised staff and reader mappings before they can accept in-person payments.

## Acceptance before enabling collection

- Confirm the owning MealDeck Stripe account and separate Lovable backend; record real Luton tenant/kitchen and Terminal location bindings.
- Select the staff device platform, install the supported native SDK or register the chosen smart reader, and complete any required Apple entitlements.
- Verify one multi-brand order and its upsells against current backend prices, including a price change made by admin before collection.
- Verify walk-in, unpaid kerbside and already-paid pickup behavior on the same shared KDS.
- Test double taps, two staff devices, online/in-person overlap, decline, cancellation, delayed webhook, interrupted connection and app restart without duplicate charge or kitchen release.
- Verify that St Albans, Bedford, unauthorised staff and a reader assigned to another kitchen cannot start collection.
- Exercise receipt, refund and handoff flows using approved test fixtures. Native/device acceptance is additional to repository tests.

These requirements extend the existing checkout work. Until the real integration and hosted acceptance are complete, the public ordering and kitchen-release gates remain closed and no contactless-payment success is represented as live.
