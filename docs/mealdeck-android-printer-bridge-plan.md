# Android printer companion build plan

Proposed, not implemented — 6 November 2026.

Build a small signed Android companion alongside the existing MealDeck Printer PWA. The PWA remains the screen for accepting paid orders, watching the queue and resolving paper outcomes. The companion consumes the same receipt queue and talks to the terminal's documented built-in printer service. Installing the PWA does not install this native component.

The existing Node bridge is already implemented for a configured POSIX host and TCP ESC/POS printer. Its receipt validation, local journal and recovery rules are reusable specifications. It is not an Android service or a Senraise driver. The existing `apps/mealdeck-terminal` app is a payment companion; its payment/NFC permissions and API are not required for printing.

## Confirmed device and remaining service contract

The owner's screenshots supplied on 6 November 2026 directly confirm **Senraise H10S**, **Android 13**, system build **`H10S-OS02-13.1.95`**, printer firmware **`307`** and **Hardware Settings app version `8.3.6`**. These are observed device fields, not an inference from the serial prefix. No serial, IMEI, IP address or MAC address is retained. Hardware Settings version `8.3.6` does not identify the printer-service package, its API version or an SDK compatibility guarantee.

The remaining device evidence is:

1. **Settings → Apps**, including system apps if necessary: the printer service's exact app/package name and version. Also show **Settings → Printing** and any enabled print service.
2. The name of the app/browser and print settings that produced the earlier working Cafe1 receipt on this same device.

Then obtain the official Senraise SDK or service documentation compatible with this H10S build and printer firmware, including the permitted distribution terms, service/component/action names, required permissions, supported firmware, paper width, text/raster methods and completion/error callbacks. [Senraise's official download page](https://www.senraise.com/download.html) still showed email verification when rechecked on 6 November 2026. No matching downloadable artifact with verified manufacturer provenance was established from the public pages checked. No download gate was bypassed and no email was sent. The owner can supply the official download or SDK archive through that process.

Do not assume Sunmi/iMin compatibility from the confirmed model, guess an Android package or bind to an undocumented service. Cafe1's inspected source only probes already-injected printer objects or falls back to its Node bridge/browser printing; it does not provide a verified Senraise SDK. The exact source references and investigation are in [the Senraise integration record](./mealdeck-senraise-printer-status.md).

## Smallest supported implementation

Use a separate Android application with a narrow native adapter for the verified manufacturer SDK. Choose its minimum Android version and service permissions from the actual SDK/device requirements. Reuse the repository's reproducible native build practices, without importing the payment app's Stripe or NFC scope.

The first build should have four small screens: sign in, printer connection/status, automatic receipt service, and held-job recovery. A device capability check must verify the documented service identity/version, successful binding and supported printer status without printing. An unsupported or disconnected service disables new dispatch and reports the exact missing capability safely.

The companion should connect directly to MealDeck's existing independent backend. This avoids adding a second browser-to-loopback TLS protocol or injecting JavaScript into the PWA. The PWA and companion coordinate through the canonical database queue. Leave the PWA's separate local-bridge automatic consumer off on this device while the native companion is selected; existing server claims remain the concurrency guard if another terminal is active.

Use normal verified printer-account Auth and the existing kitchen-specific printer assignment. Store the native session using platform-protected application storage; keep credentials, tokens, customer details and receipt bodies out of diagnostic logs and the job journal. No service-role credential, Stripe key, `payments.collect` grant or general operations role belongs in the app. Every action must use the current authenticated user's server authorization.

## Reuse the existing RPC contract

These RPCs already exist. A native adapter does not need a second order, payment or receipt-creation path.

| Operation                                | Existing function and arguments                                                | Required behavior                                                                                                         |
| ---------------------------------------- | ------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------- |
| Discover assigned access                 | `mealdeck_printer_my_access()`                                                 | Use only the kitchen scope the verified account is allowed to operate.                                                    |
| Read receipt queue                       | `mealdeck_printer_board(p_tenant,p_location)`                                  | Read canonical jobs; its existing recovery logic holds expired claims. Archived work stays excluded.                      |
| Claim one queued job                     | `mealdeck_printer_claim_job(p_tenant,p_location,p_job,p_terminal)`             | Use one stable installation terminal UUID; keep the returned claim scoped to that job and identity.                       |
| Authorize a new send                     | `mealdeck_printer_begin_send(p_tenant,p_location,p_job,p_claim)`               | Only a newly authorized transition permits a dispatch. A replay or ambiguous response is not permission to print again.   |
| Independently fetch the claimed snapshot | `mealdeck_printer_claim_receipt(p_job,p_claim)`                                | Requires the current user, sending state and unexpired claim; validate and compare the immutable receipt before dispatch. |
| Record transport outcome                 | `mealdeck_printer_send_result(p_tenant,p_location,p_job,p_claim,p_outcome)`    | Only `sent_unconfirmed` or `held`; a vendor callback is not physical-paper confirmation.                                  |
| Record inspected paper                   | `mealdeck_printer_confirm_paper(p_tenant,p_location,p_job,p_outcome,p_reason)` | Explicit `printed` or `not_printed` with a reason after inspection.                                                       |
| Request another copy                     | `mealdeck_printer_reprint(p_tenant,p_location,p_job,p_reason,p_request)`       | Existing audited, numbered-copy flow only after the previous outcome is resolved.                                         |

The current claim lifetime is two minutes and is enforced by the server. The native client must not extend that locally. KDS acceptance and the existing printer acceptance action already queue one original receipt through the shared acceptance transaction. The native consumer automatically prints an eligible queued receipt; it does not automatically accept an order or decide that payment succeeded.

## One dispatch and durable recovery

Port the strict receipt schema and arithmetic checks from `src/lib/mealdeck-printer.ts` and `tools/receipt-bridge/receipt.mjs`, including optional order number, canonical meal components, cash label, notes, bags and copy metadata. Use golden fixtures to establish equivalent normalization and fingerprints; do not silently change the existing receipt-byte comparison. The approved logo is a bundled trusted asset, never a caller URL or arbitrary print command.

For each job:

1. Read current access and queue, claim the job and validate the returned immutable snapshot. Finish local rendering/assets before starting a possible send.
2. Durably reserve the job ID, order ID, copy number and canonical payload fingerprint in a transactional local journal. Enforce unique job/copy ownership and a single in-flight dispatch. A journal failure stops printing.
3. Call `begin_send`. Then fetch `claim_receipt` independently with the same current user/claim and verify the exact receipt fingerprint. Refuse changed, expired or unauthorized data.
4. Persist the local `sending` state before invoking the manufacturer API. Perform one bounded dispatch with the documented service callbacks.
5. Persist the transport result before reporting it. A completed SDK call can become `sent_unconfirmed`; timeout, disconnect, process death or an uncertain callback becomes held. Report the server outcome when connectivity permits.

On restart, an incomplete reservation/send is held for inspection. A retry of the same job returns its journaled outcome, never another physical send. A replayed `begin_send`, claim expiry, lost HTTP response or missing/corrupt journal must not trigger automatic retry, browser fallback or another printer transport. Losing the local installation/journal requires explicit recovery before new work.

Keep paper inspection separate. If a new numbered copy is required, use the existing reprint RPC and retain the prior attempt and reason. The local journal must enforce the same resolved-original/copy-sequence rules as the existing Node bridge. No local button should reset a possibly sent original to “queued”.

## Android lifecycle and sound

Start automatic service explicitly while the companion is visible and show a persistent operating/paused status. Select the correct foreground-service type using the verified service contract and the companion's target Android version, and test it on this Android 13 build. Android documents [background-start restrictions](https://developer.android.com/develop/background-work/services/fgs/restrictions-bg-start), [timeouts for certain foreground-service types](https://developer.android.com/develop/background-work/services/fgs/timeout), and [Doze/App Standby limits on network, jobs and alarms](https://developer.android.com/training/monitoring-device-state/doze-standby). These official sources were checked on 6 November 2026.

Do not assume a polling timer, WorkManager task or scheduled alarm guarantees immediate background printing. Use native notifications/status and any permitted native alert sound for the companion; preserve the user's sound preferences and operating-system controls. Test the actual terminal while the PWA is in front, the screen is off, the network is lost, the printer service restarts and the device reboots. A build result cannot establish all-day background operation or audible alerts on this firmware.

## Build, install and acceptance

Once the matching official SDK and service contract are available:

1. Add the smallest adapter and local journal with fixture tests for validation, duplicate jobs, mismatched fingerprints, claim expiry, concurrent consumers, callback timeout and crash recovery. Compile in native CI with locked dependencies.
2. Produce a signed internal test APK with a recorded checksum and controlled signing key. Do not place signing secrets or SDK credentials in the repository. Install it on the actual Senraise device through the approved internal distribution method.
3. Verify service binding and paper width. Run one explicit **MealDeck printer setup test — No customer order — No payment taken**, separate from the receipt-job queue. Inspect logo, text, cut/feed behavior and one-copy output.
4. Use one real canonical paid order. Accept it through KDS or the Printer PWA; verify one queued original, one native dispatch and one physical receipt. Confirm paper through the existing action.
5. Test interrupted sends, out-of-paper, reconnection, account revocation, restart and an explicitly authorized numbered reprint. Resolve every uncertain attempt before another dispatch. Keep automatic operation disabled if any of these boundaries fail.

The next deliverable is therefore a device-specific signed test APK after the official service/SDK contract is supplied. No native printer adapter, background service or APK was added by this planning work, and no built-in printer connection or physical output is claimed.
