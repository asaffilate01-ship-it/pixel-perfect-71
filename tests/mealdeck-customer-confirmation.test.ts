import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import {
  customerConfirmationInstruction,
  visibleCustomerConfirmationCode,
} from "../src/lib/mealdeck-customer-confirmation";

describe("customer phone confirmation code", () => {
  test("uses the existing four-digit code after payment for pickup, curbside and delivery", () => {
    for (const fulfilment of ["pickup", "curbside", "delivery"] as const) {
      const privateReceipt = { verifiedPaid: true, handoffCode: "0042", fulfilment };
      expect(visibleCustomerConfirmationCode(privateReceipt)).toBe("0042");
      expect(customerConfirmationInstruction(fulfilment)).toContain("code");
    }
  });
  test("never shows a code for unpaid or malformed receipts", () => {
    expect(visibleCustomerConfirmationCode({ verifiedPaid: false, handoffCode: "0042" })).toBeNull();
    expect(visibleCustomerConfirmationCode({ verifiedPaid: true, handoffCode: null })).toBeNull();
    for (const invalid of ["42", "12345", "12AB", "0042\\n", " 0042", "0000 "]) {
      expect(visibleCustomerConfirmationCode({ verifiedPaid: true, handoffCode: invalid })).toBeNull();
    }
  });
  test("both mobile receipt and signed-in history use the secured code, without a delivery exclusion", () => {
    const checkout = readFileSync(new URL("../src/components/launch-checkout.tsx", import.meta.url), "utf8");
    const history = readFileSync(new URL("../src/components/customer-orders.tsx", import.meta.url), "utf8");
    expect(checkout).toContain("visibleCustomerConfirmationCode(receipt)");
    expect(checkout).toContain("customerConfirmationInstruction(receipt.fulfilment)");
    expect(checkout).not.toContain('receipt.fulfilment !== "delivery" && (');
    expect(history).toContain("visibleCustomerConfirmationCode(order)");
    expect(history).toContain("Confirmation code");
  });
});
