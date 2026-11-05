# Confirmed opening hours and guest checkout — 5 November 2026

## Owner-confirmed behaviour

| UK date                  | Opening hours |
| ------------------------ | ------------- |
| Friday 6 November 2026   | 15:00–23:00   |
| Saturday 7 November 2026 | 13:00–23:00   |
| Sunday 8 November 2026   | 13:00–23:00   |

The time zone is Europe/London. Each start is inclusive and each closing time is exclusive. During these windows, eligible Luton collection and kerbside orders receive the existing 30% opening discount, with no minimum. Guests can order without registering, and earn no loyalty points. Member-only offers require a registered, verified account. Promotional email and push permissions are separate, optional choices for members. Notification sending and loyalty earning remain subject to their actual configuration.

The advert/explainer, opening-offer page, menus' shared offer banner and location information display the same confirmed hours. Checkout and payment readiness continue to depend on the operational menu, enabled channel, verified provider configuration and acceptance. Dates alone never enable ordering.

After the launch weekend, member checkout retains the existing manually controlled enabled-channel model. No regular timetable has been supplied or invented. From 9 November, an enabled channel accepts new member orders until staff pause it; the team must switch it off outside service or supply a regular schedule before leaving it enabled. Guest ordering and the opening discount remain permanently closed. Paid-order progress and receipts continue when new ordering is paused.

## Guest privacy and payment authority

Guest checkout stores necessary name, email and phone contact details in `mealdeck_private.guest_sessions`. It creates no Auth user, customer membership, loyalty record or marketing preference. A 256-bit random capability is delivered only in the `__Host-mealdeck_guest` cookie: Secure, HttpOnly, SameSite=Lax, Path=/, 30-day maximum lifetime, no Domain. The database stores a SHA-256 digest, never the raw capability. No guest capability is exposed through browser JavaScript, URLs, JSON or local storage.

Guest state changes require same-origin JSON requests. Guest quote, payment preparation and receipt RPCs accept only the server-derived token hash and trusted tenant/location binding. They are executable by the backend service role only; all tables retain RLS and no direct API-role table grants. Private helpers are revoked from every API role. Guest session creation has per-contact and kitchen-wide limits; existing quote limits and idempotency remain in effect.

Existing member Bearer tokens retain their verified identity path and never fall back to a guest cookie when invalid. Guest and member records remain separate even when contact emails match. Exactly-one identity constraints bind each quote and Stripe order to either a verified member or guest. Guest orders have a null member customer ID and a durable guest marker. Contact fields alone can never recover an order.

Both identities use the same server-owned pricing, modifier validation, numbered packing, reviewed total and Stripe preparation implementation. Signed and independently fetched payment evidence remains the only authority for paid status and KDS release. A redirect, guest cookie, marketing date or client flag cannot confirm payment. Guest receipts use the same canonical order/printer data.

No new guest checkout begins outside the three daily windows. Quotes expire no later than that day's closing time. Provider sessions already prepared while open can finish within their existing expiry and reconcile normally, including after closing. Existing receipts remain available in the original browser until session expiry or explicit session ending; after losing the cookie, the customer must contact the team rather than use email as an access credential.

## Additive database installation

Apply only to the independent MealDeck project after the foundation, customer membership, Stripe checkout and kitchen/printer extensions. Do not apply to Dishbee or Cafe 1. The new file was created by the pinned Supabase CLI and retained as an additive post-install migration:

`deploy/mealdeck/post-install-migrations/20261105143652_mealdeck_opening_guest_checkout.sql`

`deploy/mealdeck/guest-checkout.mjs` exposes complete and managed-transaction builders. Apply the unchanged standalone SQL as one request with its outer transaction; use the managed builder only for a runner that owns one atomic transaction. Historical installers and migrations are unchanged. Installation changes the confirmed campaign dates but does not enable channels, publish menus, create owner/customer accounts, assign permissions, configure payment secrets, send emails or create orders.

The disposable PostgreSQL suite exercises the exact production window function, then substitutes a private clock wrapper only inside the local disposable fixture to exercise in-window and after-window flows. No test clock override is shipped or applied to the hosted database. CI also exercises the migration on PostgreSQL 17.

## Activation still requires real configuration

The intended owner `info@mealdeck.co.uk` must register and verify the email before private owner/kitchen setup. Then publish the reviewed catalogue, configure the server-only Stripe account and webhook values, set the actual kitchen pickup estimate and complete payment/KDS acceptance. Physical printer/TLS setup and a paper check remain device-specific. The latest hosted installation and verification receipt is recorded in `mealdeck-cloud-deployment-status.md`.
