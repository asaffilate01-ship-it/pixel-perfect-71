import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { FixtureTransport, fixtureProfile } from "../demo/fixture.mjs";
import { JustEatAdapter, UberEatsAdapter, orderFingerprint } from "../src/adapters.mjs";
import { isScopedXPath, validateProfile } from "../src/profile.mjs";
import { readField } from "../src/extraction.mjs";
import { CommandEngine } from "../src/engine.mjs";

for (const [platform, Adapter] of [
  ["uber_eats", UberEatsAdapter],
  ["just_eat", JustEatAdapter],
]) {
  test(`${platform}: complete snapshot keeps source reference, modifiers, notes and unknown unit price`, async () => {
    const fixture = new FixtureTransport(platform);
    const adapter = new Adapter(fixture, fixtureProfile(platform), "fixture-store");
    const [order] = await adapter.scan();
    assert.equal(order.displayReference, platform === "uber_eats" ? "0AB19" : "000123456789");
    assert.equal(order.externalOrderId, `fixture-stable-${platform}-order`);
    assert.equal(order.totalPence, 1450);
    assert.equal(order.items[0].unitPricePence, 350);
    assert.equal(order.items[1].unitPricePence, null);
    assert.deepEqual(order.items[0].modifiers, [{ name: "No onion", quantity: 1 }]);
    assert.equal(order.items[0].notes, "Keep this with its extra");
    assert.match(order.items[0].externalLineId, /^ui:[0-9a-f]{64}:1$/);
    assert.equal(orderFingerprint(order), orderFingerprint((await adapter.scan())[0]));
    assert.equal(fixture.mutationClicks, 0);
  });
}

test("source reference is neither converted to a number nor implicitly trimmed", async () => {
  const fixture = new FixtureTransport();
  fixture.reference.text = " 00Ab-19 ";
  const adapter = new UberEatsAdapter(fixture, fixtureProfile("uber_eats"), "fixture-store");
  assert.equal((await adapter.scan())[0].displayReference, " 00Ab-19 ");
});

test("partial virtualised lists and incomplete line lists cannot be imported", async () => {
  const fixture = new FixtureTransport();
  const adapter = new UberEatsAdapter(fixture, fixtureProfile("uber_eats"), "fixture-store");
  fixture.orderCount.text = "2";
  await assert.rejects(adapter.scan(), /observation_incomplete/);
  fixture.orderCount.text = "1";
  fixture.itemCount.text = "3";
  await assert.rejects(adapter.scan(), /observation_incomplete/);
});

test("unmapped payment labels and source state changes cannot silently become paid orders", async () => {
  const fixture = new FixtureTransport();
  const adapter = new UberEatsAdapter(fixture, fixtureProfile("uber_eats"), "fixture-store");
  fixture.payment.text = "Cash on delivery";
  await assert.rejects(adapter.scan(), /observation_incomplete/);
  fixture.payment.text = "Platform managed";
  fixture.state.text = "Unrecognised screen";
  await assert.rejects(adapter.scan(), /observation_incomplete/);
});

test("GB prices use exact integer pence and reject ambiguous decimal text", async () => {
  const fixture = new FixtureTransport();
  const field = { selector: { using: "css", value: '[data-key="total"]' }, format: "gbp" };
  const total = fixture.all().find((node) => node.key === "total");
  total.text = "£1,234.56";
  assert.equal(await readField(fixture, field), 123456);
  for (const value of ["1.234,56", "£3.5", "£-1.00", "£1.999", "NaN"]) {
    total.text = value;
    await assert.rejects(readField(fixture, field), /observation_incomplete/);
  }
});

test("shipped live profiles are deliberately unconfigured and fixture profiles cannot run live", async () => {
  for (const name of ["uber-eats", "just-eat"]) {
    const profile = JSON.parse(
      await readFile(new URL(`../profiles/${name}.unconfigured.json`, import.meta.url)),
    );
    assert.throws(() => validateProfile(profile), /profile_mismatch/);
  }
  assert.throws(() => validateProfile(fixtureProfile("uber_eats")), /profile_mismatch/);
});

test("reviewed profile expiry is enforced while a worker remains running", async () => {
  const fixture = new FixtureTransport();
  const profile = fixtureProfile("uber_eats");
  profile.environment = "live";
  profile.commissioning.expiresAt = new Date(Date.now() - 1).toISOString();
  const adapter = new UberEatsAdapter(fixture, profile, "fixture-store");
  await assert.rejects(adapter.scan(), /profile_mismatch/);
});

test("Android XPath is confined to descendant paths with simple exact predicates", () => {
  for (const value of [
    ".//android.widget.Button",
    './/*[@resource-id="fixture:accept"]',
    ".//android.widget.FrameLayout/android.widget.Button[1]",
  ]) {
    assert.equal(isScopedXPath(value), true);
  }
  for (const value of [
    "//Button",
    ".//Button/..",
    ".//Button/ancestor::root",
    ".//Button/following::Button",
    ".//Button | //other",
    './/*[contains(@text,"Accept")]',
  ]) {
    assert.equal(isScopedXPath(value), false);
    const profile = fixtureProfile("just_eat");
    profile.actions.accept.button = { using: "xpath", value };
    assert.throws(() => validateProfile(profile, { fixture: true }), /profile_mismatch/);
  }
});

test("an order moving from New to Active is confirmed in its reviewed readback view", async () => {
  const fixture = new FixtureTransport();
  const profile = fixtureProfile("uber_eats");
  const select = (key) => ({ using: "css", value: `[data-key="${key}"]` });
  const activeView = fixture.node("active-view", "New");
  const empty = fixture.node("empty", "No orders");
  const isVisible = () => (fixture.state.text === "New") === (activeView.text === "New");
  const navigate = (key, label) => {
    const button = fixture.node(key, label);
    button.onClick = () => {
      activeView.text = label;
      fixture.orderCount.text = isVisible() ? "1" : "0";
    };
    return button;
  };
  fixture.root.children.push(
    activeView,
    empty,
    navigate("new-tab", "New"),
    navigate("active-tab", "Active"),
  );
  const originalFind = fixture.find.bind(fixture);
  fixture.find = async (selector, scope) => {
    if (fixture.key(selector) === "order" && !isVisible()) return [];
    return originalFind(selector, scope);
  };
  const originalClick = fixture.click.bind(fixture);
  fixture.click = async (element) => {
    await originalClick(element);
    fixture.orderCount.text = isVisible() ? "1" : "0";
  };
  profile.screen.views = [
    {
      name: "new",
      navigate: select("new-tab"),
      guard: { field: { selector: select("active-view") }, equals: "New" },
    },
    {
      name: "active",
      navigate: select("active-tab"),
      guard: { field: { selector: select("active-view") }, equals: "Active" },
    },
  ];
  validateProfile(profile, { fixture: true });
  const adapter = new UberEatsAdapter(fixture, profile, "fixture-store");
  const [order] = await adapter.scan();
  const records = new Map();
  const engine = new CommandEngine({
    adapter,
    journal: { get: (key) => records.get(key), put: async (key, value) => records.set(key, value) },
    observe: async () => ({ ok: true, held: false }),
  });
  const result = await engine.run({
    ...order,
    commandId: randomUUID(),
    leaseToken: randomUUID(),
    mode: "execute",
    leaseExpiresAt: new Date(Date.now() + 30_000).toISOString(),
    action: "accept",
    expectedState: "new",
  });
  assert.equal(result.outcome, "confirmed");
  assert.equal(result.observedState, "accepted");
  assert.equal(fixture.mutationClicks, 1);
  assert.equal(activeView.text, "Active");
});
