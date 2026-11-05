import test from "node:test";
import assert from "node:assert/strict";
import {
  createClaimedReceiptFetcher,
  validateBackend,
  MEALDECK_SUPABASE_ORIGIN,
} from "../backend.mjs";
import { validateConfiguration } from "../server.mjs";
import { fixture, JOB, CLAIM, ORDER } from "./fixtures.mjs";

const token = (payload) =>
  Buffer.from('{"alg":"ES256"}').toString("base64url") +
  "." +
  Buffer.from(JSON.stringify(payload)).toString("base64url") +
  ".test_signature";
const staffToken = () =>
  token({
    sub: ORDER,
    role: "authenticated",
    aud: "authenticated",
    iss: MEALDECK_SUPABASE_ORIGIN + "/auth/v1",
    exp: Math.floor(Date.now() / 1000) + 1200,
  });
const backend = {
  projectUrl: MEALDECK_SUPABASE_ORIGIN,
  publishableKey: "sb_publishable_XXXXXXXXXXXXXXXXXXXXXXXX",
};
const json = (value) =>
  new Response(JSON.stringify(value), { headers: { "Content-Type": "application/json" } });

test("canonical lookup has a fixed MealDeck endpoint and sends only job, claim, publishable key and ephemeral staff token", async () => {
  const jwt = staffToken();
  let calls = 0;
  const fetcher = createClaimedReceiptFetcher(backend, {
    fetchImpl: async (url, options) => {
      calls++;
      assert.equal(url, MEALDECK_SUPABASE_ORIGIN + "/rest/v1/rpc/mealdeck_printer_claim_receipt");
      assert.equal(options.headers.Authorization, "Bearer " + jwt);
      assert.equal(options.headers.apikey, backend.publishableKey);
      assert.deepEqual(JSON.parse(options.body), { p_job: JOB, p_claim: CLAIM });
      assert.equal(options.redirect, "error");
      assert.equal(options.credentials, "omit");
      assert.equal(options.method, "POST");
      return json({ jobId: JOB, receipt: fixture() });
    },
  });
  assert.deepEqual(await fetcher({ jobId: JOB, claimToken: CLAIM, accessToken: jwt }), fixture());
  assert.equal(calls, 1);
});

test("no privileged key, different backend, missing JWT or expired/non-staff token can authorize hardware", async () => {
  for (const input of [
    { ...backend, projectUrl: "https://ebzinvoxundsdubczqfg.supabase.co" },
    { ...backend, projectUrl: "https://attacker.test" },
    { ...backend, publishableKey: "sb_secret_XXXXXXXXXXXXXXXXXXXXXXXX" },
    { ...backend, publishableKey: token({ role: "service_role", ref: "srsxybepwujuawyutnbs" }) },
    { ...backend, rpc: "other" },
  ])
    assert.throws(() => validateBackend(input));
  let calls = 0;
  const fetcher = createClaimedReceiptFetcher(backend, {
    fetchImpl: async () => {
      calls++;
      throw new Error("Must not call");
    },
  });
  for (const jwt of [
    undefined,
    "refresh-token",
    token({ role: "service_role" }),
    token({
      sub: ORDER,
      role: "authenticated",
      aud: "authenticated",
      iss: MEALDECK_SUPABASE_ORIGIN + "/auth/v1",
      exp: 1,
    }),
    staffToken() + "\r\nX-Forged: yes",
  ])
    await assert.rejects(fetcher({ jobId: JOB, claimToken: CLAIM, accessToken: jwt }), {
      code: "valid_staff_access_token_required",
    });
  assert.equal(calls, 0);
});

test("backend rejection, redirects, oversized bodies and a response for another job fail closed", async () => {
  for (const response of [
    new Response("private upstream details", { status: 403 }),
    json({ jobId: CLAIM, receipt: fixture() }),
    json({ jobId: JOB, receipt: fixture(), extra: "unexpected" }),
    new Response("x", { headers: { "Content-Type": "text/html" } }),
    new Response(" ".repeat(131073), { headers: { "Content-Type": "application/json" } }),
  ]) {
    const fetcher = createClaimedReceiptFetcher(backend, { fetchImpl: async () => response });
    await assert.rejects(fetcher({ jobId: JOB, claimToken: CLAIM, accessToken: staffToken() }));
  }
  const fetcher = createClaimedReceiptFetcher(backend, {
    fetchImpl: async () => {
      throw new Error("Redirect includes private token");
    },
  });
  await assert.rejects(
    fetcher({ jobId: JOB, claimToken: CLAIM, accessToken: staffToken() }),
    (error) => error.code === "receipt_backend_unavailable" && !error.message.includes("token"),
  );
});

test("production configuration binds only the fixed HTTPS loopback listener and locally configured private printer", () => {
  const config = {
    schemaVersion: 1,
    serviceOrigin: "https://127.0.0.1:17443",
    allowedOrigins: ["https://mealdeck.co.uk"],
    stateDirectory: "private-state",
    tls: { keyFile: "localhost-key.pem", certFile: "localhost.pem" },
    backend,
    printer: { host: "192.168.1.50", port: 9100 },
  };
  const validated = validateConfiguration(config, "/private/example");
  assert.equal(validated.host, "127.0.0.1");
  assert.equal(validated.printer.cut, "none");
  assert.equal(validated.stateDirectory, "/private/example/private-state");
  for (const invalid of [
    { ...config, serviceOrigin: "http://127.0.0.1:17443" },
    { ...config, serviceOrigin: "https://0.0.0.0:17443" },
    { ...config, serviceOrigin: "https://192.168.1.10:17443" },
    { ...config, allowedOrigins: ["*"] },
    { ...config, allowedOrigins: ["https://mealdeck.co.uk/"] },
    { ...config, printer: { host: "example.com", port: 9100 } },
    { ...config, printer: { host: "8.8.8.8", port: 9100 } },
    { ...config, printer: { host: "192.168.1.50", port: 9100, command: "shell" } },
  ])
    assert.throws(() => validateConfiguration(invalid));
});
