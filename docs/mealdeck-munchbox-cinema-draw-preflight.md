# Munchbox cinema draw — private reconciliation preflight (not activated)

The approved banner component has been merged. Scheduled public presentation is tracked separately; the campaign must remain disabled until operational approval. This operator kit does not publish the campaign, change prices, alter orders, add a customer endpoint, or send messages.

## Owner decisions still required
Confirm the ticket is purchased/transferable and admission age conditions, the exact canonical Munchbox SKUs, one entry per verified member, eligible direct website checkout only, refund/dispute treatment, and the 24-hour response window. Terms must be published before advertising begins on 2 December 2026 at 21:00 GMT. That teaser does not qualify purchases. The paid entry window is 3 December at 00:00 GMT inclusive until 7 December at 00:00 GMT exclusive (3–6 December inclusive). Proposed draw on 7 December. The film name is descriptive; do not use third-party branding without permission. Filming is optional with separate consent.

## Preflight (restricted database owner only)
The checked-in launch catalogue does not currently identify a Munchbox SKU. Obtain the exact live SKU IDs from the verified MealDeck catalogue and reconcile the product identity against the menu. No substring name matches or invented SKUs. Confirm the independent installation UUID, Luton shared-kitchen location UUID and live Stripe account. Confirm that the eligibility rule covers every advertised purchase channel; the current query intentionally excludes guest, WhatsApp, group, terminal, cash and aggregator orders. Confirm latest payment/refund/dispute records before exporting. This is an operational SQL draft pending review and disposable PostgreSQL integration testing; it must not be run on a live database until reviewed.

Run the read-only export with psql only after 7 December, with approved values supplied using psql variables: installation_id, location_id, stripe_account, eligible_skus (JSON array). Use a private owner connection and a securely stored output JSON, not a public API, chat, GitHub commit or application log. Check ready=true, exact eligible SKUs and count; reconcile sampled order evidence. Zero entrants is not a successful draw. The export deliberately contains only member UUID and qualifying order UUIDs; no names, email, phone or payment references. One member is grouped once regardless of quantity or number of purchases.

## Draw
After final reconciliation, call createCinemaDraw with the frozen reviewed snapshot in a restricted Node/Bun operator environment. The library uses node:crypto randomInt and a uniform shuffle; preserve the original snapshot, hash, ranking and event ledger in restricted durable storage and have an independent observer/witness verify the procedure. Never regenerate the ranking to change the winner. The initial candidate is ranking[0]; replacements advance to the next ranked member. The new owner-only ledger utility persists the frozen snapshot, ranking and event history, rejects a second initialization in the designated directory, validates the full event history on every operation and rejects stale operator writes. It does not authenticate the export or send messages; retain the independently witnessed genesis digest and the latest state digest outside the ledger.

Before contacting each selected candidate, recheck current eligibility, including refunds/disputes, through authorised order records. Only the selected member's telephone number is retrieved through existing authorised staff processes. Record each genuine contact attempt; the 24-hour clock starts with the first contact attempt. The helper requires two attempts and 24 hours before a no-response replacement. A declined or demonstrably ineligible member may be replaced with a recorded reason. Claim acknowledgement closes the draw; arrange collection and separately obtain any filming consent. Do not impose marketing consent as a condition. Retain evidence under a defined retention schedule and restrict access.

## Verification and deployment
Run bun test tests/mealdeck-munchbox-cinema-draw.test.ts using synthetic data. The library and export are preflight only: the real SQL schema and exact SKU/channel coverage, privacy/terms, prize and audit persistence must be verified before enabling the public banner. No live DB or customer data was accessed or changed.


## Restricted operator ledger
Use one owner-approved, backed-up directory **outside the Git repository** on a private local POSIX filesystem; permissions must be 0700 for the directory and 0600 for the snapshot and ledger files. Do not put the directory in a public or cloud-synchronised folder. Do not use separate copies to draw again. The code uses an exclusive lock and atomic file replacement, and fails if an initial ledger already exists. It is not a database service, hosted dashboard or tamper-proof evidence store.

After the promotion closes and the authorised read-only export has been independently checked, use the following operator commands. Replace placeholders privately; never paste entrant IDs into a repository or a public chat.

```sh
node deploy/mealdeck/munchbox-cinema-ledger.mjs init /private/draw-directory /private/reviewed-snapshot.json
node deploy/mealdeck/munchbox-cinema-ledger.mjs status /private/draw-directory GENESIS_DIGEST
node deploy/mealdeck/munchbox-cinema-ledger.mjs candidate /private/draw-directory GENESIS_DIGEST
node deploy/mealdeck/munchbox-cinema-ledger.mjs contact /private/draw-directory GENESIS_DIGEST CURRENT_LEDGER_DIGEST
node deploy/mealdeck/munchbox-cinema-ledger.mjs claim /private/draw-directory GENESIS_DIGEST CURRENT_LEDGER_DIGEST
node deploy/mealdeck/munchbox-cinema-ledger.mjs replace /private/draw-directory GENESIS_DIGEST CURRENT_LEDGER_DIGEST no-response
```

- Init is the only command that generates the random ranking. A witness should retain its genesis digest in separate restricted evidence, and record the current ledger digest after each change. These digests detect changed evidence against the witnessed copy, not deliberate collusion or a privileged filesystem administrator.
- Status shows only the campaign, number of entrants, candidate number, state, deadlines and digests, not any member IDs or contact details. Candidate returns the selected member and qualifying order IDs for private authorised verification. Never capture candidate output in a public log.
- Contact means an actual documented notification attempt, not an intention to contact. The 24-hour clock starts on the first contact. Duplicate timestamps are rejected, and a first contact must allow the complete response window before the screening. At least two distinct attempts are required before a no-response replacement, after the full 24 hours. No claim is recorded without prior contact.
- Replace accepts no-response, declined or ineligible; decline/ineligibility require genuine documented evidence retained privately. Before every contact and award, recheck the current order/member evidence. Do not redraw or change the frozen ranking. Claim ends candidate selection; collection and filming consent are separate.
- Every mutation requires the last observed ledger digest. If a lock remains after a crash, stop and inspect the process and files with the authorised operator. Never automatically clear it or retry an uncertain selection. If a command reports an I/O error, inspect the existing durable state before any retry.
- Tests use synthetic IDs and a disposable private directory. No real winner has been selected. Production export SQL still needs disposable database validation and verified live scope/terms before use.

### Export validation
The exact SKU allowlist must be a JSON array of distinct, nonempty canonical strings; numbers, nested objects, duplicates, surrounding whitespace, missing IDs or an unrelated installation fail closed. The owner export is available only after entries close and before the screening. Eligibility uses the stored server-verified `paid_at` timestamp, not the browser clock or an unverified provider timestamp. Agree how delayed provider confirmation around midnight is handled in the published terms. The disposable test below executes the read-only selection against the real independent fixture tables with synthetic IDs and a fixed test-only clock. It must pass before running the operation against real orders.
