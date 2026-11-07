import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { FixtureTransport, fixtureProfile, startFixtureAppium } from "../demo/fixture.mjs";
import { AppiumTransport, openAndroidDevice } from "../src/appium-transport.mjs";
import { JustEatAdapter, UberEatsAdapter } from "../src/adapters.mjs";
import { CommandEngine } from "../src/engine.mjs";
import { validateAndroidConnection, validateProfile } from "../src/profile.mjs";

function engine(adapter) {
  const journal = new Map();
  return new CommandEngine({
    adapter,
    journal: { get: (id) => journal.get(id), put: async (id, value) => journal.set(id, value) },
    observe: async () => ({ ok: true, held: false }),
  });
}
function command(order, action = "accept", expectedState = "new") {
  return {
    ...order,
    commandId: randomUUID(),
    leaseToken: randomUUID(),
    leaseExpiresAt: new Date(Date.now() + 60_000).toISOString(),
    mode: "execute",
    action,
    expectedState,
  };
}
function androidConfig(profile, appiumUrl, deviceIdEnvironment, systemPort) {
  return { profile, android: { appiumUrl, deviceIdEnvironment, systemPort } };
}

test("two Appium Sunmi fixtures keep Uber and Just Eat sessions, identities and actions separate", async () => {
  const uber = new FixtureTransport("uber_eats");
  const justEat = new FixtureTransport("just_eat");
  // Equal visible references and equal element IDs must never turn into cross-device order identity.
  uber.reference.text = justEat.reference.text = "00123";
  uber.store.text = "fixture-uber-store";
  justEat.store.text = "fixture-just-eat-store";
  const uberProfile = fixtureProfile("uber_eats", undefined, { transport: "appium" });
  const justEatProfile = fixtureProfile("just_eat");
  const devices = [
    { deviceId: "fixture-uber-sunmi", appPackage: uberProfile.appPackage, fixture: uber },
    { deviceId: "fixture-just-eat-sunmi", appPackage: justEatProfile.appPackage, fixture: justEat },
  ];
  const server = await startFixtureAppium(devices);
  let uberTransport, justEatTransport;
  try {
    [uberTransport, justEatTransport] = await Promise.all([
      openAndroidDevice(androidConfig(uberProfile, server.url, "MEALDECK_UBER_DEVICE_ID", 8201), {
        MEALDECK_UBER_DEVICE_ID: devices[0].deviceId,
      }),
      openAndroidDevice(
        androidConfig(justEatProfile, server.url, "MEALDECK_JUST_EAT_DEVICE_ID", 8202),
        { MEALDECK_JUST_EAT_DEVICE_ID: devices[1].deviceId },
      ),
    ]);
    assert.notEqual(uberTransport.sessionId, justEatTransport.sessionId);
    const uberSession = uberTransport.sessionId,
      justEatSession = justEatTransport.sessionId;
    const creation = server.requests.filter(
      (request) => request.method === "POST" && request.path === "/session",
    );
    assert.equal(creation.length, 2);
    for (const [index, port] of [
      [0, 8201],
      [1, 8202],
    ]) {
      const caps = creation
        .map((request) => request.body.capabilities.alwaysMatch)
        .find((caps) => caps["appium:udid"] === devices[index].deviceId);
      assert.equal(caps["appium:systemPort"], port);
      assert.equal(caps["appium:appPackage"], devices[index].appPackage);
      for (const key of [
        "noReset",
        "dontStopAppOnReset",
        "skipServerInstallation",
        "skipDeviceInitialization",
        "skipSettingsAppReinstall",
        "skipUnlock",
        "skipLogcatCapture",
        "suppressKillServer",
      ])
        assert.equal(caps[`appium:${key}`], true);
      for (const key of [
        "fullReset",
        "autoLaunch",
        "forceAppLaunch",
        "shouldTerminateApp",
        "autoGrantPermissions",
        "autoWebview",
      ])
        assert.equal(caps[`appium:${key}`], false);
      assert.equal(caps["appium:mockLocationApp"], "");
      assert.equal(caps["appium:app"], undefined);
    }
    const uberAdapter = new UberEatsAdapter(uberTransport, uberProfile, uber.store.text);
    const justEatAdapter = new JustEatAdapter(justEatTransport, justEatProfile, justEat.store.text);
    const [[uberOrder], [justEatOrder]] = await Promise.all([
      uberAdapter.scan(),
      justEatAdapter.scan(),
    ]);
    assert.equal(uberOrder.displayReference, "00123");
    assert.equal(justEatOrder.displayReference, "00123");
    assert.notEqual(uberOrder.externalOrderId, justEatOrder.externalOrderId);
    for (const order of [uberOrder, justEatOrder]) {
      assert.equal(order.items.length, 2);
      assert.deepEqual(order.items[0].modifiers, [{ name: "No onion", quantity: 1 }]);
      assert.equal(order.items[1].unitPricePence, null);
    }
    const uberEngine = engine(uberAdapter),
      justEatEngine = engine(justEatAdapter);
    await assert.rejects(uberEngine.run(command(justEatOrder)), /identity_mismatch/);
    assert.equal(uber.mutationClicks + justEat.mutationClicks, 0);
    assert.equal((await uberEngine.run(command(uberOrder))).outcome, "confirmed");
    assert.equal(uber.mutationClicks, 1);
    assert.equal(justEat.mutationClicks, 0);
    assert.equal((await justEatEngine.run(command(justEatOrder))).outcome, "confirmed");
    await uberTransport.close();
    assert.equal(server.sessions.has(uberSession), false);
    assert.equal(server.sessions.has(justEatSession), true);
    assert.equal(
      (await justEatEngine.run(command(justEatOrder, "ready", "accepted"))).outcome,
      "confirmed",
    );
    assert.equal(justEat.mutationClicks, 2);
    assert.equal(uber.mutationClicks, 1);
    assert.equal(
      server.requests.some((request) => /execute|shell|install|unlock/.test(request.path)),
      false,
    );
  } finally {
    await uberTransport?.close();
    await justEatTransport?.close();
    await server.close();
  }
});

test("Uber Android rejects the wrong foreground package and wrong visible store before any order action", async () => {
  const fixture = new FixtureTransport("uber_eats");
  const profile = fixtureProfile("uber_eats", undefined, { transport: "appium" });
  const device = { deviceId: "fixture-uber-sunmi", appPackage: profile.appPackage, fixture };
  const server = await startFixtureAppium([device]);
  const transport = new AppiumTransport(server.url, profile);
  try {
    await transport.connect(device.deviceId, 8201);
    const adapter = new UberEatsAdapter(transport, profile, "fixture-store");
    device.foregroundPackage = "uk.co.mealdeck.fixture.unrelated";
    await assert.rejects(adapter.scan(), /session_required/);
    device.foregroundPackage = profile.appPackage;
    fixture.store.text = "different-store";
    await assert.rejects(adapter.scan(), /identity_mismatch/);
    assert.equal(fixture.mutationClicks, 0);
  } finally {
    await transport.close();
    await server.close();
  }
});

test("Android missing device identifiers or invalid system ports fail before creating a session", async () => {
  let requests = 0;
  const profile = fixtureProfile("uber_eats", undefined, { transport: "appium" });
  const transport = new AppiumTransport("http://127.0.0.1:4723", profile, {
    fetchImpl: async () => {
      requests++;
    },
  });
  for (const device of [undefined, null, "", " ", " fixture-device "])
    await assert.rejects(transport.connect(device, 8201), /profile_mismatch/);
  for (const port of [undefined, null, 0, 1023, 4723, 65536, 8201.5, "8201"])
    await assert.rejects(transport.connect("fixture-device", port), /profile_mismatch/);
  assert.equal(requests, 0);
});

test("mismatched returned Android session selection is rejected and only that session is closed", async () => {
  for (const [key, wrong] of [
    ["appium:udid", "wrong-device"],
    ["deviceUDID", "wrong-device"],
    ["appium:systemPort", 8209],
    ["appium:appPackage", "uk.co.mealdeck.fixture.other"],
  ]) {
    const fixture = new FixtureTransport("just_eat");
    const server = await startFixtureAppium(fixture, {
      returnedCapabilities: (caps) => ({ ...caps, [key]: wrong }),
    });
    const transport = new AppiumTransport(server.url, fixtureProfile("just_eat"));
    try {
      await assert.rejects(transport.connect("fixture-device", 8202), /identity_mismatch/);
      assert.equal(transport.sessionId, null);
      assert.equal(server.sessions.size, 0);
      assert.equal(server.requests.filter((request) => request.method === "DELETE").length, 1);
      assert.equal(fixture.mutationClicks, 0);
    } finally {
      await transport.close();
      await server.close();
    }
  }
});

test("both Sunmi examples remain disabled with independent state, credentials, device selectors and ports", async () => {
  const load = async (name) =>
    JSON.parse(await readFile(new URL(`../${name}`, import.meta.url), "utf8"));
  const uber = await load("config.uber-eats-android.example.json");
  const justEat = await load("config.just-eat.example.json");
  const browser = await load("config.uber-eats.example.json");
  for (const config of [uber, justEat, browser]) assert.equal(config.mode, "disabled");
  for (const config of [uber, justEat]) validateAndroidConnection(config.android);
  for (const key of ["stateDirectory", "tokenEnvironment", "profilePath"])
    assert.notEqual(uber[key], justEat[key]);
  assert.notEqual(uber.android.deviceIdEnvironment, justEat.android.deviceIdEnvironment);
  assert.equal(uber.android.appiumUrl, justEat.android.appiumUrl);
  assert.equal(uber.android.systemPort, 8201);
  assert.equal(justEat.android.systemPort, 8202);
  assert.notEqual(uber.stateDirectory, browser.stateDirectory);
  const nativeProfile = await load(uber.profilePath);
  assert.equal(nativeProfile.appPackage, null);
  assert.equal(nativeProfile.commissioning.status, "unconfigured");
  assert.throws(() => validateProfile(nativeProfile), /profile_mismatch/);
  assert.equal((await load(browser.profilePath)).transport, "playwright");
});
