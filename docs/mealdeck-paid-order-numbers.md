# Permanent paid-order numbers

Owner decision: 6 November 2026. The first verified live test order should appear as **0001**, followed by **0002**, **0003** and onward. This is separate from the existing random four-digit collection code.

## Meaning and allocation

The canonical order UUID remains the identity for payments, quotes, KDS mutations and receipt jobs. The new number is a display reference. The collection code remains the handover check; it is never replaced by the sequential number.

`mealdeck_private.order_numbers` holds one immutable mapping for each eligible paid order. A private counter is scoped by tenant and kitchen. Numbers are allocated under database locks, in the same transaction as the verified paid order, so a rollback consumes no number and a repeated event cannot allocate another one. An initially deferred constraint trigger evaluates the complete transaction, including the final submission of a fully funded group order. Pending, failed, partially funded, held or otherwise ineligible payment attempts do not receive a number.

The first installation locks the order table briefly and backfills committed eligible orders in `paid_at, id` order before enabling subsequent allocation. The counter does not reset each day, and assigned numbers are never reused after a refund or cancellation. Four digits are the minimum width: `9999` is followed by `10000`.

The migration does not alter the financial-readiness, verified-release or payment-reconciliation routines. It calls their existing authority and complete-routing checks. Private tables and allocation functions are unavailable to anonymous, customer and service-role direct calls. Staff and customer projections retain their existing permission checks.

## Presentation

Customer confirmations, account history, shared-payment confirmations, KDS, operations history, native staff status and new receipt snapshots expose the canonical number as `orderNumber` or `order_number`, according to the existing DTO convention. It is optional for rollout compatibility. No client invents a sequence or derives it from a UUID, code or basket.

The UI labels **Order 0001** and **Collection code 4601** separately. KDS stage filters remain visible when tools are hidden. Every purchased line still needs to be checked ready, followed by explicit packing confirmation and the original collection-code handover.

The KDS contact projection uses the frozen order name and phone for collection and kerbside, with the same control-character, length and phone validation as the earlier kerbside-only projection. Kerbside also shows the saved car make, colour and final four registration characters. These are escaped text, not authentication or messaging permission.

## Receipt compatibility

Existing receipt snapshots are not automatically regenerated. Their original collection code, prices, lines, bags, timestamps and delivery history stay intact. New snapshots add the order number. The updated receipt bridge validates it against the canonical claimed receipt before sending, and includes it in its immutable job fingerprint.

The owner-only `mealdeck_private.add_order_number_to_unsent_receipt(job, order, expected_payload_md5)` helper can add this field to a single original receipt only if the job is still queued and has never been claimed, attempted, sent, confirmed, resolved or copied. It locks the order and job, checks the exact original payload digest, changes only `orderNumber` and the job update timestamp, verifies the rest of the JSON is unchanged, and writes an audit event. A changed or attempted job is rejected. It does not print or enqueue a replacement.

The live test order is `15e1228c-2669-4ac7-acef-7993de543efe`, paid £3.49 at 18:22 UK on 6 November. Its existing collection code is **4601**. The intended sequential number is **0001**; deployment verification must read the actual mapping rather than assume it. Its original acceptance receipt was queued, and physical printer output remains unconfirmed.

## Installation

The additive migration is `deploy/mealdeck/post-install-migrations/20261106184640_mealdeck_paid_order_numbers.sql`. Use `deploy/mealdeck/paid-order-numbers.mjs` to load the exact artifact. The managed variant removes only its single transaction wrapper when the trusted runner owns one atomic transaction.

1. Verify the current independent MealDeck database and the reviewed function-body hashes. Do not use the Dishbee database.
2. Publish the compatible application and receipt-bridge source. Existing running staff clients should refresh to receive the new contracts.
3. Apply the complete merged migration atomically. It uses a five-second lock timeout and a thirty-second statement timeout. A lock conflict or the explicit new-transaction clock guard requires a fresh read and retry; do not remove those guards.
4. Read the permanent mappings and scope counter. Confirm the first paid test is `0001`, unpaid attempts have no number, and the next allocation follows the recorded counter.
5. Only after a fresh, successful untouched-job preflight, use the guarded helper for the test receipt if still appropriate. Confirm the payload without `orderNumber` retains its original digest.
6. Verify anonymous collection checkout remains available during opening hours and the published KDS, receipt and public tracking copy are the intended version.

Native PostgreSQL 17 CI runs `tests/postgres/paid-order-numbers-behavior.mjs --native`, including two-session allocation races. The same suite runs locally in PGlite for SQL behaviour. Number contracts, KDS presentation, bridge fingerprints and native status are also covered by their focused tests.

Public collection and kerbside were independently verified open at 18:41 UK on 6 November after owner sign-off. Delivery tracking remains **Coming soon**. This release does not claim that a Senraise Android built-in printer can use the existing Node/TCP bridge or that paper output has been observed.
