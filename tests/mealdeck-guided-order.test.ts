import { expect, test } from "bun:test";
import { guidedMenuReady, guidedCheckoutDetailsReady, parseGuidedOrderChoice } from "../src/lib/mealdeck-guided-order";
import { readFileSync } from "node:fs";

test("method selection is explicit and delivery requires the exact verified postcode", () => {
  expect(guidedMenuReady(null, true, "", null)).toBe(false);
  expect(guidedMenuReady("pickup", false, "", null)).toBe(true);
  expect(guidedMenuReady("curbside", false, "", null)).toBe(true);
  expect(guidedMenuReady("delivery", true, "LU4 8NU", null)).toBe(false);
  expect(guidedMenuReady("delivery", true, "LU4 8NU", "LU4 8NU")).toBe(true);
  expect(guidedMenuReady("delivery", true, "LU1 1AA", "LU4 8NU")).toBe(false);
  expect(guidedMenuReady("delivery", false, "LU4 8NU", "LU4 8NU")).toBe(false);
});
test("contact and branch-specific details must be ready before packing", () => {
  expect(guidedCheckoutDetailsReady(null, true, true, true)).toBe(false);
  expect(guidedCheckoutDetailsReady("pickup", false, true, true)).toBe(false);
  expect(guidedCheckoutDetailsReady("pickup", true, false, false)).toBe(true);
  expect(guidedCheckoutDetailsReady("curbside", true, true, false)).toBe(false);
  expect(guidedCheckoutDetailsReady("curbside", true, false, true)).toBe(true);
  expect(guidedCheckoutDetailsReady("delivery", true, false, true)).toBe(false);
  expect(guidedCheckoutDetailsReady("delivery", true, true, false)).toBe(true);
});
test("expired, future and legacy remembered choices do not unlock a new order", () => {
  const now = 2_000_000;
  const raw = (method: unknown, at: number) => JSON.stringify({ method, at });
  expect(parseGuidedOrderChoice(raw("pickup", now), now)?.method).toBe("pickup");
  expect(parseGuidedOrderChoice(raw("delivery", now - 1_200_000), now)).toBeNull();
  expect(parseGuidedOrderChoice(raw("curbside", now + 1), now)).toBeNull();
  expect(parseGuidedOrderChoice(raw("unknown", now), now)).toBeNull();
  expect(parseGuidedOrderChoice("pickup", now)).toBeNull();
});
test("both responsive surfaces and checkout are gated, not just visually reordered", () => {
  const source = (path: string) => readFileSync(new URL("../" + path, import.meta.url), "utf8");
  const menu = source("src/components/menus/launch-menu-browser.tsx");
  expect(menu).toContain("hidden={!flow.ready}");
  expect(menu).toContain("hidden={!showDishes}");
  expect(menu).toContain("if (!showDishes || !flow.method)");
  expect(menu).toContain("showDishes && quantity > 0");
  const checkout = source("src/components/launch-checkout.tsx");
  expect(checkout).toContain("(!guidedDirect || (detailsReady && packingReviewed))");
  expect(checkout).toContain("(!guidedDirect || postcodeReady)");
  expect(checkout).toContain("Continue to basket");
  expect(checkout).toContain("showBasketReview && <aside");
});
