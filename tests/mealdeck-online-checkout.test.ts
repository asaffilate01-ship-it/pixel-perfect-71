import { describe, expect, test } from "bun:test";
import { createHmac } from "node:crypto";
import { launchMenuBrands } from "../src/lib/launch-menu-catalogue";
import {
  checkoutModifierId,
  checkoutPayInput,
  normaliseCheckoutSelection,
} from "../src/lib/mealdeck-checkout-selection";
import { openingOfferDiscountPence, parseKerbsideVehicle } from "../src/lib/mealdeck-opening-offer";
import { customerOrderElapsedMinutes } from "../src/lib/mealdeck-customer-order-timing";
import {
  readOnlineCheckoutStatus,
  handleOnlineCheckoutRequest,
} from "../src/lib/mealdeck-online-checkout.server";
import {
  readMealDeckStripeConfig,
  safeStripeCheckoutUrl,
  stripeSessionParameters,
  verifiedStripeEvent,
  verifyStripeSignature,
  type MealDeckStripeConfig,
  type PreparedStripeOrder,
} from "../src/lib/mealdeck-stripe.server";
import { launchModifierDatabaseId } from "../deploy/mealdeck/catalogue-import.mjs";

const tenant = "00000000-0000-4000-8000-000000000001";
const orderId = "00000000-0000-4000-8000-000000000002";
const quoteId = "00000000-0000-4000-8000-000000000003";
const skorch = launchMenuBrands.find((brand) => brand.id === "skorch-burgers")!;
const ace = skorch.sections
  .flatMap((section) => section.items)
  .find((item) => item.name === "The Ace")!;
const mojito = launchMenuBrands.find((brand) => brand.id === "moktl")!.sections[0]!.items[0]!;
const base = () => ({
  action: "quote",
  fulfilment: "pickup",
  picks: [{ brandId: skorch.id, itemId: ace.id, quantity: 1, selections: {} }],
  packing: { cutleryRequested: false, separateBags: false, bagCount: 1, allocations: [] },
});

describe("actual menu selection and optional numbered packing", () => {
  test("customer time starts at verified payment and advances independently of the device clock", () => {
    // A Checkout session may have been pending for 35 minutes before payment.
    const paidAt = "2026-11-05T18:35:00.000Z";
    const serverNow = "2026-11-05T18:36:10.000Z";
    expect(customerOrderElapsedMinutes(paidAt, serverNow)).toBe(1);
    expect(customerOrderElapsedMinutes(paidAt, serverNow, 50_000)).toBe(2);
    expect(customerOrderElapsedMinutes(null, serverNow)).toBeNull();
    expect(customerOrderElapsedMinutes("invalid", serverNow)).toBeNull();
    expect(customerOrderElapsedMinutes(paidAt, "2026-11-05T18:34:00.000Z")).toBe(0);
  });
  test("derives stable database IDs identical to the reviewed importer", () => {
    for (const kind of ["group", "option"] as const)
      expect(checkoutModifierId(tenant, kind, "skorch-burgers-make-it-a-meal")).toBe(
        launchModifierDatabaseId(tenant, kind, "skorch-burgers-make-it-a-meal"),
      );
    expect(() => checkoutModifierId("wrong", "group", "valid-id")).toThrow();
  });
  test("rejects prices, destination/identity injections, delivery and unknown selections", () => {
    for (const extra of [
      { totalPence: 1 },
      { customerId: tenant },
      { address: {} },
      { location: "stalbans" },
    ])
      expect(() => normaliseCheckoutSelection({ ...base(), ...extra }, tenant)).toThrow();
    expect(() =>
      normaliseCheckoutSelection({ ...base(), fulfilment: "delivery" }, tenant),
    ).toThrow();
    expect(() =>
      normaliseCheckoutSelection(
        {
          ...base(),
          picks: [{ ...base().picks[0], selections: { "invented-group": ["free-burger"] } }],
        },
        tenant,
      ),
    ).toThrow();
  });
  test("only kerbside needs car make, colour and exactly four registration characters", () => {
    expect(parseKerbsideVehicle({ make: "VW", colour: "Blue", registrationLast4: "4abc" })).toEqual(
      { make: "VW", colour: "Blue", registrationLast4: "4ABC" },
    );
    expect(
      parseKerbsideVehicle({ make: "VW", colour: "Blue", registrationLast4: "AB12ABC" }),
    ).toBeNull();
    expect(
      parseKerbsideVehicle({
        make: "VW",
        colour: "Blue",
        registrationLast4: "4ABC",
        fullRegistration: "AB12ABC",
      }),
    ).toBeNull();
    expect(() => normaliseCheckoutSelection({ ...base(), fulfilment: "curbside" }, tenant)).toThrow(
      /car make/,
    );
    expect(() =>
      normaliseCheckoutSelection(
        { ...base(), vehicle: { make: "VW", colour: "Blue", registrationLast4: "4ABC" } },
        tenant,
      ),
    ).toThrow(/only needed/);
  });
  test("pack together defaults to one bag with all purchased quantities, no cutlery charge", () => {
    const one = normaliseCheckoutSelection(base(), tenant);
    expect(one.packingPlan).toEqual({
      version: 1,
      separateBags: false,
      cutleryRequested: false,
      bags: [{ number: 1, allocations: [{ lineId: "line-1", quantity: 1 }] }],
    });
    const cutlery = normaliseCheckoutSelection(
      { ...base(), packing: { ...base().packing, cutleryRequested: true } },
      tenant,
    );
    expect(cutlery.lines).toEqual(one.lines);
    expect(cutlery.requestHash).not.toBe(one.requestHash);
  });
  test("ordinary checkout cannot inject room participant names or named packing snapshots", () => {
    for (const extra of [
      { name: "Amer" },
      { participantName: "Amer" },
      { bags: [{ number: 1, name: "Amer", allocations: [{ lineId: "line-1", quantity: 1 }] }] },
      { allocations: [{ lineId: "line-1", bag: 1, quantity: 1, name: "Amer" }] },
    ])
      expect(() =>
        normaliseCheckoutSelection({ ...base(), packing: { ...base().packing, ...extra } }, tenant),
      ).toThrow();
    expect(() =>
      normaliseCheckoutSelection({ ...base(), participantName: "Amer" }, tenant),
    ).toThrow();
  });
  test("split quantities are exact and a linked cross-brand extra follows its parent in each bag", () => {
    const input = {
      ...base(),
      picks: [
        {
          ...base().picks[0],
          quantity: 3,
          crossSelections: [{ slot: "drink", mode: "extra", brandId: "moktl", itemId: mojito.id }],
        },
      ],
      packing: {
        cutleryRequested: true,
        separateBags: true,
        bagCount: 2,
        allocations: [
          { lineId: "line-1", bag: 1, quantity: 1 },
          { lineId: "line-1", bag: 2, quantity: 2 },
        ],
      },
    };
    const result = normaliseCheckoutSelection(input, tenant);
    expect(result.lines.find((line) => line.parentLineId)?.lineId).toBe("line-1-extra-drink");
    expect(result.packingPlan.bags[1]?.allocations).toEqual([
      { lineId: "line-1", quantity: 2 },
      { lineId: "line-1-extra-drink", quantity: 2 },
    ]);
    for (const allocations of [
      input.packing.allocations.slice(0, 1),
      [...input.packing.allocations, input.packing.allocations[0]],
      [{ lineId: "line-2", bag: 1, quantity: 3 }],
    ])
      expect(() =>
        normaliseCheckoutSelection(
          { ...input, packing: { ...input.packing, allocations } },
          tenant,
        ),
      ).toThrow();
    expect(() =>
      normaliseCheckoutSelection({ ...input, packing: { ...input.packing, bagCount: 3 } }, tenant),
    ).toThrow(/every numbered bag/);
  });
  test("selects a server-derived Tavo flavour/portion matrix option, never a submitted variant", () => {
    const brand = launchMenuBrands.find((entry) => entry.id === "tavo-chicken")!;
    const item = brand.sections
      .flatMap((section) => section.items)
      .find((entry) => entry.priceVariants)!;
    for (const variant of item.priceVariants!) {
      const selections = Object.fromEntries(
        Object.entries(variant.selections).map(([group, option]) => [group, [option]]),
      );
      const result = normaliseCheckoutSelection(
        { ...base(), picks: [{ brandId: brand.id, itemId: item.id, quantity: 1, selections }] },
        tenant,
      );
      expect(result.lines[0]?.modifiers.filter((modifier) => modifier.kind === "variant")).toEqual([
        {
          groupId: checkoutModifierId(tenant, "group", variant.groupId),
          optionId: checkoutModifierId(tenant, "option", variant.optionId),
          kind: "variant",
        },
      ]);
      expect(() =>
        normaliseCheckoutSelection(
          {
            ...base(),
            picks: [
              {
                brandId: brand.id,
                itemId: item.id,
                quantity: 1,
                selections: { ...selections, [variant.groupId]: [variant.optionId] },
              },
            ],
          },
          tenant,
        ),
      ).toThrow();
    }
  });
  test("requires included can unless a named replacement is selected, and blocks unavailable milkshake", () => {
    const mealGroup = skorch.optionGroups.find(
      (group) => group.id === "skorch-burgers-make-it-a-meal",
    )!;
    const selections = { [mealGroup.id]: [mealGroup.options[0]!.id] };
    expect(() =>
      normaliseCheckoutSelection(
        { ...base(), picks: [{ ...base().picks[0], selections }] },
        tenant,
      ),
    ).toThrow(/finish your meal choices/);
    const result = normaliseCheckoutSelection(
      {
        ...base(),
        picks: [
          {
            ...base().picks[0],
            selections,
            crossSelections: [
              { slot: "drink", mode: "upgrade", brandId: "moktl", itemId: mojito.id },
            ],
          },
        ],
      },
      tenant,
    );
    expect(result.lines[0]?.modifiers.filter((modifier) => modifier.kind === "cross")).toHaveLength(
      1,
    );
    const upgrades = skorch.optionGroups.find(
      (group) => group.id === "skorch-burgers-meal-upgrades",
    )!;
    const milkshake = upgrades.options.find((option) => option.id.includes("milkshake"))!;
    expect(() =>
      normaliseCheckoutSelection(
        {
          ...base(),
          picks: [
            { ...base().picks[0], selections: { ...selections, [upgrades.id]: [milkshake.id] } },
          ],
        },
        tenant,
      ),
    ).toThrow();
  });
  test("whole-order 30% discount rounds once and no order minimum is imposed", () => {
    expect(openingOfferDiscountPence(100)).toBe(30);
    expect(openingOfferDiscountPence(399)).toBe(120);
    expect(openingOfferDiscountPence(1098)).toBe(329);
    expect(openingOfferDiscountPence(1)).toBe(0);
    expect(() => openingOfferDiscountPence(3.5)).toThrow();
  });
  test("pay request needs an explicit final order review acknowledgment", () => {
    const input = { action: "pay", quoteId, attemptId: tenant };
    expect(checkoutPayInput.safeParse(input).success).toBe(false);
    expect(checkoutPayInput.safeParse({ ...input, reviewConfirmed: false }).success).toBe(false);
    expect(checkoutPayInput.safeParse({ ...input, reviewConfirmed: true }).success).toBe(true);
  });
});

const config: MealDeckStripeConfig = {
  secretKey: "sk_test_" + "a".repeat(30),
  webhookSecret: "whsec_" + "b".repeat(30),
  accountId: "acct_MealDeckTest",
  livemode: false,
};
const prepared: PreparedStripeOrder = {
  orderId,
  quoteId,
  totalPence: 279,
  grossPence: 399,
  discountPence: 120,
  currency: "gbp",
  email: "fixture@example.invalid",
  fulfilment: "pickup",
  sessionId: null,
  sessionUrl: null,
  expiresAt: new Date(Date.now() + 35 * 60_000).toISOString(),
  requestHash: "a".repeat(64),
  lines: [{ name: "The Ace", quantity: 1, line_pence: 399 }],
};
const event = {
  id: "evt_verified",
  type: "checkout.session.completed",
  livemode: false,
  data: { object: { id: "cs_test_verified" } },
};
const metadata = {
  source: "mealdeck",
  mealdeck_order_id: orderId,
  mealdeck_quote_id: quoteId,
  mealdeck_request_hash: "a".repeat(64),
};
const session = {
  id: "cs_test_verified",
  mode: "payment",
  status: "complete",
  payment_status: "paid",
  amount_total: 279,
  currency: "gbp",
  livemode: false,
  client_reference_id: orderId,
  metadata,
  payment_intent: {
    id: "pi_verified",
    livemode: false,
    status: "succeeded",
    amount_received: 279,
    currency: "gbp",
    metadata,
    latest_charge: {
      livemode: false,
      paid: true,
      captured: true,
      status: "succeeded",
      currency: "gbp",
      amount: 279,
      amount_captured: 279,
      amount_refunded: 0,
      disputed: false,
    },
  },
};
function signed(value: unknown, timestamp = Math.floor(Date.now() / 1000)) {
  const body = JSON.stringify(value);
  return {
    body,
    header: `t=${timestamp},v1=${createHmac("sha256", config.webhookSecret)
      .update(timestamp + "." + body)
      .digest("hex")}`,
  };
}
const fetchFixture = (change?: (value: typeof session) => unknown) =>
  (async (input: RequestInfo | URL) => {
    const url = String(input);
    if (url.endsWith("/account"))
      return Response.json({ id: config.accountId, charges_enabled: true });
    if (url.includes("/events/")) return Response.json(event);
    if (url.includes("/checkout/sessions/"))
      return Response.json(change ? change(structuredClone(session)) : session);
    throw new Error("Unexpected external call " + url);
  }) as typeof fetch;

describe("Stripe server boundaries", () => {
  test("public keys or mixed live/test secrets never establish readiness", () => {
    expect(
      readMealDeckStripeConfig({ VITE_PAYMENTS_CLIENT_TOKEN: "pk_live_untrusted" }),
    ).toBeNull();
    expect(
      readMealDeckStripeConfig({
        MEALDECK_STRIPE_SECRET_KEY: config.secretKey,
        MEALDECK_STRIPE_WEBHOOK_SECRET: config.webhookSecret,
        MEALDECK_STRIPE_ACCOUNT_ID: config.accountId,
        MEALDECK_STRIPE_MODE: "live",
      }),
    ).toBeNull();
  });
  test("Hosted Checkout uses canonical total, fixed return URLs, card wallets and automatic 3DS without pickup address fields", () => {
    const params = stripeSessionParameters(prepared);
    expect(params.get("line_items[0][price_data][unit_amount]")).toBe("279");
    expect(params.get("payment_method_types[0]")).toBe("card");
    expect(params.get("payment_method_options[card][request_three_d_secure]")).toBe("automatic");
    expect(params.get("success_url")).toBe("https://mealdeck.co.uk/checkout?order=" + orderId);
    expect(
      [...params.keys()].some(
        (key) => key.includes("shipping_address") || key.includes("billing_address"),
      ),
    ).toBe(false);
    expect(params.get("payment_intent_data[metadata][mealdeck_order_id]")).toBe(orderId);
    expect(
      safeStripeCheckoutUrl("https://checkout.stripe.com.evil.invalid/c/pay/cs_test_foo"),
    ).toBeNull();
    expect(safeStripeCheckoutUrl("https://checkout.stripe.com/c/pay/cs_test_foo")).not.toBeNull();
  });
  test("signature checks bind raw bytes, timestamp and secret with replay tolerance", () => {
    const { body, header } = signed(event);
    expect(verifyStripeSignature(body, header, config.webhookSecret)).toBe(true);
    expect(verifyStripeSignature(body + " ", header, config.webhookSecret)).toBe(false);
    expect(verifyStripeSignature(body, header, "whsec_wrong")).toBe(false);
    expect(verifyStripeSignature(body, header + ",t=1000000000", config.webhookSecret)).toBe(false);
    const expired = signed(event, Math.floor(Date.now() / 1000) - 301);
    expect(verifyStripeSignature(expired.body, expired.header, config.webhookSecret)).toBe(false);
  });
  test("verified webhook independently fetches provider event and captured payment before narrow RPC data", async () => {
    const { body, header } = signed(event);
    const result = await verifiedStripeEvent(body, header, config, fetchFixture());
    expect(result).toMatchObject({
      p_order: orderId,
      p_captured: 279,
      p_refunded: 0,
      p_disputed: false,
      p_session: "cs_test_verified",
      p_intent: "pi_verified",
      p_account: config.accountId,
    });
    for (const change of [
      (s: typeof session) => ({ ...s, payment_status: "unpaid" }),
      (s: typeof session) => ({ ...s, status: "open" }),
      (s: typeof session) => ({ ...s, amount_total: 1 }),
      (s: typeof session) => ({ ...s, livemode: true }),
      (s: typeof session) => ({
        ...s,
        payment_intent: { ...s.payment_intent, status: "requires_action" },
      }),
      (s: typeof session) => ({
        ...s,
        payment_intent: {
          ...s.payment_intent,
          latest_charge: { ...s.payment_intent.latest_charge, captured: false },
        },
      }),
    ])
      await expect(verifiedStripeEvent(body, header, config, fetchFixture(change))).rejects.toThrow(
        /could not be verified/,
      );
  });
  test("forged webhooks never contact Stripe and other merchant activity is ignored", async () => {
    let calls = 0;
    await expect(
      verifiedStripeEvent("{}", "wrong", config, (async () => {
        calls++;
        return Response.json({});
      }) as typeof fetch),
    ).rejects.toThrow(/signature/);
    expect(calls).toBe(0);
    const { body, header } = signed(event);
    expect(
      await verifiedStripeEvent(
        body,
        header,
        config,
        fetchFixture((s) => ({ ...s, metadata: { source: "another-app" } })),
      ),
    ).toBeNull();
  });
  test("verified events still reconcile when the account stops accepting new charges", async () => {
    const { body, header } = signed(event);
    const fetcher = (async (input: RequestInfo | URL, init?: RequestInit) =>
      String(input).endsWith("/account")
        ? Response.json({ id: config.accountId, charges_enabled: false })
        : fetchFixture()(input, init)) as typeof fetch;
    expect((await verifiedStripeEvent(body, header, config, fetcher))?.p_captured).toBe(279);
  });
  test("an unconfigured site shows no invented opening dates and rejects checkout instead of accepting payment flags", async () => {
    const status = await readOnlineCheckoutStatus({});
    expect(status.available).toBe(false);
    expect(status.openingOffer.status).toBe("unscheduled");
    const result = await handleOnlineCheckoutRequest(
      new Request("https://mealdeck.co.uk/api/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ paid: true }),
      }),
      {},
    );
    expect(result.status).toBe(503);
    expect(result.headers.get("Cache-Control")).toContain("no-store");
  });
});
