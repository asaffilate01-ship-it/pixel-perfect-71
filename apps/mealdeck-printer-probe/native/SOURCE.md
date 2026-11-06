# Reviewed Senraise diagnostic contract

This directory contains a narrow MealDeck implementation of two Binder operations observed in [mawlood-fareq/capacitor-senraise-printer](https://github.com/mawlood-fareq/capacitor-senraise-printer/tree/7e2c4e2e6dde6872a239c6cb00fa209317078e45), pinned at `7e2c4e2e6dde6872a239c6cb00fa209317078e45` (package version 2.0.0). The upstream package identifies **Mawlood Fareq Mahmood** as author and declares **MIT** in `package.json`; its README also links to MIT. The reviewed tree contains no separate licence file or attribution explaining the original generated service stubs. This is a third-party candidate, not a manufacturer endorsement or an H10S compatibility guarantee.

Reference files:

- `android/src/main/java/com/senraise/printer/PrinterPlugin.java`: explicit installed service component.
- `android/src/main/java/recieptservice/PrinterInterface.java`: descriptor and generated Binder transaction ordering.

The implementation does not copy the complete generated SDK. It uses the exact observed descriptor `recieptservice.com.recieptservice.PrinterInterface`, service `recieptservice.com.recieptservice.service.PrinterService`, synchronous transaction `2` for `getServiceVersion`, and transaction `4` for `printBitmap`. The bitmap parcel contains an interface token, a presence word and `Bitmap.writeToParcel(..., 0)`, followed by the normal exception reply. An unsupported transaction, mismatched descriptor or missing/invalid version response fails closed. A nonempty reported version is recorded for the device test; it is not compared with an invented compatibility allowlist. No firmware, scanner, PSAM, NFC, raw ESC/POS, arbitrary text or arbitrary image operation is exposed.

## Integration

- App namespace/package: `uk.co.mealdeck.printerprobe`.
- Register `MealDeckPrinterProbePlugin` with the Capacitor activity.
- Add `native/src/main/java` as an app Java source directory, using Java 21 / Capacitor 8.
- Supply the existing approved thermal logo as `R.drawable.mealdeck_thermal_logo`.
- Declare only the exact service package in Android package visibility queries. No elevated permission is requested; an inaccessible/signature-protected service remains unavailable.
- Disable Android backup and device transfer for the local test journal. Never clear it as a recovery step.
- Keep the WebView restricted to bundled trusted diagnostic content; this plugin needs no internet permission, account, order API or payment configuration.

The first probe establishes the actual installed package version, Binder descriptor and service version. Android 13 and the observed H10S build are not proof that the service is accessible. The fixed setup sample is at most 256 × 640 ARGB pixels and uses one bitmap send, including white feed space. A returned IPC call is only `sent_unconfirmed`.

SQLite saves a unique request UUID and one unresolved slot with full synchronous commits before dispatch. Repeat UUIDs never dispatch again. Timeout, activity destruction or process interruption holds the saved test. A timed-out Binder call remains busy until it actually returns, even if its UI deadline has elapsed. Only explicit inspected-paper confirmation closes an unresolved test. An unknown WebView outcome must retain the original UUID; a null status does not prove a delayed bridge invocation cannot still arrive.

`run-core-tests.mjs` checks the transport state machine and pinned transaction constants with the JDK alone. Android compilation, actual SQLite lifecycle behavior and H10S service/paper acceptance are separate verification steps; no hardware success is claimed by these tests.
