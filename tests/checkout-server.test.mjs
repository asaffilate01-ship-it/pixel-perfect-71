import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { registerHooks } from "node:module";

// Exercise the actual server handlers with deterministic RPCs, without a live order.
const state = { calls: [], responses: [] };
globalThis.__mealdeckCheckoutTest = state;
registerHooks({
  resolve(specifier, context, nextResolve) {
    if (context.parentURL?.endsWith("/dishbee.functions.ts")) {
      if (["@tanstack/react-start", "@supabase/supabase-js", "./mealdeck", "./launch-status"].includes(specifier)) {
        return { url: `mealdeck-test:${specifier}`, shortCircuit: true };
      }
      if (specifier === "./checkout-readiness") {
        return nextResolve(new URL("./checkout-readiness.ts", context.parentURL).href, context);
      }
    }
    return nextResolve(specifier, context);
  },
  load(url, context, nextLoad) {
    const mocks = {
      "mealdeck-test:@tanstack/react-start": `export const createServerFn = () => ({ inputValidator(validate) { return { handler: fn => input => fn({data: validate(input.data)}) }; } });`,
      "mealdeck-test:@supabase/supabase-js": `export const createClient = () => ({rpc: async (name, args) => { const state = globalThis.__mealdeckCheckoutTest; state.calls.push({name,args}); const response = state.responses.shift(); if (response instanceof Error) throw response; if (!response) throw new Error('Unexpected RPC'); return response; }});`,
      "mealdeck-test:./mealdeck": `export const brands = []; export const sampleMenu = () => []; export const sampleLocationOpen = () => false;`,
      "mealdeck-test:./launch-status": `export const COMING_SOON = false; export const COMING_SOON_MESSAGE = 'Preview only';`,
    };
    if (url in mocks) return { format: "module", source: mocks[url], shortCircuit: true };
    return nextLoad(url, context);
  },
});
const { placeOrder, checkServiceability } = await import("../src/lib/dishbee.functions.ts");
const coverage = { served: true, channel_open: true, tenant_id: "tenant-a", location_id: "kitchen-a" };
const input = { data: {
  location: "luton", fulfilment: "delivery", deliveryPence: 299,
  lines: [{ itemId: "item-a", quantity: 1, modifiers: [] }],
  customer: { name: "Test", phone: "07000000000", address1: "Test address", city: "Luton", postcode: "LU1 2AB" },
} };
beforeEach(() => {
  state.calls.length = 0; state.responses.length = 0;
  process.env.DISHBEE_SUPABASE_URL = "https://example.invalid";
  process.env.DISHBEE_SUPABASE_ANON_KEY = "test-key";
  process.env.MEALDECK_LUTON_TENANT_ID = "tenant-a";
  process.env.MEALDECK_LUTON_LOCATION_ID = "kitchen-a";
  process.env.MEALDECK_STALBANS_TENANT_ID = "tenant-b";
  process.env.MEALDECK_STALBANS_LOCATION_ID = "kitchen-b";
});

test("order creation follows an independent current-postcode check", async () => {
  state.responses.push({ data: [coverage], error: null }, { data: [{ order_id: "order-a", handoff_code: "1234" }], error: null });
  const result = await placeOrder(input);
  assert.equal(result.status, "payment_required");
  assert.deepEqual(state.calls.map(c => c.name), ["public_mealdeck_serviceability", "create_mealdeck_checkout_order"]);
  assert.deepEqual(state.calls[0].args, { p_postcode: "LU1 2AB", p_fulfilment: "delivery" });
  assert.equal(state.calls[1].args.p_location, "kitchen-a");
});

for (const [name, response] of [
  ["closed", { data: [{ ...coverage, channel_open: false }], error: null }],
  ["unserved", { data: [{ ...coverage, served: false }], error: null }],
  ["other kitchen", { data: [{ ...coverage, location_id: "kitchen-b", tenant_id: "tenant-b" }], error: null }],
  ["RPC failure", { data: null, error: { message: "internal database detail" } }],
  ["missing result", { data: [], error: null }],
]) {
  test(`does not create an order when coverage is ${name}`, async () => {
    state.responses.push(response);
    const result = await placeOrder(input);
    assert.equal(result.status, "failed");
    assert.equal(state.calls.length, 1);
    assert.equal(result.message.includes("internal database detail"), false);
  });
}

test("unconfigured service does not fall back to sample coverage", async () => {
  delete process.env.DISHBEE_SUPABASE_URL;
  assert.equal((await checkServiceability({ data: { postcode: "LU1 2AB", fulfilment: "delivery" } })).served, false);
  assert.equal((await placeOrder(input)).status, "unconfigured");
  assert.equal(state.calls.length, 0);
});

test("mapped location wins over misleading town and postcode hints", async () => {
  state.responses.push({ data: [{ ...coverage, town: "St Albans" }], error: null });
  const result = await checkServiceability({ data: { postcode: "AL1 1AB", fulfilment: "delivery" } });
  assert.equal(result.served, true);
  assert.equal(result.location, "luton");
});
