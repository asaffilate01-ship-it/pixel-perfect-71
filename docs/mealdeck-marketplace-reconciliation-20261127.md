# Marketplace connectors — staged reconciliation

Source: PR #126 (`0fbf043c3d425c8f2d8bf72515c1aeed6646b199`), compared against current main `e790d4dfea87c5d57c38c150a1d8fbf4b03b866d` on 27 November 2026.

The older branch contains 63 changed files and is 881 commits behind the inspected main branch. Its previous verification applies to that older revision, not to today's KDS. Do not merge its entire tree or overwrite current checkout, kitchen, staff, driver, receipt or payment authority. This first step ports 29 standalone package files from the original branch, replaces the live CLI with a disabled-only configuration checker, and adds a separate fixture gate. All merchant actions remain synthetic; no API route, database operation, provider login or live deployment is added.

## Reconciliation order
| Gate | Required work | Status |
| --- | --- | --- |
| A — transport lab | Exact original local transport fixtures, two independent device sessions, journal recovery, disabled CLI and offline demo on today's main ancestry | Source port; new CI pending |
| B — database review | Compare old marketplace ledger, scoped RLS, command leases, KDS projection and role checks against the independent MealDeck schema and current verified-payment/receipt guards | Not ported |
| C — API contract | Review and port scoped machine-only endpoint, no public secrets; reproduce exact identity and readback, reject cross-store references and unsafe actions | Wire schemas and unmounted machine admission handler ported; database authorization and route not ported |
| D — KDS UX | Adapt badges, exact marketplace reference and confirmed source state to current mobile/tablet/desktop kitchen views; preserve meal components, packing, order notes, driver and printer changes | Not ported |
| E — real provider/device approval | Confirm permitted integrations, authorised merchant access, actual store mapping, device/app version, supported controls, stable order IDs and complete food/options | Not commissioned |
| F — controlled operation | Disposable/approved end-to-end integration, observe-only with complete readback before any permitted mutation; manual fallback, privacy and rollback review | Not commissioned |

Platform acceptance and status changes require their actual confirmed readback; merchant handover must never be represented as a completed customer delivery. Marketplace payment responsibility does not create a direct MealDeck Stripe payment or a paid-order proof. No use of inaccessible interfaces or bypass of platform/device-management restrictions. Prefer supported partner APIs wherever available. Do not add live automation or provider credentials through this fixture-only release.

## Review evidence
The legacy PR documents prior synthetic tests and owner device observations. Actual current runtime, permissions and device evidence must be established separately. Existing main KDS and payment files are not modified by this port. The old PR remains outstanding until the remaining changes are reconciled and tested; a green fixture run alone is not sufficient for production operation.

## 28 November — wire-contract reconciliation
Ported the standalone request/response schemas from PR #126, retaining strict envelopes, bounded complete order data, exact identities and lease IDs. A cancelled order is not a successful command confirmation. Added synthetic tests and wired them into the main verification job. These schemas are not connected to any live route or database operation and do not establish actual store ownership, timestamp freshness, payment, lease or action authority; those checks remain mandatory in the future reviewed server and database implementation.

## 28 November — operational status evidence
Ported the strict marketplace connection report contract without mounting an endpoint. A healthy response label now requires a recent, scoped report and heartbeat; unresolved actions take precedence. The owner/admin payment and email panel expires reports after 60 seconds. Printer recovery rejects unexpected local journal outcomes, and loyalty, financial dates and AI operational scopes receive additional input validation. These are source and presentation checks only; no marketplace command, real voucher, printer action, loyalty mutation or production payment is performed by this release.

## 28 November — machine admission boundary
Added an unmounted server handler accepting only explicit machine requests and a supplied, reviewed store implementation. It derives Luton scope from the dedicated MealDeck configuration, hashes credentials before store access, checks bounded payloads, observation freshness, profile readback, lease expiry and result correlation, and sanitizes all store errors. Nine synthetic regression groups are included. Neither a default privileged database client nor an API route is installed; enabling environment flags alone cannot activate it. Actual connector token verification, atomic store/tenant/lease binding, current database schema, merchant authorization and KDS integration remain separate release gates. A syntactically valid response is not proof of payment or successful merchant action.

## 28 November — read-only marketplace kitchen presentation
Added strict marketplace source, exact reference, sync and last-observed state projection plus a read-only responsive card for the future dedicated board. Cancelled, uncertain and queued orders never imply a successful merchant action; stale evidence is labelled as unverified. Existing direct active and Done parsers reject non-null marketplace markers until dedicated ledger/action routing is commissioned. The card is not mounted on a live board, and no direct KDS, driver or payment mutation is authorised by it. A mixed source response must be split by the reviewed server before rollout. Six new regression groups cover the projection/card and active/completed isolation.
