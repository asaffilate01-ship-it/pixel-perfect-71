import { z } from "zod";
import { packingPersonNameSchema } from "./mealdeck-packing-name";
const uuid = z.string().uuid(),
  stamp = z.string().datetime({ offset: true });
const money = z.number().int().min(0).max(10000000);
const packingSchema = z.object({
  version: z.literal(1),
  separateBags: z.boolean(),
  cutleryRequested: z.boolean(),
  bags: z
    .array(
      z.object({
        number: z.number().int().min(1).max(10),
        name: packingPersonNameSchema.optional(),
        allocations: z
          .array(
            z.object({
              lineId: z.string().min(1).max(100),
              quantity: z.number().int().min(1).max(999),
            }),
          )
          .min(1)
          .max(180),
      }),
    )
    .min(1)
    .max(10),
});
export const receiptSchema = z
  .object({
    schemaVersion: z.literal(1),
    orderId: uuid,
    copyNumber: z.number().int().min(1).max(100),
    reprintOf: uuid.nullable(),
    reprintReason: z.string().max(300).nullable(),
    displayCode: z.string().regex(/^\d{4}$/),
    brand: z.literal("MealDeck"),
    tradingName: z.literal("313 Brands Ltd"),
    locationName: z.string().min(1).max(140),
    createdAt: stamp,
    paidAt: stamp,
    acceptedAt: stamp,
    fulfilment: z.enum(["pickup", "curbside"]),
    customerName: z.string().min(1).max(200),
    car: z
      .object({
        make: z.string().min(1).max(100),
        colour: z.string().min(1).max(100),
        registrationLast4: z.string().regex(/^[A-Z0-9]{4}$/),
      })
      .nullable(),
    cutleryRequested: z.boolean(),
    packingPlan: packingSchema,
    items: z
      .array(
        z.object({
          lineId: z.string().min(1).max(100),
          parentLineId: z.string().max(100).nullable(),
          brandName: z.string().min(1).max(140),
          name: z.string().min(1).max(1000),
          quantity: z.number().int().min(1).max(999),
          baseUnitPence: money,
          unitPence: money,
          linePence: money,
          notes: z.string().max(20000).nullable(),
          modifiers: z
            .array(
              z.object({
                name: z.string().min(1).max(1000),
                groupName: z.string().max(1000),
                quantityPerParent: z.number().int().min(1).max(999),
                priceDeltaPence: z.number().int().min(-1000000).max(1000000),
              }),
            )
            .max(100),
        }),
      )
      .min(1)
      .max(180),
    subtotalPence: money,
    discountPence: money,
    totalPence: money,
    currency: z.literal("GBP"),
    orderNotes: z.string().max(20000).nullable(),
  })
  .superRefine((r, ctx) => {
    const fail = () =>
      ctx.addIssue({ code: "custom", message: "Receipt snapshot is inconsistent" });
    if (
      r.items.reduce((n, i) => n + i.linePence, 0) !== r.subtotalPence ||
      r.totalPence !== r.subtotalPence - r.discountPence
    )
      fail();
    if (
      r.items.some(
        (i) =>
          i.linePence !== i.quantity * i.unitPence ||
          i.baseUnitPence +
            i.modifiers.reduce((n, m) => n + m.priceDeltaPence * m.quantityPerParent, 0) !==
            i.unitPence,
      )
    )
      fail();
    if (
      Date.parse(r.paidAt) < Date.parse(r.createdAt) ||
      Date.parse(r.acceptedAt) < Date.parse(r.paidAt)
    )
      fail();
    if (new Set(r.items.map((i) => i.lineId)).size !== r.items.length) fail();
    if (
      r.cutleryRequested !== r.packingPlan.cutleryRequested ||
      (r.fulfilment === "curbside") !== !!r.car
    )
      fail();
    if (
      (r.copyNumber === 1) !== (r.reprintOf === null) ||
      (r.copyNumber === 1) !== (r.reprintReason === null)
    )
      fail();
    if (!r.packingPlan.separateBags && r.packingPlan.bags.length !== 1) fail();
    const totals = new Map<string, number>();
    for (const [index, bag] of r.packingPlan.bags.entries()) {
      if (
        bag.number !== index + 1 ||
        new Set(bag.allocations.map((a) => a.lineId)).size !== bag.allocations.length
      )
        fail();
      for (const allocation of bag.allocations) {
        if (!r.items.some((i) => i.lineId === allocation.lineId)) fail();
        totals.set(allocation.lineId, (totals.get(allocation.lineId) ?? 0) + allocation.quantity);
      }
      for (const child of r.items.filter((i) => i.parentLineId))
        if (
          (bag.allocations.find((a) => a.lineId === child.lineId)?.quantity ?? 0) !==
          (bag.allocations.find((a) => a.lineId === child.parentLineId)?.quantity ?? 0)
        )
          fail();
    }
    if (
      r.items.some(
        (i) =>
          totals.get(i.lineId) !== i.quantity ||
          (i.parentLineId && !r.items.some((p) => p.lineId === i.parentLineId && !p.parentLineId)),
      )
    )
      fail();
  });
export type MealDeckReceipt = z.infer<typeof receiptSchema>;
export const printerJobSchema = z
  .object({
    jobId: uuid,
    orderId: uuid,
    copyNumber: z.number().int().min(1).max(100),
    status: z.enum([
      "queued",
      "claimed",
      "sending",
      "sent_unconfirmed",
      "printed",
      "held",
      "failed",
    ]),
    createdAt: stamp,
    updatedAt: stamp,
    resolution: z.string().max(300).nullable(),
    receipt: receiptSchema,
  })
  .superRefine((j, c) => {
    if (j.orderId !== j.receipt.orderId || j.copyNumber !== j.receipt.copyNumber)
      c.addIssue({ code: "custom", message: "Receipt job mismatch" });
  });
export type PrinterJob = z.infer<typeof printerJobSchema>;
export type PrinterScope = {
  tenantId: string;
  locationId: string;
  locationName: string;
  tenantName: string;
  canManage: boolean;
};
export function parsePrinterScopes(input: unknown): PrinterScope[] {
  return z
    .object({
      schemaVersion: z.literal(1),
      scopes: z
        .array(
          z.object({
            tenantId: uuid,
            locationId: uuid,
            locationName: z.string().max(140),
            tenantName: z.string().max(140),
            canManage: z.boolean(),
          }),
        )
        .max(100),
    })
    .parse(input).scopes;
}
export function parsePrinterBoard(
  input: unknown,
  scope: Pick<PrinterScope, "tenantId" | "locationId">,
) {
  const result = z
    .object({
      schemaVersion: z.literal(1),
      tenantId: uuid,
      locationId: uuid,
      generatedAt: stamp,
      jobs: z.array(printerJobSchema).max(100),
    })
    .parse(input);
  if (
    result.tenantId !== scope.tenantId ||
    result.locationId !== scope.locationId ||
    new Set(result.jobs.map((j) => j.jobId)).size !== result.jobs.length
  )
    throw new Error("Invalid printer scope");
  return result;
}
export function parseClaim(input: unknown, expectedJobId: string) {
  const result = printerJobSchema
    .and(z.object({ claimToken: uuid, replayed: z.boolean() }))
    .parse(input);
  if (result.jobId !== expectedJobId || result.status !== "claimed")
    throw new Error("Invalid receipt claim");
  return result;
}
export function receiptItemBags(receipt: MealDeckReceipt, lineId: string) {
  return receipt.packingPlan.bags.flatMap((b) =>
    b.allocations
      .filter((a) => a.lineId === lineId)
      .map((a) => ({
        number: b.number,
        ...(b.name === undefined ? {} : { name: b.name }),
        quantity: a.quantity,
      })),
  );
}
export const formatReceiptMoney = (pence: number) =>
  new Intl.NumberFormat("en-GB", { style: "currency", currency: "GBP" }).format(pence / 100);
export const printerStatusLabel: Record<PrinterJob["status"], string> = {
  queued: "Waiting to print",
  claimed: "Claimed by a terminal",
  sending: "Sending — do not retry",
  sent_unconfirmed: "Check the paper receipt",
  printed: "Paper confirmed",
  held: "Held — inspect the printer",
  failed: "Confirmed not printed",
};
