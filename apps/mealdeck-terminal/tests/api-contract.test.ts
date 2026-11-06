import assert from "node:assert/strict";
import { test } from "node:test";
import { TerminalApi, TerminalApiError } from "../src/api/client";
import {
  bootstrapSchema,
  publicAuthKey,
  recoverySchema,
  terminalConfigSchema,
  terminalOrderSchema,
  trustedOrigin,
} from "../src/api/types";
import { catalogueSchema } from "../src/api/catalogue";
import {
  launchMenuBrands,
  LAUNCH_MENU_PRICE_REVISION,
} from "../../../src/lib/launch-menu-catalogue";

const id = "00000000-0000-4000-8000-000000000001";
test("native server URLs require HTTPS origins without credentials, query data or paths", () => {
  assert.equal(trustedOrigin("https://mealdeck.co.uk/"), "https://mealdeck.co.uk");
  for (const bad of [
    "http://mealdeck.co.uk",
    "https://user:secret@mealdeck.co.uk",
    "https://mealdeck.co.uk/other",
    "https://mealdeck.co.uk?token=secret",
    "https://mealdeck.co.uk#token",
    "javascript:alert(1)",
  ])
    assert.throws(() => trustedOrigin(bad));
});
test("bootstrap accepts only public Supabase keys, never service-role credentials", () => {
  const jwt = (role: string) =>
    "header." + Buffer.from(JSON.stringify({ role })).toString("base64url") + ".signature";
  assert.equal(publicAuthKey("sb_publishable_public_test_key"), true);
  assert.equal(publicAuthKey(jwt("anon")), true);
  assert.equal(publicAuthKey(jwt("service_role")), false);
  assert.equal(publicAuthKey("sb_secret_private_test_key"), false);
  assert.equal(
    bootstrapSchema.safeParse({
      apiVersion: 1,
      auth: { url: "https://project.supabase.co", publishableKey: jwt("service_role") },
      message: "",
    }).success,
    false,
  );
});
test("only quote or order IDs and the attempt UUID can be saved as recovery", () => {
  assert.equal(recoverySchema.safeParse({ orderId: id, attemptId: id }).success, true);
  assert.equal(recoverySchema.safeParse({ quoteId: id, attemptId: id }).success, true);
  for (const bad of [
    { orderId: id, quoteId: id, attemptId: id },
    { orderId: id, attemptId: id, clientSecret: "secret" },
    { orderId: id, attemptId: id, amount: 1 },
    { orderId: id, attemptId: "invalid" },
  ])
    assert.equal(recoverySchema.safeParse(bad).success, false);
});
test("invalid or inconsistent server totals and live simulation configuration fail closed", () => {
  const order = {
    orderId: id,
    handoffCode: "1234",
    fulfilment: "pickup",
    kitchenName: "Luton",
    currency: "gbp",
    totalPence: 1000,
    paidPence: 0,
    remainingPence: 1000,
    status: "unpaid",
    canCollect: true,
    lines: [],
    message: "",
  };
  assert.equal(terminalOrderSchema.safeParse(order).success, true);
  const held = { ...order, status: "hold", paidPence: 1200, remainingPence: 0, canCollect: false };
  assert.equal(terminalOrderSchema.parse(held).paidPence, 1200);
  assert.equal(terminalOrderSchema.safeParse({ ...held, canCollect: true }).success, false);
  assert.equal(terminalOrderSchema.safeParse({ ...held, status: "paid" }).success, false);
  for (const override of [
    { remainingPence: 1 },
    { totalPence: 1.1 },
    { currency: "usd" },
    { status: "paid" },
    { totalPence: -1 },
  ])
    assert.equal(terminalOrderSchema.safeParse({ ...order, ...override }).success, false);
  const config = {
    ready: true,
    reason: null,
    message: "",
    kitchen: { id, name: "Luton" },
    stripeLocationId: "tml_example",
    mode: "live",
    simulationAllowed: false,
    canCreateSale: true,
  };
  assert.equal(terminalConfigSchema.safeParse(config).success, true);
  assert.equal(
    terminalConfigSchema.safeParse({ ...config, simulationAllowed: true }).success,
    false,
  );
  assert.equal(
    terminalConfigSchema.safeParse({ ...config, stripeLocationId: null }).success,
    false,
  );
});
test("the native composer consumes all current menu brands and blocks unknown source revisions", () => {
  const catalogue = {
    brands: launchMenuBrands,
    priceRevision: LAUNCH_MENU_PRICE_REVISION,
    notice: "Review the kitchen total.",
  };
  const parsed = catalogueSchema.parse(catalogue);
  assert.equal(parsed.brands.length, 5);
  assert.equal(
    parsed.brands.flatMap((brand) => brand.sections.flatMap((section) => section.items)).length,
    89,
  );
  assert.equal(
    catalogueSchema.safeParse({ ...catalogue, priceRevision: "unreviewed-menu" }).success,
    false,
  );
});
test("authenticated requests contain only the reviewed IDs and use the fixed API endpoint", async () => {
  const sent: { url: string; options: RequestInit }[] = [];
  const fetcher = (async (url, options) => {
    sent.push({ url: String(url), options: options! });
    return new Response(JSON.stringify({ secret: "sdk-memory-only" }), {
      headers: { "Content-Type": "application/json" },
    });
  }) as typeof fetch;
  const api = new TerminalApi("https://mealdeck.co.uk", async () => "access-token", fetcher);
  assert.equal(await api.connectionToken(), "sdk-memory-only");
  assert.equal(sent[0]!.url, "https://mealdeck.co.uk/api/terminal");
  assert.deepEqual(JSON.parse(String(sent[0]!.options.body)), { action: "connection_token" });
  assert.equal(
    (sent[0]!.options.headers as Record<string, string>).Authorization,
    "Bearer access-token",
  );
  assert.equal(sent[0]!.options.redirect, "error");
  assert.equal(sent[0]!.options.cache, "no-store");
});
test("unauthenticated collection cannot call the network; bootstrap sends no bearer token", async () => {
  let calls = 0;
  const api = new TerminalApi("https://mealdeck.co.uk", async () => null, (async (
    _url,
    options,
  ) => {
    calls++;
    assert.equal((options!.headers as Record<string, string>).Authorization, undefined);
    return new Response(JSON.stringify({ apiVersion: 1, auth: null, message: "Not configured" }));
  }) as typeof fetch);
  await assert.rejects(
    api.connectionToken(),
    (error: unknown) => error instanceof TerminalApiError && error.status === 401,
  );
  assert.equal(calls, 0);
  assert.equal((await api.bootstrap()).auth, null);
  assert.equal(calls, 1);
});
test("network failures and unexpected payloads are not retried as new payment attempts", async () => {
  let calls = 0;
  const api = new TerminalApi("https://mealdeck.co.uk", async () => "access-token", (async () => {
    calls++;
    throw new Error("Connection reset");
  }) as typeof fetch);
  await assert.rejects(
    api.prepare({ orderId: id, attemptId: id }),
    (error: unknown) => error instanceof TerminalApiError && error.code === "connection_lost",
  );
  assert.equal(calls, 1);
  const malformed = new TerminalApi(
    "https://mealdeck.co.uk",
    async () => "access-token",
    (async () => new Response(JSON.stringify({ paid: true }))) as typeof fetch,
  );
  await assert.rejects(
    malformed.prepare({ orderId: id, attemptId: id }),
    (error: unknown) => error instanceof TerminalApiError && error.code === "invalid_response",
  );
});

test("server MFA and expired-session failures route back to staff authentication without retry", async () => {
  for (const [status, code] of [
    [403, "mfa_required"],
    [401, "invalid_session"],
  ] as const) {
    const seen: string[] = [];
    let calls = 0;
    const api = new TerminalApi(
      "https://mealdeck.co.uk",
      async () => "access-token",
      (async () => {
        calls++;
        return new Response(
          JSON.stringify({ error: code, message: "Verify your staff session." }),
          { status },
        );
      }) as typeof fetch,
      (failure) => seen.push(failure.code),
    );
    await assert.rejects(api.connectionToken(), TerminalApiError);
    assert.deepEqual(seen, [code]);
    assert.equal(calls, 1);
  }
});
