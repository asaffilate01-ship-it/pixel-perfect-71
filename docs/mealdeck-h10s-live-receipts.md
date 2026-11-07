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
