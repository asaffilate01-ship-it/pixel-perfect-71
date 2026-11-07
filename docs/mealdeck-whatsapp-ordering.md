# MealDeck WhatsApp ordering — pickup and kerbside

Implementation: 7 November 2026. This document describes source implementation and activation requirements. A source merge, a passing build, database installation, Meta registration and a successful live customer order are separate outcomes.

## Scope and ownership

The initial channel supports one Luton pickup or kerbside basket across the current launch brands. It uses MealDeck's independent backend, canonical live menu, existing member/guest eligibility, Stripe Checkout, shared KDS, packing and printer rules. The merchant is 313 Brands Ltd, trading as MealDeck; Dishbee supplies the technology. There is no fallback to Dishbee's database or Cafe 1's tills.

The transport is **Meta's official Cloud API directly**. Twilio is an alternative provider, but its webhook validation and send API are different: a Twilio number/credential cannot simply be pasted into this adapter. Use a dedicated business-owned number that can receive Meta's ownership-verification SMS or call. Register the business account under the merchant's control. Review onboarding against the actual approved account/API version before activation.

Group ordering and delivery remain later phases for this channel. Reuse existing server-backed MealDeck group rooms and payment claims when adding groups. Delivery requires a real serviceability/fee/courier integration and its own acceptance; it must not be inferred from a chat request.

## Customer journey

1. The customer follows a verified business link or sends a message to the official number. Website links contain only a generic greeting. Public links stay **coming soon** until all channel configuration and explicit activation flags pass.
2. The assistant asks pickup/kerbside, the customer's name and contact number, and (for kerbside) car make, colour and exactly the final four registration characters. The sender identifier is opaque and is never used as a member account or automatically copied into contact fields.
3. The customer separately chooses whether to receive WhatsApp order updates. Marketing is not required and no campaign sender is implemented.
4. The assistant shows the live catalogue and guides required choices, optional extras, quantities, basket edits, cutlery, up to three numbered bags and optional notes. All quantities must be assigned exactly once; attached meal extras stay with their main. No cached/sample menu fallback is used on live-menu failure.
5. Optional AI interpretation proposes only stable menu identifiers. Deterministic code validates the proposal. The assistant cannot set a price, sign in a customer, create payment authority or change kitchen status.
6. The customer explicitly confirms the reviewed basket. An encrypted durable outbox delivers a 15-minute private link. The raw capability is in the URL fragment, never a query string. The page removes the fragment immediately and exchanges the capability once for a Secure, HttpOnly, SameSite browser cookie. Only hashes are stored in the handoff ledger.
7. `/whatsapp/checkout` shows the frozen chat selections without changing the customer's normal or group basket. Existing member verification and actual guest opening eligibility apply. A prefilled guest contact does not grant privacy or marketing consent. The ordinary canonical server produces the final priced quote, including current configured offers.
8. The customer reviews and authorises payment on the existing Stripe-hosted checkout. The exact original quote, actor, order and attempt are bound before any Stripe session creation. Repeated clicks resume the original attempt. Stripe's verified server evidence remains the only online-payment authority.
9. Verified payment makes the order eligible for the existing KDS queue. Staff acceptance remains separate and queues the original receipt once. All-items-ready/packing remains the authority for collection readiness. Optional status messages use those verified database states.
10. For a linked, verified paid kerbside order, `I'M HERE` records arrival for the authorised operations inbox. It does not mark food ready, complete a handoff or release payment. Staff match the saved vehicle and collection code using the established handoff procedure.

`HELP`, allergy queries and payment disputes enter the staff inbox. They pause further automated checkout and do not cancel or refund any payment already in progress. Staff must review active provider payments explicitly. A new draft is allowed only after the database atomically proves there is no prepared payment or that the previous order is safely complete/refunded. Unknown payments remain locked.

## Runtime configuration

All settings below are server-only. Never put them in `VITE_*`, browser code, a chat, an issue or a committed env file.

| Setting                                                                                               | Purpose                                                                                                                                                                |
| ----------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Existing `MEALDECK_SUPABASE_URL`, `MEALDECK_SUPABASE_PUBLISHABLE_KEY`, `MEALDECK_CHECKOUT_SERVER_KEY` | The independent MealDeck project; never mix project URLs and credentials.                                                                                              |
| Existing `MEALDECK_TENANT_ID`, `MEALDECK_LUTON_LOCATION_ID`                                           | Exact approved Luton scope.                                                                                                                                            |
| `MEALDECK_LUTON_WHATSAPP_BUSINESS_NUMBER`                                                             | Business-owned E.164 number.                                                                                                                                           |
| `MEALDECK_LUTON_WHATSAPP_PHONE_NUMBER_ID`                                                             | Meta phone-number resource ID; this is different from the visible telephone number.                                                                                    |
| `MEALDECK_WHATSAPP_BUSINESS_ACCOUNT_ID`                                                               | Exact account ID accepted by this webhook.                                                                                                                             |
| `MEALDECK_LUTON_WHATSAPP_VERIFIED=true`                                                               | Record only after actual number ownership and routing verification.                                                                                                    |
| `MEALDECK_WHATSAPP_APP_SECRET`                                                                        | Meta application secret for raw-body webhook signatures.                                                                                                               |
| `MEALDECK_WHATSAPP_VERIFY_TOKEN`                                                                      | Separate random verification token, 32–256 URL-safe characters.                                                                                                        |
| `MEALDECK_WHATSAPP_ACCESS_TOKEN`                                                                      | Least-privilege server messaging credential for the approved account/number.                                                                                           |
| `MEALDECK_WHATSAPP_GRAPH_VERSION`                                                                     | Explicit supported Graph version from the actual app; no guessed default.                                                                                              |
| `MEALDECK_WHATSAPP_WORKER_SECRET`                                                                     | Separate random 32–256-character URL-safe scheduler credential.                                                                                                        |
| `MEALDECK_WHATSAPP_HANDOFF_SECRET`                                                                    | Independent 32-byte random AES key encoded as 64 lowercase hexadecimal characters. It encrypts queued checkout links and binds them to the sender and business number. |
| `MEALDECK_WHATSAPP_ORDERING_ENABLED=true`                                                             | New-order switch, after acceptance.                                                                                                                                    |
| `MEALDECK_WHATSAPP_ORDERING_APPROVAL=signed-off`                                                      | Explicit channel acceptance record. Existing canonical payment gates still apply.                                                                                      |
| `MEALDECK_WHATSAPP_AI_ENABLED=true`                                                                   | Optional natural-language menu interpretation. Buttons work when disabled or AI fails.                                                                                 |
| `MEALDECK_WHATSAPP_OPENAI_API_KEY`, `MEALDECK_WHATSAPP_OPENAI_MODEL`                                  | Separately configured OpenAI project credential and reviewed Structured Outputs-compatible model. No default credential or model is guessed.                           |

Configure the Meta webhook as `https://mealdeck.co.uk/api/whatsapp/webhook` and subscribe the intended business account/number to message events. A valid verification challenge alone is not inbound/outbound acceptance. Confirm a real signed inbound fixture and outbound message against the exact selected API/account version.

The current decoder accepts signed Cloud API `messages[].from` identifiers as opaque strings. A phone number is not identity. Username/BSUID and account-model changes must be checked against actual account-version webhook fixtures; do not claim support for undocumented alternative field names merely because storage accepts opaque strings.

## Database and worker installation

Install the WhatsApp post-install migration **only** in the independent MealDeck database, after its current checkout, guest, KDS/pass and staff-permission extensions. The SQL checks its prerequisites and never turns on payment/ordering settings. The Supabase CLI creates the timestamped migration; the reviewed artifact is stored under `deploy/mealdeck/post-install-migrations/`, outside the historical shared-project migration chain. Do not run a broad `supabase db push` against another product to install this extension.

`deploy/mealdeck/post-install-migrations/20261107071449_mealdeck_whatsapp_ordering.sql` is the reviewed source. `buildWhatsappOrderingSql()` includes its atomic transaction; `buildManagedWhatsappOrderingSql({runnerOwnsTransaction:true,singleMigration:true})` removes only that wrapper for a runner which owns one complete atomic migration. Do not split this migration into independently committed snippets. Direct private-table access is revoked, including from `service_role`; transport uses narrowly scoped RPCs. Staff RPCs use verified staff tokens, current database permissions and the existing MFA checks.

Run `apps/mealdeck-whatsapp-worker/worker.mjs` with Node 22+ under a process supervisor, using `MEALDECK_WHATSAPP_WORKER_ORIGIN=https://mealdeck.co.uk` and the matching worker credential injected through the host's secret store. It continuously POSTs `/api/whatsapp/worker` and logs counts/status codes only. Do not use a request-lifetime background promise as the only worker. The webhook acknowledges durable inbox persistence; workers acquire leases and commit draft + replies + handoff atomically. Overlapping workers cannot process the same active sender lease. The worker also queues authoritative order updates and performs bounded housekeeping.

Monitor queue age, held replies, worker failures and support requests. Polling must be running and tested before enabling the public channel. Staff support appears in the existing operations experience. Taking over pauses automation; only the assigned staff member can send/release. Manual replies carry a stable request UUID, so a lost browser response is not an excuse to submit a different message ID. “Sent to WhatsApp” means provider acceptance, not proof the customer read it.

## Security and recovery boundaries

- Webhooks verify HMAC-SHA256 over the exact bounded raw bytes, then exact account and number scope. IDs deduplicate atomically. Cross-sender replay cannot overwrite a message. Untrusted media is not fetched and a payment screenshot has no financial authority.
- Customer and worker endpoints have separate credentials. Customer POSTs require same-origin JSON and a high-entropy HttpOnly claim. Tokens cannot be redeemed by arbitrary query parameters. The checkout API projects only the frozen selection/contact fields needed by the authorised browser.
- AI is a single bounded call to the fixed OpenAI Responses endpoint with `store:false` and strict structured output. Saved contacts, vehicle data, notes, credentials and conversation history are excluded. Suspicious current messages use the guided fallback. `store:false` is not a blanket zero-retention guarantee; review applicable provider data-processing settings/terms before activation.
- AI has no tool permissions, SQL access, payment actions or staff identity. Refusals, malformed output, timeouts and unavailable models return to deterministic menu choices.
- New quotes must match the exact normalized frozen selection hash. SQL verifies canonical quote scope, actual member/guest actor and original order/attempt. A new quote cannot replace an unknown/prepared payment.
- Known delivery rejection/rate limits may retry within a bound. Timeouts, 5xx responses or expired sending leases are **held**, because the provider may already have accepted the message. Operators inspect held items; do not blindly resend a private payment link or message.
- Freeform messages use a conservative 24-hour customer-service window, refreshed only by signed incoming customer messages. This release holds messages outside that window. No marketing campaigns or unapproved template/Direct Send fallback is enabled; future outbound methods need actual account eligibility and accepted content.
- STOP preferences are separate from account identity and payment state. Stopping messages never means cancelling/refunding an order. Staff must handle opt-outs and explicit resume requests according to the visible customer instruction.
- Housekeeping redacts old inbound/outbound message bodies after seven days and expires unused drafts/handoffs where safe. Bound or uncertain payment recovery is retained independently. Order/account records keep their existing retention rules. Rotate secrets deliberately; replacing the handoff encryption key makes already queued encrypted links unreadable and they must remain held.

## Acceptance before live activation

Automated tests cover deterministic choices and stale buttons; explicit confirmation; signature tampering and scope; ciphertext tampering/sender binding; body/queue limits; private link exchange and cookie/CSRF boundaries; AI refusal and privacy boundaries; guest/member isolation; canonical quote/order binding; duplicate webhook and overlapping worker leases; uncertain sends; consent and service-window expiry; staff permission/takeover and safe reset; kerbside arrival; and preservation of original payment recovery.

The database behavior suite runs against disposable PostgreSQL/PGlite and has native PostgreSQL concurrency coverage in CI. These checks do not establish a real Meta connection or live payment acceptance.

Before enabling: install on the correct independent project; configure and verify the number/app/account; run the supervised worker; complete signed inbound and outbound tests; confirm the actual username/account payload schema if enabled; exercise pickup and kerbside to the real secure checkout; verify a paid order appears once in KDS, staff acceptance queues one print, readiness follows complete packing, and arrival reaches staff; check STOP/help/allergy handling and an interrupted-payment recovery. Keep new ordering disabled if any required part is unverified.

## Official references checked during implementation

- [WhatsApp Business Platform](https://business.whatsapp.com/products/business-platform)
- [WhatsApp Business Messaging Policy](https://whatsappbusiness.com/policy/)
- [Meta Cloud API registration](https://www.postman.com/meta/whatsapp-business-platform/folder/zuoeksl/registration)
- [Meta username and BSUID guidance](https://developers.meta.com/resources/videos/whatsapp-usernames/)
- [OpenAI Structured Outputs](https://developers.openai.com/api/docs/guides/structured-outputs?api-mode=responses)
- [OpenAI Responses reference](https://developers.openai.com/api/reference/resources/responses/methods/create)
- [Stripe Checkout fulfilment](https://docs.stripe.com/checkout/fulfillment)
- [Twilio WhatsApp pricing](https://www.twilio.com/en-us/whatsapp/pricing) — alternative provider, not the implemented transport.

Some Meta API documentation requests returned rate limits during research. Activation therefore explicitly requires current account/version fixture verification; no unsupported field or capability is assumed from historical examples.
