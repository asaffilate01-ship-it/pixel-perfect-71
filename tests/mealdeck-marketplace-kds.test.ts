import { describe, expect, test } from "bun:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { KdsOrderCollection, KitchenOrderCard } from "../src/components/ops/kds-panel";
import { KdsCompletedCard } from "../src/components/ops/kds-completed-card";
import { KdsMarketplaceStatus } from "../src/components/ops/kds-marketplace-status";
import { parseKdsBoard, parseKdsMutation, type KdsOrder } from "../src/lib/mealdeck-kds";
import { parseKdsWorkflowBoard } from "../src/lib/mealdeck-kds-workflow";
import { kdsOrderStage, nextKdsOrderAction } from "../src/lib/mealdeck-kds-presentation";
import { matchesKdsOrderSearch } from "../src/lib/mealdeck-kds-view";
import {
  kdsOrderReference,
  marketplaceKitchenBlockReason,
  marketplaceProjectionSchema,
  marketplaceTransitionParameters,
  parseMarketplaceCancellationAcknowledgement,
  type MarketplaceKitchenAction,
} from "../src/lib/mealdeck-marketplace";

import {
  id,
  version,
  now,
  scope,
  marketplace,
  board,
  completed,
} from "./fixtures/mealdeck-marketplace-kds";

function renderTicket(order: KdsOrder, onAcknowledgeCancellation?: () => void) {
  return renderToStaticMarkup(
    createElement(KitchenOrderCard, {
      order,
      stage: kdsOrderStage(order),
      now: Date.parse(now),
      action: nextKdsOrderAction(order),
      disabled: false,
      saving: false,
      confirmingSeal: false,
      actionRef: () => {},
      cardRef: () => {},
      onAction: () => {},
      onConfirmSeal: () => {},
      onCancelSeal: () => {},
      onItemReady: () => {},
      onHandoff: () => {},
      ...(onAcknowledgeCancellation ? { onAcknowledgeCancellation } : {}),
    }),
  );
}

describe("marketplace references and staff evidence", () => {
  test("preserves each original platform reference across active and Done cards and search", () => {
    for (const [platform, label, display_reference] of [
      ["uber_eats", "Uber Eats", "BC953"],
      ["just_eat", "Just Eat", "0000789012"],
    ] as const) {
      const active = parseKdsBoard(board(marketplace({ platform, display_reference })), scope)
        .orders[0]!;
      const reference = kdsOrderReference(active);
      expect(reference).toEqual({ label: `${label} order`, value: display_reference });
      const html = renderTicket(active);
      expect(html).toContain(`Order source: ${label}`);
      expect(html).toContain(`class="md-kds-order-number">${display_reference}</h3>`);
      expect(html).not.toContain("Collection code");
      expect(html).not.toContain("receipt queued");
      expect(matchesKdsOrderSearch(active, `${label} ${display_reference}`)).toBe(true);
      expect(matchesKdsOrderSearch(active, `${label.replace(/\s/g, "")} No onions`)).toBe(true);
      const done = completed(active);
      const parsed = parseKdsWorkflowBoard(
        {
          ...board(),
          orders: [],
          completed_orders: [done],
          completed_remaining_order_count: 0,
          completed_window_hours: 12,
        },
        scope,
      ).completed_orders[0]!;
      expect(parsed.marketplace?.display_reference).toBe(display_reference);
      expect(matchesKdsOrderSearch(parsed, `${label} ${display_reference}`)).toBe(true);
      const doneHtml = renderToStaticMarkup(createElement(KdsCompletedCard, { order: parsed }));
      expect(doneHtml).toContain(`class="md-kds-order-number">${display_reference}</h3>`);
      expect(doneHtml).toContain("Kitchen handover recorded");
      expect(doneHtml).toContain("Customer delivery is confirmed by the platform");
      expect(doneHtml).not.toMatch(/<(button|input)\b/);
    }
  });

  test("never normalizes references or accepts unsafe/unknown platform evidence", () => {
    for (const display_reference of [
      12345,
      "",
      "BC953 ",
      " BC953",
      "BC\n953",
      "BC\u202e953",
      "a".repeat(81),
    ]) {
      const value = board();
      Object.assign(value.orders[0]!.marketplace!, { display_reference });
      expect(() => parseKdsBoard(value, scope)).toThrow("mealdeck_kds_invalid_response");
    }
    for (const patch of [
      { platform: "unreviewed" },
      { platform_state: "delivered" },
      { sync_state: "success" },
      { confirmed_at: null },
      { confirmed_at: "today" },
      { platform_state: "unknown", confirmed_at: null, sync_state: "confirmed" },
      { capabilities: { accept: "true", preparing: false, ready: false, handover: false } },
    ]) {
      const value = board();
      Object.assign(value.orders[0]!.marketplace!, patch);
      expect(() => parseKdsBoard(value, scope)).toThrow("mealdeck_kds_invalid_response");
    }
    const metadata = { ...marketplace(), session_token: "secret", internal_store_id: "private" };
    const parsed = marketplaceProjectionSchema.parse(metadata);
    expect(parsed).not.toHaveProperty("session_token");
    expect(parsed).not.toHaveProperty("internal_store_id");
    const html = renderTicket(board(marketplace({ display_reference: "<order&ref>" })).orders[0]!);
    expect(html).toContain("&lt;order&amp;ref&gt;");
    expect(html).not.toContain("<order&ref>");
    expect(
      marketplaceProjectionSchema.parse(marketplace({ display_reference: "🧾".repeat(80) }))
        .display_reference,
    ).toBe("🧾".repeat(80));
  });

  test("order shortcuts preserve source references in both adaptive ticket and stage views", () => {
    const uber = board(marketplace({ display_reference: "BC953" })).orders[0]!;
    const justEat = board(marketplace({ platform: "just_eat", display_reference: "0000789012" }))
      .orders[0]!;
    justEat.order_id = id(4);
    const native = board(null).orders[0]!;
    native.order_id = id(5);
    native.order_number = "0007";
    for (const view of ["tickets", "stages"] as const) {
      const html = renderToStaticMarkup(
        createElement(KdsOrderCollection, {
          orders: [uber, justEat, native],
          view,
          filter: "all",
          renderOrder: () => null,
        }),
      );
      expect(html).toContain('aria-label="Order shortcuts"');
      expect(html).toContain(`value="${uber.order_id}">Uber Eats order BC953 ·`);
      expect(html).toContain(`value="${justEat.order_id}">Just Eat order 0000789012 ·`);
      expect(html).toContain(`value="${native.order_id}">Order 0007 ·`);
      expect(html).not.toContain("Collection code 0438");
    }
  });

  test("a local update reply must match the platform and exact reference before reporting success", () => {
    const expected = { orderId: id(3), status: "accepted" as const, marketplace: marketplace() };
    const reply = {
      ok: true,
      replayed: false,
      order_id: id(3),
      status: "accepted",
      marketplace: marketplace({ sync_state: "queued", pending_action: "accept" }),
    };
    expect(parseKdsMutation(reply, expected).marketplace?.sync_state).toBe("queued");
    for (const metadata of [
      null,
      undefined,
      marketplace({ platform: "just_eat" }),
      marketplace({ display_reference: "bc953" }),
      marketplace({ display_reference: "BC954" }),
    ]) {
      expect(() => parseKdsMutation({ ...reply, marketplace: metadata }, expected)).toThrow(
        "mealdeck_kds_invalid_response",
      );
    }
  });

  test("ordinary MealDeck order numbering and collection proof stay separate", () => {
    const native = board(null).orders[0]!;
    native.order_number = "0007";
    native.fulfilment = "pickup";
    expect(kdsOrderReference(native)).toEqual({ label: "Order", value: "0007" });
    const html = renderTicket(native);
    expect(html).toContain('class="md-kds-order-number">0007</h3>');
    expect(html).toContain("Collection code");
    expect(html).toContain("0438");
    expect(html).toContain("Accepting queues the kitchen receipt once");
    expect(html).not.toContain("Order source:");
    native.order_number = null;
    expect(kdsOrderReference(native)).toEqual({ label: "Collection code", value: "0438" });
  });

  test("marketplace prices preserve the observed unit amount without deriving inclusive or line totals", () => {
    const order = board().orders[0]!;
    order.items[0]!.unit_pence = 529;
    for (const html of [
      renderTicket(order),
      renderToStaticMarkup(createElement(KdsCompletedCard, { order: completed(order) })),
    ]) {
      expect(html).toContain("Platform unit price: £5.29");
      expect(html).not.toContain("£10.58");
      expect(html).not.toContain("selected choices included");
      expect(html).not.toContain("line total");
    }
    order.items[0]!.unit_pence = null;
    expect(renderTicket(order)).not.toContain("Platform unit price:");
  });
});

describe("local kitchen progress and confirmed marketplace progress", () => {
  test("waiting and uncertain acceptance cannot unlock preparation", () => {
    for (const sync_state of ["queued", "sending", "needs_checking"] as const) {
      const order = board(marketplace({ sync_state, pending_action: "accept" })).orders[0]!;
      order.accepted_at = now;
      expect(marketplaceKitchenBlockReason(order)).toContain("confirm acceptance");
      const html = renderTicket(order);
      expect(html).toMatch(/<button[^>]*disabled=""[^>]*aria-label="Start preparing/);
      expect(html).not.toContain("Update confirmed on Uber Eats");
      expect(html).toContain("Last seen on Uber Eats: Awaiting acceptance");
    }
    const unknown = board(marketplace({ platform_state: "unknown", confirmed_at: null }))
      .orders[0]!;
    unknown.accepted_at = now;
    expect(marketplaceKitchenBlockReason(unknown)).toContain("confirm acceptance");
    expect(marketplaceKitchenBlockReason(board(null).orders[0]!)).toBeNull();
  });

  test("unsupported acceptance requires the platform app; observed platform acceptance permits local workflow", () => {
    const order = board(
      marketplace({
        capabilities: { accept: false, preparing: false, ready: false, handover: false },
      }),
    ).orders[0]!;
    expect(marketplaceKitchenBlockReason(order)).toBe(
      "Accept on Uber Eats first, then refresh this ticket.",
    );
    expect(renderTicket(order)).toMatch(/<button[^>]*disabled=""[^>]*aria-label="Accept order/);
    order.marketplace!.platform_state = "accepted";
    expect(marketplaceKitchenBlockReason(order)).toBeNull();
    expect(renderTicket(order)).not.toMatch(/<button[^>]*disabled=""[^>]*aria-label="Accept order/);
    order.accepted_at = now;
    order.marketplace!.sync_state = "unsupported";
    order.marketplace!.pending_action = "preparing";
    expect(marketplaceKitchenBlockReason(order)).toBeNull();
    const html = renderTicket(order);
    expect(html).toContain("Preparing update was recorded in the kitchen only");
    expect(html).toContain("Last seen on Uber Eats: Accepted");
  });

  test("unconfigured and cancelled tickets are explicit and cannot accept new work", () => {
    const unconfigured = board(marketplace({ sync_state: "unconfigured" })).orders[0]!;
    expect(renderTicket(unconfigured)).toContain("Uber Eats connection not configured");
    expect(marketplaceKitchenBlockReason(unconfigured)).not.toBeNull();
    const cancelled = board(marketplace({ platform_state: "cancelled" })).orders[0]!;
    cancelled.accepted_at = now;
    expect(renderTicket(cancelled)).toContain("Cancelled on Uber Eats");
    expect(marketplaceKitchenBlockReason(cancelled)).toContain("Cancelled on Uber Eats");
  });

  test("a changed snapshot preserves the original complete ready order and blocks every kitchen control", () => {
    const value = board(marketplace({ platform_state: "accepted", sync_state: "needs_checking" }));
    const order = value.orders[0]!;
    order.accepted_at = now;
    order.preparation_status = "ready";
    order.order_status = "ready";
    order.blocked_reason = "snapshot_hold";
    order.items.forEach((item) => {
      item.status = "ready";
    });
    order.tickets.forEach((ticket) => {
      ticket.status = "ready";
      ticket.items.forEach((item) => {
        item.status = "ready";
      });
    });
    order.pass = { status: "ready_for_handoff", version, updated_at: now };
    const parsed = parseKdsBoard(value, scope).orders[0]!;
    expect(parsed.routing_complete).toBe(true);
    expect(parsed.items[0]!.modifiers).toEqual(["No onions", "Drink: fixture water"]);
    expect(parsed.preparation_status).toBe("ready");
    expect(nextKdsOrderAction(parsed)).toBeNull();
    expect(marketplaceKitchenBlockReason(parsed)).toContain("The order changed on Uber Eats");
    const html = renderTicket(parsed);
    expect(html).toContain("The order changed on Uber Eats");
    const controls = html.match(/<(input|button)\b[^>]*>/g) ?? [];
    expect(controls.length).toBeGreaterThan(0);
    for (const control of controls) expect(control).toContain('disabled=""');
    order.marketplace = null;
    expect(() => parseKdsBoard(value, scope)).toThrow("mealdeck_kds_invalid_response");
  });

  test("an inactive marketplace station preserves the packed ticket without allowing handover or breaking the board", () => {
    const value = board(marketplace({ platform_state: "ready" }));
    value.stations[0]!.active = false;
    const order = value.orders[0]!;
    order.accepted_at = now;
    order.preparation_status = "ready";
    order.order_status = "ready";
    order.routing_complete = false;
    order.blocked_reason = "routing_incomplete";
    order.items.forEach((item) => {
      item.status = "ready";
    });
    order.tickets.forEach((ticket) => {
      ticket.status = "ready";
      ticket.items.forEach((item) => {
        item.status = "ready";
      });
    });
    order.pass = { status: "ready_for_handoff", version, updated_at: now };
    const parsed = parseKdsBoard(value, scope).orders[0]!;
    expect(parsed.items).toHaveLength(1);
    expect(parsed.items[0]!.quantity).toBe(2);
    expect(parsed.preparation_status).toBe("ready");
    expect(nextKdsOrderAction(parsed)).toBeNull();
    const controls = renderTicket(parsed).match(/<(input|button)\b[^>]*>/g) ?? [];
    expect(controls.length).toBeGreaterThan(0);
    for (const control of controls) expect(control).toContain('disabled=""');
    order.marketplace = null;
    expect(() => parseKdsBoard(value, scope)).toThrow("mealdeck_kds_invalid_response");
  });

  test("only a confirmed cancellation offers its separate acknowledgement, without claiming completion or a refund", () => {
    const order = board(marketplace({ platform_state: "cancelled" })).orders[0]!;
    order.blocked_reason = "snapshot_hold";
    const html = renderTicket(order, () => {});
    const button = html.match(/<button[^>]*aria-label="Acknowledge cancellation[^>]*>/)?.[0];
    expect(button).toBeTruthy();
    expect(button).not.toContain("disabled");
    expect(html).not.toContain("Confirm handover");
    expect(html).not.toContain("Mark done");
    expect(html).not.toContain("refund");
    const receipt = { ok: true, acknowledged: true, replayed: false, order_id: order.order_id };
    expect(parseMarketplaceCancellationAcknowledgement(receipt, order.order_id).acknowledged).toBe(
      true,
    );
    for (const patch of [
      { order_id: id(99) },
      { acknowledged: false },
      { replayed: "false" },
      { ok: false },
    ]) {
      expect(() =>
        parseMarketplaceCancellationAcknowledgement({ ...receipt, ...patch }, order.order_id),
      ).toThrow("mealdeck_marketplace_invalid_response");
    }
    order.marketplace!.platform_state = "accepted";
    expect(renderTicket(order, () => {})).not.toContain("Acknowledge cancellation");
    expect(renderTicket(board(null).orders[0]!, () => {})).not.toContain(
      "Acknowledge cancellation",
    );
  });

  test("a local kitchen handover can remain uncertain on the marketplace", () => {
    const metadata = marketplace({
      platform: "just_eat",
      platform_state: "ready",
      sync_state: "needs_checking",
      pending_action: "handover",
    });
    const html = renderToStaticMarkup(
      createElement(KdsMarketplaceStatus, { marketplace: metadata, completed: true }),
    );
    expect(html).toContain("Just Eat needs checking");
    expect(html).toContain("Last seen on Just Eat: Ready for collection");
    expect(html).toContain("before retrying the update");
    expect(html).not.toContain("Delivered");
    expect(html).not.toContain("Update confirmed");
  });

  test("handover takes the exact external reference and never imposes a four-digit MealDeck code", () => {
    const order = board(marketplace({ platform_state: "ready" })).orders[0]!;
    order.accepted_at = now;
    order.preparation_status = "ready";
    order.pass = { status: "sealed", version, updated_at: now };
    const html = renderTicket(order);
    expect(html).toContain('aria-label="Uber Eats order reference for handover"');
    expect(html).toContain('inputMode="text"');
    expect(html).toContain('maxLength="160"');
    expect(html).toContain("with the courier or customer");
    expect(html).not.toContain("four-digit");
    expect(html).not.toContain('pattern="[0-9]{4}"');
    expect(html).toContain("The platform confirms courier pickup and customer delivery");
  });

  test("every marketplace control targets its own ledger and only packing seal can request external ready", () => {
    const requestScope = { ...scope, orderId: id(3), version };
    const actions: [MarketplaceKitchenAction, string][] = [
      [{ target: "accept", status: "accepted" }, "accept"],
      [{ target: "order", status: "preparing" }, "preparing"],
      [{ target: "item", status: "preparing", itemId: id(4), ready: false }, "item_ready"],
      [{ target: "item", status: "ready", itemId: id(4), ready: true }, "item_ready"],
      [{ target: "pass", status: "packing" }, "packing"],
      [{ target: "pass", status: "sealed" }, "sealed"],
      [{ target: "handoff", status: "completed", code: "BC953" }, "handover"],
    ];
    for (const [action, command] of actions) {
      const args = marketplaceTransitionParameters(requestScope, action);
      expect(args["p_action"]).toBe(command);
      expect(args["p_tenant"]).toBe(scope.tenantId);
      expect(args["p_location"]).toBe(scope.locationId);
      expect(args["p_order"]).toBe(id(3));
      expect(args["p_expected_version"]).toBe(version);
      expect(args).not.toHaveProperty("p_status");
      expect(args).not.toHaveProperty("p_code");
      if (command === "handover") expect(args["p_reference"]).toBe("BC953");
      else expect(args).not.toHaveProperty("p_reference");
    }
    expect(() =>
      marketplaceTransitionParameters(requestScope, { target: "order", status: "ready" }),
    ).toThrow("mealdeck_marketplace_invalid_action");
    expect(() =>
      marketplaceTransitionParameters(requestScope, { target: "item", status: "ready" }),
    ).toThrow("mealdeck_marketplace_invalid_action");
  });
});
