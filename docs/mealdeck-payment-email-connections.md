# Payment and email connection checks

The owner/admin Overview and Financials panels now include **Payment & email connections** for the configured Luton kitchen. **Check connections** reads current configuration and provider account/location details. It never creates a Checkout session, PaymentIntent, Terminal connection token, customer, order or email.

The report distinguishes configuration from successful operation:

| Result | Evidence |
| --- | --- |
| Checked | The corresponding database or Stripe read succeeded and matched the expected scope. |
| Configured | The required server settings are present and internally consistent; additional provider or device acceptance may still be needed. |
| Needs setup | A setting, permission, account check or current ordering gate has not passed. |
| Not verified | This app cannot independently establish the external setting or delivery result. |

The report covers the dedicated MealDeck database, Stripe account, website checkout, custom checkout hostname, shared payments, staff Tap to Pay, branded authentication emails and current kitchen ordering availability. It displays the payment mode explicitly. Secret values, account identifiers, customer details and provider error bodies are excluded. The expandable setup list shows fixed configuration **names only**.

## Access and freshness

`POST /api/ops/integrations` accepts only the fixed `status` action and the currently selected tenant/kitchen UUIDs. It requires a same-origin JSON request, verifies the staff token with the configured Auth service, enforces enrolled MFA, reads current owner/admin membership, and runs the existing `finance.manage`-protected checkout-settings RPC. Browser role hints, a service key, email address, guest cookie or public publishable key cannot grant access.

The requested IDs must match the trusted Luton runtime mapping. The endpoint makes its staff RPC calls with the staff token and public project key. This allows an authorised administrator to diagnose a missing checkout service key without using that key to confer authority. A conflicting or incomplete dedicated database configuration fails closed.

Reports use `no-store, private`, vary by authorization and cookie, and have a London-time check timestamp. The component discards responses after a kitchen/account change and clears the previous report on refresh. The report is a snapshot; each actual checkout and phone collection continues to enforce its own current checks. No change to RLS, staff permissions, kitchen status or payment gates is introduced.

## External activation that remains separate

- **Stripe custom domain:** the app setting only permits the exact `pay.mealdeck.co.uk` host. Apply the reviewed additive domain migration first, confirm Stripe shows **Active**, then configure the hostname. Check the URL that Stripe actually returns. Never rewrite a Stripe URL into the custom hostname. See `mealdeck-stripe-custom-domain.md`.
- **Tap to Pay:** a compiled app is separate from signed distribution, supported phones, Apple entitlement approval where required and physical-device payment acceptance. Use the existing Terminal setup in `apps/mealdeck-terminal/README.md`.
- **Resend:** the application cannot read a managed Auth host's SMTP configuration. A disabled hook does not prove SMTP is absent, and a configured hook does not prove it is connected at the Auth host. Use the supported SMTP or signed-hook setup in `mealdeck-auth-email-resend.md`; one general Resend key does not change Auth delivery.
- **Ordering:** an Online kitchen still requires its configured pickup estimate, opening schedule, published canonical catalogue and accepted payment integration. The connection panel never changes those controls.

Automated handler tests exercise current role/scope rejection, SQL denials, verified identity/MFA, secret redaction, read-only provider calls, wrong account/mode/location, closed kitchens, disabled credentials, and the distinction between hook configuration and actual delivery. These are fixture-based acceptance checks; they do not take a real payment or send a message.
