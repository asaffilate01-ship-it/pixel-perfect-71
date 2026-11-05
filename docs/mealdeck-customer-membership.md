# MealDeck customer accounts and communication choices

Owner instruction, 5 November 2026: collect name, email and phone, verify the
email, make marketing optional, and support app notifications and future
loyalty. Collection and kerbside registration do not ask for an address.

The later confirmed opening instruction permits guest checkout during the
6–8 November daily launch hours. Guest orders create no account, membership,
loyalty balance or marketing preference, and cannot be claimed by signing up
with the same email address. Member-only offers require verified registration;
email and push promotions remain separate opt-ins. See the
[opening guest checkout guide](mealdeck-opening-guest-checkout.md).

## Implemented customer flow

`/account` provides registration and passwordless email sign-in against the
same dedicated MealDeck backend used by operations. The customer's auth
storage key is separate from the staff key. Signing up never grants a staff,
kitchen, printer, owner or administrator role.

Registration sends a Supabase Auth magic link. If the email template also
includes an OTP, the customer can enter that code on the same screen. A
60-second resend countdown complements the Auth provider's server-side rate
limits; it does not replace them. The link uses PKCE. Customers should open it
in the same browser that requested it, or use the email code when configured.
Expired links can be requested again. Auth is queried with `getUser`, and the
profile RPC separately checks `auth.users.email_confirmed_at`, deletion,
anonymous status and active bans. Browser state or user metadata cannot verify
a customer.

The contact details are validated and confirmed after email verification.
Auth metadata only prefills editable name and phone fields; it is never a
source of permissions or saved consent. If a magic link is opened after the
form has been closed, the communication checkboxes start off again. The
customer reviews them before finishing registration. A registration retry
never changes an already registered customer's newer settings.

`/account?returnTo=%2Fcheckout` preserves a fixed checkout return path in the
verification link and shows a prominent **Continue to checkout** action once
registration is complete. No arbitrary redirect URL is accepted. Addresses
are not part of the profile schema; delivery details belong to the order.

## Deployable database extension

The frozen independent foundation remains untouched. Apply
`deploy/mealdeck/post-install-migrations/20261105082728_mealdeck_customer_membership.sql`
as one complete atomic operation after the independent foundation. It is safe
before owner bootstrap; it grants no business access. The generator
`deploy/mealdeck/customer-membership.mjs` returns either the complete standalone
transaction or a managed form that explicitly requires one runner-owned atomic
transaction. It does not contact a database.

Private tables have RLS enabled and no `PUBLIC`, `anon`, `authenticated` or
`service_role` table grants. Only explicit functions expose the intended API:

| Function                             | Access                                 | Purpose                                                                  |
| ------------------------------------ | -------------------------------------- | ------------------------------------------------------------------------ |
| `mealdeck_customer_capabilities()`   | Anonymous or authenticated             | Public registration, push and loyalty readiness flags                    |
| `mealdeck_customer_profile()`        | Authenticated, own identity            | Current verified identity, registration, preferences and loyalty balance |
| `mealdeck_customer_register(...)`    | Authenticated, verified own identity   | First name/phone profile and explicit choices                            |
| `mealdeck_customer_update(...)`      | Authenticated, verified own identity   | Edit details and preferences with an expected-update timestamp           |
| `mealdeck_customer_save_push(...)`   | Authenticated, registered own identity | Save a device endpoint after a chosen notification purpose               |
| `mealdeck_customer_has_push(...)`    | Authenticated, own identity            | Confirm this endpoint is actually connected to this account              |
| `mealdeck_customer_remove_push(...)` | Authenticated, own identity            | Remove this device endpoint                                              |
| `mealdeck_customer_export()`         | Authenticated, verified own identity   | Export profile and communication history                                 |

The private `mealdeck_private.customer_registration_authority(uuid)` helper
returns `NULL` for an unverified, anonymous, deleted or banned identity. It
returns `registered: false` for a valid email identity without a completed
contact profile. It has no API-role execution grant. Trusted checkout code
can use it after verifying the customer JWT; marketing choices are never part
of offer eligibility.

## Consent and privacy behavior

The form separates three optional, initially unticked choices:

- **Offers by email** — “Send me MealDeck promotions, loyalty offers and menu
  news by email.”
- **Offers in the app** — “Send me promotional push notifications. This needs
  a separate device permission.”
- **Order progress alerts** — “Use push notifications for updates about my
  orders. These are separate from promotions.”

The notice names **MealDeck, a trading name of 313 Brands Ltd**. Registration,
the opening discount and loyalty membership do not depend on marketing.
Verification emails and essential order messages are separate from marketing.
The phone number is for order contact; supplying it does not opt the customer
into marketing texts or calls. No marketing SMS channel is created here.

Profile updates create append-only consent evidence with the channel, previous
and new value, server timestamp, source and notice version. Current notice IDs
are `mealdeck-customer-2026-11-05` and
`mealdeck-preferences-2026-11-05`. Preserve these instructions when changing
copy and issue a new version for materially different purposes. Email
marketing is bound to the email address that was consented to. A verified
email change does not silently transfer that consent to the new address.

The account page supports updating details, withdrawing each choice and
downloading account details and consent history. A stale tab cannot overwrite
a newer withdrawal. Turning off both push purposes deletes all the account's
stored push subscriptions. Account deletion, email changes and full data
requests direct customers to `info@mealdeck.co.uk`; no automatic deletion of
financial/order records is implied. Deleting an Auth account cascades its
membership data, but order retention and identity verification for requests
remain an operational responsibility.

## Notification readiness

The account shows app notifications as **coming soon** until both:

1. `MEALDECK_WEB_PUSH_PUBLIC_KEY` is a valid uncompressed P-256 VAPID public key
   in the MealDeck server environment; and
2. `mealdeck_private.customer_features.push_enabled` is intentionally enabled
   after a sender and withdrawal handling have been accepted.

The private VAPID key must never be public. No push sender, outbound marketing
campaign or email marketing provider is fabricated by this extension. A
sender must re-read the canonical verified customer preferences before **every
send**, including the bound email for email marketing, honour withdrawals,
include an easy unsubscribe in every promotional email, handle expired
subscriptions and record delivery failures without logging sensitive payloads.
Do not use raw preference booleans without the current Auth/registration check.

After customers save a notification type, they can explicitly press **Allow
notifications**. Browser permission is requested only from that action. iPhone
and iPad customers get home-screen instructions when the browser cannot
subscribe. Successful device status requires the server to persist the
subscription; an accepted browser prompt is not enough. Disabling the device
unsubscribes locally even if server removal is interrupted. Sign-out attempts
device removal to avoid messages on a shared device.

Only supported HTTPS push-service hosts can be stored. Other accounts cannot
read or reassign an endpoint. Notifications use fixed generic text without
names, addresses, vehicle details, basket contents or payment information.
Notification clicks open only the local `/account` or `/menus` page. Customer
authentication, profile data and API responses are never cached by the PWA.

## Loyalty readiness

The private loyalty ledger is inaccessible to customers for writes. Points
cannot be awarded by browser state. It has a unique event key for future
idempotent earned/refund entries, but no earning rate, monetary value or reward
schedule has been invented. `loyalty_enabled` defaults to `false` and cannot
be enabled without terms. The account correctly says **coming soon** until an
approved programme and payment/refund reconciliation are installed.

## Hosted Auth setup and acceptance

Use only the dedicated MealDeck project. Enable email confirmation and
configure production SMTP, approved sender/domain, rate limits and anti-abuse
controls. Allow the production account redirect URLs, including the fixed
checkout return query. The default magic-link template works; including both
`{{ .ConfirmationURL }}` and `{{ .Token }}` adds the optional code route.
Verification and sign-in templates should contain service information rather
than promotional copy.

Validate a customer-requested email on the intended devices, resend/expiry,
logout, account edits, separate staff access, refusal/withdrawal of consent,
and checkout eligibility before claiming hosted readiness. Repository tests
never send real emails or notifications. A source merge cannot establish SMTP
delivery, VAPID sender readiness or legal compliance for ongoing operations.

## Verification

Run `node tests/postgres/customer-membership-behavior.mjs` for the disposable
embedded PostgreSQL suite; append `--native` only with the harness's explicit
empty localhost database configuration. It checks installation rollback and
idempotence, Auth verification, role/table ACLs, cross-account isolation,
consent history and withdrawal, stale updates, email change, push endpoint
validation, loyalty restrictions and deletion cascades.

Run `bun test tests/mealdeck-customer.test.ts tests/mealdeck-pwa.test.ts` for
contact validation, strict profile parsing, optional-choice defaults, push
privacy, safe navigation and the established offline cache boundary.

References checked 5 November 2026:

- [Supabase passwordless email authentication](https://supabase.com/docs/guides/auth/auth-email-passwordless)
- [Supabase Auth signInWithOtp](https://supabase.com/docs/reference/javascript/auth-signinwithotp)
- [Supabase Auth verifyOtp](https://supabase.com/docs/reference/javascript/auth-verifyotp)
- [MDN PushManager.subscribe](https://developer.mozilla.org/en-US/docs/Web/API/PushManager/subscribe)
- [ICO electronic marketing consent guidance](https://ico.org.uk/for-organisations/direct-marketing-and-privacy-and-electronic-communications/guidance-on-direct-marketing-using-electronic-mail/how-do-we-comply-with-the-pecr-electronic-mail-marketing-rules/)
