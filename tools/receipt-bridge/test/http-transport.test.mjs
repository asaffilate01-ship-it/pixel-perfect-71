import test from "node:test";
import assert from "node:assert/strict";
import { createServer as httpServer, request as rawRequest } from "node:http";
import { createServer as tcpServer } from "node:net";
import { setTimeout as delay } from "node:timers/promises";
import { createBridgeRequestHandler, MAX_HTTP_BODY_BYTES } from "../http.mjs";
import { createTcpWriter, TransportError } from "../transport.mjs";
import { fixture, job, harness, JOB, ORIGIN } from "./fixtures.mjs";

async function listening(server) {
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  return server.address().port;
}
async function close(server) {
  await new Promise((resolve) => {
    server.close(resolve);
    server.closeAllConnections?.();
  });
}

test("HTTP boundaries deny other origins/hosts, pair exactly once, require auth and constrain all browser inputs", async (t) => {
  const h = await harness(t);
  const server = httpServer();
  const port = await listening(server);
  const origin = "http://127.0.0.1:" + port;
  server.on("request", createBridgeRequestHandler(h.bridge, { serviceOrigin: origin }));
  t.after(() => close(server));
  const request = (path, options = {}) =>
    fetch(origin + path, { ...options, headers: { Origin: ORIGIN, ...options.headers } });
  let response = await request("/v1/health");
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("access-control-allow-origin"), ORIGIN);
  assert.equal(response.headers.get("cache-control"), "no-store");
  for (const headers of [{ Origin: "https://attacker.test" }, { Origin: "null" }]) {
    response = await request("/v1/health", { headers });
    assert.equal(response.status, 403);
    assert.equal(response.headers.get("access-control-allow-origin"), null);
  }
  const rejectedHost = await new Promise((resolve, reject) => {
    const req = rawRequest(
      origin + "/v1/health",
      { headers: { Origin: ORIGIN, Host: "rebound.attacker.test" } },
      (res) => {
        res.resume();
        resolve(res.statusCode);
      },
    );
    req.on("error", reject);
    req.end();
  });
  assert.equal(rejectedHost, 403);
  response = await request("/v1/jobs/" + JOB);
  assert.equal(response.status, 401);
  response = await request("/v1/recovery");
  assert.equal(response.status, 401);
  response = await request("/v1/jobs", {
    method: "OPTIONS",
    headers: {
      "Access-Control-Request-Method": "POST",
      "Access-Control-Request-Headers": "authorization, content-type, x-mealdeck-access-token",
      "Access-Control-Request-Private-Network": "true",
    },
  });
  assert.equal(response.status, 204);
  assert.equal(response.headers.get("access-control-allow-private-network"), "true");
  response = await request("/v1/jobs", {
    method: "OPTIONS",
    headers: { "Access-Control-Request-Method": "DELETE" },
  });
  assert.equal(response.status, 403);
  const code = h.bridge.openPairing();
  response = await request("/v1/pair", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ code }),
  });
  const { token } = await response.json();
  assert.equal(response.status, 200);
  const headers = {
    Authorization: "Bearer " + token,
    "Content-Type": "application/json",
    "X-Mealdeck-Access-Token": "temporary-jwt",
  };
  response = await request("/v1/recovery", { headers });
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { jobs: [] });
  response = await request("/v1/jobs", { method: "POST", headers, body: JSON.stringify(job()) });
  assert.equal(response.status, 201);
  assert.equal((await response.json()).status, "sent_unconfirmed");
  assert.equal(h.lookups[0].accessToken, "temporary-jwt");
  response = await request("/v1/jobs/" + JOB, { headers });
  assert.equal(response.status, 200);
  response = await request("/v1/jobs", { method: "POST", headers, body: JSON.stringify(job()) });
  assert.equal(response.status, 200);
  assert.equal(h.writes.length, 1);
  response = await request("/v1/jobs", {
    method: "POST",
    headers,
    body: JSON.stringify({ ...job(), printerHost: "127.0.0.1" }),
  });
  assert.equal(response.status, 400);
  response = await request("/v1/jobs", {
    method: "POST",
    headers: { ...headers, "Content-Type": "text/plain" },
    body: JSON.stringify(job()),
  });
  assert.equal(response.status, 415);
  response = await request("/v1/jobs", {
    method: "POST",
    headers,
    body: "x".repeat(MAX_HTTP_BODY_BYTES + 1),
  });
  assert.equal(response.status, 413);
  response = await request("/v1/jobs/" + JOB + "?retry=true", { headers });
  assert.equal(response.status, 404);
  response = await request("/v1/jobs/" + JOB + "/resolve", {
    method: "POST",
    headers,
    body: JSON.stringify({ outcome: "printed", reason: "Paper checked by operator" }),
  });
  assert.equal(response.status, 200);
  assert.equal((await response.json()).status, "printed");
  assert.equal(h.writes.length, 1);
});

test("real loopback TCP consumer writes one bounded receipt; refresh and restart never open a second connection", async (t) => {
  let connections = 0;
  const chunks = [];
  let finished;
  const received = new Promise((resolve) => {
    finished = resolve;
  });
  const server = tcpServer((socket) => {
    connections++;
    socket.on("data", (chunk) => chunks.push(chunk));
    socket.on("end", () => {
      socket.end();
      finished();
    });
  });
  const port = await listening(server);
  t.after(() => close(server));
  const h = await harness(t, {
    writer: createTcpWriter({ host: "127.0.0.1", port, cut: "partial", feedLines: 2 }),
  });
  const result = await h.bridge.submit(job(), "pair-hash", "token");
  await received;
  assert.equal(result.status, "sent_unconfirmed");
  assert.equal(connections, 1);
  const printed = Buffer.concat(chunks);
  assert.match(printed.toString(), /END OF RECEIPT/);
  assert.deepEqual([...printed.slice(0, 2)], [27, 64]);
  await h.bridge.submit(job(), "pair-hash");
  await h.restart();
  h.bridge.get(JOB);
  await h.bridge.submit(job(), "pair-hash");
  assert.equal(connections, 1);
});

test("connection refused has no attempted write; loss during journal reservation cannot send bytes", async (t) => {
  const closed = tcpServer();
  const unused = await listening(closed);
  await close(closed);
  let before = 0;
  const writer = createTcpWriter({ host: "127.0.0.1", port: unused, timeoutMs: 1000 });
  await assert.rejects(
    writer(new Uint8Array([1, 2, 3]), async () => {
      before++;
    }),
    (error) => error instanceof TransportError && error.attempted === false,
  );
  assert.equal(before, 0);
  let byteCount = 0;
  const dropped = tcpServer((socket) => {
    socket.on("data", (bytes) => (byteCount += bytes.length));
    socket.destroy();
  });
  const port = await listening(dropped);
  t.after(() => close(dropped));
  const droppingWriter = createTcpWriter({ host: "127.0.0.1", port, timeoutMs: 1000 });
  await assert.rejects(
    droppingWriter(new Uint8Array([1, 2, 3]), async () => {
      await delay(30);
    }),
    (error) => error instanceof TransportError && error.attempted === false,
  );
  assert.equal(byteCount, 0);
});
