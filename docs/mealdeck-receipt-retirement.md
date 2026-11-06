# Retiring completed receipts — 6 November 2026

The owner requested removal of the first six orders from the printer receipt queue because they had already been handed over. Their sequential numbers are 0001–0006. The reviewed preflight confirmed that all six are paid, fulfilled and have actual handover records. The first preflight saw an unconfirmed send for 0001 and queued work for 0002–0006. Before execution the terminal operator resolved 0001 as no usable receipt and recorded paper confirmation for 0002–0006. The operation was re-reviewed against those latest statuses; it preserves those operator records without adding its own paper claim.

## Behaviour

The additive `20261106195536_mealdeck_receipt_archive.sql` extension adds private archive metadata to receipt jobs. An archived receipt leaves the printer board and cannot be claimed, sent or reprinted through stale queue controls. The original status, frozen receipt, delivery attempts, confirmations, events, orders and payments remain unchanged. Archive audit entries record an owner-directed administrative operation; they do not impersonate a staff member or assert paper output.

The owner-only helper requires a fulfilled, canonically paid order with recorded handover, the sole original receipt, the reviewed unchanged status and an exact receipt digest. It refuses in-flight claims/sends and changed state. Repeating the same archive is idempotent.

The narrow operation `deploy/mealdeck/operations/20261106_retire_handed_over_receipts.sql` identifies those six exact jobs and their reviewed digests, verifies their kitchen and order numbers, and checks that payment and print history remain identical. It runs atomically after the extension. Newer orders are outside its scope. Source preparation is separate from confirmed live installation and execution.

## Automatic printing

Acceptance on KDS and acceptance on the printer screen use the same transaction and queue one original receipt. The archive extension does not change that flow. With a supported connection and automatic printing enabled, the printer consumer handles new queued receipts. A queue entry or unconfirmed send does not prove physical printing. The Senraise built-in printer still requires the verified service connection described in [the printer status](./mealdeck-senraise-printer-status.md).

## Verification

`tests/postgres/receipt-archive-behavior.mjs` verifies atomic install/rollback/rerun, owner-only access, changed-state rejection, queued and unconfirmed-send preservation, removal from active work, stale claim/reprint rejection and fresh acceptance continuing to queue exactly once. CI also runs it on PostgreSQL 17.

## Live execution

PR109 was merged normally as `c669c3cb33a30faee277a10ff44a74bef3b28cdd` and synced to the connected Lovable branch. The additive extension installed successfully in the independent MealDeck database. Its SHA-256 is `d0b56c7ed17325f0134c3418ff748e041c1faecd8eeac6ec1b1542853414496d`.

At 20:11 UK the refreshed six-job operation completed atomically. Its SHA-256 is `93f25a5d1a83d185e2d11c76916a14f38c2659dd4d7271e82ecb451f860e3342`. Readback confirmed six archived jobs, zero of those six remaining active, six archive audits, zero newer jobs archived and two newer receipt entries preserved. Order0001 retains `failed`; orders0002–0006 retain the operator-confirmed `printed` status. The operation's before/after comparisons confirmed unchanged order, payment, item, receipt and print-event history.
