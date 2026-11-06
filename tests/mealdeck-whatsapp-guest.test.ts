import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import {
  customerEntryPolicy,
  KERBSIDE_PARKING_INSTRUCTION,
} from "../src/lib/mealdeck-customer-entry";
import {
  GUEST_PRIVACY_VERSION,
  normaliseGuestInput,
  parseGuestSession,
} from "../src/lib/mealdeck-guest";
import {
  stripeSessionParameters,
  type PreparedStripeOrder,
} from "../src/lib/mealdeck-stripe.server";
import { handleOnlineCheckoutRequest } from "../src/lib/mealdeck-online-checkout.server";

const input = {
  action: "guest",
  name: "  Amer  Saleem ",
  phone: "07700 900123",
  privacyVersion: GUEST_PRIVACY_VERSION,
};
const id = "10000000-0000-4000-8000-000000000001";

describe("opening weekend name and WhatsApp checkout", () => {
  test("only name and phone are required, absent email is null rather than invented", () => {
    for (const extra of [{}, { email: null }, { email: "" }, { email: "  " }])
      expect(normaliseGuestInput({ ...input, ...extra })).toEqual({
        name: "Amer Saleem",
        phone: "+447700900123",
        email: null,
      });
    expect(normaliseGuestInput({ ...input, email: "Old@Example.invalid" }).email).toBe(
      "old@example.invalid",
    );
    for (const bad of [
      { email: "broken" },
      { email: 5 },
      { phone: "" },
      { name: "" },
      { role: "admin" },
      { emailMarketing: true },
    ])
      expect(() => normaliseGuestInput({ ...input, ...bad })).toThrow();
  });
  test("parses email-free and historical guest receipts but rejects malformed sessions", () => {
    const session = { id, name: "Amer", phone: "+447700900123", email: null };
    expect(parseGuestSession(session)).toEqual(session);
    expect(parseGuestSession({ ...session, email: "old@example.invalid" })?.email).toBe(
      "old@example.invalid",
    );
    expect(parseGuestSession({ ...session, email: "null" })).toBeNull();
    expect(parseGuestSession({ ...session, phone: "not a phone" })).toBeNull();
  });
  test("the server policy resumes registration exactly Monday 9 November at midnight UK time", () => {
    for (const at of ["2026-11-06T00:00:00Z", "2026-11-06T15:00:00Z", "2026-11-08T23:59:59.999Z"])
      expect(customerEntryPolicy(new Date(at)).emailRegistrationDeferred).toBe(true);
    for (const at of ["2026-11-05T23:59:59.999Z", "2026-11-09T00:00:00Z", "2026-11-10T12:00:00Z"])
      expect(customerEntryPolicy(new Date(at)).emailRegistrationDeferred).toBe(false);
    expect(() => customerEntryPolicy(new Date("invalid"))).toThrow();
  });
  test("Stripe never receives a null, empty or made-up email from a phone-only order", () => {
    const order: PreparedStripeOrder = {
      orderId: id,
      quoteId: id,
      totalPence: 700,
      grossPence: 1000,
      discountPence: 300,
      currency: "gbp",
      email: null,
      fulfilment: "pickup",
      sessionId: null,
      sessionUrl: null,
      expiresAt: "2026-11-06T16:00:00Z",
      lines: [{ name: "Meal", quantity: 1, line_pence: 1000 }],
      requestHash: "a".repeat(64),
    };
    expect(stripeSessionParameters(order).has("customer_email")).toBe(false);
    expect(
      stripeSessionParameters({ ...order, email: "old@example.invalid" }).get("customer_email"),
    ).toBe("old@example.invalid");
    expect(stripeSessionParameters(order).get("line_items[0][price_data][unit_amount]")).toBe(
      "700",
    );
  });
  test("both contact forms drop email and kerbside shows the requested parking instruction", () => {
    const checkout = readFileSync(
      new URL("../src/components/launch-checkout.tsx", import.meta.url),
      "utf8",
    );
    const group = readFileSync(
      new URL("../src/components/group-payments/payment-identity.tsx", import.meta.url),
      "utf8",
    );
    expect(checkout).not.toContain("value={guestDetails.email}");
    expect(group).not.toContain("value={identity.details.email}");
    expect(checkout).toContain("WhatsApp number");
    expect(group).toContain("WhatsApp number");
    expect(KERBSIDE_PARKING_INSTRUCTION).toContain("Please park near our location");
    expect(checkout).toContain("KERBSIDE_PARKING_INSTRUCTION");
    expect(
      readFileSync(new URL("../src/components/group-room-setup.tsx", import.meta.url), "utf8"),
    ).toContain("KERBSIDE_PARKING_INSTRUCTION");
  });
  test("HTTP guest creation without email uses the secure cookie and never contacts Auth", async () => {
    const calls: string[] = [];
    const env = {
      MEALDECK_SUPABASE_URL: "https://mealdeckfixture.supabase.co",
      MEALDECK_SUPABASE_PUBLISHABLE_KEY: "sb_publishable_mealdeck_fixture_public_only",
      MEALDECK_CHECKOUT_SERVER_KEY: "sb_secret_mealdeck_fixture_server_only",
      MEALDECK_TENANT_ID: id,
      MEALDECK_LUTON_LOCATION_ID: id,
      MEALDECK_ONLINE_CHECKOUT_ENABLED: "true",
      MEALDECK_CHECKOUT_INTEGRATION_APPROVED: "signed-off",
      MEALDECK_STRIPE_SECRET_KEY: "sk_test_" + "a".repeat(32),
      MEALDECK_STRIPE_WEBHOOK_SECRET: "whsec_" + "b".repeat(32),
      MEALDECK_STRIPE_ACCOUNT_ID: "acct_fixture",
      MEALDECK_STRIPE_MODE: "test",
    };
    const fetcher = (async (url: RequestInfo | URL, init?: RequestInit) => {
      const path = new URL(typeof url === "string" ? url : url instanceof URL ? url.href : url.url)
        .pathname;
      calls.push(path);
      if (path.endsWith("/mealdeck_online_checkout_status"))
        return Response.json({
          channelOpen: true,
          guestCheckoutEligible: true,
          kitchen: { state: "online", collectionEstimateMinutes: 30 },
          openingOffer: {
            status: "active",
            startsAt: "2026-11-06T15:00:00Z",
            endsAt: "2026-11-08T23:00:00Z",
            timezone: "Europe/London",
            serverNow: "2026-11-06T16:00:00Z",
          },
        });
      if (path.endsWith("/mealdeck_begin_guest_session")) {
        const data = JSON.parse(String(init?.body));
        expect(data.p_email).toBeNull();
        return Response.json({
          guestId: id,
          name: data.p_name,
          phone: data.p_phone,
          email: null,
          loyaltyEligible: false,
          expiresAt: "2026-12-06T16:00:00Z",
        });
      }
      throw new Error("Unexpected provider request: " + path);
    }) as typeof fetch;
    const response = await handleOnlineCheckoutRequest(
      new Request("https://mealdeck.co.uk/api/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json", Origin: "https://mealdeck.co.uk" },
        body: JSON.stringify(input),
      }),
      env,
      fetcher,
    );
    expect(response.status).toBe(200);
    expect(response.headers.get("Set-Cookie")).toContain("HttpOnly; Secure; SameSite=Lax");
    expect((await response.json()).guestCheckout.session.email).toBeNull();
    expect(calls.some((path) => path.includes("/auth/") || path.includes("register"))).toBe(false);
  });
});
