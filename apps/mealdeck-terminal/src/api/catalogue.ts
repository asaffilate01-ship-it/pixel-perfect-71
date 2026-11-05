import { z } from "zod";
import { LAUNCH_MENU_PRICE_REVISION, type LaunchMenuBrand } from "../menu";

const brandId = z.enum(["skorch-burgers", "tavo-chicken", "loadd", "moktl", "souvano"]);
const refs = z.array(z.string());
const description = z.string().optional();
const brand = z.object({
  id: brandId,
  name: z.string(),
  accent: z.string(),
  description,
  sourceRefs: refs,
  sections: z.array(
    z.object({
      id: z.string(),
      title: z.string(),
      description,
      sourceRefs: refs,
      items: z.array(
        z.object({
          id: z.string(),
          name: z.string(),
          description,
          pricePence: z.number().int().nonnegative().nullable(),
          optionGroupIds: refs,
          sourceRefs: refs,
          priceVariants: z
            .array(
              z.object({
                groupId: z.string(),
                optionId: z.string(),
                label: z.string(),
                selections: z.record(z.string(), z.string()),
                pricePence: z.number().int().nonnegative(),
              }),
            )
            .optional(),
        }),
      ),
    }),
  ),
  optionGroups: z.array(
    z.object({
      id: z.string(),
      label: z.string(),
      description,
      kind: z.enum(["single", "multiple"]),
      required: z.boolean(),
      sourceRefs: refs,
      when: z.object({ groupId: z.string(), optionIds: refs }).optional(),
      replacedBy: z.object({ crossSlot: z.literal("drink"), optionIds: refs }).optional(),
      options: z.array(
        z.object({
          id: z.string(),
          label: z.string(),
          description,
          pricePence: z.number().int().nonnegative().nullable(),
          available: z.boolean().optional(),
          unavailableReason: z.string().optional(),
          sourceRefs: refs,
        }),
      ),
    }),
  ),
  upsells: z.array(
    z.object({
      id: z.string(),
      label: z.string(),
      description,
      optionGroupId: z.string().optional(),
      targetBrandId: brandId.optional(),
      targetSectionId: z.string().optional(),
      sourceRefs: refs,
    }),
  ),
});
export const catalogueSchema = z.object({
  brands: z.array(brand).min(1).max(5),
  priceRevision: z.literal(LAUNCH_MENU_PRICE_REVISION),
  notice: z.string(),
});
export type MenuCatalogue = { brands: LaunchMenuBrand[]; priceRevision: string; notice: string };

export type SaleSelection = {
  picks: {
    brandId: string;
    itemId: string;
    quantity: number;
    selections: Record<string, string[]>;
    crossSelections?: {
      slot: "side" | "drink";
      mode: "upgrade" | "extra";
      brandId: "loadd" | "moktl";
      itemId: string;
    }[];
  }[];
  fulfilment: "pickup" | "curbside";
  vehicle?: { make: string; colour: string; registrationLast4: string };
  packing: {
    cutleryRequested: boolean;
    separateBags: boolean;
    bagCount: number;
    allocations: { lineId: string; bag: number; quantity: number }[];
  };
};
