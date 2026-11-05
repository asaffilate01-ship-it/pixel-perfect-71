# Shared and Terminal payments: database contract

This is the implemented database contract for the independent MealDeck database. The additive migration is `20261105182512_mealdeck_shared_terminal_payments.sql`; its deployment builder is `deploy/mealdeck/shared-terminal-payments.mjs`. Its preflight requires the `mealdeck-independent-v1` installation receipt, rejects a Dishbee private schema, and checks all prerequisite checkout, guest, printer, availability and kitchen helpers before DDL. It changes no merchant configuration, opening clock, menu visibility or checkout-enabled setting. Hosted installation and provider acceptance remain separate required steps.

All new public RPCs are **service-role-only**. PUBLIC, anon and authenticated execution is revoked. Private ledger tables have RLS enabled and no application-role grants, including service_role. Private helpers and payment-authority callbacks are not directly callable by any application role. The trusted server obtains the actor from verified Auth or a scoped guest-session cookie; request-body identities and monetary values are never authority.

## One order, exact shares, one kitchen release

The private ledger comprises:

- `payment_orders`: one canonical order and quote, group/Terminal origin, owner member/guest/staff identity, configured account/mode, immutable expected total, funding deadline, stable kitchen release ID and cancellation/refund-review hold.
- `payment_shares`: exact GBP penny allocations. Group rooms have one share per canonical numbered bag, from two to ten bags; Terminal sales have one full-order share. Share links store only hashes, without nicknames, participant contacts or raw link secrets.
- `payment_collections`: an immutable payment attempt and payer, Checkout or Terminal, frozen amount, provider bindings, verified captured/refunded amounts, cancellation request and provider cancellation evidence.
- `payment_collection_shares`: immutable claim membership. A partial unique index permits only one active claim per share. Paid claims remain reserved; only independently verified provider cancellation/expiry releases unpaid claims.
- `payment_events`: unique provider evidence ID and hash. Webhooks use `evt_…`; trusted server retrieval uses `obs_<sha256>`.

Both adapters lock the canonical quote before freezing it, so ordinary Checkout and the shared ledger cannot fund the same quote. Money/claim mutations lock the canonical order before ledger children. Shared and ordinary checkout use the same canonical order materialisation and KDS routing helpers. Current canonical prices, modifiers, pickup/kerbside rules, packing allocations, attached extras, cutlery, discounts and ETA are reused. Frozen room prices and ETA survive later menu/estimate edits; unprepared quotes still expire when the ETA changes.

`by_bag` allocates the discounted order total in proportion to each bag's canonical gross price, using largest remainder and bag number as its tie-break. `equal` divides the exact total over the number of bags, with earlier bags receiving any remaining pennies. No rounding surplus or additional surcharge is created.

Full verified funding, zero refunds/disputes/cancellation holds, exact active-share coverage and complete kitchen routes are required for one atomic KDS release. The public group room becomes `submitted`, matching the established KDS gate. Staff acceptance is a separate action and enqueues one receipt job. Existing customer/guest receipts and the printer snapshot resolve either ledger. Partial funding never releases kitchen work.

A managed order's `orders.payment_reference` is `md_payments_<orderId>`; individual provider identifiers remain in the collection ledger. This avoids pretending that several card payments have one PaymentIntent.

## Group RPCs

```sql
mealdeck_create_group_payment_room(
  p_room uuid, p_quote uuid, p_customer uuid, p_guest_token_hash text,
  p_attempt uuid, p_split_mode text, p_share_tokens jsonb,
  p_stripe_account text, p_livemode boolean
) returns jsonb

mealdeck_group_payment_status(
  p_room uuid, p_customer uuid, p_guest_token_hash text,
  p_share_token_hash text
) returns jsonb

mealdeck_group_payment_collections(
  p_room uuid, p_customer uuid, p_guest_token_hash text,
  p_share_token_hash text
) returns jsonb

mealdeck_prepare_group_payment(
  p_room uuid, p_customer uuid, p_guest_token_hash text,
  p_share_token_hash text, p_cover_remaining boolean, p_attempt uuid,
  p_stripe_account text, p_livemode boolean
) returns jsonb

mealdeck_cancel_group_payment_room(
  p_room uuid, p_customer uuid, p_guest_token_hash text
) returns jsonb
```

Creation and claims require exactly one current member or guest identity. Share-token-only status access is allowed. A currently verified Auth account without customer registration may also read its capability’s participant projection, with `payerAccess:false`; it cannot become the organiser or pay until registration is complete. Paying requires a verified registered member or valid guest session. A participant cannot cover other shares. The organiser can reserve all unclaimed unpaid shares atomically, while active participant claims remain reserved. To pay one particular share, including the organiser's Bag 1, supply that share's token hash. The server can regenerate it from its group secret.

`p_split_mode` is `by_bag` or `equal`. `p_share_tokens` is exactly `[{"shareId":"uuid","bagNumber":1,"tokenHash":"64 lowercase hex"}, …]`, one entry per canonical bag. No amount is accepted. Server-derived room/share IDs and hashes must remain stable across retries; any immutable-input mismatch is rejected.

New rooms and claims respect the existing configured channel and launch schedule. Existing attempt recovery returns the frozen collection before the new-claim opening check. Status, receipts and verified provider reconciliation survive closing. The funding deadline is 60 minutes; collections expire at the earlier of 35 minutes from reservation and that deadline. New claims are rejected with less than 30 minutes left. Neither a browser timeout nor a database deadline releases a claim. A first capture observed after its permitted deadline is recorded on hold for staff review.

### Safe room snapshot

```ts
{
  roomId: string; orderId: string; version: 1;
  quoteId?: string; // organiser only
  splitMode: "by_bag" | "equal"; currency: "GBP";
  status: "collecting" | "paid" | "cancelled" | "refund_review";
  totalPence: number; capturedPence: number; paidPence: number;
  refundedPence: number; remainingPence: number; unclaimedPence: number;
  expiresAt: string; fundingExpired: boolean; holdReason: string | null;
  viewer: { role: "organiser" | "participant"; shareId: string | null };
  shares: { shareId: string; bagNumber: number; amountPence: number;
    paidPence: number; status: "unclaimed" | "pending" | "paid" | "refund_review" }[];
  lines: CanonicalPricedLine[]; packingPlan: CanonicalPackingPlan;
  collectionEstimateMinutes: number; fulfilment: "pickup" | "curbside";
  createdAt: string; paidAt: string | null; acceptedAt: string | null;
  handoffCode: string | null; serverNow: string;
  ownerAccess: boolean; ownShareId: string | null; // compatibility aliases
}
```

The organiser sees all lines, bags and shares. A participant sees **only their own share, numbered bag, allocated item quantities and modifiers**, plus whole-order monetary aggregates. Do not impose a sum-of-visible-shares or visible-lines equals order-total invariant on participant snapshots. Names, contacts, raw tokens, hashes, provider IDs and other payer identities are excluded. Equal-share UI explains that the payment is an equal contribution to the complete order.

`paidPence` is net verified captured money, and can exceed the order total in a held overpayment case; `remainingPence` is floored at zero. Do not hide the evidence or reject the review snapshot in that case. No successful/paid presentation should override `refund_review`.

`mealdeck_group_payment_collections` is a **server-only** reconciliation lookup: the owner may see all collections; a share capability permits only collections attached to that share. Each returned collection adds ephemeral `payerAccess:boolean`, true only when the supplied current verified member/guest identity is the collection payer. Organiser or share-link access alone never grants payment-resume authority. Never spread its private projection into browser HTTP responses.

Room cancellation returns `{roomId,orderId,status,refundReviewRequired,collectionsToCancel:Collection[]}`. It closes new funding immediately but retains claims until provider evidence permits release. Captured money changes the room to refund review. No refund is automatically issued or invented. `holdReason:'cancelled'` accompanies a cancelled room even when no money was captured; the HTTP mapper should preserve its explicit cancelled state.

## Common provider contract

```sql
mealdeck_order_payment_collection(
  p_collection uuid, p_account text, p_livemode boolean
) returns jsonb

mealdeck_bind_order_payment(
  p_collection uuid, p_session text, p_intent text, p_url text,
  p_account text, p_livemode boolean
) returns jsonb

mealdeck_reconcile_order_payment(
  p_event text, p_hash text, p_type text,
  p_collection uuid, p_order uuid, p_session text, p_intent text,
  p_account text, p_livemode boolean, p_currency text,
  p_captured integer, p_refunded integer, p_disputed boolean
) returns jsonb
```

The server-only collection lookup returns null on unknown collection/account/mode. Root must additionally check its returned tenant/location against configured scope, and compare live provider metadata, quote/order/collection IDs, request hash, amount, GBP currency, account/mode and collection method before reconciliation. An authenticated HTTP caller must first be authorized through owner/share/staff access; never expose arbitrary client collection lookup.

Checkout binds a Session and URL, with an optional PaymentIntent. Terminal binds a PaymentIntent without a Session/URL. A verified webhook/retrieval may atomically bind previously unrecorded IDs when the prepare response was lost; completed Checkout sessions may have a null URL. Existing bindings cannot change. Cancellation racing creation still allows the real provider object to be recorded so it can be cancelled/reconciled safely.

Accepted evidence types are `checkout.session.completed`, `checkout.session.async_payment_succeeded`, `checkout.session.expired`, `payment_intent.succeeded`, `payment_intent.canceled`, `payment_intent.processing`, `payment_intent.payment_failed`, `charge.refunded`, `charge.dispute.created` and `charge.dispute.closed`. Only verified Checkout Session expiry or Terminal PaymentIntent cancellation with zero capture/refund frees a claim. Processing/failure is not cancellation. Capture must be the exact immutable collection amount. Refund/dispute/cancellation and late-capture holds are monotonic; stale success cannot erase them.

```ts
type Collection = {
  collectionId: string;
  attemptId: string;
  orderId: string;
  quoteId: string;
  roomId: string | null;
  tenantId: string;
  locationId: string;
  stripeAccount: string;
  livemode: boolean;
  method: "checkout" | "terminal";
  amountPence: number;
  currency: "gbp";
  requestHash: string;
  status: "reserved" | "pending" | "paid" | "cancelled" | "refund_review";
  capturedPence: number;
  refundedPence: number;
  cancelRequested: boolean;
  shareIds: string[];
  sessionId: string | null;
  sessionUrl: string | null;
  paymentIntentId: string | null;
  expiresAt: string;
  email: string | null;
  terminalLocationId: string | null;
};
```

Provider idempotency key: `mealdeck-payment-<collectionId>`. Reconciliation returns `{ok,replayed,orderId,collectionId,status,orderPaid,held}`. Failed kitchen routing rolls back verification and release together, so provider retry can safely repair the same payment after routing is restored. The first verified funding transition alone enters KDS routing; later distinct success receipts cannot reroute an already released order after a menu-route edit. Unique evidence, claim, ticket and pass-order keys prevent a second release.

## Staff Terminal RPCs

```sql
mealdeck_terminal_authorize(p_actor uuid,p_tenant uuid,p_location uuid) returns jsonb

mealdeck_create_terminal_quote(
  p_actor uuid,p_tenant uuid,p_location uuid,p_fulfilment text,
  p_vehicle jsonb,p_selection jsonb,p_packing jsonb,p_request_hash text
) returns jsonb

mealdeck_terminal_order_status(
  p_actor uuid,p_tenant uuid,p_location uuid,p_reference text
) returns jsonb

mealdeck_prepare_terminal_payment(
  p_actor uuid,p_tenant uuid,p_location uuid,p_quote uuid,p_order uuid,
  p_attempt uuid,p_stripe_account text,p_livemode boolean,p_terminal_location text
) returns jsonb

mealdeck_terminal_payment_attempt(
  p_actor uuid,p_tenant uuid,p_location uuid,p_attempt uuid
) returns jsonb

mealdeck_cancel_terminal_payment(
  p_actor uuid,p_tenant uuid,p_location uuid,p_collection uuid
) returns jsonb
```

`payments.collect` is an owner/admin default; other roles need an explicit scoped grant. Scope denials override grants. Every staff call checks a currently verified, non-anonymous, non-deleted and non-banned Auth account and active matching permission. The authorize result is `{authorized:true,tenantId,locationId}`; denial throws `mealdeck_payment_staff_forbidden`.

A staff quote stores `staff_id` as a third exclusive quote identity, using the shared canonical quote path without creating a customer or guest account. Prepare accepts exactly one quote or existing order. A new staff quote creates one canonical order and full-order share. An existing managed order collects available unpaid shares, with no active online/Terminal overlap. Paid/held orders cannot receive a new charge. Legacy ordinary Stripe orders remain readable but are never silently converted or charged again through Terminal.

Order lookup takes an exact order UUID or an actively reserved four-digit handoff code. It returns `orderId, quoteId, roomId, currency, displayCode, status, paymentStatus, verifiedPaid, totalPence, capturedPence, paidPence, refundedPence, remainingPence, collectiblePence, held, activeCollection, onlinePaymentActive, lines, packingPlan, collectionEstimateMinutes, fulfilment, vehicle, serverNow`. `activeCollection` is only the caller's recoverable Terminal attempt; no client secret is stored or returned by SQL.

Attempt lookup checks the same verified permission and scope and returns only the **same staff actor's** attempt, or null. It supports lost-response recovery using a saved request/attempt ID without creating another payment or requiring reopening. Cancellation marks the caller's own unpaid attempt cancel-requested. Its claims remain held until the server has verified provider cancellation. A later capture is retained on refund-review hold.

## Verification and installation

`node tests/postgres/shared-terminal-payments-behavior.mjs` runs the complete embedded PostgreSQL behavior suite, including actual wrong/missing profile, shared-schema, missing-extension and managed-transaction install/rollback probes. `--native` additionally requires the existing safe disposable localhost PostgreSQL configuration and runs seven competing-connection races: same share, host balance, Terminal/online overlap, two Terminal clients, cancellation/capture, duplicate webhook and ordinary/shared quote overlap. Native PostgreSQL CI is a required merge gate; embedded execution does not claim to test real connection locking.

No hosted database/provider calls are part of these tests. Merchant configuration, native entitlements/signing, physical device acceptance and real payment/refund commissioning remain necessary before activation.
