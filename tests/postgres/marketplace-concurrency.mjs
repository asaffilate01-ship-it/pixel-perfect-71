import assert from "node:assert/strict";
import pg from "pg";
import { asActor } from "./harness.mjs";

/** Requires the harness's explicitly guarded, disposable localhost database. */
export async function marketplaceConcurrencyTests(db, f) {
  if (!db.native) return;
  const clients = await Promise.all(
    [1, 2, 3].map(async () => {
      const client = new pg.Client(db.config);
      await client.connect();
      return client;
    }),
  );
  const wrappers = clients.map((client) => ({
    query: (...args) => client.query(...args),
    exec: (sql) => client.query(sql),
  }));
  const scalar = async (client, sql, args) =>
    Object.values((await client.query(sql, args)).rows[0])[0];
  const staff = (n, orderId, version) =>
    asActor(wrappers[n], f.owner, () =>
      scalar(
        clients[n],
        "select public.mealdeck_ops_marketplace_transition($1,$2,$3,$4,'accept',null,null,null)",
        [f.tenantId, f.locationId, orderId, version],
      ),
    );
  const claim = (n, c) =>
    asActor(
      wrappers[n],
      null,
      () =>
        scalar(
          clients[n],
          "select public.mealdeck_marketplace_bridge($1,$2,$3,$4,'claim',$5::jsonb)",
          [
            f.tenantId,
            f.locationId,
            c.connectorId,
            c.tokenHash,
            JSON.stringify({ evidence: c.evidence }),
          ],
        ),
      "service_role",
    );
  const waitForLock = async (pid) => {
    const deadline = Date.now() + 2_000;
    while (Date.now() < deadline) {
      const waiting = await f.scalar(
        "select wait_event_type='Lock' from pg_stat_activity where pid=$1",
        [pid],
      );
      if (waiting) return;
      await new Promise((resolve) => setTimeout(resolve, 10));
    }
    throw new Error("Expected the independent worker session to wait on the connector row lock");
  };
  try {
    const c = await f.provision("uber_eats", { externalStoreId: "fixture-concurrent-store" });
    await f.commission(c);
    await f.heartbeat(c);
    const observation = await f.observation(c, {
      externalOrderId: "concurrent-order",
      displayReference: "0RACE",
    });
    const { orderId } = await f.observe(c, observation);
    const version = (await f.card(orderId)).version;
    const accepted = await Promise.all([staff(0, orderId, version), staff(1, orderId, version)]);
    assert.equal(accepted.filter((r) => !r.replayed).length, 1);
    assert.equal(
      await f.scalar(
        "select count(*)::int from mealdeck_private.marketplace_commands where order_id=$1",
        [orderId],
      ),
      1,
    );
    assert.equal(
      await f.scalar(
        "select count(*)::int from public.mealdeck_ops_audit_log where entity_id=$1 and action='marketplace.kitchen.accept'",
        [orderId],
      ),
      1,
    );
    console.log(
      "PASS marketplaces native race: simultaneous acceptance creates one command and audit",
    );

    const claims = await Promise.all([claim(0, c), claim(1, c)]);
    const commands = claims.flatMap((r) => (r.command ? [r.command] : []));
    assert.equal(commands.length, 1);
    assert.equal(commands[0].mode, "execute");
    console.log("PASS marketplaces native race: simultaneous claims produce one execute lease");
    await db.query(
      "update mealdeck_private.marketplace_commands set lease_expires_at=now()-interval '1 second' where id=$1",
      [commands[0].commandId],
    );
    const recovery = (await Promise.all([claim(0, c), claim(1, c)])).flatMap((r) =>
      r.command ? [r.command] : [],
    );
    assert.equal(recovery.length, 1);
    assert.equal(recovery[0].mode, "reconcile");
    assert.equal(recovery[0].commandId, commands[0].commandId);
    console.log(
      "PASS marketplaces native race: expired dispatch receives one reconciliation-only lease",
    );

    // Hold the mutation uncommitted so the claim starts with the old snapshot,
    // then prove PostgreSQL's lock recheck observes the disabled connector.
    const blocker = clients[2];
    await blocker.query("begin");
    await blocker.query(
      "update mealdeck_private.marketplace_connectors set enabled=false where id=$1",
      [c.connectorId],
    );
    const pending = claim(0, c).then(
      (value) => ({ value }),
      (error) => ({ error }),
    );
    await waitForLock(clients[0].processID);
    await blocker.query("commit");
    const revoked = await pending;
    assert.match(revoked.error?.message ?? "", /unauthorized/);
    assert.equal(revoked.value, undefined);
    console.log("PASS marketplaces native race: a blocked claim rechecks connector revocation");

    await f.commission(c);
    await f.heartbeat(c);
    await blocker.query("begin");
    await blocker.query(
      "update mealdeck_private.marketplace_connectors set token_hash=$2 where id=$1",
      [c.connectorId, "f".repeat(64)],
    );
    const rotatedPending = claim(1, c).then(
      (value) => ({ value }),
      (error) => ({ error }),
    );
    await waitForLock(clients[1].processID);
    await blocker.query("commit");
    assert.match((await rotatedPending).error?.message ?? "", /unauthorized/);
    console.log("PASS marketplaces native race: a blocked claim cannot use a rotated credential");
  } finally {
    await Promise.all(
      clients.map(async (client) => {
        try {
          await client.query("rollback");
        } finally {
          await client.end();
        }
      }),
    );
  }
}
