# Marketplace connectors — staged reconciliation

Source: PR #126 (`0fbf043c3d425c8f2d8bf72515c1aeed6646b199`), compared against current main `e790d4dfea87c5d57c38c150a1d8fbf4b03b866d` on 27 November 2026.

The older branch contains 63 changed files and is 881 commits behind the inspected main branch. Its previous verification applies to that older revision, not to today's KDS. Do not merge its entire tree or overwrite current checkout, kitchen, staff, driver, receipt or payment authority. This first step ports 29 standalone package files from the original branch, replaces the live CLI with a disabled-only configuration checker, and adds a separate fixture gate. All merchant actions remain synthetic; no API route, database operation, provider login or live deployment is added.

## Reconciliation order
| Gate | Required work | Status |
| --- | --- | --- |
| A — transport lab | Exact original local transport fixtures, two independent device sessions, journal recovery, disabled CLI and offline demo on today's main ancestry | Source port; new CI pending |
| B — database review | Compare old marketplace ledger, scoped RLS, command leases, KDS projection and role checks against the independent MealDeck schema and current verified-payment/receipt guards | Not ported |
| C — API contract | Review and port scoped machine-only endpoint, no public secrets; reproduce exact identity and readback, reject cross-store references and unsafe actions | Not ported |
| D — KDS UX | Adapt badges, exact marketplace reference and confirmed source state to current mobile/tablet/desktop kitchen views; preserve meal components, packing, order notes, driver and printer changes | Not ported |
| E — real provider/device approval | Confirm permitted integrations, authorised merchant access, actual store mapping, device/app version, supported controls, stable order IDs and complete food/options | Not commissioned |
| F — controlled operation | Disposable/approved end-to-end integration, observe-only with complete readback before any permitted mutation; manual fallback, privacy and rollback review | Not commissioned |

Platform acceptance and status changes require their actual confirmed readback; merchant handover must never be represented as a completed customer delivery. Marketplace payment responsibility does not create a direct MealDeck Stripe payment or a paid-order proof. No use of inaccessible interfaces or bypass of platform/device-management restrictions. Prefer supported partner APIs wherever available. Do not add live automation or provider credentials through this fixture-only release.

## Review evidence
The legacy PR documents prior synthetic tests and owner device observations. Actual current runtime, permissions and device evidence must be established separately. Existing main KDS and payment files are not modified by this port. The old PR remains outstanding until the remaining changes are reconciled and tested; a green fixture run alone is not sufficient for production operation.
