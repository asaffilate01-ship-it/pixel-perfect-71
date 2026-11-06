# Retiring completed receipts — 6 November 2026

The owner requested removal of the first six orders from the printer receipt queue because they had already been handed over. Their sequential numbers are 0001–0006. The reviewed preflight confirmed that all six are paid, fulfilled and have actual handover records. Order 0001 has one recorded, unconfirmed send attempt; orders 0002–0006 are queued. None has a physical-print confirmation.

## Behaviour

The additive `20261106195536_mealdeck_receipt_archive.sql` extension adds private archive metadata to receipt jobs. An archived receipt leaves the printer board and cannot be claimed, sent or reprinted through stale queue controls. The original status, frozen receipt, delivery attempts, confirmations, events, orders and payments remain unchanged. Archive audit entries record an owner-directed administrative operation; they do not impersonate a staff member or assert paper output.

The owner-only helper requires a fulfilled, canonically paid order with recorded handover, the sole original receipt, the reviewed unchanged status and an exact receipt digest. It refuses in-flight claims/sends and changed state. Repeating the same archive is idempotent.

The narrow operation `deploy/mealdeck/operations/20261106_retire_handed_over_receipts.sql` identifies those six exact jobs and their reviewed digests, verifies their kitchen and order numbers, and checks that payment and print history remain identical. It runs atomically after the extension. Newer orders are outside its scope. Source preparation is separate from confirmed live installation and execution.

## Automatic printing

Acceptance on KDS and acceptance on the printer screen use the same transaction and queue one original receipt. The archive extension does not change that flow. With a supported connection and automatic printing enabled, the printer consumer handles new queued receipts. A queue entry or unconfirmed send does not prove physical printing. The Senraise built-in printer still requires the verified service connection described in [the printer status](./mealdeck-senraise-printer-status.md).

## Verification

`tests/postgres/receipt-archive-behavior.mjs` verifies atomic install/rollback/rerun, owner-only access, changed-state rejection, queued and unconfirmed-send preservation, removal from active work, stale claim/reprint rejection and fresh acceptance continuing to queue exactly once. CI also runs it on PostgreSQL 17.
