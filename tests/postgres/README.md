# MealDeck KDS PostgreSQL verification

These tests execute the **real MealDeck operations and KDS migrations** in a
disposable PostgreSQL database. They do not call a hosted Supabase project,
authenticate real staff, create customer orders, or contact payment/delivery
providers.

## Fast embedded run

```sh
npm ci --prefix tests/postgres
npm test --prefix tests/postgres
```

The pinned PGlite dependency runs PostgreSQL **18.6** in memory. The complete SQL
behavior suite currently contains **28 check groups** and takes a few seconds.
The process closes and discards its database after the run. This exercises real
PL/pgSQL, privileges, roles, transactions and row-level security; it is not a
JavaScript mock of the new RPCs.

PGlite has one database connection. It cannot establish independent concurrent
transactions, so it deliberately prints that native locking tests were not run.
Its PostgreSQL version also differs from Dishbee's PostgreSQL 17 deployment.

## Native PostgreSQL 17 run, including concurrency

Use an **empty, disposable local database** named `mealdeck_kds_test` or
`mealdeck_kds_test_<suffix>`. The bootstrap needs a database owner that can create
the local `anon`, `authenticated` and `service_role` test roles. A fresh
PostgreSQL 17.6 CI service provides this without any production credentials.

```sh
MEALDECK_KDS_TEST_DATABASE_URL='postgresql://postgres:fixture-only@127.0.0.1:5432/mealdeck_kds_test' \
  npm run test:postgres --prefix tests/postgres
```

The runner rejects external hosts, URL query overrides, other database names
and nonempty databases. It never drops existing schemas or resets a database.
Create a new disposable database to rerun the native suite.

This runs the same 28 behavior groups plus six genuine **two-session** tests:

1. Two copies of the same Start order request serialize; the second returns a
   replay and creates no additional audit record.
2. A competing next-state request waits for the first order lock, then rejects
   its stale version without advancing any brand to ready.
3. A competing seal request cannot use the version from before another terminal
   began packing.
4. A canonical refund transaction that wins the order lock prevents a waiting
   kitchen action from advancing the order.
5. Staff access revoked while a kitchen request waits is checked again before
   that previously admitted request can write.
6. A route removed while a ready action waits prevents any brands being marked
   ready after the lock is released.

The tests check `pg_blocking_pids()` to prove the second session actually waited
on the first. They do not infer concurrency correctness from a delay alone.

## Behavioral coverage

- Anonymous, customer, wrong-tenant, wrong-location, viewer, disabled and
  explicitly denied staff cannot read or mutate outside their access.
- Revoking staff access takes effect on the next RPC, including when the client
  still holds a previously issued version.
- All five launch brands appear on one master-order card; Start and Mark ready
  advance the complete order atomically.
- Modifiers and kitchen notes remain visible. Structured customer contact,
  address, payment-reference and pricing data are omitted from the projection.
- Order/item notes longer than 500 characters and modifier names/labels longer
  than 200 characters keep their complete text, including the final instruction.
  Malformed or excessive instruction data rejects the whole board read and
  preparation/packing RPCs instead of returning an empty or partial success.
- Pending, refunded, cancelled, tab, unverified and other-merchant orders are
  held or excluded.
- A missing, malformed, volatile or client-executable release authority fails
  closed. A mutable paid flag alone is insufficient.
- Missing routes, absent ticket items, quantity mismatches and empty orders
  cannot become ready or packable. Missing-route food remains visible for review.
- Old versions cannot advance state; idempotent retries do not duplicate audits.
- An injected failure while updating the final brand rolls back the entire
  operation, including its audit record.
- The pass requires complete ready food, follows packing then sealing, and has
  no delivery, payment or dispatch authority.
- Group financial readiness requires included shares and any required host
  balance/delivery amount; the room must be the submitted room for that order.
- A queue of 251 orders exposes the oldest 250 and reports the remaining count.
- Existing canonical callback definitions and grants are left unchanged, and
  the new workspace exposes no standalone station mutation.

## Fixture scope and limits

`canonical-fixture.sql` defines only the canonical columns and constraints
needed by this workspace. Its provenance is recorded at the top of the file.
The existing `20261102191000_mealdeck_ops_core.sql` and the new KDS migration are
executed unchanged. The canonical `group_order_financial_ready()` implementation
is included unchanged from the reviewed Dishbee source.

Default fixture timestamps are generated by PostgreSQL, preserving its clock
and microsecond precision. JavaScript millisecond rounding must not make a test
release appear to predate the order. A deterministic boundary case still rejects
an attestation 456 microseconds before creation; the production chronology guard
is unchanged.

`installFixtureAuthority()` creates a **test-only** private release adapter over
synthetic evidence rows. That adapter is deliberately absent before the first
readiness test. It exercises the immutable-release consumer contract; it does
not implement or validate an Adyen webhook, payment capture, refund ledger or
production release writer. Never copy this adapter into a deployment migration.

Existing payment/release/legacy-station/dispatch callbacks are represented by
side-effect traps with preserved definitions and ACLs. The suite verifies that
the workspace neither rewrites nor invokes them. It does not claim to test those
separate canonical implementations, all historical Dishbee migrations/triggers,
Supabase Auth/JWT verification, Realtime transport, live devices or provider
replays. Those remain part of acceptance on the approved Dishbee staging system.

The default embedded run is available where a native non-root PostgreSQL server
cannot start. The native CI run supplies PostgreSQL 17 and independent-session
locking evidence; it still uses disposable fixture data and is not a production
go-live signal.
