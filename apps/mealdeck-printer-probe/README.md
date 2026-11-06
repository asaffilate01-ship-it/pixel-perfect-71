# MealDeck Printer Setup — Senraise H10S

A small Capacitor Android **setup utility**, separate from the MealDeck Printer PWA and the staff payment app. The owner requested the GitHub/Capacitor route on 6 November 2026 after supplying H10S / Android 13 photographs.

This app checks the installed built-in printer service and offers one fixed, clearly labelled setup ticket containing the approved MealDeck logo, **No customer order** and **No payment taken**. It does not sign in, accept orders, read the receipt queue, take payments, change firmware or automatically print customer receipts.

## What to install and check

The **H10S printer setup APK** GitHub Actions workflow builds `mealdeck-printer-setup-h10s-debug.apk`, a signed debug APK for supervised hardware setup. The artifact contains its SHA-256 checksum and certificate/permission report. This is an internal setup build, not a production distribution/signing channel. Use the verified build linked in the release handoff, not a similarly named third-party APK.

1. On the H10S, first use **Hardware Settings → Print test** with a paper roll loaded. Leave **Flash firmware** untouched.
2. Download and install the MealDeck setup APK, granting installation permission to the download app only if Android requests it. Open **MealDeck Printer Setup**.
3. Tap **Check printer connection**. This does not print. If unavailable, copy the selectable device/printer details; no serial, IMEI, network address or customer data is included.
4. When the connection is available, tap **Print one setup ticket** once. Inspect the paper, then choose whether one complete ticket printed. Do not assume that “sent” means paper was produced.
5. If the result is uncertain, use **Check saved result** and inspect the printer. Keep the app's data and original request. Do not clear storage, uninstall, change transport or repeatedly print while an outcome is unresolved.

A successful setup slip establishes only this device's basic service/bitmap path. The full receipt consumer still needs the existing MealDeck account/queue authorisation, canonical claimed-receipt checks, job/copy journal and interrupted-send acceptance. Accepting an order on KDS or the Printer PWA already queues one original; this setup app does not consume it.

## Confirmed device, unconfirmed service

The owner's photos show H10S, Android 13, build `H10S-OS02-13.1.95`, printer firmware `307` and Hardware Settings `8.3.6`. The latter is an app version, not a printer API compatibility promise. No unique hardware identifiers are retained.

The protocol reference is [`mawlood-fareq/capacitor-senraise-printer`](https://github.com/mawlood-fareq/capacitor-senraise-printer/tree/7e2c4e2e6dde6872a239c6cb00fa209317078e45), package 2.0.0, pinned commit `7e2c4e2e6dde6872a239c6cb00fa209317078e45`. Its package declares MIT and names Mawlood Fareq Mahmood as author. No separate upstream licence file/provenance statement for the generated OEM stubs was found. See [`native/SOURCE.md`](native/SOURCE.md) for the exact functional interface evidence and limits. This is not an official Senraise SDK or a claim of vendor certification.

The app implements only service-version and one fixed-bitmap transactions. It does not adopt the upstream plugin's early-resolving connection, unbind mismatch, broad text/raw/firmware/PSAM interfaces or missing job journal. The exact target is:

```text
Package: recieptservice.com.recieptservice
Component: recieptservice.com.recieptservice.service.PrinterService
Descriptor: recieptservice.com.recieptservice.PrinterInterface
```

## Native and UI boundaries

- The APK bundles its screen. There is no remote `server.url`, navigation allowlist, sign-in, HTTP API or Android Internet permission. A website/PWA cannot invoke this native setup check.
- `MealDeckPrinterProbe` exposes only `probe`, `getTestState`, `printSetup({ requestId })` and `confirmPaper({ requestId, outcome })`. No caller-supplied text, bitmap, byte commands, network address or receipt is accepted.
- Native rendering uses the repository's fixed approved thermal logo and bounded bitmap. It makes one bitmap transaction, without a second automatic feed, retry or fallback transport.
- SQLite FULL synchronous journaling records a unique setup UUID and one unresolved slot before possible dispatch. Same-ID retries recover the recorded result. Restart, timeout, service loss and uncertain persistence hold the request; they never trigger another send.
- An in-process Binder call that outlives its timeout keeps the slot blocked until it returns. Paper confirmation and a fresh test cannot overtake it. A returned Binder call means `sent_unconfirmed`; only the operator's inspected result is `printed` or `not_printed`.
- Android backup and device transfer exclude the journal and web recovery state. Clearing app data or uninstalling discards recovery; this is deliberately not offered as an error-resolution action.
- The local UI also saves its original UUID before invocation, validates native results, and retains it after an unknown outcome. A `null` native result alone cannot erase a possibly sent request.

## Reproducible checks and APK build

Pinned Capacitor core/Android/CLI 8.6.0; Node 24; Java 21; Android SDK/build tools 36; minimum Android 13/API 33. Dependencies are locked in `package-lock.json`.

```sh
npm ci --ignore-scripts
npm run typecheck
npm run test:web
npm run test:native-core
npm run sync:android
npm run verify:native
cd android
./gradlew :app:testDebugUnitTest :app:assembleDebug --no-daemon
```

The pure coordinator tests cover concurrent UUID replay, persist-before-dispatch, pre/post-send timeout, late completion, storage failure, process interruption and restart recovery. Screen tests cover result validation, blocked browser fallback, saved-UUID recovery, unknown responses and explicit paper confirmation. The CI build additionally compiles the real Android sources, verifies the resulting APK signature and rejects Android runtime permissions in this offline utility.

Compilation and simulated recovery tests are not physical H10S acceptance. The outstanding hardware evidence is an actual connection result and one inspected complete setup slip. No live customer or payment record is created by these tests.
