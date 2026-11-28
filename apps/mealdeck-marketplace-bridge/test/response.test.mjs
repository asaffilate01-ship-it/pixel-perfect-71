import test from "node:test";
import assert from "node:assert/strict";
import { readBridgeReply } from "../src/response.mjs";

const json = (body, headers = {}) => new Response(body, { headers: { "content-type": "application/json", ...headers } });

test("accepts a bounded JSON object with UTF-8 across chunk boundaries", async () => {
  const bytes = new TextEncoder().encode('{"reference":"00Ab-19","name":"café"}');
  const body = new ReadableStream({ start(controller) {
    for (const byte of bytes) controller.enqueue(Uint8Array.of(byte));
    controller.close();
  } });
  assert.deepEqual(await readBridgeReply(json(body)), { reference: "00Ab-19", name: "café" });
});

test("rejects the exact byte limit and cancels an oversized stream before reading the remainder", async () => {
  let cancelled = false;
  let pulls = 0;
  const body = new ReadableStream({ pull(controller) {
    pulls++;
    controller.enqueue(new Uint8Array(50_000));
  }, cancel() { cancelled = true; } });
  await assert.rejects(readBridgeReply(json(body)), /^Error: bridge_error$/);
  assert.equal(cancelled, true);
  assert.ok(pulls <= 3);
  assert.equal(body.locked, false);
});

test("rejects oversized declarations, non-JSON media, redirects and HTTP failures", async () => {
  for (const response of [
    json('{}', { "content-length": "100000" }),
    json('{}', { "content-length": "invalid" }),
    json('{}', { "content-type": "text/application/json" }),
    Response.redirect("https://example.invalid/", 302),
    new Response("private provider error", { status: 503 }),
  ]) await assert.rejects(readBridgeReply(response), /^Error: bridge_error$/);
});

test("rejects malformed JSON, invalid UTF-8, arrays, null and primitives without exposing content", async () => {
  for (const body of ['{"secret":', '[]', 'null', '123', '"secret"', Uint8Array.of(0xff)]) {
    await assert.rejects(readBridgeReply(json(body)), /^Error: bridge_error$/);
  }
});

test("a small declared length cannot bypass the streamed byte limit", async () => {
  await assert.rejects(readBridgeReply(json(' '.repeat(100_000), { "content-length": "2" })), /^Error: bridge_error$/);
});
