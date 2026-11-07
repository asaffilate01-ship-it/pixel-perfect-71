import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import { chromium } from "playwright";
import {
  FixtureTransport,
  fixtureProfile,
  startFixtureAppium,
  startFixtureWeb,
} from "../demo/fixture.mjs";
import { AppiumTransport } from "../src/appium-transport.mjs";
import { PlaywrightTransport } from "../src/playwright-transport.mjs";
import { JustEatAdapter, UberEatsAdapter } from "../src/adapters.mjs";
import { CommandEngine } from "../src/engine.mjs";

function engine(adapter) {
  const records = new Map();
  return new CommandEngine({
    adapter,
    journal: { get: (id) => records.get(id), put: async (id, value) => records.set(id, value) },
    observe: async () => ({ ok: true, held: false }),
  });
}
function command(order) {
  return {
    ...order,
    commandId: randomUUID(),
    leaseToken: randomUUID(),
    leaseExpiresAt: new Date(Date.now() + 60_000).toISOString(),
    mode: "execute",
    action: "accept",
    expectedState: "new",
  };
}

test("Appium W3C fixture imports full order and verifies an accepted state through the real HTTP transport", async () => {
  const fixture = new FixtureTransport("just_eat");
  const server = await startFixtureAppium(fixture);
  const profile = fixtureProfile("just_eat");
  const transport = new AppiumTransport(server.url, profile);
  try {
    await transport.connect("fixture-device");
    const adapter = new JustEatAdapter(transport, profile, "fixture-store");
    const [order] = await adapter.scan();
    const result = await engine(adapter).run(command(order));
    assert.equal(result.outcome, "confirmed");
    assert.equal(result.displayReference, "000123456789");
    assert.equal(fixture.mutationClicks, 1);
    assert.equal(
      server.requests.some((request) => /execute|shell|install|unlock/i.test(request.path)),
      false,
    );
  } finally {
    await transport.close();
    await server.close();
  }
});

test("lost Appium click reply reconciles from native readback without another click", async () => {
  const fixture = new FixtureTransport("just_eat");
  const server = await startFixtureAppium(fixture, { loseClickResponse: true });
  const profile = fixtureProfile("just_eat");
  const transport = new AppiumTransport(server.url, profile);
  try {
    await transport.connect("fixture-device");
    const adapter = new JustEatAdapter(transport, profile, "fixture-store");
    const [order] = await adapter.scan();
    const instruction = command(order);
    const worker = engine(adapter);
    assert.equal((await worker.run(instruction)).outcome, "uncertain");
    assert.equal(
      (await worker.run({ ...instruction, mode: "reconcile", leaseToken: randomUUID() })).outcome,
      "confirmed",
    );
    assert.equal(fixture.mutationClicks, 1);
  } finally {
    await transport.close();
    await server.close();
  }
});

test("Appium server must be on loopback without URL credentials", () => {
  for (const address of [
    "http://10.0.0.1:4723",
    "http://user:password@127.0.0.1:4723",
    "https://remote.example",
  ]) {
    assert.throws(
      () => new AppiumTransport(address, fixtureProfile("just_eat")),
      /profile_mismatch/,
    );
  }
});

test("Appium transport rejects scope-escaping XPath before making any request", async () => {
  let calls = 0;
  const transport = new AppiumTransport("http://127.0.0.1:4723", fixtureProfile("just_eat"), {
    fetchImpl: async () => {
      calls++;
    },
  });
  await assert.rejects(
    transport.find({ using: "xpath", value: ".//Button | //other" }, "parent-element"),
    /profile_mismatch/,
  );
  assert.equal(calls, 0);
});

const executablePath =
  process.env.MEALDECK_TEST_CHROMIUM ??
  (existsSync(chromium.executablePath())
    ? undefined
    : existsSync("/usr/bin/chromium")
      ? "/usr/bin/chromium"
      : undefined);
test(
  "Playwright real Chromium reads and updates only the intended offline DOM order",
  {
    skip:
      !process.env.CI &&
      process.env.MEALDECK_REQUIRE_BROWSER_TESTS !== "1" &&
      !executablePath &&
      !existsSync(chromium.executablePath())
        ? "Install Playwright Chromium or set MEALDECK_TEST_CHROMIUM to run the browser fixture."
        : false,
    timeout: 30_000,
  },
  async () => {
    const fixture = new FixtureTransport("uber_eats");
    const server = await startFixtureWeb(fixture);
    let browser;
    try {
      browser = await chromium.launch({ executablePath, headless: true });
      const page = await browser.newPage();
      await page.goto(server.url);
      const profile = fixtureProfile("uber_eats", server.url);
      const adapter = new UberEatsAdapter(
        new PlaywrightTransport(page, profile),
        profile,
        "fixture-store",
      );
      const [order] = await adapter.scan();
      const result = await engine(adapter).run(command(order));
      assert.equal(result.outcome, "confirmed");
      assert.equal(result.observedState, "accepted");
      assert.equal(result.displayReference, "0AB19");
      assert.equal(await page.locator('[data-key="state"]').textContent(), "Accepted");
    } finally {
      await browser?.close();
      await server.close();
    }
  },
);
