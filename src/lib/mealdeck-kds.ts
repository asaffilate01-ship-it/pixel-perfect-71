import { packingPersonNameSchema } from "./mealdeck-packing-name";
import { isOrderNumber } from "./mealdeck-order-number";
import { mealComponentsSchema, type MealComponent } from "./mealdeck-meal-components";

/**
 * The staff KDS consumes a privacy-minimised projection of canonical MealDeck
 * records. These types/parsers are presentation checks, never payment, routing
 * or staff authority. The database rechecks all of those for every mutation.
 */
export type KdsTicketStatus = "queued" | "preparing" | "ready";
export type KdsPassStatus =
  "waiting_for_kitchen" | "ready_to_pack" | "packing" | "sealed" | "ready_for_handoff";

export type KdsStation = {
  station_id: string;
  name: string;
  code: string;
  active: boolean;
};

export type KdsOrderItem = {
  order_item_id: string;
  brand_id: string | null;
  brand_name: string;
  item_name: string;
  quantity: number;
  modifiers: string[];
  mealComponents?: MealComponent[];
  notes: string | null;
  participant_name: string | null;
  status: KdsTicketStatus;
  checkout_line_id?: string | null;
  parent_checkout_line_id?: string | null;
  base_unit_pence?: number | null;
  unit_pence?: number | null;
  modifier_details?: {
    name: string;
    group_name: string;
    price_delta_pence: number;
    quantity_per_parent: number;
    kind?: "source" | "cross" | "variant";
  }[];
  bags?: { number: number; name?: string; quantity: number }[];
};

export type KdsItem = KdsOrderItem & { ticket_item_id: string };

export type KdsTicket = {
  ticket_id: string;
  station_id: string;
  station_name: string;
  status: KdsTicketStatus;
  version: string;
  created_at: string;
  started_at: string | null;
  ready_at: string | null;
  items: KdsItem[];
};

export type KdsPass = {
  status: KdsPassStatus;
  version: string;
  updated_at: string;
};

export type KdsOrder = {
  order_id: string;
  version: string;
  preparation_status: KdsTicketStatus;
  display_code: string;
  order_number?: string | null;
  created_at: string;
  released_at: string;
  order_status: "accepted" | "preparing" | "ready";
  fulfilment: "delivery" | "pickup" | "curbside" | "dine_in";
  notes: string | null;
  group_order: boolean;
  routing_complete: boolean;
  blocked_reason: "routing_incomplete" | null;
  items: KdsOrderItem[];
  tickets: KdsTicket[];
  pass: KdsPass | null;
  accepted_at?: string | null;
  cutlery_requested?: boolean;
  vehicle?: { make: string; colour: string; registrationLast4: string } | null;
  pickupContact?: { name: string; phone: string } | null;
};

export type KdsBoard = {
  schema_version: 1;
  tenant_id: string;
  location_id: string;
  generated_at: string;
  readiness: "ready" | "setup_required";
  held_order_count: number;
  remaining_order_count: number;
  stations: KdsStation[];
  orders: KdsOrder[];
};

export type KdsMutation = {
  ok: true;
  replayed: boolean;
  order_id: string;
  status: "accepted" | "preparing" | "ready" | "packing" | "sealed" | "completed";
};

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const versionPattern = /^[0-9a-f]{32}$/;
const ticketStatuses = ["queued", "preparing", "ready"] as const;
const passStatuses = [
  "waiting_for_kitchen",
  "ready_to_pack",
  "packing",
  "sealed",
  "ready_for_handoff",
] as const;

function invalid(): never {
  throw new Error("mealdeck_kds_invalid_response");
}

function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) invalid();
  return value as Record<string, unknown>;
}

function text(value: unknown, max = 500): string {
  if (typeof value !== "string" || value.length > max) invalid();
  return value;
}

function nullableText(value: unknown, max = 500): string | null {
  return value === null ? null : text(value, max);
}

export function parseKdsPickupContact(value: unknown): { name: string; phone: string } | null {
  if (value == null) return null;
  const contact = record(value);
  const rawName = text(contact["name"], 240);
  const name = rawName.trim();
  const phone = text(contact["phone"], 16);
  if (
    !name ||
    [...name].length > 120 ||
    /[\p{Cc}\u061c\u200e\u200f\u2028-\u202e\u2066-\u2069]/u.test(rawName) ||
    !/^\+[1-9]\d{7,14}$/.test(phone)
  )
    invalid();
  return { name, phone };
}

function id(value: unknown): string {
  const result = text(value, 36);
  if (!uuidPattern.test(result)) invalid();
  return result;
}

function timestamp(value: unknown): string {
  const result = text(value, 64);
  if (!/^\d{4}-\d{2}-\d{2}T/.test(result) || !Number.isFinite(Date.parse(result))) invalid();
  return result;
}

function nullableTimestamp(value: unknown): string | null {
  return value === null ? null : timestamp(value);
}

function flag(value: unknown): boolean {
  if (typeof value !== "boolean") invalid();
  return value;
}

function integer(value: unknown, min = 0): number {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < min) invalid();
  return value;
}

function version(value: unknown): string {
  const result = text(value, 32);
  if (!versionPattern.test(result)) invalid();
  return result;
}

function choice<T extends string>(value: unknown, allowed: readonly T[]): T {
  if (typeof value !== "string" || !allowed.includes(value as T)) invalid();
  return value as T;
}

function list<T>(value: unknown, parse: (v: unknown) => T, max: number): T[] {
  if (!Array.isArray(value) || value.length > max) invalid();
  return value.map(parse);
}

function unique(values: string[]) {
  if (new Set(values).size !== values.length) invalid();
}

function parseOrderItem(value: unknown): KdsOrderItem {
  const v = record(value);
  return {
    order_item_id: id(v["order_item_id"]),
    brand_id: v["brand_id"] === null ? null : id(v["brand_id"]),
    brand_name: text(v["brand_name"], 1000),
    item_name: text(v["item_name"], 1000),
    quantity: integer(v["quantity"], 1),
    modifiers: list(v["modifiers"], (m) => text(m, 1000), 100),
    ...(v["mealComponents"] === undefined
      ? {}
      : { mealComponents: mealComponentsSchema.parse(v["mealComponents"]) }),
    notes: nullableText(v["notes"], 20000),
    participant_name: nullableText(v["participant_name"], 1000),
    status: choice(v["status"], ticketStatuses),
    checkout_line_id: v["checkout_line_id"] == null ? null : text(v["checkout_line_id"], 100),
    parent_checkout_line_id:
      v["parent_checkout_line_id"] == null ? null : text(v["parent_checkout_line_id"], 100),
    base_unit_pence: v["base_unit_pence"] == null ? null : integer(v["base_unit_pence"]),
    unit_pence: v["unit_pence"] == null ? null : integer(v["unit_pence"]),
    modifier_details:
      v["modifier_details"] === undefined
        ? []
        : list(
            v["modifier_details"],
            (input) => {
              const m = record(input);
              return {
                name: text(m["name"], 1000),
                group_name: text(m["group_name"], 1000),
                price_delta_pence: integer(m["price_delta_pence"], -1000000),
                quantity_per_parent: integer(m["quantity_per_parent"], 1),
                ...(m["kind"] === undefined
                  ? {}
                  : { kind: choice(m["kind"], ["source", "cross", "variant"] as const) }),
              };
            },
            100,
          ),
    bags:
      v["bags"] === undefined
        ? []
        : list(
            v["bags"],
            (input) => {
              const b = record(input);
              const number = integer(b["number"], 1);
              if (number > 10) invalid();
              const name =
                b["name"] === undefined ? undefined : packingPersonNameSchema.safeParse(b["name"]);
              if (name && !name.success) invalid();
              return {
                number,
                ...(name?.success ? { name: name.data } : {}),
                quantity: integer(b["quantity"], 1),
              };
            },
            10,
          ),
  };
}

function parseItem(value: unknown): KdsItem {
  const v = record(value);
  return { ...parseOrderItem(value), ticket_item_id: id(v["ticket_item_id"]) };
}

function instructions(item: KdsOrderItem): string {
  return JSON.stringify([
    item.brand_id,
    item.brand_name,
    item.item_name,
    item.quantity,
    item.modifiers,
    item.notes,
    item.participant_name,
    // Legacy tickets predate bag projections. Named room orders require the
    // same immutable person/bag allocation on every routed copy.
    item.bags?.some((bag) => bag.name !== undefined) ? item.bags : undefined,
  ]);
}

function parseTicket(value: unknown): KdsTicket {
  const v = record(value);
  const items = list(v["items"], parseItem, 500);
  unique(items.map((item) => item.ticket_item_id));
  return {
    ticket_id: id(v["ticket_id"]),
    station_id: id(v["station_id"]),
    station_name: text(v["station_name"], 200),
    status: choice(v["status"], ticketStatuses),
    version: version(v["version"]),
    created_at: timestamp(v["created_at"]),
    started_at: nullableTimestamp(v["started_at"]),
    ready_at: nullableTimestamp(v["ready_at"]),
    items,
  };
}

function parsePass(value: unknown): KdsPass {
  const v = record(value);
  return {
    status: choice(v["status"], passStatuses),
    version: version(v["version"]),
    updated_at: timestamp(v["updated_at"]),
  };
}

function parseOrder(value: unknown): KdsOrder {
  const v = record(value);
  const fulfilment = choice(v["fulfilment"], [
    "delivery",
    "pickup",
    "curbside",
    "dine_in",
  ] as const);
  const tickets = list(v["tickets"], parseTicket, 100);
  const items = list(v["items"], parseOrderItem, 500);
  unique(items.map((item) => item.order_item_id));
  unique(tickets.map((ticket) => ticket.ticket_id));
  const routingComplete = flag(v["routing_complete"]);
  const blockedReason =
    v["blocked_reason"] === null
      ? null
      : choice(v["blocked_reason"], ["routing_incomplete"] as const);
  if (routingComplete !== (blockedReason === null)) invalid();
  if (
    routingComplete &&
    (!items.length || !tickets.length || tickets.some((ticket) => !ticket.items.length))
  )
    invalid();
  // One purchased line may need multiple station tickets. The card shows its
  // quantity once; all routed copies must retain the same food instructions.
  const canonicalItems = new Map(items.map((item) => [item.order_item_id, instructions(item)]));
  const routedItems = new Set<string>();
  for (const item of tickets.flatMap((ticket) => ticket.items)) {
    if (canonicalItems.get(item.order_item_id) !== instructions(item)) invalid();
    routedItems.add(item.order_item_id);
  }
  if (routingComplete && items.some((item) => !routedItems.has(item.order_item_id))) invalid();
  const bagNames = new Map<number, string | undefined>();
  for (const item of items) {
    for (const bag of item.bags ?? []) {
      if (bag.name !== undefined && item.participant_name !== bag.name) invalid();
      if (bagNames.has(bag.number) && bagNames.get(bag.number) !== bag.name) invalid();
      bagNames.set(bag.number, bag.name);
    }
    if (item.checkout_line_id) {
      if (!item.bags?.length || item.bags.reduce((n, b) => n + b.quantity, 0) !== item.quantity)
        invalid();
      if (new Set(item.bags.map((b) => b.number)).size !== item.bags.length) invalid();
      if (
        item.parent_checkout_line_id &&
        !items.some(
          (parent) =>
            parent.checkout_line_id === item.parent_checkout_line_id &&
            !parent.parent_checkout_line_id,
        )
      )
        invalid();
    }
  }
  const preparationStatus = choice(v["preparation_status"], ticketStatuses);
  if (v["accepted_at"] === null && preparationStatus !== "queued") invalid();
  const pass = v["pass"] === null ? null : parsePass(v["pass"]);
  const allReady =
    tickets.length > 0 &&
    tickets.every(
      (ticket) =>
        ticket.status === "ready" &&
        ticket.items.length > 0 &&
        ticket.items.every((item) => item.status === "ready"),
    );
  if (preparationStatus === "ready" && (!routingComplete || !allReady)) invalid();
  if (
    routingComplete &&
    pass &&
    pass.status !== "waiting_for_kitchen" &&
    (preparationStatus !== "ready" || !allReady)
  )
    invalid();
  if (v["order_number"] != null && !isOrderNumber(v["order_number"])) invalid();
  return {
    order_id: id(v["order_id"]),
    version: version(v["version"]),
    preparation_status: preparationStatus,
    display_code: text(v["display_code"], 40),
    ...(v["order_number"] === undefined
      ? {}
      : { order_number: v["order_number"] as string | null }),
    created_at: timestamp(v["created_at"]),
    released_at: timestamp(v["released_at"]),
    order_status: choice(v["order_status"], ["accepted", "preparing", "ready"] as const),
    fulfilment,
    notes: nullableText(v["notes"], 20000),
    group_order: flag(v["group_order"]),
    routing_complete: routingComplete,
    blocked_reason: blockedReason,
    items,
    tickets,
    pass,
    accepted_at: v["accepted_at"] == null ? null : timestamp(v["accepted_at"]),
    cutlery_requested: v["cutlery_requested"] === undefined ? false : flag(v["cutlery_requested"]),
    vehicle:
      v["vehicle"] == null
        ? null
        : (() => {
            const car = record(v["vehicle"]);
            return {
              make: text(car["make"], 100),
              colour: text(car["colour"], 100),
              registrationLast4: text(car["registrationLast4"], 4),
            };
          })(),
    pickupContact:
      fulfilment === "pickup" || fulfilment === "curbside"
        ? parseKdsPickupContact(v["pickupContact"])
        : null,
  };
}

/** Copy only reviewed fields and reject stale-scope/malformed RPC results. */
export function parseKdsBoard(
  value: unknown,
  scope: { tenantId: string; locationId: string },
): KdsBoard {
  const v = record(value);
  if (
    v["schema_version"] !== 1 ||
    v["tenant_id"] !== scope.tenantId ||
    v["location_id"] !== scope.locationId
  )
    invalid();
  const stations = list(
    v["stations"],
    (input): KdsStation => {
      const station = record(input);
      return {
        station_id: id(station["station_id"]),
        name: text(station["name"], 200),
        code: text(station["code"], 100),
        active: flag(station["active"]),
      };
    },
    100,
  );
  const orders = list(v["orders"], parseOrder, 250);
  const readiness = choice(v["readiness"], ["ready", "setup_required"] as const);
  if (readiness === "setup_required" && orders.length) invalid();
  unique(stations.map((station) => station["station_id"]));
  unique(orders.map((order) => order.order_id));
  unique(orders.flatMap((order) => order.tickets.map((ticket) => ticket.ticket_id)));
  const stationIds = new Set(stations.map((station) => station["station_id"]));
  if (orders.some((order) => order.tickets.some((ticket) => !stationIds.has(ticket.station_id))))
    invalid();
  return {
    schema_version: 1,
    tenant_id: id(v["tenant_id"]),
    location_id: id(v["location_id"]),
    generated_at: timestamp(v["generated_at"]),
    readiness,
    held_order_count: integer(v["held_order_count"]),
    remaining_order_count: integer(v["remaining_order_count"]),
    stations,
    orders,
  };
}

export function parseKdsMutation(
  value: unknown,
  expected: { orderId: string; status: KdsMutation["status"] },
): KdsMutation {
  const v = record(value);
  if (v["ok"] !== true || v["order_id"] !== expected.orderId || v["status"] !== expected.status)
    invalid();
  return {
    ok: true,
    replayed: flag(v["replayed"]),
    order_id: id(v["order_id"]),
    status: choice(v["status"], [
      "accepted",
      "preparing",
      "ready",
      "packing",
      "sealed",
      "completed",
    ] as const),
  };
}

export function nextKdsTicketStatus(status: KdsTicketStatus): "preparing" | "ready" | null {
  return status === "queued" ? "preparing" : status === "preparing" ? "ready" : null;
}

/** The current shared kitchen advances all brands of one master order atomically. */
export const nextKdsOrderStatus = nextKdsTicketStatus;

export function nextKdsPassStatus(status: KdsPassStatus): "packing" | "sealed" | null {
  return status === "ready_to_pack" ? "packing" : status === "packing" ? "sealed" : null;
}
