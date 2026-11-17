import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { GROUP_READINESS_ENDPOINT, probeGroupReadiness } from "../scripts/mealdeck-group-readiness.mjs";

const actorCookie =
  "__Host-mealdeck-room-actor=" + "a".repeat(43) + "; Path=/; Max-Age=86400; HttpOnly; Secure; SameSite=Lax";

function reply(body, status = 200, cookie = actorCookie) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "content-type": "application/json",
      ...(cookie ? { "set-cookie": cookie } : {}),
    },
  });
}
const open = {
  available: true,
  newRoomsAvailable: true,
  guestEligible: true,
  message: "Group rooms are available.",
  joinWindowSeconds: 180,
  maxPeople: 10,
};

describe("GET-only live group readiness probe", () => {
  it("reports green only when the API admits rooms and sends a secure actor cookie", async () => {
    let called = 0;
    const result = await probeGroupReadiness((url, options) => {
      called += 1;
      assert.equal(url, GROUP_READINESS_ENDPOINT);
      assert.equal(url, "https://mealdeck.co.uk/api/group-orders");
      assert.equal(options.method, "GET");
      assert.equal(options.redirect, "manual");
      assert.equal(options.cache, "no-store");
      assert.equal(options.body, undefined);
      assert.equal(options.headers.Accept, "application/json");
      return Promise.resolve(reply(open));
    });
    assert.deepEqual(result, { ready: true, code: "new_rooms_advertised", httpStatus: 200 });
    assert.equal(called, 1);
    assert.doesNotMatch(JSON.stringify(result), /__Host|aaaa/);
  });

  it("never claims readiness while the payments feature gate or kitchen is off", async () => {
    for (const body of [
      { ...open, available: false, newRoomsAvailable: false },
      { ...open, available: true, newRoomsAvailable: false },
    ]) {
      const result = await probeGroupReadiness(async () => reply(body));
      assert.equal(result.ready, false);
      assert.equal(result.code, "new_rooms_paused");
      assert.equal(result.newRoomsAvailable, false);
    }
  });

  it("rejects a missing, insecure or non-host-only actor cookie", async () => {
    for (const cookie of [
      null,
      "__Host-mealdeck-room-actor=" + "a".repeat(43) + "; Path=/; HttpOnly",
      "mealdeck-room-actor=" + "a".repeat(43) + "; Path=/; HttpOnly; Secure; SameSite=Lax",
      "__Host-mealdeck-room-actor=" + "a".repeat(43) + "; Path=/; Secure; SameSite=Lax",
    ]) {
      const result = await probeGroupReadiness(async () => reply(open, 200, cookie));
      assert.equal(result.code, "room_cookie_missing_or_insecure");
    }
  });

  it("fails closed for redirects, server failure and incomplete server contracts", async () => {
    assert.equal((await probeGroupReadiness(async () => reply(open, 503))).code, "http_unavailable");
    assert.equal((await probeGroupReadiness(async () => new Response(null, { status: 302 }))).code, "http_unavailable");
    assert.equal((await probeGroupReadiness(async () => reply({ ...open, joinWindowSeconds: 600 }))).code, "unexpected_contract");
    assert.equal((await probeGroupReadiness(async () => reply({ ...open, maxPeople: 11 }))).code, "unexpected_contract");
    const invalidJson = new Response("not-json", { status: 200, headers: { "content-type": "application/json" } });
    assert.equal((await probeGroupReadiness(async () => invalidJson)).code, "invalid_json");
  });
});
