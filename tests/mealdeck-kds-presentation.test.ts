import { describe, expect, test } from "bun:test";
import type { KdsItem, KdsOrder, KdsTicket } from "../src/lib/mealdeck-kds";
import {
  KDS_STAGES,
  KDS_STAGE_LABELS,
  groupKdsItems,
  kdsOrderStage,
  nextKdsOrderAction,
} from "../src/lib/mealdeck-kds-presentation";

function item(overrides: Partial<KdsItem> = {}): KdsItem {
  return {
    ticket_item_id: "route-1",
    order_item_id: "line-1",
    brand_id: "skorch",
    brand_name: "Skorch",
    item_name: "The Ace",
    quantity: 2,
    modifiers: ["No gherkin"],
    notes: "Keep separate",
    participant_name: "Alex",
    status: "queued",
    ...overrides,
  };
}

function ticket(items: KdsItem[], overrides: Partial<KdsTicket> = {}): KdsTicket {
  return {
    ticket_id: "ticket-1",
    station_id: "grill",
    station_name: "Grill",
    status: "queued",
    version: "a".repeat(32),
    created_at: "2026-11-04T12:00:00Z",
    started_at: null,
    ready_at: null,
    items,
    ...overrides,
  };
}

function order(overrides: Partial<KdsOrder> = {}): KdsOrder {
  return {
    order_id: "order-1",
    version: "b".repeat(32),
    preparation_status: "queued",
    display_code: "MD1234",
    created_at: "2026-11-04T12:00:00Z",
    released_at: "2026-11-04T12:01:00Z",
    order_status: "accepted",
    accepted_at: "2026-11-04T12:02:00Z",
    fulfilment: "delivery",
    notes: null,
    group_order: true,
    routing_complete: true,
    blocked_reason: null,
    items: [item()],
    tickets: [ticket([item()])],
    pass: null,
    ...overrides,
  };
}

describe("one shared-kitchen order card", () => {
  test("a line routed to prep and assembly is shown and counted once", () => {
    const routed = order({
      tickets: [
        ticket([item()]),
        ticket([item({ ticket_item_id: "route-2" })], {
          ticket_id: "ticket-2",
          station_id: "assembly",
        }),
      ],
    });
    const groups = groupKdsItems(routed);
    expect(groups).toHaveLength(1);
    expect(groups[0].items).toHaveLength(1);
    expect(groups[0].items[0].quantity).toBe(2);
    expect(groups[0].items[0].modifiers).toEqual(["No gherkin"]);
    expect(groups[0].items[0].notes).toBe("Keep separate");
  });

  test("distinct variants and group participants stay separate even with the same dish name", () => {
    const lines = [
      item(),
      item({
        ticket_item_id: "route-2",
        order_item_id: "line-2",
        quantity: 1,
        modifiers: ["Extra cheese"],
        participant_name: "Sam",
        notes: null,
      }),
      item({
        ticket_item_id: "route-3",
        order_item_id: "line-3",
        brand_id: "moktl",
        brand_name: "Moktl",
        item_name: "Virgin Mojito",
        quantity: 1,
      }),
    ];
    const grouped = groupKdsItems(order({ items: lines, tickets: [ticket(lines)] }));
    expect(grouped.map((group) => group.name)).toEqual(["Skorch", "Moktl"]);
    expect(grouped[0].items).toHaveLength(2);
    expect(grouped[0].items.map((line) => line.quantity)).toEqual([2, 1]);
    expect(grouped[0].items[1].participant_name).toBe("Sam");
    expect(grouped[0].items[1].modifiers).toEqual(["Extra cheese"]);
  });

  test("an unrouted purchased line remains visible while the whole order is blocked", () => {
    const incomplete = order({
      routing_complete: false,
      blocked_reason: "routing_incomplete",
      items: [
        item(),
        item({
          order_item_id: "unrouted",
          brand_id: "moktl",
          brand_name: "Moktl",
          item_name: "Mango Mirage",
        }),
      ],
    });
    const grouped = groupKdsItems(incomplete);
    expect(grouped).toHaveLength(2);
    expect(grouped[1].items[0].item_name).toBe("Mango Mirage");
    expect(nextKdsOrderAction(incomplete)).toBeNull();
  });

  test("one command starts preparation, and item readiness cannot be bypassed", () => {
    expect(nextKdsOrderAction(order())).toEqual({
      target: "order",
      status: "preparing",
      label: "Start preparing",
    });
    expect(nextKdsOrderAction(order({ preparation_status: "preparing" }))).toBeNull();
    expect(nextKdsOrderAction(order({ accepted_at: null }))).toEqual({
      target: "accept",
      status: "accepted",
      label: "Accept order",
    });
    expect(
      nextKdsOrderAction(order({ routing_complete: false, blocked_reason: "routing_incomplete" })),
    ).toBeNull();
  });

  test("packing and sealed stages never offer a new preparation action", () => {
    for (const status of ["sealed", "ready_for_handoff"] as const) {
      const packed = order({
        pass: { status, version: "c".repeat(32), updated_at: "2026-11-04T12:10:00Z" },
      });
      expect(kdsOrderStage(packed)).toBe("ready_for_handover");
      expect(nextKdsOrderAction(packed)).toBeNull();
    }
    const packing = order({
      preparation_status: "ready",
      pass: { status: "packing", version: "c".repeat(32), updated_at: "2026-11-04T12:10:00Z" },
    });
    expect(kdsOrderStage(packing)).toBe("ready_to_pack");
    expect(nextKdsOrderAction(packing)).toEqual({
      target: "pass",
      status: "sealed",
      label: "Ready for handover",
    });
    expect(nextKdsOrderAction({ ...packing, preparation_status: "preparing" })).toBeNull();
  });

  test("an incomplete kitchen order cannot be offered packing", () => {
    const ready = order({
      preparation_status: "ready",
      pass: {
        status: "ready_to_pack",
        version: "c".repeat(32),
        updated_at: "2026-11-04T12:10:00Z",
      },
    });
    expect(nextKdsOrderAction(ready)).toEqual({
      target: "pass",
      status: "packing",
      label: "Start packing",
    });
    expect(nextKdsOrderAction({ ...ready, preparation_status: "preparing" })).toBeNull();
    expect(nextKdsOrderAction(order({ preparation_status: "ready" }))).toBeNull();
  });
});

describe("six explicit kitchen stages", () => {
  test("keeps the exact requested labels and sequence", () => {
    expect(KDS_STAGES.map((stage) => KDS_STAGE_LABELS[stage])).toEqual([
      "New",
      "Accepted",
      "Preparing",
      "Ready to pack",
      "Ready for handover",
      "Done",
    ]);
  });
  test("acceptance is separate from paid release and preparation", () => {
    expect(kdsOrderStage(order({ accepted_at: null }))).toBe("new");
    expect(kdsOrderStage(order())).toBe("accepted");
    expect(kdsOrderStage(order({ preparation_status: "preparing" }))).toBe("preparing");
  });
  test("packing is a step within ready to pack, not a seventh stage", () => {
    for (const status of ["ready_to_pack", "packing"] as const)
      expect(
        kdsOrderStage(
          order({
            preparation_status: "ready",
            pass: {
              status,
              version: "c".repeat(32),
              updated_at: "2026-11-04T12:10:00Z",
            },
          }),
        ),
      ).toBe("ready_to_pack");
  });
  test("only a fulfilled server record is done and never offers mutation", () => {
    const done = order({
      order_status: "fulfilled",
      completed_at: "2026-11-04T12:15:00Z",
      pass: { status: "handed_off", version: "c".repeat(32), updated_at: "2026-11-04T12:15:00Z" },
    });
    expect(kdsOrderStage(done)).toBe("done");
    expect(nextKdsOrderAction(done)).toBeNull();
    expect(nextKdsOrderAction({ ...done, accepted_at: null })).toBeNull();
  });
});
