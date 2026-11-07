# MealDeck Printer for H10S

The networked Android companion consumes MealDeck's existing receipt queue and
uses the H10S built-in printer service. Its application ID is
`uk.co.mealdeck.printer`, version `0.2.0` (code `2`). The separate setup utility in
`../mealdeck-printer-probe` and its published setup APK remain unchanged.

## Operator flow

1. Install the signed companion and sign in with a verified account assigned to
   the kitchen's printer role. Complete the authenticator challenge if enrolled.
2. Allow notifications, check the built-in printer connection, select the kitchen,
   and explicitly enable automatic receipts.
3. Open the fixed MealDeck Printer website using **Open orders**. Accept paid orders
   there or on KDS. Acceptance queues the existing immutable original receipt;
   the companion does not accept orders or collect payments itself.
4. The first activation stores the server's current time. Previously queued
   receipts require their individual **Print once** action. Pause/resume keeps the
   original start point, including orders queued while paused.
5. A completed native send means **Sent · check paper**. Confirm a complete paper
   receipt explicitly. A timeout, interrupted send or printer disconnect holds
   the job and pauses automatic work. No held original is automatically retried.

Confirm an original's paper outcome in this companion before requesting its next
numbered copy through the existing website. Copy eligibility also checks the
durable local parent and copy sequence. A receipt from an unknown installation is
not automatically treated as safe to resend. Keep any other local receipt bridge's
automatic consumer off when this companion is selected.

## Native boundaries

- Capacitor `8.6.0` serves only bundled local files at `https://localhost`.
  The WebView cannot navigate to remote pages or issue network requests.
- The `ReceiptPrinter` plugin implements the bounded interface in
  `web/contract.ts`. It accepts sign-in fields, assigned scope IDs, job IDs and
  explicit paper outcomes. It exposes no raw receipt, printer bytes, host, URL,
  access token or general RPC capability.
- Native bootstrap is fixed to `https://mealdeck.co.uk/api/printer/config` and
  validates the independent backend
  `https://srsxybepwujuawyutnbs.supabase.co`. Authenticated requests use the existing
  kitchen-scoped printer RPCs. The current verified account and enrolled MFA are
  checked before each claimed receipt attempt.
- Android Keystore protects the native session and saved claim tokens. The
  transactional SQLite journal retains installation identity, scope, account,
  job/order/copy ownership, canonical fingerprint, send state and outcome metadata.
  It stores no customer name, receipt body or account session token.
- The claimed receipt is independently fetched again after `begin_send` and its
  normalized fingerprint must match before dispatch. A replayed or ambiguous
  claim/begin response never authorizes another send.
- Rendering completes before dispatch. Each bitmap strip is at most
  `384 × 384` ARGB pixels, with a `750,000`-byte parcel ceiling. All strips belong
  to one logical attempt; failure after any strip holds the whole attempt.
  There is no undocumented cut/feed command or physical-cutter claim.
- The command worker, Binder sender and deadline scheduler are separate. A
  30-second send deadline holds the attempt but retains the global send slot until
  the actual Binder call exits. Late success cannot upgrade a held outcome.
- The foreground service starts explicitly from the visible companion and shows
  an operating notification. Its declared `specialUse` workload is the device's
  integrated receipt printer. It uses `START_NOT_STICKY`, no boot receiver and a
  bounded wake lock while dispatching. Opening the app or restarting Android does
  not enable automatic printing.

See [native/SOURCE.md](native/SOURCE.md) for the provenance of the fixed printer
protocol copied from the physically confirmed setup utility.

## Build and checks

Use Node 22 or newer, Java 21 and Android SDK/build tools 36. Dependencies and the
Gradle wrapper are pinned. From this directory:

```sh
npm ci
npm run typecheck
npm run test:web
npm run test:native-core
npm run sync:android
npm run verify:native
cd android
./gradlew :app:testDebugUnitTest :app:assembleRelease
```

The release build intentionally produces
`android/app/build/outputs/apk/release/app-release-unsigned.apk`. Sign it using the
retained private owner release key, outside this repository. Verify the signature
and checksum before publishing immutable versioned download files. A debug key or
a fresh certificate for each release would prevent reliable future upgrades.

The pure-Java dispatch checks cover durable-before-IPC ordering, concurrency,
timeout retention, interrupted starts and partial-send uncertainty. JVM golden
fixtures compare receipt validation, canonical JSON, SHA-256 fingerprints and full
text against the existing JavaScript receipt bridge. Web contract checks and
native bundle verification cover the installed application's fixed interface.

## Physical acceptance still required

Compilation does not establish successful live paper output or continuous Android
background operation. On the actual H10S, verify one real paid and accepted order,
one original paper receipt, explicit paper confirmation and a numbered copy. Also
exercise the orders website in front, screen off, network loss, out-of-paper,
vendor-service restart, app interruption and reboot. Resolve every uncertain
receipt before resuming; none of these checks should be described as complete
until observed on the terminal.
