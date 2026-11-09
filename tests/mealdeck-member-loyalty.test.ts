import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { memberLoyaltyView, MEMBER_LOYALTY_RULES } from "../src/lib/mealdeck-member-loyalty";

describe("member loyalty panel", () => {
  test("shows the live balance returned by the authenticated profile", () => {
    expect(memberLoyaltyView({ enabled: true, points: 1234 })).toEqual({
      kind: "live",
      points: 1234,
      pointsLabel: "1,234",
    });
  });

  test("a zero balance is still shown as live, not hidden", () => {
    expect(memberLoyaltyView({ enabled: true, points: 0 }).kind).toBe("live");
  });

  test("disabled loyalty shows a neutral status instead of a balance", () => {
    expect(memberLoyaltyView({ enabled: false, points: 50 })).toEqual({ kind: "unavailable" });
  });

  test("missing or malformed loyalty never shows a balance", () => {
    expect(memberLoyaltyView(null).kind).toBe("unavailable");
    expect(memberLoyaltyView(undefined).kind).toBe("unavailable");
    expect(memberLoyaltyView({ enabled: true, points: -1 }).kind).toBe("unavailable");
    expect(memberLoyaltyView({ enabled: true, points: 1.5 }).kind).toBe("unavailable");
  });

  test("earning rule is 1 point per complete £1 paid after discounts, guests earn 0", () => {
    const rules = MEMBER_LOYALTY_RULES.join(" ");
    expect(rules).toContain("1 point for every complete £1 actually paid after discounts");
    expect(rules).toContain("Guest orders earn 0 points");
    expect(rules.toLowerCase()).not.toContain("double");
  });
});

describe("expired opening weekend offer", () => {
  test("the menus page no longer renders the 6–8 November 30% offer card", () => {
    const source = readFileSync("src/components/menus/launch-menu-browser.tsx", "utf8");
    expect(source).not.toContain("<OpeningWeekendOffer");
    expect(source).not.toContain("6–8 November");
  });

  test("the account page no longer shows the opening weekend benefit or double points", () => {
    const source = readFileSync("src/components/customer-account.tsx", "utf8");
    expect(source).not.toContain("OPENING WEEKEND");
    expect(source).not.toContain("6–8 November");
    expect(source).not.toContain("double loyalty points");
  });
});
