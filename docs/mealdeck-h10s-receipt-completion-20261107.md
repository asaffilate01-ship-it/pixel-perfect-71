# H10S complete receipts and rotating footer — 7 November 2026

## Owner requirements

The H10S was stopping before a receipt finished, with its remainder appearing
when the next order printed. The owner also confirmed the preferred full receipt:
large MealDeck logo, large order and collection numbers, customer name and phone,
all purchased details, total, one promotional block, then the existing footer.

Version 0.2.2 (Android version code 4) combines that presentation with the pending
full-image correction and an explicit final paper advance. The earlier v0.2.0
and v0.2.1 APK/checksum files retain their original bytes and signing identity.

## Completion boundary

The app prepares a complete immutable shared-memory bitmap before `begin_send`.
Its single native attempt sends `printBitmap` (Binder operation 4), then the fixed
`nextLine(4)` (operation 9). Both calls share the original job, claim, fingerprint,
worker and durable journal. Another receipt cannot enter that slot until the
sequence has returned. A white image tail alone was not an explicit paper-feed
command.

The next-line operation and four-line count come from the same pinned Senraise
interface and receipt example already reviewed for the app. See
[`native/SOURCE.md`](../apps/mealdeck-printer/native/SOURCE.md) for source links.
No unverified cut, flush, transaction envelope, arbitrary delay or alternate
printer API is introduced.

If either operation fails, is unsupported, times out or loses its continuation,
the original attempt remains held. It is never automatically replayed. A deadline
does not release a still-running Binder slot or recycle its bitmap/parcel.
Successful command returns remain **sent, awaiting paper confirmation**; they do
not prove that the H10S motor has finished or its firmware accepted a tall image.

## Receipt appearance

- The approved 256 × 258 thermal logo remains complete.
- The sequential order number and collection code use the same large type.
- Customer name and saved order phone have their own prominent lines; the date
  remains separate. Long names and notes wrap without truncation.
- Every item, attached extra, flavour, meal component, packing allocation, note
  and canonical price is retained.
- The paid total is followed closely by one promotion, then the existing legal
  footer. QR quiet zones remain intact. The 180-pixel trailing white area is after
  the footer, separate from the compact gap after the total.

## Eight-slot promotion rotation

| Slot | Artwork / destination | Printed copy |
| --- | --- | --- |
| 1 | QR: `https://mealdeck.co.uk/play` | Got a minute? Play MealDeck. / Scan for free food games |
| 2 | QR: `https://www.tiktok.com/@mealdeckofficial` | Follow @mealdeckofficial on TikTok. |
| 3 | QR: `https://www.instagram.com/mealdeckofficial/` | Follow @mealdeckofficial on Instagram. |
| 4 | Approved Skorch logo | Next time, try Skorch Burgers. |
| 5 | Approved Tavo Chicken logo | Craving chicken? Try Tavo Chicken. |
| 6 | Approved Load’d logo | Load up on fries and mac. |
| 7 | Approved Moktl logo | Add a refreshing Moktl mocktail. |
| 8 | Approved Souvano logo | Explore Souvano’s Greek & Turkish favourites. |

The canonical order number selects `(number − 1) mod 8`, computed digit by digit
so large order numbers retain precision. Order 0001 and 0009 select Play, 0002
and 0010 select TikTok, and so on. Historical orders without a sequence use a
stable hash of their original order UUID. No copy number, print job, device-local
counter, date or random value participates. Reprints and different clients select
the same block without advancing anything.

The Java catalogue, browser SVG paths, thermal raster and packaged Android PNGs
come from one fixed specification. The five logo derivatives use complete approved
canvases, with no cropping or recreation. No receipt/customer input can become an
image, URL or QR payload. The original `/play/receipt` asset remains for historical
compatibility; the new rotation uses the owner's explicit `/play` destination.

## Customer phone compatibility

The optional outer `receiptContact` is bound to the same order UUID and sourced
from that order's saved checkout phone. It is not part of the immutable receipt
JSON or fingerprint and does not read a current customer profile.

The additive guarded extension is
`deploy/mealdeck/post-install-migrations/20261107165702_mealdeck_receipt_contact.sql`.
It adds contact to authorised job projections and a separate
`mealdeck_printer_claim_contact` RPC. That RPC reuses the existing canonical claim
checks before returning the saved contact. The canonical claim RPC retains its
exact two-key response for installed strict Node/TCP clients. No order, receipt,
payment, queue or historical print rows are rewritten.

The new native app rechecks its claimed contact immediately before dispatch and
holds a mismatch. Older backend projections without the optional extension remain
supported. Invalid or missing historical phone numbers remain absent. The native
journal and public promotional artwork contain no phone data.

## Verification and release

Focused dispatch tests exercise bitmap/feed ordering, overlap prevention, failure,
timeout, late return, resource retention and no replay. Receipt goldens retain
their canonical JSON and fingerprints. Layout tests exercise every purchased
detail, large header, eight promotions, reprints, long Unicode names and height
bounds. Generated assets are reproduced and the three QR destinations independently
decoded. The Android 13 instrumentation uses actual Bitmap/Parcel behavior and a
buffering recording Binder, with synthetic receipt PNGs for visual review.

The full PostgreSQL 17 `receipt-contact` CI suite is a release gate before the
optional backend extension is applied. Native compilation, signature verification,
APK publication and actual physical paper acceptance are separate results.

After installing the signed update over the existing app, the H10S acceptance
check is one long receipt printed by itself through its final footer, then a short
second receipt whose first output is its own header. Inspect existing uncertain
receipts and use the normal explicit copy controls when a replacement is needed;
do not uninstall, clear app data, erase the journal or replay the queue to test.
