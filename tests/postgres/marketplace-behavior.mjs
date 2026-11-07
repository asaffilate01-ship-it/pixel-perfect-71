import assert from "node:assert/strict";
import { createDatabase, asActor } from "./harness.mjs";
import { setupMarketplaceFixture } from "./marketplace-fixture.mjs";
import {
  buildMarketplaceConnectorsSql,
  buildManagedMarketplaceConnectorsSql,
} from "../../deploy/mealdeck/marketplace-connectors.mjs";
import { marketplaceConcurrencyTests } from "./marketplace-concurrency.mjs";

const db = await createDatabase(process.argv.includes("--native"));
let checks = 0;
const check = async (label, fn) => {
  await fn();
  console.log(`PASS marketplaces ${++checks}: ${label}`);
};
try {
  const f = await setupMarketplaceFixture(db);
  const authority = () =>
    f.scalar(`select jsonb_agg(jsonb_build_array(p.oid::regprocedure::text,pg_get_functiondef(p.oid),p.proacl::text) order by p.oid)
    from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname in ('public','mealdeck_private','mealdeck_ops_private')
    and p.proname in ('kds_release_authority','release_paid_order','mealdeck_reconcile_stripe_event',
      'mealdeck_ops_kds_accept_order','mealdeck_ops_kds_transition_order','mealdeck_ops_kds_set_item_ready','mealdeck_ops_kds_complete_handoff')`);
  const originalAuthority = await authority();
  const managed = buildManagedMarketplaceConnectorsSql({
    runnerOwnsTransaction: true,
    singleMigration: true,
  });
  await check("additive installer is atomic and preserves previous direct authority", async () => {
    assert.throws(
      () => buildManagedMarketplaceConnectorsSql({ singleMigration: true }),
      /atomic transaction/,
    );
    await db.exec("begin");
    await db.exec(managed);
    await assert.rejects(() => db.exec("select 1/0"), /division by zero/);
    await db.exec("rollback");
    assert.equal(
      await f.scalar("select to_regclass('mealdeck_private.marketplace_orders')::text"),
      null,
    );
    await db.exec(buildMarketplaceConnectorsSql());
    assert.deepEqual(await authority(), originalAuthority);
  });

  const uber = await f.provision("uber_eats");
  const justEat = await f.provision("just_eat", {
    capabilities: { preparing: true, handover: true },
  });
  await check("connectors start disabled and require explicit private commissioning", async () => {
    await assert.rejects(() => f.heartbeat(uber), /unauthorized/);
    await assert.rejects(
      () =>
        asActor(db, f.owner, () =>
          db.query("select mealdeck_private.marketplace_commission_connector($1,'fake','fake')", [
            uber.connectorId,
          ]),
        ),
      /permission denied/,
    );
    await f.commission(uber);
    await f.commission(justEat);
    await f.heartbeat(uber);
    await f.heartbeat(justEat);
  });
  await check(
    "connector scope, token, profile and service role are independently checked",
    async () => {
      await assert.rejects(
        () => f.bridge(uber, "claim", {}, { tokenHash: "d".repeat(64) }),
        /unauthorized/,
      );
      await assert.rejects(
        () => f.bridge(uber, "claim", {}, { tenantId: f.id(888) }),
        /unauthorized/,
      );
      await assert.rejects(
        () =>
          f.bridge(uber, "claim", {
            evidence: { profileId: "wrong", profileVersion: "fixture-v1" },
          }),
        /profile_mismatch/,
      );
      await assert.rejects(
        () => f.bridge(uber, "claim", {}, { role: "authenticated", actor: f.owner }),
        /permission denied/,
      );
      await assert.rejects(
        () =>
          asActor(
            db,
            null,
            () => db.query("select * from mealdeck_private.marketplace_orders"),
            "service_role",
          ),
        /permission denied/,
      );
      assert.equal(
        await f.scalar(
          "select bool_and(relrowsecurity) from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='mealdeck_private' and c.relname like 'marketplace_%' and c.relkind='r'",
        ),
        true,
      );
    },
  );

  const u = await f.observation(uber);
  const j = await f.observation(justEat, {
    displayReference: "000012345",
    externalOrderId: "fixture-external-order-1",
  });
  let uId, jId;
  await check(
    "both platforms import complete immutable lines and preserve original references",
    async () => {
      uId = (await f.observe(uber, u)).orderId;
      jId = (await f.observe(justEat, j)).orderId;
      assert.notEqual(uId, jId, "platform/store identities must not collide");
      const c = await f.card(uId);
      assert.equal(c.marketplace.platform, "uber_eats");
      assert.equal(c.marketplace.display_reference, "00AB9");
      assert.equal((await f.card(jId)).marketplace.display_reference, "000012345");
      assert.equal(c.order_number, null);
      assert.equal(c.accepted_at, null);
      assert.equal(c.items.length, 2);
      assert.equal(c.items[0].unit_pence, 699);
      assert.equal(c.items[1].unit_pence, null);
      assert.deepEqual(c.items[0].modifiers, ["No cheese", "2 × Extra sauce"]);
      assert.equal(
        await f.scalar("select total_pence from mealdeck_private.marketplace_orders where id=$1", [
          uId,
        ]),
        1735,
      );
      assert.equal(await f.scalar("select count(*)::int from public.orders"), 0);
      assert.equal(await f.scalar("select count(*)::int from mealdeck_private.receipt_jobs"), 0);
    },
  );
  await check("replayed reads deduplicate without stale versions or added receipts", async () => {
    const version = (await f.card(uId)).version;
    const second = await f.observe(uber, u, { observedAt: await f.now() });
    assert.equal(second.replayed, true);
    assert.equal(second.orderId, uId);
    assert.equal((await f.card(uId)).version, version);
    assert.equal(
      await f.scalar(
        "select count(*)::int from mealdeck_private.marketplace_order_items where order_id=$1",
        [uId],
      ),
      2,
    );
    await assert.rejects(
      () => f.observe(uber, u, { externalStoreId: justEat.externalStoreId }),
      /identity_mismatch/,
    );
    await assert.rejects(
      () => f.observe(uber, u, { paymentResponsibility: "cash" }),
      /invalid_observation/,
    );
    await assert.rejects(
      () => f.observe(uber, u, { items: [u.items[0], u.items[0]] }),
      /invalid_observation/,
    );
    await assert.rejects(() => f.observe(uber, u, { totalPence: -1 }), /invalid_observation/);
  });
  await check(
    "already collected imports are retained privately without creating kitchen work",
    async () => {
      const historical = await f.observation(uber, {
        externalOrderId: "already-collected",
        displayReference: "0PAST",
        state: "handed_over",
      });
      const imported = await f.observe(uber, historical);
      assert.equal(imported.held, true);
      const replay = await f.observe(uber, historical, { observedAt: await f.now() });
      assert.equal(replay.orderId, imported.orderId);
      assert.equal(replay.replayed, true);
      assert.equal(await f.card(imported.orderId), undefined);
      assert.equal(
        (await f.board()).completed_orders.some((o) => o.order_id === imported.orderId),
        false,
      );
      await assert.rejects(() => f.action(imported.orderId, "accept"), /already_handed_over/);
      await f.observe(uber, historical, { state: "cancelled", observedAt: await f.now() });
      assert.equal(await f.card(imported.orderId), undefined);
      assert.equal(
        await f.scalar(
          "select count(*)::int from mealdeck_private.marketplace_commands where order_id=$1",
          [imported.orderId],
        ),
        0,
      );
      assert.equal(await f.scalar("select count(*)::int from mealdeck_private.receipt_jobs"), 0);
    },
  );
  await check("only scoped kitchen staff may mutate and stale versions fail", async () => {
    await assert.rejects(() => f.action(uId, "accept", { actor: f.customer }), /forbidden/);
    await assert.rejects(() => f.action(uId, "accept", { version: "f".repeat(32) }), /conflict/);
    await assert.rejects(() => f.action(uId, "accept", { locationId: f.id(990) }), /forbidden/);
  });

  let accept;
  await check(
    "local acceptance queues once and cannot start cooking before platform confirmation",
    async () => {
      const before = (await f.card(uId)).version;
      const accepted = await f.action(uId, "accept");
      assert.equal(accepted.marketplace.sync_state, "queued");
      assert.equal((await f.action(uId, "accept", { version: before })).replayed, true);
      await assert.rejects(() => f.action(uId, "preparing"), /accept_confirmation_required/);
      accept = (await f.bridge(uber, "claim", {})).command;
      assert.equal(accept.mode, "execute");
      assert.equal(accept.action, "accept");
      assert.equal(accept.externalOrderId, u.externalOrderId);
      assert.equal(accept.displayReference, u.displayReference);
      assert.equal((await f.bridge(uber, "claim", {})).command, null);
      assert.equal(
        await f.scalar(
          "select count(*)::int from mealdeck_private.marketplace_commands where order_id=$1",
          [uId],
        ),
        1,
      );
    },
  );
  await check("readback must match exact order, lease, action and timestamp", async () => {
    await assert.rejects(
      () => f.result(uber, accept, u, { externalOrderId: "another-order" }),
      /identity_mismatch/,
    );
    await assert.rejects(
      () => f.result(uber, accept, u, { leaseToken: f.id(998) }),
      /lease_conflict/,
    );
    await assert.rejects(
      () => f.result(uber, accept, u, { observedState: "new" }),
      /invalid_confirmation/,
    );
    await assert.rejects(
      () => f.result(uber, accept, u, { observedAt: "2020-01-01T00:00:00Z" }),
      /invalid_confirmation/,
    );
    const confirmed = await f.result(uber, accept, u);
    assert.equal(confirmed.status, "confirmed");
    assert.equal((await f.card(uId)).marketplace.platform_state, "accepted");
    assert.equal((await f.result(uber, accept, u)).status, "confirmed");
  });
  await check(
    "unsupported preparing is local and all food must be checked before packing",
    async () => {
      const prepared = await f.action(uId, "preparing");
      assert.equal(prepared.marketplace.sync_state, "unsupported");
      assert.equal((await f.bridge(uber, "claim", {})).command, null);
      await assert.rejects(() => f.action(uId, "packing"), /all_items_required/);
      const items = (await f.card(uId)).items;
      await f.action(uId, "item_ready", { item: items[0].order_item_id, ready: true });
      await assert.rejects(() => f.action(uId, "packing"), /all_items_required/);
      await f.action(uId, "item_ready", { item: items[1].order_item_id, ready: true });
      assert.equal((await f.card(uId)).pass.status, "ready_to_pack");
      assert.equal(
        (await f.bridge(uber, "claim", {})).command,
        null,
        "ready to pack is not platform ready",
      );
      await f.action(uId, "packing");
      await assert.rejects(
        () => f.action(uId, "item_ready", { item: items[0].order_item_id, ready: false }),
        /packing_locked/,
      );
    },
  );

  let ready;
  await check(
    "only sealed packing queues ready and expired dispatch is reconcile-only",
    async () => {
      await f.action(uId, "sealed");
      ready = (await f.bridge(uber, "claim", {})).command;
      assert.equal(ready.action, "ready");
      assert.equal(ready.mode, "execute");
      await db.query(
        "update mealdeck_private.marketplace_commands set lease_expires_at=now()-interval '1 second' where id=$1",
        [ready.commandId],
      );
      const reconciliation = (await f.bridge(uber, "claim", {})).command;
      assert.equal(reconciliation.mode, "reconcile");
      assert.equal(reconciliation.commandId, ready.commandId);
      assert.notEqual(reconciliation.leaseToken, ready.leaseToken);
      await assert.rejects(() => f.result(uber, ready, u), /lease_conflict/);
      ready = reconciliation;
      const result = await f.result(uber, ready, u, {
        outcome: "not_applied",
        observedState: "accepted",
      });
      assert.equal(result.status, "needs_checking");
      assert.equal(
        (await f.bridge(uber, "claim", {})).command,
        null,
        "uncertain action is not blindly clicked again",
      );
      await f.observe(uber, u, { state: "ready", observedAt: await f.now() });
      assert.equal((await f.card(uId)).marketplace.platform_state, "ready");
    },
  );
  await check(
    "handover checks the original exact reference and local Done is not delivered",
    async () => {
      await assert.rejects(
        () => f.action(uId, "handover", { reference: "00ab9" }),
        /reference_mismatch/,
      );
      await assert.rejects(
        () => f.action(uId, "handover", { reference: "AB9" }),
        /reference_mismatch/,
      );
      await f.action(uId, "handover", { reference: "00AB9" });
      assert.equal(await f.card(uId), undefined);
      const done = (await f.board()).completed_orders.find((c) => c.order_id === uId);
      assert.equal(done.marketplace.platform_state, "ready");
      assert.equal(done.marketplace.sync_state, "unsupported");
      assert.equal(done.items.length, 2);
      assert.equal(done.marketplace.display_reference, "00AB9");
      assert.equal((await f.action(uId, "handover", { reference: "00AB9" })).replayed, true);
    },
  );
  await check("Just Eat supports its independently commissioned action set", async () => {
    await f.action(jId, "accept");
    const claimed = (await f.bridge(justEat, "claim", {})).command;
    await f.result(justEat, claimed, j);
    await f.action(jId, "preparing");
    const preparing = (await f.bridge(justEat, "claim", {})).command;
    assert.equal(preparing.action, "preparing");
    await f.result(justEat, preparing, j);
    for (const item of (await f.card(jId)).items)
      await f.action(jId, "item_ready", { item: item.order_item_id, ready: true });
    await f.action(jId, "packing");
    await f.action(jId, "sealed");
    const ready = (await f.bridge(justEat, "claim", {})).command;
    await f.result(justEat, ready, j);
    await f.action(jId, "handover", { reference: "000012345" });
    const handed = (await f.bridge(justEat, "claim", {})).command;
    assert.equal(handed.action, "handover");
    await f.result(justEat, handed, j);
    assert.equal(
      (await f.board()).completed_orders.find((c) => c.order_id === jId).marketplace.platform_state,
      "handed_over",
    );
  });
  await check("an older ready readback cannot override a newer accepted observation", async () => {
    const order = await f.observation(uber, {
      externalOrderId: "out-of-order-readback",
      displayReference: "0TIME",
      state: "accepted",
    });
    const { orderId } = await f.observe(uber, order);
    await f.action(orderId, "accept");
    await f.action(orderId, "preparing");
    for (const item of (await f.card(orderId)).items)
      await f.action(orderId, "item_ready", { item: item.order_item_id, ready: true });
    await f.action(orderId, "packing");
    await f.action(orderId, "sealed");
    const command = (await f.bridge(uber, "claim", {})).command;
    assert.equal(command.action, "ready");
    const olderReadback = await f.now();
    const newerObservation = await f.scalar(
      "select mealdeck_private.marketplace_timestamp($1::timestamptz+interval '1 millisecond')",
      [olderReadback],
    );
    await f.observe(uber, order, { observedAt: newerObservation });
    const outcome = await f.result(uber, command, order, {
      observedState: "ready",
      observedAt: olderReadback,
    });
    assert.equal(outcome.status, "needs_checking");
    const c = await f.card(orderId);
    assert.equal(c.marketplace.platform_state, "accepted");
    assert.equal(c.marketplace.sync_state, "needs_checking");
  });
  await check(
    "changed food snapshots stay visible and held, without replacing purchased lines",
    async () => {
      const order = await f.observation(uber, {
        externalOrderId: "changed-food",
        displayReference: "00002",
      });
      const imported = await f.observe(uber, order);
      const changed = await f.observe(uber, order, {
        items: [{ ...order.items[0], quantity: 3 }, order.items[1]],
        observedAt: await f.now(),
      });
      assert.equal(changed.held, true);
      const c = await f.card(imported.orderId);
      assert.equal(c.blocked_reason, "snapshot_hold");
      assert.equal(c.items[0].quantity, 2);
      await assert.rejects(() => f.action(imported.orderId, "accept"), /snapshot_hold/);
      const count = await f.scalar(
        "select count(*)::int from mealdeck_private.marketplace_observations where order_id=$1",
        [imported.orderId],
      );
      await f.observe(uber, order, {
        items: [{ ...order.items[0], quantity: 3 }, order.items[1]],
        observedAt: await f.now(),
      });
      assert.equal(
        await f.scalar(
          "select count(*)::int from mealdeck_private.marketplace_observations where order_id=$1",
          [imported.orderId],
        ),
        count,
        "a repeated conflicting snapshot must not grow the audit on every poll",
      );
    },
  );
  await check(
    "cancellation and newer state regressions block actions instead of silently cooking",
    async () => {
      const order = await f.observation(justEat, {
        externalOrderId: "cancelled-order",
        displayReference: "00003",
      });
      const imported = await f.observe(justEat, order);
      await f.action(imported.orderId, "accept");
      await f.observe(justEat, order, { state: "cancelled", observedAt: await f.now() });
      assert.equal((await f.card(imported.orderId)).marketplace.platform_state, "cancelled");
      await assert.rejects(() => f.action(imported.orderId, "preparing"), /cancelled/);
      assert.equal((await f.bridge(justEat, "claim", {})).command, null);
      await f.observe(justEat, order, { state: "accepted", observedAt: await f.now() });
      assert.equal((await f.card(imported.orderId)).marketplace.platform_state, "cancelled");
      const c = await f.card(imported.orderId);
      const ack = (version, actor = f.owner) =>
        f.rpc(
          "mealdeck_ops_marketplace_acknowledge_cancelled",
          [f.tenantId, f.locationId, imported.orderId, version],
          actor,
        );
      await assert.rejects(() => ack(c.version, f.customer), /forbidden/);
      await assert.rejects(() => ack("0".repeat(32)), /conflict/);
      assert.equal((await ack(c.version)).acknowledged, true);
      assert.equal((await ack(c.version)).replayed, true);
      assert.equal(await f.card(imported.orderId), undefined);
      assert.equal(
        (await f.board()).completed_orders.some((c) => c.order_id === imported.orderId),
        false,
        "acknowledged cancellation is not a completed meal or handover",
      );
    },
  );
  await check(
    "an uncertain action still records an exact fresh cancellation readback",
    async () => {
      const order = await f.observation(justEat, {
        externalOrderId: "cancelled-during-click",
        displayReference: "0STOP",
      });
      const { orderId } = await f.observe(justEat, order);
      await f.action(orderId, "accept");
      const command = (await f.bridge(justEat, "claim", {})).command;
      assert.equal(command.externalOrderId, order.externalOrderId);
      const result = await f.result(justEat, command, order, {
        outcome: "uncertain",
        observedState: "cancelled",
      });
      assert.equal(result.status, "needs_checking");
      assert.equal((await f.card(orderId)).marketplace.platform_state, "cancelled");
      await assert.rejects(() => f.action(orderId, "preparing"), /cancelled/);
      assert.equal((await f.bridge(justEat, "claim", {})).command, null);
    },
  );
  await check(
    "owner report omits credentials, honors MFA and detects degraded devices",
    async () => {
      await f.heartbeat(uber, { status: "degraded", errorCode: "device_unavailable" });
      const report = await f.rpc("mealdeck_ops_marketplace_connections", [
        f.tenantId,
        f.locationId,
      ]);
      assert.equal(report.length, 2);
      assert.equal(report.find((r) => r.platform === "uber_eats").health_status, "degraded");
      assert.equal(JSON.stringify(report).includes(uber.tokenHash), false);
      assert.equal(JSON.stringify(report).includes("token_hash"), false);
      await db.query("insert into auth.mfa_factors(user_id,status) values($1,'verified')", [
        f.owner,
      ]);
      await assert.rejects(
        () => f.rpc("mealdeck_ops_marketplace_connections", [f.tenantId, f.locationId]),
        /mfa_required/,
      );
      await db.exec("select set_config('request.jwt.claim.aal','aal2',false)");
      assert.equal(
        (await f.rpc("mealdeck_ops_marketplace_connections", [f.tenantId, f.locationId])).length,
        2,
      );
      await db.exec("select set_config('request.jwt.claim.aal','',false)");
    },
  );
  await check(
    "revoking the connector stops claims without deleting accepted kitchen history",
    async () => {
      await assert.rejects(
        () =>
          db.query(
            "update mealdeck_private.marketplace_connectors set external_store_id='wrong-store' where id=$1",
            [uber.connectorId],
          ),
        /immutable_connector/,
      );
      await assert.rejects(
        () =>
          db.query(
            "update mealdeck_private.marketplace_connectors set profile_version='unreviewed' where id=$1",
            [uber.connectorId],
          ),
        /profile_recommission_required/,
      );
      await db.query(
        "update mealdeck_private.marketplace_connectors set enabled=false where id=$1",
        [uber.connectorId],
      );
      await assert.rejects(() => f.bridge(uber, "claim", {}), /unauthorized/);
      assert((await f.board()).completed_orders.some((o) => o.order_id === uId));
      assert.deepEqual(await authority(), originalAuthority);
      assert.equal(await f.scalar("select count(*)::int from public.orders"), 0);
      assert.equal(await f.scalar("select count(*)::int from mealdeck_private.stripe_orders"), 0);
      assert.equal(await f.scalar("select count(*)::int from mealdeck_private.receipt_jobs"), 0);
    },
  );
  await marketplaceConcurrencyTests(db, f);
  console.log(
    `Marketplace database checks passed: ${checks}${db.native ? "; 5 native concurrency races" : "; native concurrency requires --native"}`,
  );
} catch (error) {
  console.error(
    "Marketplace database test failed:",
    error.message,
    error.where ?? "",
    error.position ?? "",
  );
  process.exitCode = 1;
} finally {
  await db.close();
}
