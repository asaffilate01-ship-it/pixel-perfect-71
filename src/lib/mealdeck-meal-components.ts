import { z } from "zod";

/** Kitchen instructions projected from the canonical frozen choices, never
 * inferred from a product name or used as a source of prices or payment state. */
export const mealComponentsSchema = z
  .array(
    z
      .object({
        slot: z.enum(["main", "side", "drink"]),
        name: z
          .string()
          .min(1)
          .max(1000)
          .refine((value) => value === value.trim() && !/[\p{Cc}\p{Cf}]/u.test(value)),
        quantityPerParent: z.number().int().min(1).max(999),
        replacement: z.boolean(),
      })
      .strict(),
  )
  .max(3)
  .refine(
    (components) =>
      new Set(components.map((component) => component.slot)).size === components.length &&
      components.every((component) => component.slot !== "main" || !component.replacement),
    "Meal components are inconsistent",
  );

export type MealComponent = z.infer<typeof mealComponentsSchema>[number];
