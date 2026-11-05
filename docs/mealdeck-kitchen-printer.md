# MealDeck shared kitchen and receipt printer

## What this extension does

The `/kds` app keeps every brand together on one card per paid order in the selected kitchen. `/printer` is a separate installable staff app with its own sign-in session and narrower database permissions. Customer progress uses the actual kitchen timestamps.

The dedicated MealDeck database is required. This extension does not connect to, change, or grant access to Dishbee or Cafe1 databases. The immutable, published foundation installer is unchanged.

Apply these independent extensions in this order:

1. Customer membership: `20261105082728_mealdeck_customer_membership.sql`.
2. Stripe checkout: `20261105082900_mealdeck_stripe_checkout.sql`.
3. Kitchen and printer: `20261105090147_mealdeck_kitchen_printer.sql`.

`deploy/mealdeck/kitchen-printer.mjs` returns the complete migration. Its managed runner wrapper requires one complete migration in one runner-owned atomic transaction; it removes only the known outer `begin`/`commit` statements. It makes no hosted request and activates no payment or printer hardware setting.

## Order workflow

| Step       | Staff action                                                        | Canonical behaviour                                                                                                                                                           |
| ---------- | ------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Placed     | None                                                                | A server-verified Stripe capture, for the exact order total and currency, releases the order. A checkout redirect, client flag, or `paid_at` alone cannot do this.            |
| Accepted   | **Accept order**                                                    | Writes `orders.accepted_at` and queues one original receipt in the same transaction. Repeating acceptance creates no extra receipt.                                           |
| Preparing  | **Start preparing**                                                 | Starts all routes on the one shared order card. Starting before acceptance is rejected in the database, including through the historical RPC.                                 |
| Item ready | Tick the purchased line                                             | Marks that line's routed copies ready. Other lines stay unchanged. Drinks, linked extras and every brand must be accounted for. Unticking is permitted until packing starts.  |
| Packing    | **Start packing**                                                   | Requires every canonical item and routed copy to be ready, and complete valid routing. The old bulk-ready call cannot bypass the checklist.                                   |
| Ready      | **Seal order**, then confirm                                        | Requires all items still ready, records sealing and `ready_for_handoff_at`, and makes the order ready for customer collection. Check the numbered bags and requested cutlery. |
| Completed  | Enter the customer's four-digit order number and confirm collection | Rechecks the payment, permission, scope, readiness and code; records `handed_off_at` and fulfils the order. This operation supports collection and kerbside only.             |

The kitchen timer starts at the verified kitchen release, not the start of an unpaid checkout. The receipt's placed time is `paidAt`. Draft `createdAt`, payment time and actual acceptance time remain separate.

Every status mutation locks the order and relevant payment, route, ticket and pass rows, then rechecks permission and payment authority after lock waits. Expected-version comparisons reject stale screens. Refunds, holds, revoked access, banned or deleted users and invalid routes cannot be bypassed by an already-open staff screen.

## Purchased instructions and bags

The receipt is snapshotted at acceptance from the server-owned priced quote and purchased order lines. Menu changes after payment do not change the receipt's item names, brands, quantities, extras, flavours, sauces or prices. There is no lookup of a current price when printing.

Modifiers appear below the parent item with their quantity and price included in that item's total. Linked cross-brand extras remain next to their parent. `checkout_line_id` and `parent_checkout_line_id` identify the relationship.

The validated packing plan contains numbered bags and an exact allocation of every purchased line, including quantity splits. Linked extras follow their parent in each bag. Both the kitchen and the receipt show “Bag 1: 1×”, “Bag 2: 1×”, and so on. The cutlery request is prominent. Staff should label the physical bags with those numbers. Invalid, missing or mismatched allocations fail validation rather than being silently guessed.

Kerbside details are the car make, colour and last four registration characters from the order. The printer projection does not expose customer phone/email, addresses, payment credentials or other tenants' data.

## Printer account setup

1. The terminal operator needs an existing MealDeck account with a verified email address. Registration alone grants no staff access.
2. An existing tenant-wide owner or admin signs into `/printer`. Password and email sign-in links are supported. Requesting a link does not create a new Auth account.
3. Open **Owner setup · printer accounts**, select the correct kitchen and assign the verified account's email.
4. The terminal operator signs into `/printer` with that account. The owner can remove the assignment through the same screen.
5. Install **MealDeck Printer** using its own PWA install card. Install **MealDeck Kitchen** separately on `/kds` if needed.

Printer assignments are stored in a separate private `printer_access` table. They do not create an operations staff row and do not grant kitchen, menu, customer lookup, finance, staff-management or payment authority. Every queue call verifies the user and exact tenant/location again. Public and service API roles have no direct access to the queue or access table. Private helpers have no API execute grants. The PWA or URL itself is not the security boundary.

No private receipts or orders are cached by service workers. Supabase's authenticated printer session has its own storage key. The local bridge pairing token stays in memory and must be paired again after the app reloads. Sound preferences contain only a boolean and volume.

## Connecting actual hardware

The repository contains the local bridge in `tools/receipt-bridge/`. Its setup instructions cover the locally configured TLS listener, trusted MealDeck origin, fixed printer address, verified backend and supported ESC/POS settings. A receipt printer model, connection and operator device must still be configured and tested before claiming physical automatic printing works.

The printer app connects only to `https://127.0.0.1:17443`. Pairing uses a code displayed by the local bridge. The browser cannot supply a printer destination, arbitrary URL, raw print bytes, feed length or copy count.

After pairing, enable **Print waiting and new receipts automatically**. Keep the PWA open and the device awake. A PWA is not a background operating-system print daemon. The terminal processes each queued job once, with a database claim preventing competing terminals from acquiring the same receipt.

Before writing to the printer, the bridge calls `mealdeck_printer_claim_receipt(p_job,p_claim)` using the current printer user's access token. That endpoint returns the canonical snapshot only for the authenticated claimant, an unexpired sending claim, a currently permitted kitchen and a still verified paid/accepted order. The bridge prints that snapshot, not a browser-edited payload. It uses the configured public backend key and never receives or stores a service-role key. The user's access token is transient and must not be logged or saved.

The bridge writes one bounded receipt, optionally performs only the supported configured cut, then stops. Its durable journal deduplicates both job ID and order/copy number. An uncertain socket write is held after restart rather than sent again. Network delivery alone does not prove ink reached paper.

### Delivery and recovery states

| State                 | Meaning                                                                    | Operator action                                                                                                         |
| --------------------- | -------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| Waiting to print      | No terminal has acquired this original or requested copy                   | Automatic mode may claim it, or print one receipt manually.                                                             |
| Claimed               | One terminal owns a short lease                                            | Other terminals cannot claim it.                                                                                        |
| Sending               | The send has started                                                       | Do not resend.                                                                                                          |
| Check paper           | The bridge accepted the bounded send, or a browser print dialog was opened | Inspect the actual paper and confirm one usable receipt.                                                                |
| Held                  | The lease expired or the send outcome is uncertain                         | Use **Check local printer status** if paired, inspect the paper, then explicitly resolve. This never sends bytes again. |
| Paper confirmed       | A permitted operator checked one complete receipt                          | Finished. No polling action will print it again.                                                                        |
| Confirmed not printed | An operator inspected the printer and found no usable receipt              | A replacement requires **Request a marked COPY**, a reason and a new audited job.                                       |

After a disconnected paper confirmation, **Sync local printer record** reconciles an already-resolved server card without resending it. **Review interrupted local receipts** lists older local holds even after their server card has left the recent queue. Each resolution requires a physical inspection; it sends no receipt bytes. Paired confirmation failures remain visible, and do not silently hide an unresolved local journal.

Reprints are deliberate, numbered, clearly marked `COPY`, and linked to the prior receipt. The database stores the actor and reason. Retrying the same reprint request ID returns the same job. A pending or unresolved predecessor cannot silently create another copy.

The browser fallback is labelled **Browser print dialog**. The operator must set copies to 1 and choose the printer. It renders only the selected receipt, not the queue or page chrome. Closing a dialog, the `afterprint` event, or a successful socket write never marks a receipt physically printed. Paper confirmation is always explicit.

## Sounds and visual alerts

The kitchen plays a two-note chime; the printer plays three shorter, higher notes. Each staff app has Enable sound, Mute, Volume and Test controls, plus a visual new-order/receipt badge. Enabling needs a user gesture because browsers can suspend audio.

A first load seeds the existing queue without sounding every historical order. In-memory ledgers deduplicate repeated polls and reconnects. BroadcastChannel plus the Web Locks API coordinates overlapping windows; the fallback limits sound to the focused window. Switching kitchens clears notices and requires a fresh audio gesture. No private order IDs are persisted in browser storage.

## Verification

- `node tests/postgres/kitchen-printer-behavior.mjs`: the real standalone foundation, membership and checkout fixture, with no payment-authority test double. Covers scope denial, original receipt idempotency, canonical bridge claims, per-line readiness, packing lock, handoff, refund exclusion, expired claims, account revocation, RLS and function/table ACLs.
- `node tests/postgres/kitchen-printer-behavior.mjs --native`: the same suite on an explicitly configured empty disposable local PostgreSQL database. Includes two independent terminal connections contending for one receipt.
- `bun test tests/mealdeck-kds.test.ts tests/mealdeck-kds-presentation.test.ts tests/mealdeck-kds-readiness.test.ts tests/mealdeck-printer.test.ts tests/mealdeck-staff-alerts.test.ts`: response boundaries, safe presentation, parent/bag relationships, totals, sound deduplication and exact receipt claims.
- The bridge has its own real loopback transport, crash/replay, authentication, canonical-backend and one-copy encoding tests. These use local test sockets, not physical printers.

For browser verification, `--fixture` additionally writes synthetic, local-only RPC projections to `/tmp/mealdeck-kitchen-printer-fixture.json`. This does not create production orders, sessions, customers or payments. There is no public fixture/demo mode on a staff route.
