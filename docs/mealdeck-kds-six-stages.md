# MealDeck six-stage kitchen display

Requested flow: **New → Accepted → Preparing → Ready to pack → Ready for handover → Done**.

| Stage | Evidence and action |
| --- | --- |
| New | A fully verified paid order is released; staff have not accepted it. **Accept order** records acceptance and queues one receipt. |
| Accepted | Staff acceptance exists, but preparation has not started. **Start preparing** moves the whole order into preparation. |
| Preparing | Staff tick each purchased line, including drinks and attached extras. The existing server requires every item to be ready. |
| Ready to pack | Every item is ready. **Start packing** keeps the order in this queue with a packing-in-progress note. Verify named bags, sides, sauces, drinks and requested cutlery; **Ready for handover** asks for confirmation. |
| Ready for handover | Packing has been confirmed. The existing collection/kerbside handover code check is required before **Confirm handover · Mark done**. |
| Done | The canonical order is fulfilled and its pass record is handed off. Read-only history shows confirmed handovers from the last 12 hours; refreshes do not lose it or print receipts again. |

The six stage counters are filters. All active orders excludes Done. The Done view retains quantities, flavours, extras, notes and person/bag labels, with up to the latest 100 completed cards and an explicit overflow count. Packing is an activity within Ready to pack, not a seventh stage. Internal database enum values and write RPCs stay unchanged.

## Kerbside pickup details

The owner confirmed five required pickup details on 6 November: customer name,
WhatsApp number, car make, colour and the final four registration characters.
The existing guest/member identity and canonical vehicle validation already
require these values before a kerbside order can be prepared. The checkout now
shows the car fields as soon as kerbside is selected and lists all five details
in the final review. Changing the contact or car details clears the review
confirmation.

Active kerbside tickets show the saved order's name and WhatsApp number beside
the existing car details. These are plain contact details, not verification that
the number is registered with WhatsApp or permission to send marketing. The
interface does not initiate a call or message.

Apply `20261106173037_mealdeck_kerbside_pickup_contact.sql` after the current
ordering-room and kitchen extensions. `deploy/mealdeck/kerbside-contact.mjs`
returns the complete atomic migration. It adds `pickupContact` only to the
private KDS card projection, using the saved order fields and the existing
staff, kitchen and payment checks. An unexpected function definition aborts the
installation. Reapplying the same migration is safe. Missing or malformed
legacy contacts become null without hiding the order or car. Completed history,
receipt payloads, printer behaviour and public access do not gain contact data.

Verify with `bun test tests/mealdeck-kds.test.ts tests/mealdeck-kds-view.test.ts`
and `node tests/postgres/kerbside-contact-behavior.mjs` (`--native` is supported
for the disposable PostgreSQL test environment).

The kerbside extension was installed in the independent Luton database on
6 November 2026. The private function body hash is
`6d9892c16035d610539ee0239953031f`; direct anonymous, authenticated and service-role
execution remains denied. Staff continue through the existing scoped KDS RPC.

## Deployment

Install the additive CLI-generated `mealdeck_kds_done_history` migration from the standalone post-install profile before publishing the updated KDS. It adds only `mealdeck_ops_kds_workflow_board(uuid,uuid)`. The original active board and all acceptance, checklist, packing, handover and printer write functions are unchanged. The new endpoint uses the same current verified identity, kitchen scope and `orders.read` permission, plus canonical payment-release evidence for completed orders. Public, anonymous and service-role execution is revoked; only the authenticated staff path is granted.

This is not a payment, notification, email or live-ordering activation. Keep those acceptance checks separate. No test orders or fake payment records are inserted into production.

## Verification

Run `bun test tests/mealdeck-kds-presentation.test.ts tests/mealdeck-kds-workflow.test.ts tests/mealdeck-kds.test.ts tests/mealdeck-kds-readiness.test.ts` and `node tests/postgres/kds-workflow-behavior.mjs` (or `--native` with the existing disposable-only PostgreSQL test database). The SQL suite runs the real lifecycle, duplicate acceptance/handover, malformed or missing completion evidence, cross-role isolation, refund exclusion and read-only history. Never point the destructive fixture harness at production.
