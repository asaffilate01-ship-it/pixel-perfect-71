import assert from "node:assert/strict";
import { test } from "node:test";
import {
  paperAction,
  parsePrinterStatus,
  receiptLabel,
  safeError,
  type PrinterStatus,
} from "./contract.ts";

function fixture(): PrinterStatus {
  return {
    schemaVersion: 1,
    signedIn: true,
    needsMfa: false,
    factors: [],
    scopes: [
      {
        tenantId: "11111111-1111-4111-8111-111111111111",
        locationId: "22222222-2222-4222-8222-222222222222",
        tenantName: "MealDeck",
        locationName: "Luton",
      },
    ],
    selectedScope: {
      tenantId: "11111111-1111-4111-8111-111111111111",
      locationId: "22222222-2222-4222-8222-222222222222",
      tenantName: "MealDeck",
      locationName: "Luton",
    },
    serviceRunning: true,
    serviceMessage: "Listening for accepted orders.",
    connection: { available: true, message: "Built-in printer connected." },
    jobs: [
      {
        jobId: "33333333-3333-4333-8333-333333333333",
        orderNumber: "27",
        copyNumber: 1,
        status: "sent_unconfirmed",
        createdAt: "2026-11-07T15:00:00Z",
        canConfirm: true,
        canPrint: false,
      },
    ],
    lastPollAt: "2026-11-07T15:00:02Z",
    baselineAt: "2026-11-07T14:58:00Z",
    notificationsAllowed: true,
    soundEnabled: true,
  };
}

test("accepts bounded native metadata and distinguishes sent from inspected paper", () => {
  const state = parsePrinterStatus(fixture());
  assert.equal(state.jobs[0]?.status, "sent_unconfirmed");
  assert.equal(receiptLabel(state.jobs[0]!), "Order 0027");
  assert.equal(receiptLabel({ orderNumber: "27", copyNumber: 2 }), "Order 0027 · Copy 2");
});

test("copies only status metadata and rejects a selected kitchen outside current access", () => {
  const extra = { ...fixture(), accessToken: "must-not-propagate" };
  const parsed = parsePrinterStatus(extra);
  assert.equal("accessToken" in parsed, false);
  extra.jobs[0]!.status = "printed";
  assert.equal(parsed.jobs[0]!.status, "sent_unconfirmed");
  const denied = fixture();
  denied.selectedScope = {
    ...denied.selectedScope!,
    locationId: "99999999-9999-4999-8999-999999999999",
  };
  assert.throws(() => parsePrinterStatus(denied));
});

test("rejects duplicate job identities, excessive arrays and false active sign-in state", () => {
  const duplicate = fixture();
  duplicate.jobs.push({ ...duplicate.jobs[0]! });
  assert.throws(() => parsePrinterStatus(duplicate));
  const unsigned = fixture();
  unsigned.signedIn = false;
  assert.throws(() => parsePrinterStatus(unsigned));
  const awaitingMfa = fixture();
  awaitingMfa.needsMfa = true;
  assert.throws(() => parsePrinterStatus(awaitingMfa));
  const excessive = fixture();
  excessive.jobs = Array.from({ length: 101 }, () => ({ ...excessive.jobs[0]! }));
  assert.throws(() => parsePrinterStatus(excessive));
});

test("paper confirmation requires a native-permitted inspected state and keeps the exact job", () => {
  const job = fixture().jobs[0]!;
  assert.deepEqual(paperAction(job, "printed"), {
    jobId: job.jobId,
    outcome: "printed",
    reason: "Operator inspected one complete paper receipt on the H10S.",
  });
  assert.equal(paperAction(job, "not_printed").outcome, "not_printed");
  for (const unsafe of [
    { ...job, canConfirm: false },
    { ...job, status: "queued" as const },
    { ...job, status: "printed" as const },
  ])
    assert.throws(() => paperAction(unsafe, "printed"));
});

test("raw native/provider errors and secrets never become operator error copy", () => {
  for (const error of [
    new Error("secret-token-value"),
    { code: "unknown", message: "private-user-info" },
    { message: "Bearer secret-token" },
  ]) {
    const message = safeError(error);
    assert(!message.includes("secret-token"));
    assert(!message.includes("private-user"));
    assert(message.includes("not confirmed"));
  }
  assert(safeError({ code: "printer_access_denied" }).includes("printer access"));
});
