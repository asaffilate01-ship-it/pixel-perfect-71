# Marketplace database contract

This is an additive upgrade for MealDeck’s independent database. It implements the owned Uber Eats and Just Eat order ledger, kitchen projection and command queue. It does not commission a browser or Sunmi device. No live connector, credential, marketplace order or platform action is created by installation.

The main setup and adapter guide is [mealdeck-marketplace-connectors.md](mealdeck-marketplace-connectors.md).

## Installation boundary

The source is `deploy/mealdeck/post-install-migrations/20261107114103_mealdeck_marketplace_connectors.sql`. Supabase CLI 3.0.0 generated its filename. `deploy/mealdeck/marketplace-connectors.mjs` reads the exact source without contacting a database.

Install it only into the explicitly selected independent MealDeck project, after the paid order number and current KDS extensions. It rejects the historical Dishbee profile and an unexpected existing KDS workflow definition. Existing direct checkout, Stripe/cash authority, acceptance, item readiness, receipt creation and handover functions retain their definitions and grants. The existing workflow-board function is retained privately and called by an additive wrapper.

The default SQL owns one transaction. An interface that already owns a single atomic migration transaction must use `buildManagedMarketplaceConnectorsSql({ runnerOwnsTransaction: true, singleMigration: true })` and submit its entire result in one request. This removes only the reviewed outer `begin;`/`commit;` lines. Do not split the migration or replay the fresh-project bootstrap against a populated project. Reapplying this upgrade after installation deliberately fails its original-definition guard.

## Separate platform order authority

`public.orders` continues to mean direct MealDeck orders. Marketplace orders live in private tables:

| Table                      | Purpose                                                                                                                                            |
| -------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| `marketplace_connectors`   | One exact marketplace store, kitchen/station, optional existing brand, credential hash, verified UI profile and explicit capabilities.             |
| `marketplace_orders`       | Stable external order ID, exact display reference, frozen commercial/food snapshot, last confirmed platform state and separate kitchen timestamps. |
| `marketplace_order_items`  | Every imported line, its exact purchased quantity and modifiers, known or unknown source unit price, and local readiness.                          |
| `marketplace_observations` | Initial and changed observations with profile identity. Unchanged successful or conflicting polls do not add another full snapshot.                |
| `marketplace_commands`     | Staff intentions, stable command identity, one execute lease, readback evidence and reconciliation state.                                          |

Every table has RLS enabled and direct privileges revoked from `PUBLIC`, `anon`, `authenticated` and `service_role`. Private helper and provisioning functions are also inaccessible to those roles. Only reviewed public RPCs have explicit grants.

An imported order needs an enabled, commissioned, store-scoped connector and exact profile evidence. Its `paymentResponsibility: "platform"` must come from the verified merchant interface. Unknown or cash-payment observations are rejected. This records platform-managed order authority; it does not invent Stripe capture or bank settlement evidence.

The original platform total and line prices are retained in integer pence. A missing unit price remains null. The import does not infer a line price from the total, recompute fees or apply MealDeck promotions. A store maps explicitly to one shared-kitchen station, with an optional trusted brand identity; product names are never used to guess canonical MealDeck SKUs.

Marketplace imports do not create a direct customer account, checkout session, second charge, sequential MealDeck order number, collection-code credential, loyalty award, stock movement, courier booking or ordinary MealDeck receipt job. Those additional domains need their own explicit reviewed mapping. The KDS ticket itself is complete and keeps the original marketplace reference.

## Provision and commission a real store

Only a privileged operator in the verified independent database can call the following private functions. Substitute actual reviewed identifiers; these examples are not executable merchant configuration.

```sql
select mealdeck_private.marketplace_provision_connector(
  p_tenant             => '<actual MealDeck tenant UUID>'::uuid,
  p_location           => '<actual kitchen UUID>'::uuid,
  p_platform           => 'uber_eats', -- or 'just_eat'
  p_external_store_id  => '<exact merchant UI store identity>',
  p_label              => '<recognisable store label>',
  p_station            => '<actual shared kitchen station UUID>'::uuid,
  p_brand              => null, -- or an existing brand of this tenant
  p_token_hash         => '<SHA-256 of a new high-entropy connector token>',
  p_profile_id         => '<reviewed profile identifier>',
  p_profile_version    => '<reviewed profile version>',
  p_capabilities       => '{"accept":false,"preparing":false,"ready":false,"handover":false}'::jsonb
);
```

This creates a **disabled** connector. Use an independent random token for each connector. The worker gets only its own token; it never receives the database service key. Keep raw tokens, browser sessions, OTPs and device credentials out of source, logs and SQL reports. The server hashes the presented token before calling the bridge RPC.

Commissioning requires an authorized merchant access arrangement, the actual device/browser profile, stable store/order identities, all-items capture, observed status semantics and readback tests. Use only capabilities demonstrated by the actual merchant interface. A generic Appium installation, accessibility tree or successful browser login does not establish those facts.

```sql
select mealdeck_private.marketplace_commission_connector(
  '<returned connector UUID>'::uuid,
  '<record of permitted merchant access>',
  '<record of actual profile and device acceptance>'
);
```

The database records this explicit operator decision and resets heartbeat health. It does not independently prove that a physical device test occurred. The separate application runtime switches and worker configuration must also be correct before any request can pass.

The immutable platform/store/tenant/location binding prevents a connector being repurposed for another merchant. A station/brand cannot be changed once the connector has imported an order. Profile or capability changes require disabling it, clearing its commissioning record, reviewing the changed configuration and commissioning again. Token rotation updates only the hash; an old token cannot claim new work. Setting `enabled=false` stops bridge traffic without erasing existing kitchen work or evidence.

## Bridge RPC

Only `service_role` may execute:

```text
mealdeck_marketplace_bridge(
  p_tenant uuid, p_location uuid, p_connector uuid,
  p_token_hash text, p_operation text, p_payload jsonb
) → jsonb
```

The HTTP server supplies its trusted tenant/location, not client-selected scope. Every request supplies `payload.evidence` with the commissioned `profileId` and `profileVersion`. The database checks the exact connector, credential, scope, enabled status and profile again under a row lock.

| Operation   | Behaviour                                                                                                                                                                                |
| ----------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `heartbeat` | Records healthy/degraded status, bounded fixed error code and observed time. Claimed capabilities must match configuration. A recent healthy heartbeat is required for an execute claim. |
| `observe`   | Validates and normalizes a complete source order. Deduplicates by connector plus stable external order ID. Preserves letters, punctuation and leading zeroes in the display reference.   |
| `claim`     | Returns at most one command for this connector. One unexpired lease blocks another writer. Earlier unresolved work for an order blocks its later commands.                               |
| `result`    | Accepts only the current command/lease. A confirmed result requires exact store, stable order ID and display reference plus an action-compatible fresh observed state.                   |

The bridge never chooses database order IDs or kitchen mappings. The reference shown to customers/couriers is not used as a globally unique key. Identical display references on different orders or stores do not merge them.

An order first seen as `handed_over` is retained privately with an explicit historical-import flag. It creates no active kitchen ticket, local Done entry, command or receipt, and staff cannot start cooking it. A later observation cannot reactivate it. For an already active kitchen order, a source handover observation updates the source state without inventing local checklist, packing or handover evidence. During commissioning, start from a reviewed merchant order list and reconcile in-flight orders; importing all merchant history is outside this bridge’s scope.

`observedAt` must be recent, and command readback must follow its lease. Keep the worker host clock synchronized. Timestamps and UUIDs are returned explicitly in JSON; no credential, internal token hash or raw configuration secret is returned.

## Kitchen flow and customer-facing status

The same staff KDS combines direct orders with the private marketplace projection. The active card retains a private MealDeck UUID for actions and a separate `marketplace.display_reference` for display and handover. Its legacy `display_code` is an ASCII placeholder and conveys no authority.

The dedicated staff mutation is:

```text
mealdeck_ops_marketplace_transition(
  p_tenant uuid, p_location uuid, p_order uuid,
  p_expected_version text, p_action text,
  p_item uuid = null, p_ready boolean = null, p_reference text = null
) → { ok, replayed, order_id, status, marketplace }
```

Every action rechecks the current verified staff identity, kitchen permission, mapping, order version and source state inside the transaction. One complete marketplace order remains one card.

| KDS action   | Local effect                                                                                                              | Platform effect                                                                                                                              |
| ------------ | ------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| `accept`     | Records staff acceptance once.                                                                                            | Queues Accept when available, or records an already observed acceptance. No preparation starts from an unconfirmed accept command.           |
| `preparing`  | Starts the kitchen order after platform acceptance is confirmed.                                                          | Sends a Preparing command only if the commissioned interface supports it. Otherwise the card explicitly reports the unsupported remote step. |
| `item_ready` | Changes one entire imported line’s readiness. All lines must be ready before packing.                                     | No platform Ready message.                                                                                                                   |
| `packing`    | Begins packing after every line is checked.                                                                               | No platform Ready message.                                                                                                                   |
| `sealed`     | Confirms packed food ready for handover.                                                                                  | Queues the supported Ready action.                                                                                                           |
| `handover`   | Requires sealed packing, all items ready and an exact original-reference check. Records local handover and moves to Done. | Queues a supported Handover action; it never invents customer delivery or a courier confirmation.                                            |

The local kitchen stage, last confirmed marketplace state and sync state are independent. The source platform controls its customer app. A local Done card can therefore still show **unsupported** or **needs checking** for the remote handover step. Unsupported native controls are never represented as successfully sent.

## Replay, ambiguity and interruption

A command receives at most one **execute** claim. If that lease expires, a new lease is **reconcile** only. The worker must read the merchant interface and may not click again. `not_applied` or `uncertain` holds the command for checking rather than automatically reissuing it. A later exact-order observation can confirm that the intended state was reached. Stable command IDs also let the worker keep a local durable dispatch journal.

An uncertain action result can still carry a valid, exact-order cancellation readback. The database records that cancellation immediately and stops further work; it does not turn the attempted action into a success. An older contradictory readback cannot mark a command confirmed against a newer source observation.

An old lease cannot report success after a newer reconciliation lease has been issued. Connector locking permits only one active writer per merchant surface. Orders retain their command sequence so a later Ready command does not bypass an unresolved Accept/Preparing command. Other orders on that connector may still proceed after a command is held for checking.

A changed item snapshot or a fresh platform-state regression preserves the original ticket and raises a visible hold. Cooking and packing mutations are blocked. The conflicting evidence is private and retained for human review; polling it repeatedly does not overwrite the food or append an unbounded duplicate archive. There is no automatic “accept the changed food” or “clear the hold” path.

A confirmed cancellation stops further commands and remains on the KDS until authorized staff acknowledge it:

```text
mealdeck_ops_marketplace_acknowledge_cancelled(
  p_tenant uuid, p_location uuid, p_order uuid, p_expected_version text
) → { ok: true, order_id, acknowledged: true, replayed }
```

Acknowledgement removes the active card and adds an audit record. It does not mark the meal handed over, place it in Done, cancel a payment, send a refund or click the marketplace. Cancellation may be acknowledged even if a changed-food hold is also present, since the operator is explicitly stopping work on the same verified external order.

## Connection diagnostics

`mealdeck_ops_marketplace_connections(p_tenant,p_location)` is a read-only owner/admin RPC. It requires current scoped finance read/manage permission and enrolled MFA. It returns the exact store mapping, profile, capability flags, last heartbeat, effective device health and unresolved-command count. It never returns raw tokens, token hashes, browser sessions, customer details or snapshot payloads.

“Bridge responding” means the last heartbeat was healthy and recent. It is distinct from a particular marketplace command’s confirmation or actual customer-app display.

## Verification

Run from the repository root:

```sh
node tests/postgres/marketplace-behavior.mjs
bun test tests/mealdeck-marketplace-http-postgres.test.ts
```

The first suite installs the actual additive SQL into a disposable PostgreSQL-compatible engine. It verifies atomic rollback, scoped credentials, disabled commissioning, unchanged direct authority, deduplication, exact references, nullable source prices, both platform lifecycles, independent capabilities, no early preparation, sealed-only Ready, exact handover reference, stale leases, reconcile-only recovery, immutable/conflicting evidence, cancellation acknowledgement, MFA diagnostics and revocation.

The HTTP roundtrip suite uses the real scoped server handler, database RPC, KDS parsers and worker command validators together. It does not contact an actual merchant interface.

For the five real concurrent-session races, point `MEALDECK_KDS_TEST_DATABASE_URL` at an **empty disposable localhost** database whose name begins `mealdeck_kds_test`, then run:

```sh
node tests/postgres/marketplace-behavior.mjs --native
```

The harness refuses other database hosts/names and nonempty databases. Native tests verify one command/audit under concurrent acceptance, one execute lease, one reconciliation lease after expiry, and row-lock rechecks for concurrent connector disable and credential rotation. Local source tests, native database execution, hosted installation, merchant-interface commissioning and real customer updates are separate evidence.
