import assert from "node:assert/strict";
import { test } from "node:test";
import type { PaymentIntent } from "@stripe/stripe-terminal-react-native";
import { PaymentController, type PaymentDependencies } from "../src/payment/controller";
import type { AttemptResponse, Recovery, TerminalOrder, TerminalQuote } from "../src/api/types";
import { TerminalApiError } from "../src/api/client";

const orderId = "00000000-0000-4000-8000-000000000001";
const attemptId = "00000000-0000-4000-8000-000000000002";
const quoteId = "00000000-0000-4000-8000-000000000003";
const recovery = { orderId, attemptId };
const order: TerminalOrder = {
  orderId,
  handoffCode: "1234",
  fulfilment: "pickup",
  kitchenName: "Luton",
  currency: "gbp",
  totalPence: 1000,
  paidPence: 0,
  remainingPence: 1000,
  status: "unpaid",
  canCollect: true,
  lines: [{ name: "Server-priced meal", quantity: 1, linePence: 1000 }],
  message: "Review this balance.",
};
const quote: TerminalQuote = {
  quoteId,
  expiresAt: "2100-01-01T00:00:00.000Z",
  grossPence: 1000,
  discountPence: 0,
  totalPence: 1000,
  collectionEstimateMinutes: 15,
  lines: [
    { lineId: "line-1", name: "Server-priced meal", quantity: 1, line_pence: 1000, modifiers: [] },
  ],
  packingPlan: {
    version: 1,
    separateBags: false,
    cutleryRequested: false,
    bags: [{ number: 1, allocations: [{ lineId: "line-1", quantity: 1 }] }],
  },
};
const intent: PaymentIntent.Type = {
  id: "pi_test",
  amount: 1000,
  currency: "gbp",
  livemode: false,
  status: "requiresPaymentMethod",
  created: "2026-11-05",
  sdkUuid: "sdk-only-id",
};
function result(
  status: AttemptResponse["attempt"]["status"] = "reserved",
  action: AttemptResponse["action"] = "collect",
  value = order,
): AttemptResponse {
  return {
    order: structuredClone(value),
    attempt: {
      id: attemptId,
      paymentIntentId: "pi_test",
      clientSecret: action === "collect" ? "pi_test_secret_memoryonly" : null,
      status,
    },
    action,
  };
}
const paid = () =>
  result("succeeded", "none", {
    ...order,
    paidPence: 1000,
    remainingPence: 0,
    status: "paid",
    canCollect: false,
    message: "Payment verified.",
  });
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}
function setup(initial: Recovery | null = null) {
  let stored = initial;
  const calls: { name: string; value?: unknown }[] = [];
  const deps: PaymentDependencies = {
    api: {
      async lookup(reference) {
        calls.push({ name: "lookup", value: reference });
        return structuredClone(order);
      },
      async prepare(value) {
        calls.push({ name: "prepare", value: structuredClone(value) });
        return result();
      },
      async reconcile(value) {
        calls.push({ name: "reconcile", value: structuredClone(value) });
        return paid();
      },
      async cancel(value) {
        calls.push({ name: "cancel", value: structuredClone(value) });
        return result("cancelled", "none");
      },
    },
    sdk: {
      async retrieve(secret) {
        calls.push({ name: "retrieve", value: secret });
        return { paymentIntent: { ...intent } };
      },
      async collect(paymentIntent) {
        calls.push({ name: "collect" });
        return { paymentIntent: { ...paymentIntent, status: "requiresConfirmation" } };
      },
      async confirm(paymentIntent) {
        calls.push({ name: "confirm" });
        return { paymentIntent: { ...paymentIntent, status: "succeeded" } };
      },
      async cancelCollection() {
        calls.push({ name: "cancelCollection" });
        return {};
      },
    },
    journal: {
      async read() {
        calls.push({ name: "read" });
        return stored;
      },
      async write(value) {
        calls.push({ name: "write", value: structuredClone(value) });
        stored = structuredClone(value);
      },
      async clear() {
        calls.push({ name: "clear" });
        stored = null;
      },
    },
    async online() {
      return true;
    },
    canCollect: () => true,
    liveMode: () => false,
    uuid() {
      calls.push({ name: "uuid" });
      return attemptId;
    },
  };
  const controller = new PaymentController(deps);
  return { controller, deps, calls, saved: () => stored };
}
async function reviewed() {
  const fixture = setup();
  await fixture.controller.restore();
  await fixture.controller.lookup("1234");
  return fixture;
}

test("persists recovery before prepare and shows paid only after backend reconciliation", async () => {
  const { controller, calls, saved } = await reviewed();
  await controller.collect();
  assert.deepEqual(
    calls.map((entry) => entry.name),
    [
      "read",
      "lookup",
      "uuid",
      "write",
      "prepare",
      "retrieve",
      "collect",
      "confirm",
      "reconcile",
      "clear",
    ],
  );
  assert.deepEqual(calls.find((entry) => entry.name === "prepare")!.value, recovery);
  assert.equal(controller.getSnapshot().phase, "paid");
  assert.equal(saved(), null);
  for (const entry of calls.filter((value) => value.name === "write"))
    assert.deepEqual(entry.value, recovery);
});

test("SDK success with a processing backend remains pending with the original recovery", async () => {
  const { controller, deps, saved } = await reviewed();
  deps.api.reconcile = async () =>
    result("processing", "reconcile", { ...order, status: "processing", canCollect: false });
  await controller.collect();
  assert.equal(controller.getSnapshot().phase, "pending");
  assert.deepEqual(saved(), recovery);
  assert.equal(controller.getSnapshot().order!.paidPence, 0);
});

test("a lost confirmation response never creates another attempt or declares failure/paid", async () => {
  const { controller, deps, calls, saved } = await reviewed();
  deps.sdk.confirm = async () => {
    throw new Error("Network interrupted");
  };
  await controller.collect();
  assert.equal(controller.getSnapshot().phase, "pending");
  assert.deepEqual(saved(), recovery);
  await controller.collect();
  assert.equal(calls.filter((entry) => entry.name === "prepare").length, 1);
  await controller.reconcile();
  assert.equal(controller.getSnapshot().phase, "paid");
  assert.equal(calls.filter((entry) => entry.name === "uuid").length, 1);
});

test("ordinary card decline retries the same server attempt and PaymentIntent", async () => {
  const { controller, deps, calls, saved } = await reviewed();
  deps.sdk.collect = async () => ({ error: { code: "declined_by_reader" } });
  deps.api.reconcile = async () => result();
  await controller.collect();
  assert.equal(controller.getSnapshot().phase, "retryable");
  assert.deepEqual(saved(), recovery);
  deps.sdk.collect = async (paymentIntent) => ({
    paymentIntent: { ...paymentIntent, status: "requiresConfirmation" },
  });
  deps.api.reconcile = async () => paid();
  await controller.collect();
  assert.equal(controller.getSnapshot().phase, "paid");
  assert.deepEqual(
    calls.filter((entry) => entry.name === "prepare").map((entry) => entry.value),
    [recovery, recovery],
  );
  assert.equal(calls.filter((entry) => entry.name === "uuid").length, 1);
});

test("double tapping payment cannot overlap prepare, collection or confirmation", async () => {
  const { controller, deps, calls } = await reviewed();
  const waiting = deferred<AttemptResponse>();
  deps.api.prepare = async (value) => {
    calls.push({ name: "prepare", value });
    return waiting.promise;
  };
  const first = controller.collect();
  await new Promise((resolve) => setTimeout(resolve, 0));
  await controller.collect();
  waiting.resolve(result());
  await first;
  assert.equal(calls.filter((entry) => entry.name === "prepare").length, 1);
  assert.equal(calls.filter((entry) => entry.name === "collect").length, 1);
  assert.equal(calls.filter((entry) => entry.name === "confirm").length, 1);
});

test("staff readiness, offline status and paid order all block collection", async () => {
  for (const scenario of ["permission", "offline", "paid"] as const) {
    const { controller, deps, calls } = await reviewed();
    if (scenario === "permission") deps.canCollect = () => false;
    if (scenario === "offline") deps.online = async () => false;
    if (scenario === "paid") {
      deps.api.lookup = async () => paid().order;
      await controller.lookup("1234");
    }
    await controller.collect();
    assert.equal(
      calls.some((entry) => ["prepare", "collect", "confirm", "write"].includes(entry.name)),
      false,
    );
  }
});

test("secure storage failure blocks preparation instead of losing recovery data", async () => {
  const { controller, deps, calls } = await reviewed();
  deps.journal.write = async () => {
    throw new Error("Keychain unavailable");
  };
  await controller.collect();
  assert.equal(controller.getSnapshot().phase, "error");
  assert.equal(
    calls.some((entry) => entry.name === "prepare"),
    false,
  );
  const unreadable = setup();
  unreadable.deps.journal.read = async () => {
    throw new Error("Corrupt recovery record");
  };
  await unreadable.controller.restore();
  await unreadable.controller.lookup("1234");
  assert.equal(
    unreadable.calls.some((entry) => entry.name === "lookup"),
    false,
  );
});

test("mismatched intent amount, currency, mode and ID cannot reach card collection", async () => {
  for (const mismatch of [
    { amount: 1 },
    { currency: "usd" },
    { livemode: true },
    { id: "pi_different" },
  ]) {
    const { controller, deps, calls, saved } = await reviewed();
    deps.sdk.retrieve = async () => ({ paymentIntent: { ...intent, ...mismatch } });
    await controller.collect();
    assert.equal(controller.getSnapshot().phase, "pending");
    assert.deepEqual(saved(), recovery);
    assert.equal(
      calls.some((entry) => entry.name === "collect"),
      false,
    );
  }
});

test("a different server order or attempt never reaches the SDK", async () => {
  for (const mismatch of [
    { ...result(), order: { ...order, orderId: quoteId } },
    { ...result(), attempt: { ...result().attempt, id: quoteId } },
  ]) {
    const { controller, deps, calls } = await reviewed();
    deps.api.prepare = async () => mismatch;
    await controller.collect();
    assert.equal(controller.getSnapshot().phase, "pending");
    assert.equal(
      calls.some((entry) => entry.name === "retrieve"),
      false,
    );
  }
});

test("changed current amount requires a second explicit review before touching the reader", async () => {
  const { controller, deps, calls } = await reviewed();
  const changed = { ...order, totalPence: 1200, remainingPence: 1200 };
  deps.api.prepare = async () => result("reserved", "collect", changed);
  await controller.collect();
  assert.equal(controller.getSnapshot().phase, "review");
  assert.equal(controller.getSnapshot().order!.remainingPence, 1200);
  assert.equal(
    calls.some((entry) => entry.name === "retrieve"),
    false,
  );
});

test("a retrieved processing/succeeded intent is reconciled without asking for another card", async () => {
  for (const status of ["processing", "succeeded", "requiresConfirmation"] as const) {
    const { controller, deps, calls } = await reviewed();
    deps.sdk.retrieve = async () => ({ paymentIntent: { ...intent, status } });
    await controller.collect();
    assert.equal(
      calls.some((entry) => entry.name === "collect"),
      false,
    );
    assert.equal(controller.getSnapshot().phase, "paid");
  }
});

test("cancel stops reader collection then reconciles server cancellation before clearing recovery", async () => {
  const { controller, deps, calls, saved } = await reviewed();
  const collecting = deferred<{ error: { code: string } }>();
  deps.sdk.collect = async () => {
    calls.push({ name: "collect" });
    return collecting.promise;
  };
  const pending = controller.collect();
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.equal(controller.getSnapshot().phase, "collecting");
  await controller.cancel();
  assert.deepEqual(saved(), recovery);
  assert.equal(
    calls.some((entry) => entry.name === "cancel"),
    false,
  );
  collecting.resolve({ error: { code: "canceled" } });
  await pending;
  assert.equal(controller.getSnapshot().phase, "cancelled");
  assert.equal(saved(), null);
  assert.equal(
    calls.some((entry) => entry.name === "confirm"),
    false,
  );
  assert.ok(
    calls.findIndex((entry) => entry.name === "cancelCollection") <
      calls.findIndex((entry) => entry.name === "cancel"),
  );
});

test("app restart reconciles the original order before allowing another order", async () => {
  const { controller, deps, calls, saved } = setup(recovery);
  deps.api.reconcile = async () =>
    result("processing", "reconcile", { ...order, status: "processing", canCollect: false });
  await controller.restore();
  await controller.lookup("different-order");
  assert.equal(
    calls.some((entry) => entry.name === "lookup" || entry.name === "prepare"),
    false,
  );
  assert.deepEqual(saved(), recovery);
  assert.equal(controller.getSnapshot().phase, "pending");
});

test("new-sale quote uses its original recovery ID and changes to the returned order ID", async () => {
  const { controller, calls } = setup();
  await controller.restore();
  controller.reviewQuote(quote);
  await controller.collect();
  assert.deepEqual(calls.find((entry) => entry.name === "prepare")!.value, { quoteId, attemptId });
  assert.deepEqual(
    calls.filter((entry) => entry.name === "write").map((entry) => entry.value),
    [{ quoteId, attemptId }, recovery],
  );
  assert.deepEqual(calls.find((entry) => entry.name === "reconcile")!.value, recovery);
  assert.equal(controller.getSnapshot().phase, "paid");
});

test("expired kitchen quote cannot prepare an order or start collection", async () => {
  const { controller, calls } = setup();
  await controller.restore();
  controller.reviewQuote({ ...quote, expiresAt: "2020-01-01T00:00:00.000Z" });
  await controller.collect();
  assert.equal(
    calls.some((entry) => entry.name === "prepare" || entry.name === "write"),
    false,
  );
  assert.match(controller.getSnapshot().message, /expired/);
});

test("unknown quote preparation requires explicit retry with the SAME idempotency UUID", async () => {
  const { controller, deps, calls } = setup({ quoteId, attemptId });
  deps.api.reconcile = async (value) => {
    calls.push({ name: "reconcile", value });
    throw new TerminalApiError("attempt_not_found", "Original request not recorded", 404);
  };
  await controller.restore();
  assert.equal(controller.getSnapshot().phase, "pending");
  assert.equal(
    calls.some((entry) => entry.name === "prepare"),
    false,
  );
  await controller.retryPreparation();
  assert.deepEqual(calls.find((entry) => entry.name === "prepare")!.value, { quoteId, attemptId });
  assert.equal(
    calls.some((entry) => entry.name === "uuid" || entry.name === "retrieve"),
    false,
  );
  assert.equal(controller.getSnapshot().phase, "retryable");
  assert.equal(controller.getSnapshot().order!.remainingPence, 1000);
});

test("a settled partial payment unlocks only the remaining server balance", async () => {
  const { controller, deps, saved } = setup(recovery);
  deps.api.reconcile = async () =>
    result("succeeded", "none", { ...order, paidPence: 600, remainingPence: 400 });
  await controller.restore();
  assert.equal(controller.getSnapshot().phase, "review");
  assert.equal(controller.getSnapshot().order!.remainingPence, 400);
  assert.equal(saved(), null);
});

test("a successful attempt on a held overpaid order preserves actual money and recovery", async () => {
  const { controller, deps, saved, calls } = setup(recovery);
  deps.api.reconcile = async () =>
    result("succeeded", "none", {
      ...order,
      status: "hold",
      paidPence: 1400,
      remainingPence: 0,
      canCollect: false,
      message: "A late payment needs manager review.",
    });
  await controller.restore();
  assert.equal(controller.getSnapshot().phase, "hold");
  assert.equal(controller.getSnapshot().order!.paidPence, 1400);
  assert.deepEqual(saved(), recovery);
  await controller.collect();
  assert.equal(
    calls.some((entry) => entry.name === "prepare" || entry.name === "collect"),
    false,
  );
  assert.deepEqual(saved(), recovery);
});
