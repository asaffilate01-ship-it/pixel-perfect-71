import { test } from "node:test";
import assert from "node:assert/strict";
import { checkoutBlocker, serviceLocation } from "../src/lib/checkout-readiness.ts";

const ready = {
  comingSoon: false, loading: false, source: "live", channelOpen: true,
  fulfilmentAllowed: true, lineCount: 2, postcode: "LU1 2AB", location: "luton",
  fulfilment: "delivery",
  confirmation: { postcode: "lu12ab", location: "luton", fulfilment: "delivery", channelOpen: true },
};

test("live, served mixed-brand basket can proceed", () => {
  assert.equal(checkoutBlocker(ready), null);
});

for (const [name, change] of [
  ["launch closed", { comingSoon: true }],
  ["menu refreshing", { loading: true }],
  ["sample catalogue", { source: "sample" }],
  ["missing catalogue", { source: undefined }],
  ["closed kitchen", { channelOpen: false }],
  ["unsupported fulfilment", { fulfilmentAllowed: false }],
  ["empty basket", { lineCount: 0 }],
  ["unchecked postcode", { confirmation: null }],
  ["edited postcode", { postcode: "AL1 1AB" }],
  ["changed kitchen", { location: "stalbans" }],
  ["changed fulfilment", { fulfilment: "pickup" }],
  ["empty postcode", { postcode: " " }],
  ["closed service", { confirmation: { ...ready.confirmation, channelOpen: false } }],
]) {
  test(`checkout blocked: ${name}`, () => {
    assert.equal(typeof checkoutBlocker({ ...ready, ...change }), "string");
  });
}

const locations = [{ key: "luton", locationId: "kitchen-a", tenantId: "tenant-a" }];
const row = { served: true, location_id: "kitchen-a", tenant_id: "tenant-a", channel_open: true };

test("RPC object and array results resolve configured tenant and kitchen", () => {
  for (const value of [row, [row]]) {
    assert.deepEqual(serviceLocation(value, locations), { location: "luton", channelOpen: true });
  }
});

for (const [name, value] of [
  ["null", null], ["empty result", []], ["unserved", { ...row, served: false }],
  ["string boolean", { ...row, served: "true" }],
  ["unknown kitchen", { ...row, location_id: "other" }],
  ["other tenant", { ...row, tenant_id: "other" }],
  ["missing tenant", { served: true, location_id: "kitchen-a" }],
]) {
  test(`reject serviceability: ${name}`, () => assert.equal(serviceLocation(value, locations), null));
}

test("duplicate location configuration fails closed", () => {
  assert.equal(serviceLocation(row, [...locations, { ...locations[0], key: "stalbans" }]), null);
});
test("non-boolean channel status cannot enable ordering", () => {
  assert.deepEqual(serviceLocation({ ...row, channel_open: "true" }, locations), { location: "luton", channelOpen: false });
});
