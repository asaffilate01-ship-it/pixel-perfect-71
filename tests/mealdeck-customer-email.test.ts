import { describe, expect, test } from "bun:test";
import {
  CUSTOMER_EMAIL_FROM,
  customerConfirmationLink,
  planCustomerEmail,
  readCustomerTokenConfirmation,
} from "../src/lib/mealdeck-customer-email";

const now = Date.parse("2026-11-09T15:30:00Z");
const hash = "a".repeat(56);

describe("MealDeck customer emails via Resend", () => {
  test("are sent from info@mealdeck.co.uk", () => {
    expect(CUSTOMER_EMAIL_FROM).toBe("MealDeck <info@mealdeck.co.uk>");
  });

  test("registering a new address sends a sign-up verification and creates the account", () => {
    expect(planCustomerEmail("register", null, now)).toEqual({
      action: "send",
      linkType: "signup",
      createUser: true,
    });
  });

  test("registering an already verified address sends a sign-in link, not a second account", () => {
    expect(planCustomerEmail("register", { id: "u", confirmed: true, lastSentAt: null }, now)).toEqual({
      action: "send",
      linkType: "magiclink",
      createUser: false,
    });
  });

  test("sign-in never creates an account", () => {
    expect(planCustomerEmail("signin", null, now)).toEqual({ action: "skip", reason: "no_account" });
  });

  test("password reset only goes to verified accounts", () => {
    expect(planCustomerEmail("recovery", null, now).action).toBe("skip");
    expect(planCustomerEmail("recovery", { id: "u", confirmed: false, lastSentAt: null }, now).action).toBe("skip");
    expect(planCustomerEmail("recovery", { id: "u", confirmed: true, lastSentAt: null }, now)).toEqual({
      action: "send",
      linkType: "recovery",
      createUser: false,
    });
  });

  test("one email per address per minute", () => {
    const sent = new Date(now - 20_000).toISOString();
    expect(planCustomerEmail("signin", { id: "u", confirmed: true, lastSentAt: sent }, now)).toEqual({
      action: "skip",
      reason: "cooldown",
      retryAfterSeconds: 40,
    });
    const old = new Date(now - 61_000).toISOString();
    expect(planCustomerEmail("signin", { id: "u", confirmed: true, lastSentAt: old }, now).action).toBe("send");
  });

  test("confirmation links round-trip and only return to fixed pages", () => {
    const link = customerConfirmationLink("https://mealdeck.co.uk", hash, "magiclink", "/checkout");
    const fragment = link.slice(link.indexOf("#"));
    expect(readCustomerTokenConfirmation(fragment)).toEqual({
      tokenHash: hash,
      type: "magiclink",
      next: "/account?returnTo=%2Fcheckout",
    });
    expect(readCustomerTokenConfirmation(`#token_hash=${hash}&type=magiclink&next=https://evil.example`)).toBeNull();
    expect(readCustomerTokenConfirmation(`#token_hash=${hash}&type=invite&next=/account`)).toBeNull();
  });
});
