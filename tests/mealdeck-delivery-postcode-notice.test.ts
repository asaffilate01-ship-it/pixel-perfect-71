import { describe, expect, test } from "bun:test";
import { deliveryAreaRejectionMessage } from "../src/lib/mealdeck-delivery-postcode-notice";

describe("customer-facing delivery postcode rejection", () => {
  test("unverified postcode is not incorrectly labelled outside the radius", () => {
    const text = deliveryAreaRejectionMessage(null);
    expect(text).toContain("couldn't verify");
    expect(text).toContain("no longer be in use");
    expect(text).not.toContain("outside MealDeck");
  });

  test("verified postcode beyond the strict 4 km radius gets an out-of-area message", () => {
    const text = deliveryAreaRejectionMessage(4003);
    expect(text).toContain("outside MealDeck's 4 km delivery area");
    expect(text).not.toContain("couldn't verify");
  });
});
