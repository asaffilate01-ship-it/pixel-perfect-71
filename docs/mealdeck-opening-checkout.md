# MealDeck opening checkout

This extension adds Stripe Checkout for Luton collection and kerbside orders. Registered customers use verified Auth; the additive [opening guest extension](mealdeck-opening-guest-checkout.md) also permits account-free orders during the confirmed launch hours. It uses the dedicated MealDeck database and the reviewed five-brand menu. It does not enable delivery or make a browser return URL evidence of payment.

## Installation and launch state

Apply the frozen independent foundation first, followed by the customer membership extension, `20261105082900_mealdeck_stripe_checkout.sql`, the kitchen/printer extension and `20261105143652_mealdeck_opening_guest_checkout.sql`. These migrations can be installed before the owner and Luton kitchen are bootstrapped. Settings start closed and without a collection estimate. The latest extension fixes the owner-confirmed opening date to 6 November 2026; it does not enable ordering.

The standalone migration includes its own `begin`/`commit`. A migration runner that already owns one atomic transaction must use `buildManagedStripeCheckoutSql({ runnerOwnsTransaction: true, singleMigration: true })` from `deploy/mealdeck/stripe-checkout.mjs` and execute the entire returned migration once. Do not split a migration into separately committed statements.

The owner must bootstrap the dedicated database, apply the reviewed price revision, configure the shared kitchen routes, and deliberately publish the available menu. Checkout requires an audit entry with action `catalogue.menu_revision` and `priceRevision` equal to `owner-menu-20261105-v2`. An insert-only catalogue import is insufficient: it could leave old £20 prices unchanged. Unavailable milkshake choices must remain inactive until their flavours have been approved.

The Finance launch-settings panel uses:

```text
mealdeck_ops_checkout_settings(p_tenant, p_location)
mealdeck_ops_update_checkout_settings(
  p_tenant, p_location, p_enabled, p_opening_start_date,
  p_collection_estimate_minutes
)
```

Only an authorised owner/admin with `finance.manage` in that scope can update these settings. The collection estimate is an explicit whole number from 5 to 180 minutes, with no invented default. Enabling the database setting does not bypass server or Stripe readiness gates.

## Server configuration

Use the existing dedicated MealDeck public backend configuration and the exact bootstrapped `MEALDECK_TENANT_ID` / `MEALDECK_LUTON_LOCATION_ID`. Configure the following on the server, never with a `VITE_` prefix and never in a public asset:

| Setting                                  | Purpose                                                             |
| ---------------------------------------- | ------------------------------------------------------------------- |
| `MEALDECK_CHECKOUT_SERVER_KEY`           | Secret/service credential from the same dedicated MealDeck project. |
| `MEALDECK_STRIPE_SECRET_KEY`             | Stripe restricted or secret API key, consistent with the declared mode. |
| `MEALDECK_STRIPE_WEBHOOK_SECRET`         | Signing secret for this environment's webhook endpoint.             |
| `MEALDECK_STRIPE_ACCOUNT_ID`             | Expected Stripe merchant account ID.                                |
| `MEALDECK_STRIPE_MODE`                   | Exactly `test` or `live`.                                           |
| `MEALDECK_STRIPE_CHECKOUT_HOST`          | Optional exact `pay.mealdeck.co.uk` after custom-domain setup; blank keeps Stripe's default. |
| `MEALDECK_ONLINE_CHECKOUT_ENABLED`       | Exactly `true` after setup is ready.                                |
| `MEALDECK_CHECKOUT_INTEGRATION_APPROVED` | Exactly `signed-off` after end-to-end acceptance.                   |

Do not substitute Dishbee credentials or infer authority from a publishable Stripe key. Conflicting legacy backend configuration fails closed.

### Stripe API request compatibility

Requests are pinned to `2026-10-28.endive`. Endive removed the writable `payment_method_types` parameter: ordinary and shared Checkout Session creation use `allowed_payment_method_types[0]=card`, and native Terminal PaymentIntent creation uses `allowed_payment_method_types[0]=card_present`. Retain the provider's read-only `payment_method_types` response field for payment-method verification. The provider test fixture rejects the removed request parameter, so accepting a permissive simulated response cannot hide this API incompatibility again.

References: [Checkout Session parameter removal](https://docs.stripe.com/changelog/endive/2026-09-30/remove-payment-method-types-checkout-sessions), [PaymentIntent parameter removal](https://docs.stripe.com/changelog/endive/2026-09-30/removes-the-payment-method-types-parameter-from-payment-intents-and-setup-intents), and [Terminal card-present allowlist support](https://docs.stripe.com/changelog/endive/2026-09-30/card-present-and-interac-present-enum-values-for-allowed-payment-method-types).

### Restricted Stripe API keys

Prefer a restricted key with the permissions needed by this integration. The same server setting accepts `rk_live_` and `sk_live_` in live mode, or `rk_test_` and `sk_test_` in test mode. Store the complete value in the hosting platform's Secrets screen. Do not change its prefix, paste a masked value, or put the credential in source code. `MEALDECK_STRIPE_WEBHOOK_SECRET` remains a separate endpoint signing secret beginning `whsec_`.

The current browser checkout and canonical webhook use these Stripe resources:

| Resource | Required access | MealDeck use |
| --- | --- | --- |
| Checkout Sessions | Write, which includes Read | Create and recover the exact order session; list by PaymentIntent; expire an existing shared-payment attempt when authorised. |
| Events | Read | Independently retrieve the signed event before reconciliation. |
| Payment Intents | Read | Retrieve or expand the payment and its latest charge, including lifecycle/refund/dispute reconciliation. |
| Charges | Read | Verify captured funds and provider refund/dispute evidence. |
| Current merchant account | Successful `GET /v1/account` | Check the credential's actual merchant identity and charging capability. |

These are an inventory of the current requests, not evidence that a particular key has been accepted. Stripe's published permission table does not list the singular `/v1/account` request separately; verify that required request with the deployed key rather than guessing a Dashboard permission label or skipping the account check. Checkout also supplies inline `price_data.product_data` and expands `payment_intent.latest_charge`. Check those exact requests in Stripe's request logs and add only any further permission Stripe identifies as necessary. The application makes no separate Products or Prices API request.

If native Terminal collection is enabled later, it additionally needs Payment Intents Write, Terminal Connection Tokens Write and Terminal Locations Read. The receipt-printer PWA is independent of these Stripe Terminal permissions. Runtime code does not manage webhook destinations, issue refunds, send payouts or transfer funds; do not grant those write permissions merely to receive payment notifications.

The owner connection report can confirm the merchant-account read; it does not prove session creation, every restricted permission or signed webhook processing. Complete the approved private checkout, reconcile the actual provider payment into its matching KDS order, and verify the receipt separately before public sign-off. A denied Stripe request still fails closed and cannot mark an order paid.

References: [restricted API key setup and permissions](https://docs.stripe.com/keys/restricted-api-keys), [endpoint permission reference](https://docs.stripe.com/keys/permissions-reference).

### Reading the owner connection report

After the existing owner/admin, current Auth, MFA, kitchen and finance-permission checks pass, the private connection report distinguishes these account-read results:

| Result | Next check |
| --- | --- |
| Stripe HTTP 401 | The saved API key must be complete and active. |
| Stripe HTTP 403 | Review the key's account-read permissions and access policies. This result does not identify a particular missing permission by itself. |
| A different merchant account was returned | Check both `MEALDECK_STRIPE_SECRET_KEY` and `MEALDECK_STRIPE_ACCOUNT_ID` against the intended MealDeck account. |
| The matching account has charges disabled | Review that account's activation or restrictions in Stripe. Replacing the key does not enable charges. |
| Malformed account response | Stripe's account data could not be validated; the check remains unsuccessful. |
| Other HTTP, network or response-read failure | The account check could not complete; inspect the provider request and connectivity before retrying. |

The report returns fixed diagnostic text, a bounded provider HTTP status when available, and setting names only. Non-success response bodies are not read, and raw errors, supplied credentials and returned account identifiers are not included. Customer checkout keeps its existing generic error code, message and 503 response. A failed Terminal-location check does not erase an already successful account check.

For deeper diagnosis, use the restricted key's **View request logs** action in Stripe and find the relevant `GET /v1/account`. HTTP status, error code and a required permission name are useful; do not copy the raw message or key into support chat. See [Stripe HTTP errors](https://docs.stripe.com/api/errors) and [request-log filters](https://docs.stripe.com/development/dashboard/request-logs).

The production server targets Cloudflare Workers. Stripe requests use `redirect: "manual"` and reject every non-2xx response before reading its body, including all redirects. They never follow `Location` or forward the API key to another destination. Workers does not implement `redirect: "error"`; that option throws during request construction, before Stripe is contacted, and can therefore appear as a network failure in this report. Node/Bun fetch mocks alone do not detect that runtime difference. See [Cloudflare Request redirect support](https://developers.cloudflare.com/workers/runtime-apis/request/).

An account check does not prove session creation or signed payment processing. Keep public approval pending during the approved private live test. The standard Stripe-hosted checkout URL remains supported; custom-domain activation is a separate optional check.

The approved Stripe custom hostname is `pay.mealdeck.co.uk`. Single and shared Checkout validate the actual provider-issued URL, including during recovery, against the exact configured host; they never construct a replacement URL. Install the additive database URL guard before setting the server value. DNS entry alone is not confirmation that Stripe has activated the domain. See [custom Checkout domain setup and acceptance](mealdeck-stripe-custom-domain.md).

The signed webhook is `https://mealdeck.co.uk/api/stripe/webhook`. Subscribe to `checkout.session.completed`, `checkout.session.async_payment_succeeded`, `charge.refunded`, `charge.dispute.created`, and `charge.dispute.closed`. The handler verifies the signature over the raw body, checks the Stripe account and mode, then independently retrieves the provider event, complete Checkout session, succeeded PaymentIntent and captured charge before calling the narrow database reconciliation function. Event replay and order/session binding are enforced inside a transaction.

New payments require the account to accept charges. Refund and dispute reconciliation continues if Stripe later disables new charges, or local ordering is closed. Keep the webhook and private receipt route deployed while paid orders or payment sessions still exist.

## Offer and total authority

The opening offer is 30% off the entire goods subtotal, with no order minimum, for guests and verified registered customers choosing collection or kerbside at Luton during the confirmed daily launch windows. Optional marketing consent does not affect eligibility. Guest orders earn no loyalty points. The discount is rounded once on the whole basket to the nearest penny, with half-penny rounded up.

The confirmed hours in `Europe/London` are Friday 6 November 2026, 15:00–23:00; Saturday 7 November, 13:00–23:00; and Sunday 8 November, 13:00–23:00. New checkout is closed between these windows. The offer and new guest ordering end on Sunday at 23:00 and do not recur. These exact windows supersede the original midnight-based campaign calculation.

Quotes last up to ten minutes, capped at the current launch day's closing time. Payment preparation rechecks the current published menu prices, availability, member or guest authority, fulfilment, opening hours and offer. A changed price or expired quote requires a fresh review. A payment session started while the offer is active retains its agreed total until that Stripe session expires, up to 35 minutes after preparation. The terms page explains this completion window.

The browser submits item and choice identifiers, quantities, pickup method and packing requests. It cannot submit authoritative prices, discount rates, customer identity, location, payment status or an address. Current database prices and modifier amounts are snapshotted for the order. The Tavo flavour/portion price variant is derived by the server; the client cannot select a cheaper hidden variant. Named Load’d and Moktl upgrades retain their target item and purchased amount.

## Review, packing and customer data

The customer chooses collection or kerbside, signs in with a verified email or starts an eligible opening-weekend guest session, reviews the final server total and explicitly acknowledges “Please check your order before confirming and paying.” The server requires that review acknowledgement to start payment.

Registration requires name, email and phone. Collection asks for no address. Kerbside additionally requires make, colour and exactly the last four registration characters; a full registration is rejected by this input contract. Delivery is currently unavailable and rejected by the server.

Cutlery is an optional unchecked request with no fee. Packing defaults to one bag. Separate numbered bags are validated as a sequential, nonempty set: every purchased quantity must be assigned exactly once, and a linked cross-brand extra follows its parent into the same bag. Quantities can be split across bags. All bag assignments, cutlery, dish quantities, flavours, named extras and prices are immutable purchase snapshots used by the receipt and kitchen/printer extension.

Private member receipt requests require a fresh authenticated customer lookup and order ownership. Guest receipts require the scoped, unexpired HttpOnly session capability; contact details or an order UUID alone grant no access. Responses use `Cache-Control: no-store, private`. Customer/car details and private receipts are not added to the public PWA cache. The checkout browser handoff stores only the basket and payment-attempt references; server secrets and customer/car details are never stored there.

The authenticated, argument-free `mealdeck_customer_orders()` RPC returns `{ orders: [...] }` for the latest 20 orders belonging to `auth.uid()`. It rechecks the live verified registration and exposes only order ID, handoff number, fulfilment, total, payment/hold flags and progress timestamps. It enables the account page to recover order-progress links without caching private orders or granting table access.

## Paid order and kitchen progression

A signed and independently verified provider event is the only path that confirms payment and releases an order to the kitchen. Opening a success URL, presenting an order ID, or receiving a browser payment flag cannot release food. Duplicate provider events cannot create a second order, kitchen ticket or payment release.

The foundation's `order_status='accepted'` is retained internally when a paid order is queued. Customer **Accepted** instead uses the new `accepted_at` timestamp set by staff. Payment itself leaves that timestamp empty. Customer progress is therefore:

| Customer stage | Authoritative evidence                                           |
| -------------- | ---------------------------------------------------------------- |
| Placed         | Verified captured payment and `paid_at`.                         |
| Accepted       | Staff acceptance sets `accepted_at` and creates the receipt job. |
| Preparing      | Staff starts preparation.                                        |
| Ready          | All item checks and the packing handoff are complete.            |
| Completed      | Staff confirms the order number at collection/handoff.           |

The elapsed customer clock begins at `paid_at`, not at the earlier pending Checkout-session creation time. The collection estimate also begins at payment, is clearly approximate, and does not automatically mark the order ready.

Four-digit collection numbers are reserved per kitchen from pending payment onwards. Allocation takes a kitchen-scoped transaction lock, scans the complete `0000`–`9999` range from a random starting point, and is additionally protected by a unique database index. Retries reuse the existing order and code. A verified completed handoff or full provider-confirmed refund releases its reservation; the historical receipt retains its number.

A pending session passing its local expiry time does **not** release its number. Its payment webhook might be delayed. This release does not implement a separate signed/refetched provider-expiry reconciliation path, so unresolved expired or failed sessions retain their reservations. Do not clear reservations merely from timestamps, a browser cancellation, an operator-edited status or an unverified provider response. Recovery requires verified provider-terminal evidence in an approved reconciliation path. Exhausting all 10,000 unresolved numbers fails before Stripe session creation with a clear temporary-unavailable customer message, rather than recycling an active number or retrying indefinitely.

Refunds and disputes invalidate new kitchen authority and place the affected order on hold. A later or repeated original capture event cannot undo that hold. This extension reconciles provider refunds; it does not initiate refunds or replace an authorised operator refund workflow.

## Stripe and wallet acceptance

Hosted Checkout uses card payment methods, allowing Stripe to present eligible Apple Pay and Google Pay on supported devices, browsers and accounts. Automatic 3D Secure allows Stripe and the issuer to request additional authentication when required; a bank OTP is not promised for every payment. No shipping-address field is configured for pickup. Stripe can still collect information needed to process the selected payment method.

Do not label Apple Pay, Google Pay, Samsung Pay, physical Tap to Pay, email delivery or live card charging as tested merely because source code or keys are present. Complete the corresponding provider/account/device acceptance checks before live sign-off. A separate Samsung Pay web option is not promised by this implementation, and physical Stripe Terminal/Tap to Pay is a separate integration.

The app keeps the detailed purchase receipt. Stripe Checkout displays one server-priced aggregate order line for the payable total, avoiding client-controlled amounts or a second rounding of the opening discount.

## Verification

Focused units: `bun test tests/mealdeck-online-checkout.test.ts`.

Database behaviour: `node tests/postgres/stripe-checkout-behavior.mjs`. For a disposable native PostgreSQL database, use `node tests/postgres/stripe-checkout-behavior.mjs --native` with the existing `MEALDECK_KDS_TEST_DATABASE_URL` harness configuration. Never point the destructive test harness at a hosted or production database.

`tests/postgres/stripe-checkout-fixture.mjs` exports a shared fixture that installs the real foundation/extensions, bootstraps a fake local owner, applies the reviewed catalogue, and creates local customer/payment records. It uses `.invalid` email addresses and simulated provider events. It sends no emails and makes no payment-provider calls.

These tests verify authentication boundaries, API grants, exact menu pricing, offer calendar boundaries, kerbside validation, packing quantities, idempotency, captured-payment-only kitchen release, private receipts and refund replay protection. Handoff tests force code collisions, retain unresolved expired reservations, exercise namespace exhaustion, and use two real connections under `--native` to verify that simultaneous allocations wait on the kitchen lock and receive distinct numbers. They are not evidence of a successful live transaction or wallet/device test.

## Provider references

- [Stripe Checkout session parameters](https://docs.stripe.com/api/checkout/sessions/create)
- [Stripe webhook verification](https://docs.stripe.com/webhooks)
- [Stripe Checkout fulfilment](https://docs.stripe.com/checkout/fulfillment)
- [Supabase verified user lookup](https://supabase.com/docs/reference/javascript/auth-getuser)
- [Supabase API grants and security](https://supabase.com/docs/guides/api/securing-your-api)
