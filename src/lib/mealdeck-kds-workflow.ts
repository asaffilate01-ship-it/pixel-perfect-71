import { z } from "zod";
import { parseKdsBoard, type KdsBoard } from "./mealdeck-kds";
import { packingPersonNameSchema } from "./mealdeck-packing-name";

const timestamp = z
  .string()
  .max(64)
  .refine((value) => /^\d{4}-\d{2}-\d{2}T/.test(value) && Number.isFinite(Date.parse(value)));
const completedItem = z.object({
  order_item_id: z.string().uuid(),
  item_name: z.string().min(1).max(1000),
  brand_name: z.string().max(1000),
  quantity: z.number().int().positive().max(100000),
  modifiers: z.array(z.string().max(1000)).max(100),
  notes: z.string().max(20000).nullable(),
  participant_name: z.string().max(1000).nullable(),
  bags: z
    .array(
      z.object({
        number: z.number().int().min(1).max(10),
        name: packingPersonNameSchema.optional(),
        quantity: z.number().int().positive(),
      }),
    )
    .max(10)
    .optional(),
});
const completedOrder = z.object({
  order_id: z.string().uuid(),
  display_code: z.string().min(1).max(40),
  order_status: z.literal("fulfilled"),
  handoff_status: z.literal("handed_off"),
  accepted_at: timestamp,
  completed_at: timestamp,
  fulfilment: z.enum(["delivery", "pickup", "curbside", "dine_in"]),
  group_order: z.boolean(),
  cutlery_requested: z.boolean(),
  notes: z.string().max(20000).nullable(),
  items: z.array(completedItem).min(1).max(500),
});
export type KdsCompletedOrder = z.infer<typeof completedOrder>;
export type KdsWorkflowBoard = KdsBoard & {
  completed_orders: KdsCompletedOrder[];
  completed_remaining_order_count: number;
  completed_window_hours: 12;
};

/** Done is durable server history, never a local completion flag or payment return. */
export function parseKdsWorkflowBoard(
  value: unknown,
  scope: { tenantId: string; locationId: string },
): KdsWorkflowBoard {
  const active = parseKdsBoard(value, scope);
  const result = z
    .object({
      completed_orders: z.array(completedOrder).max(100),
      completed_remaining_order_count: z.number().int().nonnegative(),
      completed_window_hours: z.literal(12),
    })
    .safeParse(value);
  if (!result.success) throw new Error("mealdeck_kds_invalid_response");
  const seen = new Set(active.orders.map((order) => order.order_id));
  const now = Date.parse(active.generated_at);
  for (const order of result.data.completed_orders) {
    const completed = Date.parse(order.completed_at);
    if (
      seen.has(order.order_id) ||
      completed < Date.parse(order.accepted_at) ||
      completed > now ||
      completed < now - 12 * 60 * 60 * 1000 ||
      new Set(order.items.map((item) => item.order_item_id)).size !== order.items.length
    ) {
      throw new Error("mealdeck_kds_invalid_response");
    }
    seen.add(order.order_id);
  }
  if (active.readiness !== "ready" && result.data.completed_orders.length) {
    throw new Error("mealdeck_kds_invalid_response");
  }
  return { ...active, ...result.data };
}
