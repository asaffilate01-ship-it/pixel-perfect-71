# MealDeck H10S live receipt companion

## What is confirmed

On 7 November 2026 the owner reported that the setup APK successfully printed its
fixed test ticket on the Senraise H10S. This confirms the tested service connection
and that bitmap output reached paper on that terminal. The setup APK remains a
separate offline diagnostic application.

The live MealDeck database was inspected read-only before this implementation.
All nine existing printer access, queue, claim, send, paper-confirmation, reprint
and acceptance functions are installed and deny anonymous execution. The native
app uses those functions without a database migration or a second ordering path.

## Operation

1. Install the **MealDeck Printer** companion from `/printer` on the H10S. Keep
   the same application installed for future updates so its receipt journal is
   retained. The original **MealDeck Printer Setup** app is only the earlier test.
2. Sign in with the same verified printer account used by `/printer`. Complete
   the existing authenticator check if that account has MFA enabled. Select the
   authorised kitchen and check the printer connection.
3. Start automatic printing explicitly. The first activation remembers the
   server's current time and receives newly queued receipts from that point.
   Older queued work is offered for deliberate one-receipt review rather than
   being printed as a surprise backlog. Pause/resume retains this starting point.
4. Continue accepting paid orders through KDS or the ordinary `/printer` screen.
   Acceptance creates the same single original receipt. The companion claims
   and prints it using the H10S built-in printer.
5. Inspect the first actual customer receipt for complete contents, branding,
   readable type, feed/finish and exactly one copy. Confirm the paper in the
   companion or `/printer`. A returned printer call alone is labelled sent,
   awaiting paper confirmation.

Before requesting a numbered replacement, confirm the preceding receipt in the
companion as well. If it was already confirmed on the website, repeat that same
observed outcome in the app; the server confirmation is idempotent. The app keeps
that preceding receipt visible for this check, and leaves the new copy queued
until local receipt history is resolved. A new installation cannot print a copy
whose earlier attempts are absent from its local history.

The native foreground service performs the queue work. Its ongoing notification
and app status communicate whether automatic printing is running or paused.
Device firmware, battery management and network connectivity can affect operation;
the actual terminal still needs the browser-in-front, screen-off and interruption
checks below. No background reliability claim follows from compilation alone.

## Receipt and security boundaries

- The native network client has fixed MealDeck HTTPS destinations, bounded
  requests/responses and normal certificate validation. Its public bootstrap is
  `GET /api/printer/config`; only the validated public backend URL/key can leave
  that endpoint. No payment credential or arbitrary server setting is returned.
- The app stores its authenticated session in platform-protected app storage.
  The bundled screen has no remote content or arbitrary network/printing bridge.
  Every queue operation retains the database's current account and kitchen
  assignment checks. The native client separately checks verified account and
  enrolled authenticator requirements before each print attempt. Printer
  authority remains separate from payment collection.
- Canonical receipt validation retains integer-pence arithmetic, copy sequence,
  paid/accepted timestamps, inclusive prices, purchased flavours/extras, meal
  components, notes, numbered/name-labelled bags, cutlery and kerbside details.
  The approved monochrome logo is bundled with the app.
- A durable journal binds each job to its order, numbered copy and normalised
  receipt fingerprint. It contains no receipt body, customer details or session
  token; claim identifiers needed to acknowledge an interrupted attempt are
  encrypted with a separate Android Keystore key. Rendering finishes before
  `begin_send` is requested. An independent fetch of
  the same claimed snapshot is checked before the one native dispatch.
- A completed send is `sent_unconfirmed`, allowing the next distinct receipt.
  An interrupted, timed-out or uncertain send is held and pauses dispatch. A
  reload, duplicate request or reconnect cannot send that same copy again.
- Paper confirmation records what the operator actually observed. A replacement
  is a separately numbered, audited receipt requested through the existing
  reprint workflow after the previous result is resolved; it is never a reset of
  a possibly printed original.

## Distribution and validation

The **H10S live receipt APK** workflow builds the app with pinned dependencies,
checks its local screen and native receipt/recovery behavior, and produces an
unsigned, non-debuggable release APK. A privately retained owner signing key
signs the inspected artifact outside the public Git repository. The signed APK
and checksum are published under a new versioned download URL. The signing key
and password never belong in source, workflow artifacts or diagnostic output.

The companion package is `uk.co.mealdeck.printer`; the earlier setup package is
`uk.co.mealdeck.printerprobe`. The two apps may be installed side by side. Future
companion versions must preserve the signing identity and increase version code.

Before claiming live-device acceptance, observe one real paid order accepted by
staff, one canonical original receipt, one native send and one complete paper
receipt. Then check lost network, an uncertain send/out-of-paper, browser in
front, screen off, stop/resume, account revocation, app restart and an explicit
numbered replacement. Do not fabricate an order, payment or paper result for
these checks. Keep the service paused if an uncertain result cannot be resolved.

## Related source

- `apps/mealdeck-printer` — live receipt companion.
- `apps/mealdeck-printer-probe` — proven fixed-ticket setup utility.
- `tools/receipt-bridge/receipt.mjs` — shared canonical receipt normalisation.
- `docs/mealdeck-android-printer-bridge-plan.md` — original design and RPC contract.
- `docs/mealdeck-kitchen-printer.md` — acceptance, receipt queue and recovery.

Publication evidence and the actual-device acceptance result must be recorded
separately when observed; this implementation document is not itself that evidence.

## Version 0.2.1 receipt layout update

The owner subsequently reported a short/incomplete receipt with no games QR and
asked to retain the earlier full browser layout, changing only the large blank
space between PAID and the games promotion. The supplied video shows that earlier
full layout, including an intact QR; it does not identify the cause of the newer
incomplete native output.

Version 0.2.1 source restores that visual hierarchy in the native renderer and
includes the fixed games QR. It submits one bounded shared-memory bitmap rather
than multiple strips, with a 180-pixel white tail after the footer. Canonical
receipt validation, fingerprints, existing journal records, claim checks and
explicit paper confirmation remain intact. Browser receipts retain the original
promotion order and tight spacing; removing whole-section page-break avoidance
prevents that rule from pushing the promotion to a later page. The selected print
driver's page size remains authoritative.

Publication of 0.2.1 and physical H10S acceptance are separate evidence. The 0.2.0
artifact and its historical build evidence below remain immutable.

### Version 0.2.1 signed build evidence

- Production source: `0e0ef88681fcf05f2bbfdb69532f234d74b39954`, tree `8171a3ab1e7f1e82849f6e14ce704d28996363bd`.
- Successful Android build and four API 33 instrumentation tests: [42387109073](https://github.com/asaffilate01-ship-it/pixel-perfect-71/actions/runs/42387109073); unsigned artifact `13580500022`, raster/test evidence `13580475303`.
- Unsigned APK SHA-256: `0c214537d2a4fb237574d76c6f5d131f3f328e79a20d15997aa6327a50ff877c`.
- Signed APK: `/downloads/mealdeck-printer-h10s-0.2.1.apk`, 8,664,664 bytes, SHA-256 `8fde9dbaa399d8987563ddbf049f59e720657b9227d64fd37291b94cf846ad69`.
- Package `uk.co.mealdeck.printer`, version `0.2.1`, version code `3`, minimum API `33`, target API `36`, non-debuggable.
- APK v3 verified with exactly one RSA-3072 signer. Its certificate SHA-256 matches the retained v0.2.0 release identity: `0aa18a66b01cecbe0aa86c07a6efa8693b5f01138278488d7dce4a296b992ec8`.
- All 413 uncompressed payload entries match the tested unsigned APK; all 202 stored entries are four-byte aligned. This APK contains no native `.so` libraries.
- Actual Android renderings were inspected for full content, the approved logo, tight promotion spacing, QR and footer. The independent decoder reads the fixed public URL from the complete raster. A 384 × 16,000 bitmap round-trip preserves both ends in one bounded shared-memory parcel.

These checks establish the built artifact and Android rendering/parcel behavior.
They do not record an H10S paper result. Install as an update over the existing
companion to preserve its journal; inspect the next genuine accepted-order receipt
through the final footer before reporting physical acceptance.

## Version 0.2.0 signed build evidence

### Compatibility with the later games receipt release

The signed 0.2.0 APK retains its original complete order receipt layout. It does
not include the games promotional QR added later to browser and Node/TCP receipts.
Its native golden fixtures explicitly select `includeGamesQr: false` on the shared
JavaScript renderer; the existing golden file, native code and APK remain unchanged.
The ordinary bridge default remains QR-enabled. Regression checks compare every
valid native fixture's full text, normalized data and fingerprint, and verify that
the compatibility profile omits only the fixed promotion. Adding the promotional
QR to the native app requires a later version built and signed with the retained
release identity.

### Signed artifact

- Native source: `b3959346e28a0b8c9cf1662177e6469c94c13023`.
- Successful Android workflow: [42374402495](https://github.com/asaffilate01-ship-it/pixel-perfect-71/actions/runs/42374402495); artifact `13574394028`.
- Artifact ZIP SHA-256: `831670470838dc18971520b98675c48f34f00c78cabeab695c5080ac09ebb265`.
- Native validation: 14 valid and 32 invalid golden receipt cases, exact normalized JSON/fingerprint/text parity, plus dispatch durability/interruption/overlap checks.
- Signed APK: `public/downloads/mealdeck-printer-h10s-0.2.0.apk`, 8685343 bytes.
- APK SHA-256: `9738bad20f8c4dcd996ac9f98159f6355ea7c7fd9f14ee9f387cbb737991b3f0`.
- Release certificate SHA-256: `0aa18a66b01cecbe0aa86c07a6efa8693b5f01138278488d7dce4a296b992ec8`; public certificate is checked in, private signing material is not.
- Verified APK signature v3, one RSA3072 signer, 16 KiB page alignment, package `uk.co.mealdeck.printer`, version code 2, minimum Android API33, target36, and non-debuggable release.
- Website validation: 25 focused config/auth/acceptance tests and the main website build passed; bundled screen typecheck and five status-boundary tests passed.
- Physical setup ticket: owner-confirmed. Full customer receipt and background/recovery behaviour: awaiting the actual H10S installation and paper check.
