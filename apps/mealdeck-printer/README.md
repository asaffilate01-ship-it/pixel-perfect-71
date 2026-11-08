# MealDeck Printer for H10S

The networked Android companion consumes MealDeck's existing receipt queue and
uses the H10S built-in printer service. Its application ID is
`uk.co.mealdeck.printer`, version `0.2.3` (code `5`). The separate setup utility in
`../mealdeck-printer-probe` and its published setup APK remain unchanged.

`release-certificate.pem` is the **historical v0.2.0** public release
certificate (SHA-256 `0AA18A66B01CECBE0AA86C07A6EFA8693B5F01138278488D7DCE4A296B992EC8`).
**The published v0.2.2 APK was signed with a different certificate**:
`56BDF4173AC112FAB080C8A88485C31FB5D7FF3847C02AF314039CCB459D6D17`,
confirmed by successful GitHub Actions run
[`42428234548`](https://github.com/asaffilate01-ship-it/pixel-perfect-71/actions/runs/42428234548)
and its APK SHA-256. A v0.2.3 update to an **installed v0.2.2** must match
**that actual v0.2.2 certificate**, not the old v0.2.0 certificate.
Before attempting any in-place update, confirm which certificate is installed
on the H10S. Do not uninstall the application to work around a mismatch.

The corresponding v0.2.2 private keystore and password were encrypted to
`recovery-recipient.pem` and retained in the Actions artifact
`mealdeck-printer-v0.2.2-signing-backup-encrypted` (ID `13596113904`,
expires **8 December 2026**). That PEM contains **only the public recovery
certificate**. It does not contain the private recovery key.

## v0.2.3 safe update

The new receipt validator accepts **delivery** as well as collection and
kerbside. Version 0.2.2 cannot reliably print delivery orders.

Build verification creates an **unsigned** non-debuggable v0.2.3/build 5 APK
first. It is *not* an installable update to the live v0.2.2 until the
original owner's release key signs it. The `.github/workflows/publish-printer-v023.yml` publisher accepts **one
of two private recovery paths** through protected GitHub Actions secrets:

1. Set both `MEALDECK_PRINTER_ORIGINAL_KEYSTORE_BASE64` (base64 of the
   recovered original v0.2.2 `.p12`) and
   `MEALDECK_PRINTER_ORIGINAL_STORE_PASSWORD` (the original keystore password).
2. Recommended if using the owner recovery file: copy the full contents of
   `printer-ci-recovery-private.pem` from your private MealDeck Library into
   the protected GitHub Actions secret `MEALDECK_PRINTER_RECOVERY_PRIVATE_KEY_PEM`.
   The secret accepts the original multiline PEM directly; do not paste it in
   chat or add it to any repository file. Alternatively, set
   `MEALDECK_PRINTER_RECOVERY_PRIVATE_KEY_BASE64` to the base64 encoding of the
   PEM file bytes. The workflow downloads the historical encrypted artifact
   and decrypts it inside its temporary GitHub runner, without logging or
   publishing the recovered signer.

Only the holder of that private recovery key can use the second path. Neither
the public certificate, encrypted backup nor existing APK can regenerate the
missing private key. Never put a private key or password in code, chat, CI
logs or a public artifact. The workflow verifies the published v0.2.2 APK
checksum, requires the new APK to have the **same actual v0.2.2 signer**
and checks the independent pinned signer fingerprint from run `42428234548`.
Do **not** create a fresh signing key or uninstall an existing app; either
breaks update compatibility and may lose the printer journal.

When the signed APK and checksum exist, `/printer` automatically offers
v0.2.3; otherwise it continues to offer v0.2.2. After installing the update
over v0.2.2 on the same H10S, verify one *actual* complete receipt including
its footer before enabling customer delivery.

### Delivery destination on the physical v0.2.3 slip

The driver ticket prints the verified **DELIVER TO** street, number, optional flat and postcode, with the saved order name/phone. It uses the canonical saved local-driver quote via the existing authenticated printer-claim contact projection, **outside** the immutable paid receipt, SHA-256 receipt fingerprint and local printer journal. An absent, changed or invalid delivery address **holds** the print job for operator inspection; it must never print a seemingly complete delivery slip without the destination. Customer collection and kerbside print contracts retain their original contact shape.

Install `deploy/mealdeck/post-install-migrations/20261108074000_mealdeck_printer_delivery_address.sql` only on the verified independent MealDeck database, **after** the local-driver delivery migration. Complete Android emulator, server receipt, QR/footer and real H10S paper checks before publishing and enabling delivery; no source commit alone commissions the printer.

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
- The full branded receipt keeps the large logo, prominent order number and
  equally large collection code, customer name and saved phone, boxed copy
  reason, complete purchased/packing information, paid total and one rotating
  promotion. The eight slots are Play, TikTok and Instagram QRs, then Skorch,
  Tavo Chicken, Load’d, Moktl and Souvano logos. Canonical order numbers select
  the slot; a reprint keeps it. The gap after PAID is compact and each QR retains
  its full four-module quiet border.
- Saved phone is an optional authenticated projection of the same order, outside
  the immutable receipt and fingerprint. The claim's phone is rechecked through
  the separately gated contact RPC before dispatch. Existing server projections
  without the extension remain readable; no profile or fabricated phone fallback
  is used, and no customer phone is written to the native journal.
- Rendering and parcel preparation complete before `begin_send`. One immutable
  shared-memory bitmap, bounded to `384 × 16,000` ARGB pixels, is submitted in one
  `printBitmap` call. The parcel must contain a shared-memory descriptor and fit
  the unchanged `750,000`-byte ceiling. There are no app-created strip boundaries.
  A fixed 180-pixel white raster tail follows the footer. The same one-shot send
  then executes the pinned protocol's fixed `nextLine(4)` paper advance before
  releasing its slot. The feed is skipped after timeout/pause/service loss; any
  uncertain stage holds the original attempt without replay. No undocumented
  cut/flush command or physical-cutter claim is introduced.
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
# With an Android 13 emulator running (fake Binder only, no real printer):
./gradlew :app:connectedDebugAndroidTest
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
Layout tests retain long notes and every purchased detail; an Android 13 emulator
renders synthetic receipts, decodes the fixed promotion QRs, and round-trips the
complete shared bitmap through a recording Binder. A buffering receiver checks
that every bitmap is followed by its own final feed before the next header.
These checks do not simulate the
H10S service's handling of a tall immutable bitmap or prove its paper output.

## Physical acceptance still required

Compilation does not establish successful live paper output or continuous Android
background operation. On the actual H10S, verify one real paid and accepted order,
one original paper receipt, explicit paper confirmation and a numbered copy. Also
exercise the orders website in front, screen off, network loss, out-of-paper,
vendor-service restart, app interruption and reboot. Resolve every uncertain
receipt before resuming; none of these checks should be described as complete
until observed on the terminal.
