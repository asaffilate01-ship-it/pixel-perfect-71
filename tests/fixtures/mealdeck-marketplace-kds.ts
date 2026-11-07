// Deterministic fixtures for tests and local visual checks only; never imported by app code.
import type { KdsBoard, KdsOrder } from "../../src/lib/mealdeck-kds";
import type { KdsCompletedOrder } from "../../src/lib/mealdeck-kds-workflow";
import type { MarketplaceProjection } from "../../src/lib/mealdeck-marketplace";

export const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
export const version = "a".repeat(32);
export const now = "2026-11-07T11:00:00Z";
export const scope = { tenantId: id(1), locationId: id(2) };

export function marketplace(overrides: Partial<MarketplaceProjection> = {}): MarketplaceProjection {
  return {
    platform: "uber_eats",
    display_reference: "BC953",
    platform_state: "new",
    confirmed_at: now,
    sync_state: "idle",
    pending_action: null,
    capabilities: { accept: true, preparing: false, ready: true, handover: false },
    ...overrides,
  };
}

export function board(metadata: MarketplaceProjection | null = marketplace()): KdsBoard {
  const item = {
    order_item_id: id(4),
    brand_id: null,
    brand_name: "Fixture store",
    item_name: "Fixture meal",
    quantity: 2,
    modifiers: ["No onions", "Drink: fixture water"],
    notes: "Sauce separately",
    participant_name: null,
    status: "queued" as const,
  };
  return {
    schema_version: 1,
    tenant_id: scope.tenantId,
    location_id: scope.locationId,
    generated_at: now,
    readiness: "ready",
    held_order_count: 0,
    remaining_order_count: 0,
    stations: [{ station_id: id(5), name: "Shared kitchen", code: "main", active: true }],
    orders: [
      {
        order_id: id(3),
        version,
        preparation_status: "queued",
        display_code: "0438",
        order_number: null,
        marketplace: metadata,
        created_at: now,
        released_at: now,
        accepted_at: null,
        order_status: "accepted",
        fulfilment: "delivery",
        notes: "Keep complete order together",
        group_order: false,
        routing_complete: true,
        blocked_reason: null,
        items: [item],
        tickets: [
          {
            ticket_id: id(6),
            station_id: id(5),
            station_name: "Shared kitchen",
            status: "queued",
            version,
            created_at: now,
            started_at: null,
            ready_at: null,
            items: [{ ...item, ticket_item_id: id(7) }],
          },
        ],
        pass: { status: "waiting_for_kitchen", version, updated_at: now },
      },
    ],
  };
}

export function completed(order: KdsOrder): KdsCompletedOrder {
  return {
    order_id: order.order_id,
    display_code: order.display_code,
    order_number: null,
    marketplace: order.marketplace ?? null,
    order_status: "fulfilled",
    handoff_status: "handed_off",
    accepted_at: "2026-11-07T10:15:00Z",
    completed_at: "2026-11-07T10:30:00Z",
    fulfilment: order.fulfilment,
    group_order: false,
    cutlery_requested: false,
    notes: order.notes,
    items: order.items,
  };
}
