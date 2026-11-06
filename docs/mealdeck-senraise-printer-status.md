# Senraise printer integration status — 6 November 2026

The owner uses a Senraise Android terminal and wants the **MealDeck Printer PWA** at `https://mealdeck.co.uk/printer` to remain the working screen, with automatic receipts after acceptance on either KDS or printer. The exact model, installed firmware and printer service have not been verified. No device serial or other unique hardware identifier is recorded here. No integrated-printer connection, APK installation or physical-paper acceptance was performed during this investigation.

## What the Cafe1 source actually provides

The owner reported that Cafe1 printed on the same device. The following files were refreshed read-only from the default branch of `asaffilate01-ship-it/cafe1-connect-dash` on 6 November 2026, alongside the local audit checkout at `1aad3af52a41f779c3c1c735f18f29572d36a56c`:

| Source                                                                                                                                | Observed implementation                                                                                                                                                                                       |
| ------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [`src/lib/imin.ts`](https://github.com/asaffilate01-ship-it/cafe1-connect-dash/blob/main/src/lib/imin.ts)                             | Probes injected `iminPrinter`, `imin.printer`, `innerPrinter`, `sunmiPrinter` or `AndroidPrinter` objects; invokes `printText` or `sendRAWData`. It does not install those objects or contain a Senraise SDK. |
| [`src/routes/till.tsx`](https://github.com/asaffilate01-ship-it/cafe1-connect-dash/blob/main/src/routes/till.tsx)                     | Tries the injected bridge, then Cafe1 Device Bridge, then opens browser print preview.                                                                                                                        |
| [`device-bridge/src/server.mjs`](https://github.com/asaffilate01-ship-it/cafe1-connect-dash/blob/main/device-bridge/src/server.mjs)   | Node service using a configured TCP ESC/POS printer or an operating-system/CUPS queue through `lp`.                                                                                                           |
| [`src/routes/print.$orderId.tsx`](https://github.com/asaffilate01-ship-it/cafe1-connect-dash/blob/main/src/routes/print.$orderId.tsx) | Browser receipt layout and `window.print()` fallback.                                                                                                                                                         |
| [`docs/POS_HARDWARE_SETUP.md`](https://github.com/asaffilate01-ship-it/cafe1-connect-dash/blob/main/docs/POS_HARDWARE_SETUP.md)       | Documents Node 22+, network printing or CUPS, and separate physical acceptance.                                                                                                                               |

No Senraise-specific adapter, manufacturer SDK, AIDL contract or Android printer APK was found in that source. The audit checkout's `release/operational-acceptance.json` still marks `printer_cash_drawer` pending; this records no completed acceptance evidence and does not contradict the owner's report of earlier printing. Identifying the app or service used by that successful Cafe1 flow is the most direct way to establish a reusable connection.

Cafe1's return-on-no-exception and automatic fallback behaviour must not be copied into MealDeck's receipt delivery. A native method returning, or a browser dialog closing, does not confirm physical paper and must not initiate an additional delivery path after an uncertain send.

## Verified manufacturer and Android information

- [Senraise's official FAQ](https://www.senraise.com/faq.html) confirms built-in thermal printing and SDK/API integration support. It does not publish the service package, bind action, callable methods or completion guarantees.
- [Senraise's official download page](https://www.senraise.com/download.html) presented an email-verification gate when checked on 6 November. No matching publicly accessible manufacturer SDK/service contract or manufacturer-owned SDK repository was verified. The gate was not bypassed and no email was sent.
- [Chrome's Android printing instructions](https://support.google.com/chrome/answer/1069693?co=GENIE.Platform%3DAndroid&hl=en) document **More → Share → Print** and choosing an installed printer. This can provide manual output only when a compatible printer service exposes the device. It does not establish silent automatic printing.
- [Android's WebView printing documentation](https://developer.android.com/training/printing/html-docs) requires native print-adapter integration and states that JavaScript in an HTML document cannot trigger that WebView printing path. A Chrome-installed PWA and an application-owned WebView have different integration mechanisms; an injected vendor object is not created by PWA installation.

## Current MealDeck boundary

KDS and printer acceptance already enter the same canonical acceptance transaction and create one original receipt. The printer's automatic consumer requires a verified scoped account, a fresh queue, an idle controller, a paired connection and **Print waiting receipts automatically** enabled. It consumes queued receipts and does not automatically accept new orders. The controller remains mounted while mobile tabs change.

The shipped local bridge is `https://127.0.0.1:17443`, backed by Node/POSIX storage and a configured TCP ESC/POS printer. It is not an Android built-in-printer adapter. Its canonical claimed-receipt check, immutable payload comparison, durable job/copy journal and uncertain-send recovery are the requirements for any future transport.

`apps/mealdeck-terminal` is the separate Expo/React Native payment application. Its current Android configuration requires NFC and Android API 33+, and its API uses payment collection permissions. It contains no Android printer module. Printer-only accounts must retain their existing narrow permissions; installing or repurposing this payment application is not a printer setup step.

## Supported implementation direction after the service is identified

A dedicated Android printer companion can leave the PWA as the operator screen. It can authenticate with the existing printer access and consume the same receipt queue directly, avoiding a new browser-to-localhost protocol. This is a proposed design; no such companion has been implemented or commissioned.

The native transport must first resolve the **documented** manufacturer service, verify its installed version and bind/status capabilities without printing. It must fetch the canonical claimed receipt, persist the job ID, order/copy identity and payload hash before dispatch, and perform one bounded SDK send. A timeout, process death or ambiguous callback becomes a held receipt. It must never automatically retry or switch transports after a possible send. Physical-paper confirmation and audited numbered reprints remain separate actions.

The existing native CI demonstrates a reusable build process: locked dependencies, pinned Expo prebuild and Android Gradle compilation. A dedicated printer application would require its own manifest, printer module, permission review, tests and signed APK distribution. Existing payment-app build artifacts do not establish Senraise support.

### Evidence needed to proceed

1. The app/browser name and its settings from the **working Cafe1 print flow**, plus the terminal's **Settings → Printing** services and **About device** model/firmware fields. Unique device identifiers are unnecessary.
2. The matching official Senraise SDK/AAR/AIDL or print-service package, its distribution licence, service/component/action names, permissions and supported firmware versions.
3. The documented printable width, encoding/rendering contract, status/error callbacks, completion semantics and behaviour after service disconnect or timeout.
4. A supervised clearly labelled setup print on the actual device, followed by a real canonical receipt test confirming one physical copy and correct interrupted-send recovery.

Until these are established, the automatic queue is implemented but automatic output through this terminal's built-in printer is unverified. Do not advertise a successful pairing or physical print from source review, a build result or PWA installation alone.
