import { describe, expect, test } from "bun:test";
import { customerEmailReturnPath, customerReturnTarget } from "../src/lib/mealdeck-customer-return";

describe("fixed customer authentication return destinations", () => {
  test("preserves the exact group checkout context through the email account return", () => {
    for (const target of [
      "/checkout",
      "/checkout?group=1",
      "/group-pay",
      "/group-order",
    ] as const) {
      expect(customerReturnTarget(target)).toBe(target);
      const redirect = new URL(customerEmailReturnPath(target), "https://mealdeck.co.uk");
      expect(redirect.origin).toBe("https://mealdeck.co.uk");
      expect(redirect.pathname).toBe("/account");
      expect(customerReturnTarget(redirect.searchParams.get("returnTo"))).toBe(target);
      expect([...redirect.searchParams.keys()]).toEqual(["returnTo"]);
    }
    expect(customerReturnTarget("/menus")).toBe("/menus");
    expect(customerEmailReturnPath("/menus")).toBe("/account");
  });

  test("rejects external, encoded, ambiguous and identifier-bearing redirects", () => {
    for (const target of [
      undefined,
      null,
      [],
      { to: "/checkout" },
      "https://example.org/checkout",
      "//example.org/checkout",
      "javascript:alert(1)",
      "https://mealdeck.co.uk/checkout?group=1",
      "/\\example.org/checkout",
      "/%2fexample.org",
      "/checkout?group=true",
      "/checkout?group=1&next=https://example.org",
      "/checkout?group=1#private",
      "/checkout?order=00000000-0000-4000-8000-000000000001",
      "/checkout?group=1&group=0",
      "%2Fcheckout%3Fgroup%3D1",
      "/checkout?group=%31",
      "/group-pay?room=00000000-0000-4000-8000-000000000001",
      "/group-pay#share=secret",
      "/group-pay?next=https://example.org",
      "/group-order?room=00000000-0000-4000-8000-000000000001",
      "/group-order?invite=secret",
      "/group-order#room=private&participant=private&token=secret",
      "/group-order?next=https://example.org",
      "%2Fgroup-order",
      "/group-order/",
      "/group-order?",
      " /checkout",
      "/checkout\n",
      "/ops",
    ]) {
      expect(customerReturnTarget(target)).toBe("/menus");
      expect(customerEmailReturnPath(target)).toBe("/account");
    }
  });
});
