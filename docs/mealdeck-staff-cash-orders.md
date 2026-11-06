# Staff walk-in cash orders

This is a web staff workflow for a new pickup order. It works in the Operations workspace on a desktop or staff phone/PWA without Stripe Terminal, NFC, or a native application. The staff member must already hold `payments.collect` for the selected kitchen. Printer-only access does not grant that permission.

## Staff flow

Choose the current menu items and modifiers, enter the customer's real name and phone number, and optionally add special requests. Review the kitchen's current total before confirming **Cash received**. The server freezes the contact details and notes with that quote and rechecks prices, stock, packing, opening hours and kitchen availability before saving the order.

Confirmation records the exact quoted amount as cash received by the verified staff member. It creates one paid order and the next ordinary visible order number. Its random four-digit collection code remains separate. The order then waits for the existing KDS or printer acceptance action. Acceptance creates the unique original receipt; the existing paired/automatic printer flow controls sending it. A queued receipt does not assert that paper was printed.

Cash orders have no fabricated customer account, email, guest identity, Stripe account, PaymentIntent, Checkout Session, or provider event. They use the same canonical purchased items, linked drink stock, price variants, notes, packing and numbering as the other ordering routes. The current opening offer, when applicable, comes from the existing quote implementation.

## Interrupted requests and unused attempts

The browser saves only `quoteId` and `attemptId`, scoped to the current staff user, tenant and location, before asking the server to confirm. Contact details and notes are not added to that recovery storage. Keep the same pair after a lost response; check its status or retry it. A successful replay returns the original order and does not collect cash again, allocate another number, or queue another original receipt.

Status waits on the same transaction locks as confirmation. An explicit null result means no recorded cash order existed when that locked check completed. **Close unused attempt** then resolves that quote atomically:

- If confirmation has committed first, the server returns the saved cash order unchanged.
- Otherwise, the server records an immutable closure for the unused quote. Every later confirmation against it is rejected, including a request using a different attempt ID.
- The UI may clear the saved attempt only after the server returns `cancelled: true`, or after it has displayed the recovered order. A failed close request leaves the saved pair available for recovery.

Closing an unused attempt creates no order, payment, refund or order number. It does not cancel or refund a saved cash order. Recorded cash facts and any existing receipt remain unchanged.

## API contract

`POST /api/ops/cash` requires the current verified staff bearer session, enrolled MFA where applicable, a same-origin request and the configured kitchen scope. The server derives the actor and actual destination; browser scope fields must match that destination and cannot grant access.

| Action    | Required input beyond scope                                                                                | Result                                                                           |
| --------- | ---------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------- |
| `quote`   | `fulfilment: "pickup"`, canonical `picks` and `packing`, `customerName`, `customerPhone`, optional `notes` | Sanitized canonical `quote` with exact normalized contact and notes              |
| `confirm` | `quoteId`, stable `attemptId`, `cashReceived: true`                                                        | One saved `order`, `replayed`                                                    |
| `status`  | The same `quoteId` and `attemptId`                                                                         | `order` or explicit null, `replayed`, `cancelled`                                |
| `cancel`  | The same `quoteId` and `attemptId`                                                                         | Existing order unchanged, or `{ order: null, replayed: false, cancelled: true }` |

The order result includes `paymentMethod: "cash"`, `cashReceived: true`, the recorded amount/time, current canonical payment/order status, `verifiedPaid`, `orderNumber`, collection code and acceptance time. `cashReceived` is the historical tender fact. A subsequent cancelled/refunded canonical order can have `verifiedPaid: false` without erasing that fact or its assigned number.

New quotations and confirmations respect the existing online-enabled and integration-approved application switches, together with the database kitchen/opening checks. Status, safe closure and already committed replays remain available after admission closes; current authentication and `payments.collect` are always required. There is no Stripe credential or native-Terminal readiness dependency.

## Database installation and authority

Apply `20261106201017_mealdeck_staff_cash_orders.sql` from the reviewed release as a complete atomic migration to MealDeck's independent database. The builder is `deploy/mealdeck/staff-cash-orders.mjs`. `buildManagedStaffCashOrdersSql` requires an explicit single runner-owned transaction. Never concatenate partial fragments or change a failed body-hash guard to accept an unknown definition.

The migration requires the previously installed shared/Terminal canonical materializer, numbered orders/receipts, order notes and included-drink stock extension. It guards their exact reviewed function bodies. The original Stripe kitchen-release authority is copied byte-for-byte into a private alias; the new wrapper adds only separately verified cash evidence. It does not change the canonical pricer, materializer, Stripe/group/Terminal finance logic, paid release function or number allocator.

Private, RLS-enabled tables hold cash quote provenance, immutable tender/attestation records and immutable unused-quote closure records. API roles have no direct table or private helper access. The four public cash RPCs are executable only by the existing server role. Current Auth and scoped permission checks occur inside those RPCs. A short shared staff-access table lock also covers a concurrently inserted denial, while the Auth row and destination are locked and checked.

Attempt locks and the canonical quote row serialize confirmation, status and closure. Cash-designated quotes cannot be reused by the ordinary or shared/Terminal payment ledgers. A cash tender must agree with its canonical order, quoted amount, contact, recorded time, immutable staff audit and distinct cash reference before KDS authority is returned. Cancellation/refund status removes active kitchen authority; past tender records and number assignments remain intact.

Publish the compatible browser and receipt/bridge parsers before installing the cash SQL. The optional meal-components projection migration applies **after cash**, preserving this cash receipt lookup and label. Existing stored receipt payloads are not regenerated. The separate historical receipt archive extension does not alter the cash functions.

## Verification

`tests/mealdeck-cash-orders.test.ts` exercises the real HTTP handler's staff/origin/scope checks, mandatory contact, immutable quote echo, server-only authority, canonical errors, response-loss semantics and close-unused protocol. `tests/postgres/staff-cash-orders-behavior.mjs` runs the actual migrations and cash lifecycle in PostgreSQL/PGlite, including old payment preservation, private ACLs, current stock/price/kitchen gates, replay/rollback, closure, numbering, KDS and original receipt creation. Its native mode additionally runs real multi-session lock races for duplicate confirmation, status versus commit/rollback, both close/confirm orderings, and newly inserted staff denial.

```sh
bun test tests/mealdeck-cash-orders.test.ts
node tests/postgres/staff-cash-orders-behavior.mjs
MEALDECK_KDS_TEST_DATABASE_URL='<explicit empty localhost test database>' \
  node tests/postgres/staff-cash-orders-behavior.mjs --native
```

The test harness refuses a non-local, nonempty or incorrectly named native database. These checks do not create a production cash payment or commission a physical printer.

Frozen source verification on 6 November: 13 PostgreSQL/PGlite behavior groups, 17 cash API/recovery tests with 136 assertions, full TypeScript and scoped lint passed. Five additional real multi-session groups are registered for the native PostgreSQL 17 release gate. The cash SQL SHA256 is `4576864ef1004b06dc5dcb319758bcc329637e068185291fae8579b347c395c9`.

After each installation step, run `deploy/mealdeck/operations/20261106_verify_cash_and_meal.sql` through an authorized database-owner connection. The query returns only metadata and aggregate counts. It checks exact function definitions and grants, private RLS tables, immutable guards, the paid numbering trigger, receipt composition and inconsistent cash records. The exact query was exercised against disposable databases after cash and after cash plus meal components. It does not create a cash transaction or mark a receipt printed. Production rollout is recorded separately in the deployment status.
