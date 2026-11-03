import { describe, expect, test } from "bun:test";
import {
  canonicalDeliveryFeePence,
  validateCheckoutDeliveryFee,
} from "../src/lib/mealdeck-checkout-delivery-fee";
import { DELIVERY_FEE_PENCE } from "../src/lib/mealdeck";

describe("MealDeck checkout delivery charge integrity", () => {
  test("uses the server-owned launch delivery charge", () => {
    expect(canonicalDeliveryFeePence("delivery")).toBe(DELIVERY_FEE_PENCE);
    expect(validateCheckoutDeliveryFee("delivery", DELIVERY_FEE_PENCE)).toBe(true);
  });

  test("rejects a forged free or discounted delivery charge", () => {
    expect(validateCheckoutDeliveryFee("delivery", 0)).toBe(false);
    expect(validateCheckoutDeliveryFee("delivery", DELIVERY_FEE_PENCE - 1)).toBe(false);
  });

  test("rejects an inflated delivery charge rather than silently billing it", () => {
    expect(validateCheckoutDeliveryFee("delivery", DELIVERY_FEE_PENCE + 1)).toBe(false);
  });

  test("does not allow adding a delivery fee to collection, kerbside or dine-in", () => {
    for (const method of ["pickup", "curbside", "dinein"] as const) {
      expect(canonicalDeliveryFeePence(method)).toBe(0);
      expect(validateCheckoutDeliveryFee(method, 0)).toBe(true);
      expect(validateCheckoutDeliveryFee(method, DELIVERY_FEE_PENCE)).toBe(false);
    }
  });

  test("rejects malformed or non-integer amounts", () => {
    for (const submitted of [NaN, Infinity, -Infinity, -1, 2.99, 299.1]) {
      expect(validateCheckoutDeliveryFee("delivery", submitted)).toBe(false);
    }
  });
});
