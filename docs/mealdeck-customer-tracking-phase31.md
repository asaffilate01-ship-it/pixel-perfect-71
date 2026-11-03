# MealDeck Phase 31 — truthful multi-brand tracking and support boundaries

**3 November 2026 · GitHub source implementation only · not production activation**

## What this phase builds

The customer-facing `/track` page now has a four-stage, accessible, responsive order journey:

1. **Payment** — the canonical Dishbee order must leave `payment_pending` before any kitchen preparation is shown.
2. **Kitchen preparation** — all participating food brands share one master order. A kitchen completion is not inferred from a courier event.
3. **One MealDeck pack** — the canonical pass state is separately represented as `ready_to_pack`, `packing`, `sealed` or `ready_for_handoff`. If the pass is missing, the UI does not claim packing completed.
4. **One handoff** — pickup, kerbside or one delivery, as returned by Dishbee. Couriers may report `picked_up`, `arriving_customer` or `delivered`, but the latter is labelled **Courier reports delivery**, not independent proof that the customer received the order.

The new `src/lib/mealdeck-tracking-presentation.ts` is a browser-safe, deterministic, **read-only** projector. It contains no checkout, KDS, webhook, refund, booking or account-write logic. It never sends a message or declares a verified financial settlement. It is called only with the previously authenticated and privacy-minimised `getOrderTracking` response. The existing server-side courier tracking URL allowlist remains authoritative; the new timeline further hides the link for pending payments, missing/contradictory kitchen evidence, cancelled deliveries and unrecognised statuses.

`src/components/order/tracking-timeline.tsx` shows explicit *recorded / current / unconfirmed / review* text alongside visual indicators so that meaning is not colour-only. It keeps MealDeck's semantic app palette, uses accessible list semantics and respects narrow mobile layouts. The route has a manual Refresh control, handles failed requests, ignores stale responses after reference/code changes, and hides the four-digit handoff code while typing. It does **not** poll an endpoint automatically, invent a courier ETA or expose the order reference in a shareable URL.

The server function now independently checks `COMING_SOON`, not just its route's UI guard. The same flag is unchanged and remains `true`.

## Failure and uncertainty policy

| Status or circumstance | Customer-visible meaning | Forbidden conclusion |
| --- | --- | --- |
| `payment_pending` | Payment not confirmed; preparation not released | Payment authorised or captured |
| `paid` without pass | Brands preparing; pass not yet confirmed | Every kitchen is ready |
| `packing` | Every brand's dishes are in MealDeck pack workflow | Sealed, sent or courier collected |
| `sealed` / `ready_for_handoff` | Pass has a recorded packed/ready status | Courier booked or delivered |
| `driver_assigned` after pack | Courier booking/assignment recorded | Courier already collected |
| `picked_up` after pack | Courier reports pickup of complete order | Guaranteed ETA or delivered |
| `delivered` after pack | Provider reported delivery | Independent proof of customer receipt |
| Courier marked delivered but no confirmed pass | Status needs review | Delivery success |
| Order still payment-pending but pass/courier active | Status needs review | Payment has secretly succeeded |
| Cancellation, refund, provider failure, unknown code | Request support or review | Automatic refund, rebooking or resolution |

The backend must always load the order via the verified order UUID + handoff code; server-derived tenant/location/order authority is not replaceable by a browser field or AI-generated message.

## Test and change list

- `src/lib/mealdeck-tracking-presentation.ts`: conservative stage projections with contradiction and provider-error guards, date parsing, no unapproved statuses.
- `src/components/order/tracking-timeline.tsx`: accessible and mobile-responsive tracking stages.
- `src/routes/track.tsx`: revised status, Refresh, fault handling, private handoff code entry, verified provider link.
- `src/lib/dishbee.functions.ts`: server-side launch gate for the tracking endpoint.
- `tests/mealdeck-tracking-presentation.test.ts`: pending payment, multi-brand kitchen and pass, courier waiting, pickup and kerbside, delivered-without-proof wording, duplicate status contradictions, cancellations and arbitrary hostile strings.
- `.github/workflows/verify.yml`: tests + lint run on every PR/push, with build and TypeScript checks already provided.

## Mandatory work before customer launch

- Dishbee staging RPC and RLS/access test with a real nonproduction order UUID and handoff code; test unauthorised access, repeated guesses and rate limiting. A four-digit code alone is not strong authentication without the unguessable UUID, adequate abuse monitoring and throttling.
- Review `public_mealdeck_order_tracking_v2` privileges and complete `updated_at`, pass and courier provenance. If the v2 contract changes, update both service and projection tests. Do not silently treat a legacy RPC as proof of packed/ready status.
- Real delivery-provider callback signature verification, chronological event handling, split-payment completeness and cross-brand pass tests before enabling the checkout or KDS release.
- Independent production safety checks for order payment events, provider tracking links, proof-of-handoff records and customer support.
- Browser/manual accessibility acceptance at 320px, 390px, 768px, desktop, 200% zoom and reduced motion, plus screenshots. Automated CI is not a substitute for browser and provider sandbox checks.

**Deliberately not done:** live checkout, a Supabase migration, provider API calls, KDS release, customer payments, real courier dispatch, modifying the linked Lovable environment or enabling a hidden production flag. This is compatible with the current source-only launch gate; real customer tracking remains closed until separate acceptance.
