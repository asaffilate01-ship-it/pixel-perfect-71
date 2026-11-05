import { createHash } from "node:crypto";
import { z } from "zod";
import { getLaunchMenuPriceVariant, isLaunchBrandPriceApproved } from "./launch-menu-catalogue";
import { findLaunchMenuItem, launchItemGroups, missingLaunchChoices } from "./launch-menu-picks";
import { cleanLaunchCrossConfiguration } from "./launch-menu-upsells";
import { parseKerbsideVehicle } from "./mealdeck-opening-offer";

const sourceId = z
  .string()
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/)
  .max(180);
const pickSchema = z
  .object({
    brandId: sourceId,
    itemId: sourceId,
    quantity: z.number().int().min(1).max(20),
    selections: z.record(sourceId, z.array(sourceId).max(30)),
    crossSelections: z
      .array(
        z
          .object({
            slot: z.enum(["side", "drink"]),
            mode: z.enum(["upgrade", "extra"]),
            brandId: z.enum(["loadd", "moktl"]),
            itemId: sourceId,
          })
          .strict(),
      )
      .max(2)
      .optional(),
  })
  .strict();

export const checkoutQuoteInput = z
  .object({
    action: z.literal("quote"),
    fulfilment: z.enum(["pickup", "curbside"]),
    picks: z.array(pickSchema).min(1).max(60),
    vehicle: z.unknown().optional(),
    packing: z
      .object({
        cutleryRequested: z.boolean(),
        separateBags: z.boolean(),
        bagCount: z.number().int().min(1).max(10),
        allocations: z
          .array(
            z
              .object({
                lineId: z.string().regex(/^line-([1-9]|[1-5][0-9]|60)$/),
                bag: z.number().int().min(1).max(10),
                quantity: z.number().int().min(1).max(20),
              })
              .strict(),
          )
          .max(600),
      })
      .strict(),
  })
  .strict();
export const checkoutPayInput = z
  .object({
    action: z.literal("pay"),
    quoteId: z.uuid(),
    attemptId: z.uuid(),
    reviewConfirmed: z.literal(true),
  })
  .strict();
export const checkoutReceiptInput = z
  .object({
    action: z.literal("receipt"),
    orderId: z.uuid(),
  })
  .strict();

export class CheckoutProblem extends Error {
  constructor(
    public code: string,
    message: string,
    public status = 400,
  ) {
    super(message);
    this.name = "CheckoutProblem";
  }
}

/** Identical UUIDv5 namespace to the insert-only approved catalogue importer. */
export function checkoutModifierId(tenantId: string, kind: "group" | "option", source: string) {
  if (!z.uuid().safeParse(tenantId).success || !sourceId.safeParse(source).success)
    throw new CheckoutProblem("invalid_selection", "Please review your menu choices.");
  const bytes = createHash("sha1")
    .update(Buffer.from(tenantId.replaceAll("-", ""), "hex"))
    .update("mealdeck-launch-v1:" + kind + ":" + source)
    .digest()
    .subarray(0, 16);
  bytes[6] = (bytes[6]! & 15) | 80;
  bytes[8] = (bytes[8]! & 63) | 128;
  const h = bytes.toString("hex");
  return [h.slice(0, 8), h.slice(8, 12), h.slice(12, 16), h.slice(16, 20), h.slice(20)].join("-");
}

export type CanonicalCheckoutLine = {
  lineId: string;
  parentLineId: string | null;
  sku: string;
  quantity: number;
  modifiers: {
    groupId: string;
    optionId: string;
    kind: "source" | "cross" | "variant";
    targetSku?: string;
  }[];
  attachment: string | null;
};

export type MealDeckPackingPlan = {
  version: 1;
  separateBags: boolean;
  cutleryRequested: boolean;
  bags: { number: number; allocations: { lineId: string; quantity: number }[] }[];
};

/** Strict source validation, then server-derived canonical IDs. No browser prices survive. */
export function normaliseCheckoutSelection(input: unknown, tenantId: string) {
  const parsed = checkoutQuoteInput.safeParse(input);
  if (!parsed.success)
    throw new CheckoutProblem(
      "invalid_selection",
      "Please review your basket and collection details.",
    );
  const data = parsed.data;
  if (data.picks.reduce((count, pick) => count + pick.quantity, 0) > 60)
    throw new CheckoutProblem("basket_limit", "Please keep this order to 60 items or fewer.");
  const vehicle = data.fulfilment === "curbside" ? parseKerbsideVehicle(data.vehicle) : null;
  if (data.fulfilment === "curbside" && !vehicle)
    throw new CheckoutProblem(
      "vehicle_required",
      "Enter the car make, colour and last 4 registration characters.",
    );
  if (data.fulfilment !== "curbside" && data.vehicle != null)
    throw new CheckoutProblem(
      "vehicle_not_needed",
      "Car details are only needed for kerbside pickup.",
    );
  const lines: CanonicalCheckoutLine[] = [];
  for (const [index, pick] of data.picks.entries()) {
    const lineId = "line-" + (index + 1);
    const found = findLaunchMenuItem(pick.brandId, pick.itemId);
    if (!found || !isLaunchBrandPriceApproved(pick.brandId))
      throw new CheckoutProblem(
        "item_unavailable",
        "An item in your basket is not available to order yet.",
      );
    const groups = launchItemGroups(found.brand, found.item);
    for (const [groupId, selected] of Object.entries(pick.selections)) {
      const group = groups.find((entry) => entry.id === groupId);
      if (
        !group ||
        new Set(selected).size !== selected.length ||
        (group.kind === "single" && selected.length > 1) ||
        selected.some(
          (id) => !group.options.some((option) => option.id === id && option.available !== false),
        )
      )
        throw new CheckoutProblem(
          "invalid_option",
          "One of your choices has changed. Please customise the item again.",
        );
    }
    const clean = cleanLaunchCrossConfiguration(
      found.brand,
      found.item,
      pick.selections,
      pick.crossSelections,
    );
    if (
      (pick.crossSelections?.length ?? 0) !== clean.crossSelections.length ||
      missingLaunchChoices(found.brand, found.item, clean.selections, clean.crossSelections).length
    )
      throw new CheckoutProblem(
        "incomplete_choices",
        "Please finish your meal choices before checkout.",
      );
    const modifiers: CanonicalCheckoutLine["modifiers"] = Object.entries(clean.selections).flatMap(
      ([groupId, options]) =>
        options.map((optionId) => ({
          groupId: checkoutModifierId(tenantId, "group", groupId),
          optionId: checkoutModifierId(tenantId, "option", optionId),
          kind: "source" as const,
        })),
    );
    const variant = getLaunchMenuPriceVariant(pick.brandId, pick.itemId, clean.selections);
    if (found.item.priceVariants && !variant)
      throw new CheckoutProblem(
        "variant_required",
        "Choose a portion and flavour for your chicken.",
      );
    if (variant)
      modifiers.push({
        groupId: checkoutModifierId(tenantId, "group", variant.groupId),
        optionId: checkoutModifierId(tenantId, "option", variant.optionId),
        kind: "variant",
      });
    for (const cross of clean.crossSelections) {
      const target = findLaunchMenuItem(cross.brandId, cross.itemId);
      if (!target || !isLaunchBrandPriceApproved(cross.brandId))
        throw new CheckoutProblem(
          "upgrade_unavailable",
          "That upgrade is not available right now.",
        );
      if (cross.mode === "extra")
        lines.push({
          lineId: lineId + "-extra-" + cross.slot,
          parentLineId: lineId,
          sku: cross.itemId,
          quantity: pick.quantity,
          modifiers: [],
          attachment: "Extra with " + found.item.name,
        });
      else {
        const group = "cross-" + cross.slot + "-replacement";
        modifiers.push({
          groupId: checkoutModifierId(tenantId, "group", group),
          optionId: checkoutModifierId(tenantId, "option", group + "-" + cross.itemId),
          kind: "cross",
          targetSku: cross.itemId,
        });
      }
    }
    lines.push({
      lineId,
      parentLineId: null,
      sku: found.item.id,
      quantity: pick.quantity,
      modifiers,
      attachment: null,
    });
  }
  const { packing } = data;
  if (!packing.separateBags && (packing.bagCount !== 1 || packing.allocations.length !== 0))
    throw new CheckoutProblem(
      "invalid_packing",
      "Choose pack together or review your numbered bags.",
    );
  const allocations = packing.separateBags
    ? packing.allocations
    : data.picks.map((pick, index) => ({
        lineId: "line-" + (index + 1),
        bag: 1,
        quantity: pick.quantity,
      }));
  const seen = new Set<string>();
  const quantities = new Map<string, number>();
  for (const allocation of allocations) {
    const source = lines.find(
      (line) => line.lineId === allocation.lineId && line.parentLineId === null,
    );
    const key = allocation.lineId + ":" + allocation.bag;
    if (!source || allocation.bag > packing.bagCount || seen.has(key))
      throw new CheckoutProblem(
        "invalid_packing",
        "Each item must be assigned to a valid numbered bag.",
      );
    seen.add(key);
    quantities.set(
      allocation.lineId,
      (quantities.get(allocation.lineId) ?? 0) + allocation.quantity,
    );
  }
  if (
    lines.some(
      (line) => line.parentLineId === null && quantities.get(line.lineId) !== line.quantity,
    )
  )
    throw new CheckoutProblem(
      "incomplete_packing",
      "Assign the full quantity of every item to your bags exactly once.",
    );
  const bags: MealDeckPackingPlan["bags"] = Array.from(
    { length: packing.bagCount },
    (_, index) => ({
      number: index + 1,
      allocations: allocations
        .filter((entry) => entry.bag === index + 1)
        .flatMap((entry) => [
          { lineId: entry.lineId, quantity: entry.quantity },
          ...lines
            .filter((line) => line.parentLineId === entry.lineId)
            .map((line) => ({ lineId: line.lineId, quantity: entry.quantity })),
        ]),
    }),
  );
  if (bags.some((bag) => bag.allocations.length === 0))
    throw new CheckoutProblem(
      "empty_bag",
      "Assign at least one item to every numbered bag, or reduce the number of bags.",
    );
  const packingPlan: MealDeckPackingPlan = {
    version: 1,
    separateBags: packing.separateBags,
    cutleryRequested: packing.cutleryRequested,
    bags,
  };
  const payload = { fulfilment: data.fulfilment, vehicle, lines, packingPlan };
  return {
    ...payload,
    requestHash: createHash("sha256").update(JSON.stringify(payload)).digest("hex"),
  };
}
