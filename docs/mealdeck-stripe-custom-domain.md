# MealDeck Stripe hosted domain

The owner chose **`pay.mealdeck.co.uk`** for Stripe's hosted Checkout, Payment Links and Customer Portal and reported adding the DNS records. This release adds application support for the Checkout Sessions used by ordinary orders and individual group contributions. It does not create a new Payment Link or Customer Portal product, configure Stripe/DNS, or activate ordering.

During the authorised live acceptance on **6 November 2026**, an authenticated
read of the MealDeck merchant's live Checkout Sessions confirmed that Stripe
returned `pay.mealdeck.co.uk` with the `/g/pay/` Session path. Both inspected
Sessions were open and unpaid, and their order, quote, request hash, amount and
mode matched the saved MealDeck attempts. This verifies the provider-issued
hostname and path for those Sessions; it does not establish a completed payment,
signed webhook reconciliation, kitchen release or physical receipt.

## Application behavior

Set the server-only `MEALDECK_STRIPE_CHECKOUT_HOST` to exactly `pay.mealdeck.co.uk` after Stripe has activated that hostname. Leave it empty for `checkout.stripe.com`. Schemes, ports, paths, wildcards, alternate hostnames and comma-separated lists are invalid. `VITE_`/public environment variables are not read.

With the custom setting, the server accepts Stripe-returned Session URLs on exactly `pay.mealdeck.co.uk` and `checkout.stripe.com`, using either `/c/pay/cs_…` or `/g/pay/cs_…`. The path must contain the same Session ID that was independently retrieved and checked against the saved order. Keeping both established path forms and the original host allows existing Sessions to continue without altering their identity. The provider decides which URL it returns. The application preserves the complete URL, including its query/fragment; it never changes the hostname, reconstructs the Session path or manufactures a custom-domain URL from a saved ID.

Both customer redirect paths perform a second check against those two exact known hosts and the Checkout Session path. They reject other subdomains, lookalike suffixes, credentials, ports, whitespace, backslashes, non-HTTPS links, arbitrary paths and URLs longer than 4,096 characters. Payment Link and Customer Portal paths are not accepted as order Checkout Sessions.

A configured domain is not payment evidence. The server continues verifying the merchant account, mode, canonical amount, order/quote metadata and current Session. Payment confirmation still needs the signed webhook and independent provider retrieval; a browser return cannot release the kitchen.

## Safe recovery

An existing single-payer Session is retrieved by its saved Stripe ID. Its stored URL cannot cause another Session to be created merely because the provider domain or local configuration changed. New Session creation retains the original order idempotency key; the current Session is then retrieved because an idempotent POST response can be stale after payment. Complete, expired, mispriced, cross-order or mismatched-mode Sessions never return another payment link.

If Stripe created a Session but URL validation stopped the database binding, recover the original saved order before its unchanged payment expiry. The original order's idempotency key recovers the provider object, then a fresh GET verifies its current status and binding. Do not send a raw provider URL around the application, change the expiry, refresh to a new quote merely to bypass recovery, or infer payment from an existing Session. The authenticated customer receipt's **Continue payment** action retains the original quote/order identity; it still requires the existing checkout eligibility checks.

Shared payments retain their original collection, claim, payer and Session ID. A custom URL changes no allocation, payment amount or expiry, and cannot reopen a paid claim. Invalid domain configuration blocks new Checkout creation and redirects but leaves verified webhooks, receipt access and payment reconciliation available. It does not invalidate Terminal credentials.

## Database installation

Use `deploy/mealdeck/checkout-domain.mjs` and its guarded migration:

`deploy/mealdeck/post-install-migrations/20261105194218_mealdeck_checkout_domain.sql`

The filename was generated with the Supabase CLI, then the file was placed in this repository's independent post-install migration directory. Install only after the existing independent foundation, checkout, guest, kitchen and shared/Terminal extensions. The migration requires the independent MealDeck installation receipt, rejects a Dishbee schema, and checks the exact prior function bodies so an unrelated change is not overwritten.

Submit `buildCheckoutDomainSql()` as one complete request with its own transaction. Use `buildManagedCheckoutDomainSql({ runnerOwnsTransaction: true, singleMigration: true })` only when the migration runner itself guarantees one transaction for the complete statement batch. Do not split the installation into individual remote calls.

It adds a private exact-URL validator and replaces only the URL conditions in the two existing Session-binding functions. Their account/mode checks, locks, immutable claim bindings and service-only grants remain. It creates no account, tenant, order, payment or kitchen ticket, modifies no existing URL or financial amount, and changes no opening clock or activation flag. The source guard allows a deliberate rerun of this exact migration while rejecting separately changed routine bodies.

### Additional Session path compatibility

After the domain migration, install the separate guarded extension exported by `deploy/mealdeck/checkout-session-paths.mjs`. `buildCheckoutSessionPathsSql()` returns its complete transaction; `buildManagedCheckoutSessionPathsSql({ runnerOwnsTransaction: true, singleMigration: true })` is for a runner that owns one atomic transaction. Keep the domain and path extension as separately reviewed installation steps; do not concatenate their transaction wrappers.

The CLI-generated extension is `deploy/mealdeck/post-install-migrations/20261106180458_mealdeck_checkout_session_paths.sql`.

This extension allows `/g/pay/` alongside `/c/pay/` in the existing private URL validator. It guards the independent MealDeck profile and known prior helper definition, preserves the private permissions, and leaves both public binding functions, existing URLs, amounts, Session IDs and expiry times unchanged. A deliberately repeated installation accepts only the reviewed final helper definition. Install this extension with the matching server and browser validators before retrying a provider-issued `/g/pay/` Session.

## Activation order

1. In the existing MealDeck Stripe account, confirm `pay.mealdeck.co.uk` is active with its certificate ready. The reported DNS additions are a completed setup step, not proof of activation. Do not purchase or enable a different domain subscription as part of this source change.
2. Install the additive database domain migration followed by the Session-path extension, and deploy the matching server/browser code. Check the post-install helper definitions and service-only permissions.
3. Securely set `MEALDECK_STRIPE_CHECKOUT_HOST=pay.mealdeck.co.uk` on the application server. Keep the established payment readiness and test/live account controls.
4. In the approved test environment, create an ordinary Checkout and a group contribution. Use exactly the URL Stripe returns, finish the provider flow, confirm the original order/claim on return, and verify one kitchen release only after complete verified funding. Reopen the same unpaid attempt and verify that no second Session is created.
5. Confirm the expected live hostname with the merchant's approved live acceptance process. A test, mock, browser redirect, DNS response or successful compile is not a live charge or domain-activation check.

Stripe can also use its configured custom domain for Payment Links and Customer Portal. Manage those products in the same Stripe account when they are actually used. Do not redirect an order to a generic link/portal or infer subscription/customer ownership from its URL.

## Verification in this release

- `tests/mealdeck-checkout-domain.test.ts` covers exact configuration, byte-preserving URLs, spoofed domains/paths, existing Session recovery, stale create responses, expired attempts and mismatched provider evidence.
- `tests/postgres/checkout-domain-behavior.mjs` runs the actual migration against PostgreSQL, including rollback, foreign-profile rejection, preserved existing attempts/clock/privileges, exact URL binding, and unchanged Terminal intent handling. It supports the native PostgreSQL 17 CI runner.
- `tests/mealdeck-payment-http-postgres.test.ts` exercises actual HTTP handlers and migrated SQL for both hostnames, full group funding and one kitchen release; ordinary custom-domain checkout resumes one Session and continues webhook reconciliation after a domain configuration error. Stripe/Auth are deterministic test doubles and no external payment is taken.

## Official references

- [Stripe: use a custom domain for hosted products](https://docs.stripe.com/payments/checkout/custom-domains)
- [Stripe Checkout Session `url`: the provider returns the configured subdomain](https://docs.stripe.com/api/checkout/sessions/object#checkout_session_object-url)
- [Retrieve the original Checkout Session](https://docs.stripe.com/api/checkout/sessions/retrieve)
- [Stripe API idempotent requests](https://docs.stripe.com/api/idempotent_requests)
- [Checkout fulfilment and verified payment processing](https://docs.stripe.com/checkout/fulfillment)

The live provider observation establishes the returned custom hostname and path for the inspected Sessions. Source changes and simulated tests do not establish a completed live customer payment or physical kitchen/printer acceptance.
