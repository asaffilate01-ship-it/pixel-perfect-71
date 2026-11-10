import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { ownDriverShortfallPence, OWN_DRIVER_MINIMUM_PENCE } from "../src/lib/mealdeck-own-driver-delivery";

describe("MealDeck Luton delivery minimum customer feedback", () => {
  test("November is £15 free and December £10 requires a live courier fee", () => {
    expect(OWN_DRIVER_MINIMUM_PENCE).toBe(1500);
    const november = "2026-11-09T18:00:00Z";
    const december = "2026-12-01T18:00:00Z";
    expect(ownDriverShortfallPence(0, november)).toBe(1500);
    expect(ownDriverShortfallPence(1499, november)).toBe(1);
    expect(ownDriverShortfallPence(1500, november)).toBe(0);
    expect(ownDriverShortfallPence(999, december)).toBe(1);
    expect(ownDriverShortfallPence(1000, december)).toBe(0);
  });

  test("member registration and real points remain visible if the entry status request fails", () => {
    const account = readFileSync(new URL("../src/components/customer-account.tsx", import.meta.url), "utf8");
    expect(account).toContain("entryPolicy?.emailRegistrationDeferred === true");
    expect(account).not.toContain("entryPolicy?.emailRegistrationDeferred !== false");
    expect(account).toContain("memberLoyaltyView(profile?.loyalty)");
    expect(account).toContain("{loyaltyView.pointsLabel}");
  });

  test("under-minimum baskets show immediate accessible feedback on delivery selection", () => {
    const checkout = readFileSync(new URL("../src/components/launch-checkout.tsx", import.meta.url), "utf8");
    expect(checkout).toContain('fulfilment === "delivery" && deliveryShortfall !== null');
    expect(checkout).toContain('role="alert" aria-live="polite"');
    expect(checkout).toContain("Your basket is below the");
    expect(checkout).toContain("£15 minimum after discounts");
    expect(checkout).toContain("From 1 December");
    expect(checkout).toContain("£10");
    expect(checkout).toContain("collection or kerbside");
    expect(checkout).toContain('if (fulfilment === "delivery" && deliveryUnderMinimum)');
    const styles = readFileSync(new URL("../src/styles.launch-checkout.css", import.meta.url), "utf8");
    expect(styles).toContain(".md-checkout-timing");
    expect(styles).toContain("button:disabled");
    expect(checkout).toContain("Schedule for later");
    expect(checkout).toContain("You cannot reserve a");
    expect(checkout).toContain("disabled aria-describedby=\"mealdeck-schedule-not-ready\"");
  });
});
