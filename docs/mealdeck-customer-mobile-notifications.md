# MealDeck customer mobile notifications

Implementation date: **7 November 2026**. This document describes the source
implementation and commissioning process. **Hosted installation, publication,
runtime activation and a physical-phone delivery test are separate evidence.**
The deployment record must preserve the observed outcome of each stage;
this document does not claim a notification has appeared on a customer's phone.

## Observed release — 7 November 2026, 09:14 UTC

[PR #121](https://github.com/asaffilate01-ship-it/pixel-perfect-71/pull/121)
was merged with commit `563e42b6c8e3f9cb2d3bbf2ffadce48bb90deb60` and published
to `https://mealdeck.co.uk`. The served customer service worker matched the
reviewed source byte for byte. The deployment identifier was
`f84e6427-f24d-4337-b876-8297cdbe8f8c`.

Both additive migrations were installed in the actual independent MealDeck
database. The matching encrypted Vault bundle and 30-second cron schedule were
provisioned while sending was disabled. The private tables have RLS enabled and
API-role access revoked; anonymous/member roles cannot read the Vault bundle,
and the runtime configuration RPC is service-only.

An authenticated empty-queue worker check returned HTTP 200 at 09:11:58 UTC,
with zero processed, accepted, retried or skipped messages. Only after this
check were both runtime `enabled` and customer `push_enabled` controls enabled.
The live `GET /api/notifications` then returned HTTP 200, `available: true` and
the expected public key, with private/no-store caching controls and no secret
fields. Unauthenticated order, campaign and worker requests returned 401, 401
and 403 respectively.

The recurring dispatcher independently invoked the worker at 09:13:27 UTC and
received HTTP 200 with the same zero-message counts. Its heartbeat was recorded
and the subsequent cron runs succeeded. There were no queued jobs or campaigns
at verification; no customer campaign, test push or payment was created.

This establishes publication, configuration and a functioning authenticated
background dispatcher. **Physical Android/iPhone receipt, lock-screen display,
sound and notification-click acceptance remain unverified.** A push-service
delivery request has not been used as a substitute for those device checks.
Runtime controls can change after this record; use the health checks below for
current operation.

## Customer experience

The private confirmation page for a verified, active order offers **Notify me
about this order**. The customer deliberately taps it before the browser asks
for notification permission. A permitted browser prompt is insufficient: the
screen reports success only after the authorised server has saved that order's
device subscription.

| Alert                         | Required server evidence                                                                                                                                |
| ----------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Order accepted                | Canonically verified payment and a real staff acceptance timestamp. Payment alone does not mean accepted.                                               |
| Preparing your order          | The existing authorised KDS preparation transition.                                                                                                     |
| Ready for handover            | Every purchased item is ready, the pass is ready for handoff and packing has been sealed.                                                               |
| Order handed over             | The existing completed order and confirmed pass handover.                                                                                               |
| With your driver / On the way | Payload and display support is reserved for a later, verified delivery adapter. The current migration emits neither stage and does not enable delivery. |

Collection and kerbside ready messages use the appropriate wording. They ask the
customer to have their handover code ready and tap to view it. **The actual
four-digit code stays on the authorised private receipt.** Lock-screen order
messages do not contain that code, customer name, contact details, vehicle,
address, basket or payment details. The permanent sequential order number and
the random handover code remain separate values.

Tapping an order notification opens
`/checkout?order=<order UUID>&notificationMode=guest|member`. The mode is a
strictly validated interface hint, accepted only alongside a valid UUID. It
chooses the existing guest-cookie or verified-member transport and cannot grant
access to an order. The server checks the real identity and order ownership on
every request. Notifications cannot navigate a KDS, printer or staff window.

The order progress page continues working when notification permission is
refused, a browser is unsupported, delivery is temporarily unavailable or a
push is delayed. These alerts use fixed templates; no AI generation is needed.

## Guests, members and withdrawal

Guests can opt into alerts for their own current order without creating a
member account or consenting to promotions. Their existing high-entropy,
HttpOnly guest cookie is the authority; only its hash is supplied to the
private database. A phone number, order number, endpoint or email match cannot
establish ownership. Guest requests deliberately omit a member bearer even if
the same browser also has a signed-in member.

Members can use the same order-specific control. Their existing account-wide
order notification preference and device registration also remain supported.
The sender deduplicates a device that qualifies through both paths. A
per-order withdrawal creates an override so account-wide order preferences
cannot silently resume that order's alerts on the same device.

**Turn off this order's alerts** removes only this order's association. It does
not unsubscribe the browser connection used for other orders or separately
chosen offers. Existing account withdrawal and device/sign-out removal also
revoke the relevant member order subscriptions. State and removal endpoints
remain usable while sending is paused. Consent changes are recorded under
`mealdeck-order-push-2026-11-07`.

Order-specific subscriptions expire no later than 24 hours after order
creation, and no later than the guest session's expiry where applicable. They
cannot be added to unpaid, held, completed, foreign or otherwise ineligible
orders. They never change guest ordering windows or member registration rules.

Promotional notifications require the separate current member
`pushMarketing` choice and an actual saved device. Signing up, ordering,
accepting order alerts or granting browser permission does not set marketing
consent. Guests are excluded from campaign recipients.

## Android and iPhone setup

Supporting Android browsers use the standards-based Push API and a service
worker. The page need not remain open for the push service to attempt delivery.
Permission, network conditions, notification settings and device power or Focus
controls still affect when and how a notification is presented.

On **iOS/iPadOS 16.4 or later**, the customer must add MealDeck to the Home
Screen, open it from that icon, and deliberately choose to allow notifications.
The order card explains this rather than repeatedly opening a permission
prompt in an ordinary browser tab. Older or unsupported browsers retain the
ordinary progress page.

A newly installed Home Screen app must not be assumed to inherit an existing
guest order's browser session. For a guest order already placed in Safari, the
guidance is to keep its original browser for the private receipt and add
MealDeck before the next order for Home Screen alerts. No URL token or
weakened receipt check is introduced to work around that separation.

The application cannot turn on browser permission automatically, override a
customer's mute/Focus choice or promise a particular notification sound.

When an app update is waiting, the order card pauses new opt-in and active-alert
claims until the customer chooses the existing **Update app** action. Updating
refreshes the page; it is never forced. The saved order association remains
readable and removable during that transition. A saved browser subscription
must also match the current public application key before detailed order alerts
are presented as available; an old connection needs explicit reconnection.

Primary platform references:

- [WebKit: Web Push for Web Apps on iOS and iPadOS](https://webkit.org/blog/13878/web-push-for-web-apps-on-ios-and-ipados/)
- [Google: Push notifications overview](https://web.dev/articles/push-notifications-overview)
- [Samsung Internet: Web developer guide](https://developer.samsung.com/browser/android/web-developer-guide.html)

## Staff offers and promotions

The **Operations → Overview → Offers & app notifications** panel appears with
the existing owner/admin connection controls. The server independently
requires a current owner/admin identity for the configured kitchen, both
`finance.read` and `finance.manage`, and the enrolled-MFA check. Hiding a button
is not the permission boundary.

1. Enter a title of up to 60 characters and a message of up to 180 characters.
2. Choose the fixed **Offers** or **Menus** destination and a send deadline of
   1, 6 or 24 hours. Use approved promotion terms and a deadline within the
   promotion period.
3. Select **Save draft & preview**. The preview displays the exact server-saved
   text, destination, expiry and eligible device count. Drafting does not send.
4. Select **Send to opted-in devices** to queue that saved campaign. The request
   carries its immutable campaign ID, not editable replacement text.
5. Use **Refresh campaigns** for the current status and counts. A draft can be
   discarded; a queued campaign can have its pending notifications stopped.

Drafts can be prepared while the sender is unavailable. Confirmation remains
disabled until readiness is established. The current audience is checked
again at confirmation and before each send; an earlier preview is not a
permanent permission to contact someone who has since opted out.

The counts distinguish queued jobs, **push service accepted**, failed and
skipped outcomes. Acceptance by a push service is not proof that an alert was
displayed or read. Stopping a campaign cannot recall an outbound request
already in flight or a notification already accepted by a provider. Expired
and completed campaigns cannot be sent again through the confirmation action.

The separation between service updates and promotional content is deliberate.
Do not add offers to transactional order templates. Relevant primary guidance:
[ICO: Marketing and data protection in detail](https://ico.org.uk/for-organisations/advice-for-small-organisations/direct-marketing-and-data-protection/marketing-and-data-protection-in-detail/).
The implementation uses explicit separate promotional opt-in; it does not
assume that an existing customer relationship is blanket marketing permission.

## Delivery implementation

- Canonical order/pass transitions create a durable private event and outbox in
  the same transaction. Installation does not backfill historical orders or
  create a marketing campaign.
- Each distinct order stage has one event, with one job per recipient endpoint.
  Account and order-specific subscription paths are deduplicated. Payment,
  kitchen acceptance, receipt printing and handover authority are unchanged.
- A worker claims jobs with bounded leases. Immediately before sending it
  rechecks kitchen scope, the current order stage, payment/release authority,
  active recipient identity, subscription version and applicable consent.
  Obsolete preparation alerts are skipped after readiness or completion.
- Temporary failures use bounded retries, capped at five attempts. The sender
  uses a short provider TTL for order alerts. Expired events and expired or
  removed subscriptions cannot become new delivery authority.
- Provider 404/410 responses retire the matching subscription version. They do
  not erase a newer device registration saved while the request was in flight.
- The server encrypts standards-based Web Push requests with the matching
  P-256 VAPID keys. Endpoint hosts are allowlisted; payloads and URLs are not
  arbitrary outbound destinations. Secrets, endpoints and private payloads
  must not be logged.
- The service worker displays bounded fixed order copy, replaces the visible
  notification for the same order, and protects against an older visible stage
  overwriting a newer one. Its navigation destinations are local and allowlisted.
  No private receipt, API response or account data is added to the offline cache.

## Routes and configuration

| Route                            | Purpose                                                           |
| -------------------------------- | ----------------------------------------------------------------- |
| `GET /api/notifications`         | Read availability and the public VAPID key only.                  |
| `POST /api/notifications`        | Authorised `status`, `subscribe` and `unsubscribe` for one order. |
| `POST /api/ops/notifications`    | Authorised campaign `list`, `prepare`, `confirm` and `cancel`.    |
| `POST /api/notifications/worker` | Secret-authenticated bounded outbox processing.                   |

All these responses use private/no-store controls. The worker secret is
separate from user credentials and database access keys. Browser code receives
neither it nor the VAPID private key.

### Installation order

Use **only the independent MealDeck database**, with its reviewed membership,
guest checkout, payment and KDS/pass extensions already installed. Never apply
the fresh-project bootstrap or these migrations to Dishbee or Cafe 1.

1. Apply the complete atomic
   `deploy/mealdeck/post-install-migrations/20261107083903_mealdeck_customer_push.sql`.
   `deploy/mealdeck/customer-push.mjs` provides the raw and explicitly
   runner-owned-transaction forms. It installs private tables, current-consent
   RPCs, campaign controls and event/outbox triggers without activating sending.
2. For hosted Vault dispatch, apply the complete atomic
   `deploy/mealdeck/post-install-migrations/20261107084448_mealdeck_push_hosted_dispatch.sql`.
   It requires Supabase Vault and creates the dormant private runtime reference,
   `pg_net` wake-up path and `pg_cron` retry schedule. It contains no credentials.
3. Publish the corresponding server routes, sender and customer service worker.
   A source merge alone does not establish that the host serves the new routes.
4. Configure one of the following runtime modes and verify the correct
   tenant/location. The database `customer_features.push_enabled` flag is an
   additional required control in either mode.

### Server environment mode

Use the server settings documented in `.env.example`:

| Setting                           | Meaning                                                                                                                |
| --------------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| `MEALDECK_WEB_PUSH_ENABLED`       | Explicit `true` to use a fully valid environment bundle. Explicit `false` stops sending and never falls back to Vault. |
| `MEALDECK_WEB_PUSH_PUBLIC_KEY`    | Public half of the stable uncompressed P-256 VAPID pair.                                                               |
| `MEALDECK_WEB_PUSH_PRIVATE_KEY`   | Matching private half; server secret only.                                                                             |
| `MEALDECK_WEB_PUSH_SUBJECT`       | The verified operational contact, configured as a `mailto:` subject.                                                   |
| `MEALDECK_WEB_PUSH_WORKER_SECRET` | A separate random base64url secret of 32–256 characters for the worker caller.                                         |

The public and private VAPID keys are validated as a matching pair. Do not
casually rotate them: existing browser subscriptions are bound to their public
key. Keep the entire secret configuration out of `VITE_*`, committed files,
screenshots, public responses and PR descriptions.

In environment mode, arrange an authenticated server-side invocation of
`POST /api/notifications/worker` every 10–30 seconds, with its worker bearer
and an empty JSON body. Do not put that credential in a public URL.

### Hosted Supabase Vault mode

When `MEALDECK_WEB_PUSH_ENABLED` is **absent**, the existing MealDeck server
connection can read the exact kitchen's enabled Vault-backed bundle through
the service-only `mealdeck_push_runtime_config` RPC. The encrypted secret JSON
contains `publicKey`, `privateKey`, `subject` and `workerSecret`; the private
`push_runtime_configuration` row holds the Vault secret ID and exact scope.
There are no example credential values in this repository.

The hosted dispatcher targets only
`https://mealdeck.co.uk/api/notifications/worker`. Outbox insertion wakes it;
the `mealdeck-customer-push` cron job runs every 30 seconds for retries. The
dispatcher coalesces close wake-ups and records a bounded idle heartbeat.
Credential-bearing network queue records are unavailable to API roles.
An alert transport failure must not roll back a kitchen action.

Check `last_worker_at`, `last_dispatch_at` and aggregate outbox outcomes before
claiming healthy runtime operation. `GET /api/notifications` is a configuration
readiness check, not proof of a working phone or a recently running worker.
Explicit environment OFF always overrides Vault; disabling the private
feature/runtime flags also pauses the relevant sender path without deleting
customer orders or consent history.

## Validation and release evidence

Frontend validation performed for this change:

| Check                                                                      | Observed result                                                                                                                                                                          |
| -------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| New order-notification browser behavior tests                              | 16 passed: direct gesture timing, guest/member separation, readiness, refused permission, current and rotated keys, waiting app updates, uncertain save, withdrawal and per-order reuse. |
| New campaign browser behavior tests                                        | 6 passed: immutable preview/confirm transport, safe destinations/counts, expiry, staff transport and recoverable failures.                                                               |
| Existing checkout transport and PWA provider lifecycle tests               | 16 passed.                                                                                                                                                                               |
| Targeted frontend lint                                                     | Passed.                                                                                                                                                                                  |
| Full TypeScript check of the assembled worktree at the frontend checkpoint | Passed.                                                                                                                                                                                  |
| Mobile screenshot/keyboard browser pass                                    | Not completed: installed Chromium was blocked at startup by the executor's socket restriction. No visual or physical-phone acceptance is claimed.                                        |
| Complete focused application CI                                            | 108 passed, 0 failed, 810 assertions across 10 files.                                                                                                                                    |
| Database CI                                                                | 20 core checks and 8 hosted-dispatch checks passed against fresh PostgreSQL 17 services; extension stand-ins in the hosted fixture perform no real HTTP or scheduling.                   |
| Hosted installation, publication and runtime                               | Both migrations installed; reviewed source served; public availability enabled; authenticated and independently scheduled empty-queue worker requests returned HTTP 200.                 |
| Actual phone notification receipt                                          | Not performed. Android and installed iPhone commissioning remains outstanding.                                                                                                           |

Relevant repeatable checks from the repository root:

```sh
bun test tests/mealdeck-order-notifications-browser.test.ts tests/mealdeck-notification-campaigns-browser.test.ts tests/mealdeck-notifications-server.test.ts tests/mealdeck-web-push.test.ts tests/mealdeck-push-service-worker.test.ts
node tests/postgres/customer-push-behavior.mjs
bunx tsc --noEmit
bun run build
```

The database behavior harness uses a disposable local database; its `--native`
mode requires the harness-approved empty localhost test database. Never point
it at the live MealDeck database. Tests use fake transport and fixture devices,
not customer recipients.

Physical-device commissioning still needs an explicitly chosen test customer
or owned device: permit alerts after a verified test order, close the page,
observe accepted/preparing/packed-ready/handover notifications, follow the
private receipt link and confirm withdrawal. Check Android and an installed
iPhone Home Screen app separately, including denied permission and Focus
behavior. A marketing test must use an explicitly selected consenting test
recipient and deliberate campaign confirmation; do not broadcast a test to
existing customers.
