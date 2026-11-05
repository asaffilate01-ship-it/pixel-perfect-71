# MealDeck Staff — native Tap to Pay

This is the Android and iPhone staff companion, built with React Native, Expo native projects and Stripe Terminal. It supports new walk-in/pickup/kerbside sales and collection against the original unpaid MealDeck order. The app uses the same server pricing, payment ledger and kitchen release as online ordering.

**This source is not an installed or approved payment terminal.** Native configuration, JavaScript exports, type checks and automated tests can be checked without taking a payment. Physical device acceptance, Apple entitlement approval, production signing and hosted merchant configuration are separate release steps.

## What the staff flow does

1. Sign in with an invited MealDeck staff account, using a password or an email code. Existing verified TOTP factors are challenged. The server checks current `payments.collect` access and the authorised Luton kitchen on every payment action.
2. On iPhone, open **How to Tap**. The local Expo module presents Apple's `ProximityReaderDiscovery` content on iOS 18 and later from the current topmost view controller. Earlier iOS versions show the app's merchant-education fallback. This does not make an older OS eligible for Tap to Pay.
3. Check this phone, grant the SDK's required permissions, and connect its discovered Tap to Pay reader to the server-selected Terminal location. The app never chooses a merchant account or kitchen from entered text.
4. Start a new sale from the five confirmed menus, or look up an existing order. Required portions, flavours, included drinks and named cross-brand extras use the existing source helpers. Source prices are planning information. A new sale receives a fresh server quote, with items, modifiers, packing, discount and total for review.
5. Confirm the amount. Before the first prepare request, the app saves the original quote/order ID and attempt UUID in secure storage. It retrieves the server's PaymentIntent, checks its ID, GBP amount and test/live mode, collects the card, confirms it, then asks MealDeck to reconcile.
6. Only the server's verified result produces **Payment confirmed**. Kitchen acceptance, preparation, packing and handoff remain separate. Existing paid or held orders cannot be collected again.

A decline keeps the same attempt. A timeout, app restart or unknown result requires checking that attempt. Cancelling reader collection is followed by server cancellation/reconciliation. A request that never reached the server can be retried explicitly with its original UUID; it never silently becomes a new attempt. Offline payments are unavailable, and the app does not create offline PaymentIntents or offline sale queues.

## Pinned toolchain

All direct npm dependencies are exact versions in `package.json`; `package-lock.json` records the resolved dependency graph.

| Component                              | Version                              |
| -------------------------------------- | ------------------------------------ |
| Stripe Terminal React Native           | `0.0.1-beta.34` — public preview     |
| Stripe Terminal iOS / Android          | `6.0.0`                              |
| Expo                                   | `56.0.24`                            |
| Native prebuild template               | `expo-template-bare-minimum@56.0.24` |
| React / React Native                   | `19.2.3` / `0.85.3`                  |
| Supabase JS                            | `2.118.0`                            |
| SecureStore                            | `56.0.4`                             |
| Kotlin compiler / AGP / Gradle         | `2.2.0` / `8.12.0` / `9.0.0`         |
| Android compile / target / minimum SDK | `36` / `36` / `33`                   |
| iOS app deployment target              | `16.4`                               |

Node 24 was used for local checks; the project requires Node 22.13 or later. Android uses Java 17, Android platform/build-tools 36 / 36.0.0, NDK 27.1.12297006 and CMake 3.22.1. Use a current supported macOS/Xcode with the iOS 18-or-later SDK and CocoaPods for iOS compilation.

The prebuild wrapper packs the **lockfile-installed template** locally. Use `npm run prebuild`; an unqualified Expo prebuild can choose another template. The native plugin sets the Kotlin compiler dependency as well as its property, puts the Tap to Pay process guard before application/React initialization, and pins Stripe's iOS Swift package to exactly 6.0.0. Generated `android/` and `ios/` directories are disposable; custom native education code remains in `modules/`.

## Server configuration and credentials

The only build configuration is the approved public HTTPS origin:

```sh
MEALDECK_TERMINAL_API_ORIGIN=https://mealdeck.co.uk
```

Copy `.env.example` to `.env` for local configuration. Never put Stripe secret keys, Supabase service-role keys, staff passwords, access tokens or connection-token secrets in Expo public variables, app config, EAS build variables intended for the bundle, or source control.

At runtime, `bootstrap` supplies the independent MealDeck Auth URL and publishable/legacy anon key. Authenticated `config` supplies kitchen scope, Terminal location, mode and availability. There is no hard-coded Supabase project or merchant credential in the app. Connection tokens are fetched on demand and never cached by application code.

Refresh tokens use device-only, when-unlocked SecureStore/Keychain storage. Access tokens and PaymentIntent client secrets remain in memory. Payment recovery stores only `{orderId, attemptId}` or `{quoteId, attemptId}`, separately for each staff user. Signing out retains recovery until reconciliation, disconnects the reader and clears SDK credentials. Raw SDK objects, customer card data and secrets are not logged. Screenshot protection and app-switcher privacy are enabled.

The payment server owns these release switches and its normal payment-readiness checks:

- `MEALDECK_TERMINAL_ENABLED=true`
- `MEALDECK_TERMINAL_INTEGRATION_APPROVED=signed-off`
- `MEALDECK_STRIPE_TERMINAL_LOCATION_ID=tml_…`
- `MEALDECK_TERMINAL_SIMULATED=true` only in test mode
- The existing common checkout integration approval and the independent MealDeck configuration

An authenticated account alone does not grant payment authority. No role is inferred from user-editable metadata. Server `mfa_required` and expired-session responses return to staff authentication while retaining recovery. Email-code login requires an Auth template that includes the OTP; password login remains available. Account creation and password-reset administration remain in the existing Auth flow.

## Build and install

From this directory, with the repository's shared `src/lib` modules present:

```sh
npm ci
npm run typecheck
npm test
npm run check:config
CI=1 npm run prebuild -- --clean --no-install
npm run check:native
npm run export:check
```

`--clean` regenerates only the app's ignored native directories; keep intentional changes in `app.config.ts`, `plugins/` or the local Expo module. The app cannot run in Expo Go. Its Stripe SDK and education bridge require a custom native build.

### Android

With the required Android SDK packages already installed and licensed on the build machine:

```sh
cd android
./gradlew :app:assembleDebug --no-daemon --stacktrace
```

This produces a debug APK under `android/app/build/outputs/apk/debug/`. It proves compilation, not payment acceptance. Development work can use `npm run android` and `npm start`. For staff-device acceptance use an approved standalone preview/release build, with real-device eligibility checks and Developer options disabled. Do not distribute a debug-signed build as the production app.

`eas.json` contains development, internal preview and production build profiles. The authorised release operator must configure the actual Expo/Android signing account, retain the keystore securely, build the selected profile and distribute the resulting APK/AAB through the agreed channel. No account, signing key, release upload or device installation was performed by creating this project.

### iPhone

1. In the owning Apple Developer account, register `uk.co.mealdeck.terminal` (or deliberately change the bundle ID before commissioning), request the Tap to Pay development entitlement and create a matching provisioning profile.
2. On macOS, generate the native project, run `pod install` in `ios/`, and open `ios/MealDeckStaff.xcworkspace`. Select the approved team and an eligible physical iPhone. The entitlement declaration is already generated; it does not grant Apple's approval.
3. The authorised business representative completes any Apple account-linking/terms step shown during first reader connection. Test the actual **How to Tap** overlay and the full staff flow.
4. After internal acceptance, request the distribution entitlement and complete the normal TestFlight/App Store review and signing process. Do not submit before merchant education and required device tests pass.

An unsigned simulator **compile** can be attempted in macOS CI after CocoaPods installation:

```sh
xcodebuild -workspace ios/MealDeckStaff.xcworkspace \
  -scheme MealDeckStaff -configuration Debug \
  -sdk iphonesimulator -destination 'generic/platform=iOS Simulator' \
  CODE_SIGNING_ALLOWED=NO build
```

No simulator compile, SDK simulated-reader run or entitlement XML proves real iPhone Tap to Pay acceptance.

## Device and operating requirements

Stripe's current requirements, rather than model-name assumptions in app code, determine eligibility. Android needs a supported physical NFC/ARM device, Android 13 or later, sufficiently recent security updates, supported Google services, an unmodified OS and a locked bootloader; Developer options must be disabled for real Tap to Pay. iPhone requires a supported iPhone and current supported non-beta iOS. Keep devices and the Terminal SDK current. The reader's discovery/connect error is shown when eligibility or permissions fail.

Use only the authorised UK/GBP merchant and Luton Terminal location. A device changing country, missing internet, or failing its integrity/OS checks must not receive a local override. Some cards require insertion or another supported payment method; reconcile the existing attempt before switching collection channels. Never collect a PIN in the app's own inputs.

## API contract

Every request is a strict JSON `POST` to `/api/terminal`. Only `bootstrap` is unauthenticated. Other actions use `Authorization: Bearer <staff access token>`; responses are validated before use. The authoritative types are in `src/api/types.ts`.

| Action                 | Body beyond `action`                                      | Result                                                                        |
| ---------------------- | --------------------------------------------------------- | ----------------------------------------------------------------------------- |
| `bootstrap`            | none                                                      | Auth public config or setup message, API version 1                            |
| `config`               | none                                                      | Current permission/readiness, kitchen, Terminal location and mode             |
| `connection_token`     | none                                                      | Ephemeral SDK connection secret                                               |
| `catalogue`            | none                                                      | Current supported catalogue and source revision; planning only                |
| `quote`                | Exact source picks, fulfilment, optional vehicle, packing | Expiring server-priced quote and full review lines                            |
| `lookup`               | `reference`                                               | Authorised original order and verified outstanding balance                    |
| `prepare`              | Exactly one of `quoteId`/`orderId`, plus `attemptId`      | Bound order/attempt, optional client secret and collect/reconcile/none action |
| `reconcile` / `cancel` | The same recovery pair                                    | Authoritative result for that attempt                                         |

No payment request contains an amount, merchant, kitchen/tenant selector, paid flag or card data. `attemptId` is the client-created idempotency UUID, retained unchanged when a quote becomes an order; internal collection IDs remain server-owned. The native app supports held overpayments without hiding actual paid money and blocks further collection on held orders.

`src/menu.ts` imports only the existing catalogue, picks, upsells and display-price helpers. Metro watches the repository's `src/lib` folder, uses this app's dependency installation, and blocks server-module imports. The app refuses unsupported catalogue revisions. Do not import server adapters or environment readers into this entry point.

## Validation and remaining acceptance

Automated tests cover strict server responses, private-key rejection, token use, amount/mode/intent mismatches, duplicate taps, card declines, cancellation, offline/restart recovery, quote expiry, lost initial prepare responses and verified-only paid states. `check:native` inspects generated permissions, the process guard, Kotlin/Gradle settings, the iPhone entitlement, exact Stripe Swift package and education-module autolinking. Export checks bundle both iOS and Android JavaScript.

The implementation environment has Java 17 but no Android SDK/device tools or Xcode/Swift toolchain. No native binary, device UI/screenshot pass, real Tap to Pay attempt, live/test email, merchant-account action, entitlement acceptance or signing action has been performed here. Android/iOS CI compilation and physical device commissioning remain necessary. Test new sales, existing unpaid and already-paid orders, two staff devices, online/native overlap, interrupted confirmation, cancellation races, shared bags/extras, held late captures and one KDS release before enabling live collection.

## Primary references checked on 5 November 2026

- [Stripe Terminal React Native releases](https://github.com/stripe/stripe-terminal-react-native/releases/tag/v0.0.1-beta.34)
- [Stripe native integration and required locale configuration](https://docs.stripe.com/terminal/payments/setup-integration?terminal-sdk-platform=react-native)
- [Tap to Pay on iPhone, entitlement and merchant education](https://docs.stripe.com/terminal/payments/setup-reader/tap-to-pay?platform=ios)
- [Tap to Pay on Android and supported devices](https://docs.stripe.com/terminal/payments/setup-reader/tap-to-pay?platform=android)
- [Discovering and connecting native Tap to Pay](https://docs.stripe.com/terminal/payments/connect-reader?terminal-sdk-platform=react-native&reader-type=tap-to-pay)
- [Collecting, confirming and retrying card payments](https://docs.stripe.com/terminal/payments/collect-card-payment?terminal-sdk-platform=react-native)
- [Expo local native modules](https://docs.expo.dev/modules/get-started/)
- [Expo SecureStore](https://docs.expo.dev/versions/v56.0.0/sdk/securestore/)
- [Supabase React Native Auth](https://supabase.com/docs/guides/auth/quickstarts/react-native)
