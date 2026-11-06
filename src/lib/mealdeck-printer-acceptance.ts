import { z } from "zod";
import { printerPackingSchema, type PrinterJob, type PrinterScope } from "./mealdeck-printer";
import { orderNumberSchema } from "./mealdeck-order-number";

const uuid = z.string().uuid();
const stamp = z.string().datetime({ offset: true });
const money = z.number().int().min(0).max(10000000);
const lineId = z.string().min(1).max(100);
const itemSchema = z.object({
  lineId,
  parentLineId: lineId.nullable(),
  name: z.string().min(1).max(1000),
  brandName: z.string().min(1).max(1000),
  quantity: z.number().int().min(1).max(999),
  unitPence: money,
  modifiers: z.array(z.string().min(1).max(1000)).max(100),
  notes: z.string().max(20000).nullable(),
  bags: z
    .array(
      z.object({
        number: z.number().int().min(1).max(10),
        quantity: z.number().int().min(1).max(999),
      }),
    )
    .min(1)
    .max(10),
});

/** A purchased-order summary, deliberately not a receipt: no fabricated
 * acceptance time, copy number, claim or printable payload exists here. */
export const printerPendingOrderSchema = z
  .object({
    orderId: uuid,
    version: z.string().regex(/^[0-9a-f]{32}$/),
    displayCode: z.string().regex(/^\d{4}$/),
    orderNumber: orderNumberSchema.nullable().optional(),
    paidAt: stamp,
    fulfilment: z.enum(["pickup", "curbside"]),
    totalPence: money,
    cutleryRequested: z.boolean(),
    notes: z.string().max(20000).nullable(),
    packingPlan: printerPackingSchema,
    items: z.array(itemSchema).min(1).max(180),
  })
  .superRefine((order, context) => {
    const fail = () =>
      context.addIssue({ code: "custom", message: "Paid order summary is inconsistent" });
    if (new Set(order.items.map((item) => item.lineId)).size !== order.items.length) fail();
    if (order.cutleryRequested !== order.packingPlan.cutleryRequested) fail();
    if (!order.packingPlan.separateBags && order.packingPlan.bags.length !== 1) fail();
    const totals = new Map<string, number>();
    for (const [index, bag] of order.packingPlan.bags.entries()) {
      if (
        bag.number !== index + 1 ||
        new Set(bag.allocations.map((entry) => entry.lineId)).size !== bag.allocations.length
      )
        fail();
      for (const allocation of bag.allocations) {
        if (!order.items.some((item) => item.lineId === allocation.lineId)) fail();
        totals.set(allocation.lineId, (totals.get(allocation.lineId) ?? 0) + allocation.quantity);
      }
      for (const item of order.items) {
        const quantity =
          bag.allocations.find((entry) => entry.lineId === item.lineId)?.quantity ?? 0;
        if ((item.bags.find((entry) => entry.number === bag.number)?.quantity ?? 0) !== quantity)
          fail();
        if (
          item.parentLineId &&
          quantity !==
            (bag.allocations.find((entry) => entry.lineId === item.parentLineId)?.quantity ?? 0)
        )
          fail();
      }
    }
    for (const item of order.items) {
      if (
        totals.get(item.lineId) !== item.quantity ||
        new Set(item.bags.map((bag) => bag.number)).size !== item.bags.length
      )
        fail();
      if (
        item.bags.some(
          (bag) => !order.packingPlan.bags.some((expected) => expected.number === bag.number),
        )
      )
        fail();
      if (
        item.parentLineId &&
        !order.items.some((parent) => parent.lineId === item.parentLineId && !parent.parentLineId)
      )
        fail();
    }
  });
export type PrinterPendingOrder = z.infer<typeof printerPendingOrderSchema>;

export function parsePrinterAcceptanceBoard(
  input: unknown,
  scope: Pick<PrinterScope, "tenantId" | "locationId">,
) {
  const board = z
    .object({
      schemaVersion: z.literal(1),
      tenantId: uuid,
      locationId: uuid,
      generatedAt: stamp,
      orders: z.array(printerPendingOrderSchema).max(100),
      remainingOrderCount: z.number().int().min(0).max(1000000),
    })
    .parse(input);
  if (
    board.tenantId !== scope.tenantId ||
    board.locationId !== scope.locationId ||
    new Set(board.orders.map((order) => order.orderId)).size !== board.orders.length
  )
    throw new Error("Invalid printer acceptance scope");
  return board;
}

export function parsePrinterAcceptance(input: unknown, expectedOrderId: string) {
  const result = z
    .object({
      schemaVersion: z.literal(1),
      orderId: uuid,
      accepted: z.literal(true),
      replayed: z.boolean(),
      receiptJobId: uuid,
    })
    .parse(input);
  if (result.orderId !== expectedOrderId) throw new Error("Invalid printer acceptance result");
  return result;
}

export class PrinterAcceptanceError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PrinterAcceptanceError";
  }
}

/** One explicit acceptance request, with the same synchronous lock as receipt
 * sends. Neither this action nor a replay can claim, print or reprint a job. */
export async function acceptPrinterPendingOrder({
  order,
  scope,
  mutation,
  readCurrent,
  request,
  onStart,
}: {
  order: Pick<PrinterPendingOrder, "orderId" | "version">;
  scope: Pick<PrinterScope, "tenantId" | "locationId">;
  mutation: { current: boolean };
  readCurrent: () => { fresh: boolean; orders: readonly PrinterPendingOrder[] };
  request: (name: string, args: Record<string, unknown>) => Promise<unknown>;
  onStart?: () => void;
}) {
  if (mutation.current) throw new PrinterAcceptanceError("Another printer action is in progress.");
  const current = readCurrent();
  const latest = current.orders.find((entry) => entry.orderId === order.orderId);
  if (!current.fresh || !latest || latest.version !== order.version)
    throw new PrinterAcceptanceError(
      "This order changed or the live queue is stale. Refresh before accepting it.",
    );
  mutation.current = true;
  try {
    onStart?.();
    const result = await request("mealdeck_printer_accept_order", {
      p_tenant: scope.tenantId,
      p_location: scope.locationId,
      p_order: latest.orderId,
      p_expected_version: latest.version,
    });
    return parsePrinterAcceptance(result, latest.orderId);
  } finally {
    mutation.current = false;
  }
}

export function printerAcceptanceAction({
  fresh,
  paired,
  automatic,
}: {
  fresh: boolean;
  paired: boolean;
  automatic: boolean;
}) {
  return fresh && paired && automatic ? "Accept & print" : "Accept & queue receipt";
}

/** The same order makes one arrival sound as it moves from paid to accepted.
 * Explicit requested copies remain distinct jobs. */
export function printerArrivalKeys(
  orders: readonly Pick<PrinterPendingOrder, "orderId">[],
  jobs: readonly Pick<PrinterJob, "orderId" | "jobId" | "copyNumber">[],
) {
  return [
    ...new Set([
      ...orders.map((order) => `order:${order.orderId}`),
      ...jobs.map((job) => (job.copyNumber === 1 ? `order:${job.orderId}` : `copy:${job.jobId}`)),
    ]),
  ];
}
