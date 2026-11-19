# MealDeck Luton — H10S v0.2.3 and own-driver release gates

**Status: NOT APPROVED until all gates below have independent evidence.**
Repository publication, successful CI, a marketing banner or a passing GET probe
are **not** physical operational acceptance.

## Reproducible read-only software checks

Run `node scripts/mealdeck-luton-launch-preflight.mjs --live` from a trusted
network. This makes GET requests only to the fixed `https://mealdeck.co.uk`
origin. It does **not** place orders, start payment, change application flags,
dispatch a driver, write customer information or send alerts. Missing or
inaccessible responses fail closed.

The probe checks:

1. The public `/printer` response and whether server-rendered output itself
   advertises v0.2.3. Because the UI can reveal the version after hydration,
   a negative server-rendering result must be followed by an independent
   authenticated-browser inspection on the actual device. No HTML string
   alone certifies the running app.
2. The hosted immutable v0.2.3 SHA-256 manifest against the publisher's pinned
   digest: `139be5b8f57b99b044b4ce571b10a43852f9e8e77c6d4843d29cadda96470681`.
3. Independent streaming SHA-256 calculation of the hosted APK bytes, plus
   expected 8,726,751-byte download size. Separately compare the APK signing
   certificate to original v0.2.2 before any replacement installation.
4. The actual **GET /api/checkout** JSON `available === true` with a
   `fulfilments` array containing `delivery`. Checkout marketing text is
   insufficient; a redirect, cached public response or inaccessible endpoint
   is not a successful result.

The read-only probe always reports `fullyOperationallyReady: false`.
It cannot authorise a launch or replace a human acceptance record.

## Delivery acceptance — owner-approved policy

Use **LU4 8NU** as the postcode-coordinate origin. The radius is **4,000 m**
straight-line, **not** road-driving distance. The free own-driver charge is
**£0**, with a **£15 minimum payable food total after promotions and discounts**.
A basket over £15 before a discount but below £15 after it must not qualify.
Test real production eligibility at one verified in-radius and one out-of-radius
postcode, immediately below and at the £15 threshold. Verify those results in
the production checkout flow, without capturing money unless independently
approved for a supervised genuine order. Existing unit and disposable-database
tests do not prove that the current production settings are enabled.

## Physical H10S acceptance — separate mandatory sign-off

An authorised Luton operator must confirm:

- The installed app is the reviewed **MealDeck Printer v0.2.3**, updated with
  the original signing identity and without clearing the existing print journal.
- A genuinely paid order accepted in KDS triggers exactly one automatic
  original receipt, without a second manual action.
- The entire paper ticket has no mid-receipt blank gap, displays the correct
  order number, items, customer-safe pickup information and footer, and cuts at
  the correct position.
- A printer interruption/recovery does not silently duplicate a receipt.
  The operator explicitly confirms the observed paper outcome.

Record date, device, operator and the redacted order reference in the
restricted operations acceptance log. Do not put customer details, passwords,
MFA codes, location histories or full receipts in public GitHub issues.

## Driver acceptance — separate mandatory sign-off

An authorised own-driver must sign in on their own permitted account, see an
assigned delivery, accept it, collect the sealed order, follow the correct
address, and complete the verified handover with the required customer code.
Kitchen and customer status updates must follow the actual events; test no
double-assignment, location-privacy boundaries and failure/reassignment
handling. Record operator approval separately from a successful demo or CI
test. Driver presence/capacity must be confirmed for the launch shift.

## Release decision

Approve or notify **only when** the current main commit's release validation
is green; the signed APK and live webpage are verified; real checkout offers
delivery and enforces 4 km / £15-after-discount / £0 fee; and both physical
H10S and authorised driver acceptance have documented sign-off. Otherwise,
report **not fully operationally ready**. Do not automatically enable delivery,
activate payment processing or send a launch notice.
