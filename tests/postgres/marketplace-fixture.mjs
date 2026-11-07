import { asActor, id } from "./harness.mjs";
import { setupPaidOrderNumbersFixture } from "./paid-order-numbers-fixture.mjs";
import { buildPaidOrderNumbersSql } from "../../deploy/mealdeck/paid-order-numbers.mjs";

/** Disposable platform and merchant fixtures; no live credentials or synthetic production payments. */
export async function setupMarketplaceFixture(db) {
  const f = await setupPaidOrderNumbersFixture(db);
  await db.exec(buildPaidOrderNumbersSql());
  await db.exec(
    "create table auth.mfa_factors(id uuid primary key default gen_random_uuid(),user_id uuid not null,status text not null)",
  );
  const scalar = async (sql, args = []) => Object.values((await db.query(sql, args)).rows[0])[0];
  const now = () => scalar("select mealdeck_private.marketplace_timestamp(now())");
  const rpc = (name, args, actor = f.owner, role = "authenticated") =>
    asActor(
      db,
      actor,
      () => scalar(`select public.${name}(${args.map((_, n) => "$" + (n + 1)).join(",")})`, args),
      role,
    );
  const provision = async (platform, options = {}) => {
    const evidence = { profileId: `fixture-${platform}`, profileVersion: "fixture-v1" };
    const capabilities = {
      accept: true,
      preparing: false,
      ready: true,
      handover: false,
      ...options.capabilities,
    };
    const externalStoreId = options.externalStoreId ?? `fixture-store-${platform}`;
    const tokenHash = (platform === "uber_eats" ? "b" : "c").repeat(64);
    const connectorId = await scalar(
      "select mealdeck_private.marketplace_provision_connector($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11::jsonb)",
      [
        f.tenantId,
        f.locationId,
        platform,
        externalStoreId,
        `Fixture ${platform}`,
        f.stationId,
        null,
        tokenHash,
        evidence.profileId,
        evidence.profileVersion,
        JSON.stringify(capabilities),
      ],
    );
    return { connectorId, platform, externalStoreId, tokenHash, evidence, capabilities };
  };
  const commission = (c) =>
    scalar(
      "select mealdeck_private.marketplace_commission_connector($1,'fixture-permission-only','fixture-device-check-only')",
      [c.connectorId],
    );
  const bridge = (c, op, payload, overrides = {}) =>
    rpc(
      "mealdeck_marketplace_bridge",
      [
        overrides.tenantId ?? f.tenantId,
        overrides.locationId ?? f.locationId,
        c.connectorId,
        overrides.tokenHash ?? c.tokenHash,
        op,
        JSON.stringify({ evidence: c.evidence, ...payload }),
      ],
      overrides.actor ?? null,
      overrides.role ?? "service_role",
    );
  const heartbeat = async (c, options = {}) =>
    bridge(c, "heartbeat", {
      status: "healthy",
      capabilities: c.capabilities,
      observedAt: await now(),
      ...options,
    });
  const observation = async (c, options = {}) => ({
    platform: c.platform,
    externalStoreId: c.externalStoreId,
    externalOrderId: "fixture-external-order-1",
    displayReference: "00AB9",
    state: "new",
    fulfilment: "platform_delivery",
    paymentResponsibility: "platform",
    currency: "GBP",
    totalPence: 1735,
    placedAt: new Date(Date.now() - 60_000).toISOString(),
    observedAt: await now(),
    items: [
      {
        externalLineId: "line-a",
        name: "Fixture burger",
        quantity: 2,
        unitPricePence: 699,
        modifiers: [
          { name: "No cheese", quantity: 1 },
          { name: "Extra sauce", quantity: 2 },
        ],
        notes: "Keep wrapped separately",
      },
      {
        externalLineId: "line-b",
        name: "Fixture drink",
        quantity: 1,
        unitPricePence: null,
        modifiers: [],
        notes: null,
      },
    ],
    notes: "Fixture kitchen notes",
    ...options,
  });
  const observe = (c, order, options = {}) => bridge(c, "observe", { ...order, ...options });
  const board = () => rpc("mealdeck_ops_kds_workflow_board", [f.tenantId, f.locationId]);
  const card = async (orderId) => (await board()).orders.find((c) => c.order_id === orderId);
  const action = async (orderId, actionName, options = {}) =>
    rpc(
      "mealdeck_ops_marketplace_transition",
      [
        options.tenantId ?? f.tenantId,
        options.locationId ?? f.locationId,
        orderId,
        options.version ?? (await card(orderId))?.version ?? "0".repeat(32),
        actionName,
        options.item ?? null,
        options.ready ?? null,
        options.reference ?? null,
      ],
      options.actor ?? f.owner,
      options.role ?? "authenticated",
    );
  const result = async (c, command, order, options = {}) =>
    bridge(c, "result", {
      commandId: command.commandId,
      leaseToken: command.leaseToken,
      outcome: "confirmed",
      externalStoreId: order.externalStoreId,
      externalOrderId: order.externalOrderId,
      displayReference: order.displayReference,
      observedState: {
        accept: "accepted",
        preparing: "preparing",
        ready: "ready",
        handover: "handed_over",
      }[command.action],
      observedAt: await now(),
      ...options,
    });
  return {
    ...f,
    scalar,
    rpc,
    now,
    provision,
    commission,
    bridge,
    heartbeat,
    observation,
    observe,
    board,
    card,
    action,
    result,
    id,
  };
}
