import { createHash, randomBytes } from "node:crypto";
import { expect, test } from "bun:test";
import { handleMarketplaceBridgeRequest } from "../src/lib/mealdeck-marketplace-bridge.server";
import { marketplaceConnectionSchema } from "../src/lib/mealdeck-marketplace-connections";
import { parseKdsWorkflowBoard } from "../src/lib/mealdeck-kds-workflow";
import { parseKdsMutation, type KdsMutation } from "../src/lib/mealdeck-kds";
import { buildMarketplaceConnectorsSql } from "../deploy/mealdeck/marketplace-connectors.mjs";
import { createDatabase, asActor } from "./postgres/harness.mjs";
import { setupMarketplaceFixture } from "./postgres/marketplace-fixture.mjs";
import {
  validateCommand,
  validateObservation,
} from "../apps/mealdeck-marketplace-bridge/src/contracts.mjs";

/** Real HTTP handler -> named Supabase RPC -> disposable PostgreSQL -> real KDS parsers.
 * Only transport and external merchant UI are simulated. No live network, order or payment.
 */
test("both marketplace bridge contracts roundtrip into the existing KDS through every supported stage", async () => {
  const db = await createDatabase();
  try {
    const f = await setupMarketplaceFixture(db);
    await db.exec(buildMarketplaceConnectorsSql());
    const env = {
      MEALDECK_SUPABASE_URL: "https://marketplaceintegration.supabase.co",
      MEALDECK_SUPABASE_PUBLISHABLE_KEY: `sb_publishable_${randomBytes(24).toString("base64url")}`,
      MEALDECK_CHECKOUT_SERVER_KEY: `sb_secret_${randomBytes(24).toString("base64url")}`,
      MEALDECK_TENANT_ID: f.tenantId,
      MEALDECK_LUTON_LOCATION_ID: f.locationId,
      MEALDECK_MARKETPLACE_BRIDGE_ENABLED: "true",
      MEALDECK_MARKETPLACE_BRIDGE_APPROVAL: "signed-off",
    };
    const fetcher = (async (input: RequestInfo | URL, init?: RequestInit) => {
      expect(String(input)).toBe(
        `${env.MEALDECK_SUPABASE_URL}/rest/v1/rpc/mealdeck_marketplace_bridge`,
      );
      expect(new Headers(init?.headers).get("apikey")).toBe(env.MEALDECK_CHECKOUT_SERVER_KEY);
      const p = JSON.parse(String(init?.body));
      try {
        const result = await asActor(
          db,
          null,
          () =>
            db.query(
              "select public.mealdeck_marketplace_bridge($1::uuid,$2::uuid,$3::uuid,$4::text,$5::text,$6::jsonb) as result",
              [
                p.p_tenant,
                p.p_location,
                p.p_connector,
                p.p_token_hash,
                p.p_operation,
                JSON.stringify(p.p_payload),
              ],
            ),
          "service_role",
        );
        return Response.json(result.rows[0].result);
      } catch (error) {
        return Response.json(
          { message: error instanceof Error ? error.message : "fixture failed" },
          { status: 400 },
        );
      }
    }) as typeof fetch;
    const scope = { tenantId: f.tenantId, locationId: f.locationId };
    for (const platform of ["uber_eats", "just_eat"] as const) {
      const connector = await f.provision(platform, {
        capabilities: { preparing: platform === "just_eat", handover: platform === "just_eat" },
      });
      const token = `fixture_${platform}_`.repeat(4);
      await db.query(
        "update mealdeck_private.marketplace_connectors set token_hash=$1 where id=$2",
        [createHash("sha256").update(token).digest("hex"), connector.connectorId],
      );
      await f.commission(connector);
      const call = async (op: string, payload: Record<string, unknown> = {}) => {
        const response = await handleMarketplaceBridgeRequest(
          new Request("https://mealdeck.co.uk/api/marketplace/bridge", {
            method: "POST",
            headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
            body: JSON.stringify({
              op,
              connectorId: connector.connectorId,
              payload: { evidence: connector.evidence, ...payload },
            }),
          }),
          env,
          fetcher,
        );
        const body = await response.json();
        expect(response.status, `${op}: ${JSON.stringify(body)}`).toBe(200);
        return body;
      };
      await call("heartbeat", {
        status: "healthy",
        capabilities: connector.capabilities,
        observedAt: await f.now(),
      });
      const observed = await f.observation(connector, {
        displayReference: platform === "uber_eats" ? "00Ab9" : "0000789012",
      });
      validateObservation({ ...observed, evidence: connector.evidence });
      const imported = await call("observe", observed);
      const replayed = await call("observe", { ...observed, observedAt: await f.now() });
      expect(replayed.orderId).toBe(imported.orderId);
      expect(replayed.replayed).toBe(true);
      const readBoard = async () => parseKdsWorkflowBoard(await f.board(), scope);
      const card = async () =>
        (await readBoard()).orders.find((order) => order.order_id === imported.orderId)!;
      const initial = await card();
      expect(initial.marketplace?.display_reference).toBe(observed.displayReference);
      expect(initial.items.length).toBe(2);
      expect(initial.items[0]?.modifiers).toEqual(["No cheese", "2 × Extra sauce"]);
      const action = async (
        name: string,
        options: { item?: string; ready?: boolean; reference?: string } = {},
      ) => {
        const before = await card();
        const status: KdsMutation["status"] =
          name === "accept"
            ? "accepted"
            : name === "handover"
              ? "completed"
              : name === "item_ready"
                ? before.items.every((item) =>
                    item.order_item_id === options.item ? options.ready : item.status === "ready",
                  )
                  ? "ready"
                  : "preparing"
                : (name as "preparing" | "packing" | "sealed");
        const result = await f.action(imported.orderId, name, options);
        return parseKdsMutation(result, {
          orderId: imported.orderId,
          status,
          marketplace: { platform, display_reference: observed.displayReference },
        });
      };
      const confirm = async (action: string, state: string) => {
        const { command } = await call("claim");
        validateCommand(command);
        expect(command.action).toBe(action);
        const result = await call("result", {
          commandId: command.commandId,
          leaseToken: command.leaseToken,
          outcome: "confirmed",
          externalStoreId: observed.externalStoreId,
          externalOrderId: observed.externalOrderId,
          displayReference: observed.displayReference,
          observedState: state,
          observedAt: await f.now(),
        });
        expect(result.status).toBe("confirmed");
      };
      expect((await action("accept")).marketplace?.sync_state).toBe("queued");
      await confirm("accept", "accepted");
      await action("preparing");
      if (connector.capabilities.preparing) await confirm("preparing", "preparing");
      else expect((await call("claim")).command).toBe(null);
      for (const item of (await card()).items)
        await action("item_ready", { item: item.order_item_id, ready: true });
      expect((await card()).pass?.status).toBe("ready_to_pack");
      expect((await call("claim")).command).toBe(null);
      await action("packing");
      await action("sealed");
      await confirm("ready", "ready");
      await action("handover", { reference: observed.displayReference });
      if (connector.capabilities.handover) await confirm("handover", "handed_over");
      const done = (await readBoard()).completed_orders.find(
        (order) => order.order_id === imported.orderId,
      )!;
      expect(done.marketplace?.platform_state).toBe(
        connector.capabilities.handover ? "handed_over" : "ready",
      );
      expect(done.marketplace?.display_reference).toBe(observed.displayReference);
    }
    const connections = await f.rpc("mealdeck_ops_marketplace_connections", [
      f.tenantId,
      f.locationId,
    ]);
    expect(connections).toHaveLength(2);
    for (const connection of connections)
      expect(marketplaceConnectionSchema.safeParse(connection).success).toBe(true);
    expect(await f.scalar("select count(*)::int from public.orders")).toBe(0);
    expect(await f.scalar("select count(*)::int from mealdeck_private.receipt_jobs")).toBe(0);
  } finally {
    await db.close();
  }
}, 60_000);
