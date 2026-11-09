import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { ownDriverShortfallPence, OWN_DRIVER_MINIMUM_PENCE } from "../src/lib/mealdeck-own-driver-delivery";

describe("MealDeck Luton delivery minimum customer feedback", () => {
  test("is always £15 based on the final after-discount payable amount", () => {
    expect(OWN_DRIVER_MINIMUM_PENCE).toBe(1500);
    expect(ownDriverShortfallPence(0)).toBe(1500);
    expect(ownDriverShortfallPence(1499)).toBe(1);
    expect(ownDriverShortfallPence(1500)).toBe(0);
    expect(ownDriverShortfallPence(3000)).toBe(0);
  });

  test("under-minimum baskets show immediate accessible feedback on delivery selection", () => {
    const checkout = readFileSync(new URL("../src/components/launch-checkout.tsx", import.meta.url), "utf8");
    expect(checkout).toContain('fulfilment === "delivery" && deliveryShortfall !== null');
    expect(checkout).toContain('role="alert" aria-live="polite"');
    expect(checkout).toContain("Delivery is only available for orders of");
    expect(checkout).toContain("£15 or more after discounts");
    expect(checkout).toContain("collection or kerbside");
    expect(checkout).toContain('if (fulfilment === "delivery" && deliveryUnderMinimum)');
    expect(checkout).not.toContain("after the 30%\n");
  });
});
