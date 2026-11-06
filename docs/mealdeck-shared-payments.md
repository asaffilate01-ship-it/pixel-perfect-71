# MealDeck shared payments and phone collection

The common payment ledger was implemented in source on 5 November 2026. The current server ordering rooms extend it on 6 November; they replace the local reply-link planner while preserving historical payment records. This is one payment model for the customer website, shared group funding and Android/iPhone staff companion. Schema installation and web publication do not activate a merchant account or prove a real payment works.

## Customer experience

The current `/group-order` flow starts with a server room: invite, explicitly join, choose food and mark ready. The server expires only unjoined invitations after three minutes. Once everyone remaining is ready, the organiser reviews and finalises the current room revision. Canonical prices, choices and named bags are frozen before payment. The two new-room payment modes are **each person pays for their own food** and **organiser pays for everyone**; either keeps billing itemised by person. See [group ordering rooms](mealdeck-group-ordering.md) for the complete flow and installation order.

By-bag pricing allocates the final whole-order discount proportionally to the canonical gross bag totals, using largest remainder and bag number to settle any leftover pennies. There is no lost or duplicated penny, invented fee or client-controlled price. Each remaining person's bag contains its exact allocated quantities; attached meal extras follow their parent. Both the bag number and canonical short name persist into kitchen and receipt snapshots.

Participants see their own food and share; the organiser can review the whole room and its per-person progress. Payer contact details and provider credentials remain private. A payment already processing stays reserved for its payer. The organiser's whole-order payment must use the same ledger claims and cannot take over another person's active payment.

**Superseded entry flow, retained payment compatibility:** the earlier local planner handed a reviewed basket to `/group-pay`, with private payment invitation links, by-bag funding, equal split and organiser cover of unclaimed shares. Equal split divides the exact total and assigns leftover pennies in bag order; existing records and their amounts remain valid, but the new room UI does not offer it. Older share capabilities remain fragment-only and redeem into scoped HttpOnly, Secure, SameSite cookies. Do not rewrite an old payment room into the new room model or discard its pending attempts.

Paying still requires a verified registered member or a valid guest session during the confirmed guest opening windows. An invitation is access to the share, not a customer identity or authority to charge. A supplied invalid member token never falls back to a guest payment identity. Guest contact details do not create membership, loyalty points or marketing consent.

If someone returns from Stripe, reloads, or loses a response, the current payer can explicitly review and resume their original saved payment. The server returns only that payer's recoverable attempt reference and exact amount. An organiser cannot resume another person's card payment. The same attempt UUID and provider idempotency key are reused.

## One order and one kitchen release

The `mealdeck_private.payment_orders` record binds one canonical quote/order to the current tenant, Luton kitchen, Stripe account and live/test mode. Frozen shares and collection claims live in private RLS-enabled tables. Public API functions are service-role only, and the HTTP server independently verifies the actor. Client requests contain references and choices; they cannot provide a trusted actor, amount, merchant, payment intent or paid flag.

Each share has at most one active collection claim. The organiser, friends and staff phones cannot race to charge the same balance. Terminal collection is excluded while a live online claim owns the order, and online preparation is excluded while a live Terminal claim owns it. Existing legacy Checkout orders remain on their original adapter; lookup does not silently convert them into a phone sale. Already-paid orders have no collection action.

The server authenticates Stripe webhooks against the raw bytes and timestamp, reads the event and current provider objects independently, and compares metadata, account, mode, currency, amount and captured charge with the frozen database claim. Authoritative retrieval also supports interrupted-client recovery. The database accepts only narrow verified facts, records evidence idempotently and rechecks its own amount/identifier bindings.

Partial funding creates no kitchen ticket. Full verified funding, complete kitchen routing and no hold atomically release one master order to the shared KDS. Payment is distinct from staff acceptance; the first receipt job is still created once on acceptance. Canonical person names, bag numbers, modifiers, attached extras and cutlery persist through customer, KDS and printer snapshots. Historical unnamed bags remain valid.

Cancellation immediately stops new funding but does not pretend money was refunded. Pending provider objects are cancelled/expired and independently reread before any unpaid claim is released. A decline, timeout or local clock expiry cannot unlock a claim that might still capture. Captured payments after cancellation, late captures, refunds, disputes or excess funding stay recorded and place the order on human review. No automatic provider refund call is introduced.

## Technical deadlines and recovery

The frozen payment room funds for 60 minutes. This is separate from the new ordering room's three-minute invitation deadline; invitation expiry never drops a joined person or releases a payment claim. Each collection expires at the earlier of its creation plus 35 minutes or the funding deadline. New claims stop when fewer than 30 minutes remain, matching Stripe Checkout's minimum expiry interval. The actual server deadline appears in the room.

An unbound provider-creation response can be recovered by replaying its immutable request with `mealdeck-payment-<collectionId>` during that original claim lifetime. Stripe API v1 idempotency keys can be pruned after at least 24 hours; therefore an old unknown attempt is never recreated indefinitely. After expiry, an already-bound provider ID remains readable/cancellable, while an unbound unknown request requires provider evidence or authorised review. Existing webhooks and receipts remain available when new ordering is paused/closed.

## HTTP and native boundaries

| Route                      | Purpose                                                                                                                                    |
| -------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| `GET /api/group-orders`    | Current server-room availability, join window and member/guest eligibility |
| `POST /api/group-orders`   | Scoped room creation, invitation preview/join, own choices/readiness, organiser finalisation and common-ledger payment/recovery |
| `/group-order`            | Current private room, named per-person review, payment and progress |
| `GET /api/group-payments`  | Current shared-payment and guest eligibility; no invented readiness                                                                        |
| `POST /api/group-payments` | Existing payment-room creation/access, pay/resume, reconcile or cancel; retained compatibility path |
| `/group-pay`               | Existing private, noindex payment-room review and recovery |
| `POST /api/terminal`       | Public Auth bootstrap, then verified scoped staff config/lookup/catalogue/quote/prepare/reconcile/cancel and short-lived connection tokens |
| `POST /api/stripe/webhook` | Verified routing to the common share/Terminal ledger or the compatible legacy Checkout ledger                                              |

The native project is `apps/mealdeck-terminal`. It uses the current Stripe Terminal React Native SDK, native Expo builds, device checks, secure refresh-token storage, staff MFA, exact-attempt recovery and a real iPhone merchant-education module. It is not an Expo Go or browser NFC integration. See its README for pinned toolchains and installation steps.

The API verifies the configured Stripe account and Terminal location are in GB, uses GBP and server-created automatic-capture `card_present` PaymentIntents, and checks current `payments.collect` access. Stripe's connection-token location parameter scopes internet readers only; server actor/claim/location validation supplies the MealDeck phone boundary. Client secrets and short-lived connection tokens are returned only to authorised staff and never cached or logged.

## Hosted configuration

Keep the existing dedicated MealDeck URL/public key/server key and tenant/Luton location values. Both online and phone flows share the actual Stripe secret, webhook secret, account ID and explicit test/live mode. Never use Dishbee/Cafe1 credentials or copy another merchant's records.

Shared funding additionally requires `MEALDECK_SHARED_PAYMENTS_ENABLED=true` and `MEALDECK_GROUP_LINK_SECRET`, a separately generated high-entropy base64url secret of at least 43 characters. Rotating that key invalidates existing participant access links/cookies; it does not rewrite payment records. Retain the key while pending rooms need access.

New ordering rooms reuse those same settings; there is no additional feature flag or secret. Install `20261105235509_mealdeck_ordering_rooms.sql` after the current Checkout-domain extension and existing payment prerequisites, using the guarded `deploy/mealdeck/ordering-rooms.mjs` builder in one atomic transaction. Existing payment installation alone does not supply the new create/join/save/finalise room API. The [room setup guide](mealdeck-group-ordering.md#setup-and-activation) records the exact order.

Shared contributions use the same optional `MEALDECK_STRIPE_CHECKOUT_HOST=pay.mealdeck.co.uk` setting as single-payer Checkout. Their original Stripe Session and claim are preserved on return/retry, including when the provider returns the earlier Stripe hostname. The exact new hostname needs the [custom-domain additive migration and activation checks](mealdeck-stripe-custom-domain.md); setting it is not evidence of an active domain or accepted payment.

Native collection additionally requires `MEALDECK_TERMINAL_ENABLED=true`, `MEALDECK_TERMINAL_INTEGRATION_APPROVED=signed-off`, and `MEALDECK_STRIPE_TERMINAL_LOCATION_ID`. `MEALDECK_TERMINAL_SIMULATED=true` is permitted only in test mode. Common checkout integration approval and actual canonical kitchen readiness still apply. All defaults remain unavailable until configured.

Subscribe the configured Stripe webhook to Checkout completed/async-payment-succeeded/expired; PaymentIntent succeeded/canceled/processing/payment-failed; charge refunded; and dispute created/closed. Unknown provider activity is not made into a MealDeck order. Unbound callbacks before the initial HTTP response can bind only through the verified server reconciliation path.

Install the guarded post-install migration only in the independent MealDeck project after the existing membership, checkout, printer, guest and kitchen-availability extensions. The migration changes no owner identity, merchant keys, catalogue publishing or enabled-checkout setting. The installation wrapper requires one complete atomic transaction. See `mealdeck-shared-payments-db-contract.md` for exact RPCs.

## Verification and remaining acceptance

The automated checks exercise real database permissions, canonical penny allocations, immutable prices, partial/full funding, safe cancellation, late/refunded/disputed money, one KDS release and acceptance receipt, guest/member separation, and multiple simultaneous connections in PostgreSQL CI. HTTP tests use deterministic provider fixtures to verify signature, metadata, amount, mode, no-fallback identity, scope and recovery failures; they are not real Stripe charges.

Native CI compiles Android and an unsigned iPhone simulator target where the current toolchains support it. Compilation does not test NFC, Apple account linking, real bank-card acceptance, production signing or App Store approval. Commission eligible physical Android and iPhone devices, obtain Apple's development/distribution entitlements, and complete the documented test-mode and approved live acceptance before switching on staff collection.

Official references: [Stripe Tap to Pay](https://docs.stripe.com/terminal/payments/setup-reader/tap-to-pay), [Android requirements](https://docs.stripe.com/terminal/payments/setup-reader/tap-to-pay?platform=android), [Terminal card collection](https://docs.stripe.com/terminal/payments/collect-card-payment), [connection tokens](https://docs.stripe.com/api/terminal/connection_tokens/create), [API idempotency](https://docs.stripe.com/api/idempotent_requests).
