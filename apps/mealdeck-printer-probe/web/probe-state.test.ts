import { describe, test } from "node:test";
import assert from "node:assert/strict";
import {
  createProbeController,
  diagnosticText,
  parseProbeResult,
  parseTestState,
  probeControls,
  REQUEST_STORAGE_KEY,
  type PrinterProbePlugin,
  type ProbeResult,
  type ProbeState,
  type ProbeStorage,
  type SetupTest,
  type TestStatus,
} from "./probe-state.ts";

const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const time = "2026-11-06T21:30:00Z";
const result = (requestId = id(1), status: TestStatus = "sent_unconfirmed"): SetupTest => ({
  requestId,
  status,
  createdAt: time,
  updatedAt: time,
  message: "Inspect the setup ticket.",
});
const available = (): ProbeResult => ({
  available: true,
  state: "available",
  message: "Printer service connected. Paper output still needs checking.",
  device: { model: "H10S", androidVersion: "13", apiLevel: 33, build: "H10S-OS02-13.1.95" },
  service: {
    packageName: "example.printer",
    componentName: "example.printer.Service",
    packageVersion: "8.3.6",
    descriptor: "example.Printer",
    serviceVersion: "307",
  },
});
function memory(): ProbeStorage {
  const values = new Map<string, string>();
  return {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => {
      values.set(key, value);
    },
    removeItem: (key) => {
      values.delete(key);
    },
  };
}
function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
}
function harness(options: { native?: boolean; storage?: ProbeStorage } = {}) {
  let nativeTest: SetupTest | null = null;
  let sequence = 0;
  const storage = options.storage ?? memory();
  const calls: {
    probe: number;
    reads: number;
    print: string[];
    confirm: { requestId: string; outcome: string }[];
  } = { probe: 0, reads: 0, print: [], confirm: [] };
  const plugin: PrinterProbePlugin = {
    async probe() {
      calls.probe++;
      return available();
    },
    async getTestState() {
      calls.reads++;
      return { test: nativeTest };
    },
    async printSetup({ requestId }) {
      calls.print.push(requestId);
      nativeTest = result(requestId);
      return { test: nativeTest };
    },
    async confirmPaper({ requestId, outcome }) {
      calls.confirm.push({ requestId, outcome });
      nativeTest = result(requestId, outcome);
      return { test: nativeTest };
    },
  };
  const emitted: ProbeState[] = [];
  const controller = createProbeController({
    native: options.native ?? true,
    plugin,
    storage,
    createRequestId: () => id(++sequence),
    onChange: (state) => emitted.push(state),
  });
  return {
    controller,
    plugin,
    storage,
    calls,
    emitted,
    native: (value: SetupTest | null) => {
      nativeTest = value;
    },
    idsCreated: () => sequence,
  };
}

describe("local setup contract", () => {
  test("only software metadata is retained and copied", () => {
    const probe = parseProbeResult({
      ...available(),
      token: "secret-canary",
      device: {
        ...available().device,
        serial: "serial-canary",
        imei: "imei-canary",
        address: "address-canary",
      },
      service: { ...available().service, mac: "mac-canary" },
    });
    const state: ProbeState = {
      native: true,
      busy: null,
      journalChecked: true,
      probe,
      test: result(),
      pendingRequestId: id(1),
      error: "",
      storageError: "",
    };
    const copy = diagnosticText(state);
    for (const label of [
      "H10S",
      "Android: 13 (API 33)",
      "H10S-OS02-13.1.95",
      "8.3.6",
      "307",
      "sent_unconfirmed",
      id(1),
    ])
      assert.ok(copy.includes(label));
    for (const marker of [
      "secret-canary",
      "serial-canary",
      "imei-canary",
      "address-canary",
      "mac-canary",
    ])
      assert.ok(!(JSON.stringify(probe) + copy).includes(marker));
  });
  test("malformed or contradictory native results cannot enable a print", () => {
    for (const value of [
      null,
      {},
      { ...available(), available: true, state: "unavailable" },
      { ...available(), device: { ...available().device, apiLevel: "33" } },
      { ...available(), message: "unsafe\u202etext" },
    ])
      assert.throws(() => parseProbeResult(value));
    for (const value of [
      {},
      { test: {} },
      { test: { ...result(), requestId: "bad" } },
      { test: { ...result(), status: "success" } },
      { test: { ...result(), updatedAt: "yesterday" } },
    ])
      assert.throws(() => parseTestState(value));
    assert.equal(parseTestState({ test: null }), null);
    assert.deepEqual(parseTestState({ test: { ...result(), secret: "discard" } }), result());
  });
  test("browser mode invokes no native methods and never offers simulated printing", async () => {
    const h = harness({ native: false });
    await h.controller.start();
    await h.controller.checkConnection();
    await h.controller.recover();
    await h.controller.print();
    await h.controller.retrySame();
    await h.controller.confirm("printed");
    assert.deepEqual(h.calls, { probe: 0, reads: 0, print: [], confirm: [] });
    assert.equal(probeControls(h.controller.getState()).print, false);
    assert.ok(diagnosticText(h.controller.getState()).includes("Native Android app: no"));
  });
});

describe("one explicit setup request", () => {
  test("startup and connection checks do not print; both journal and service gate the action", async () => {
    const h = harness();
    await h.controller.print();
    await h.controller.start();
    assert.equal(h.calls.reads, 1);
    assert.equal(probeControls(h.controller.getState()).print, false);
    await h.controller.checkConnection();
    assert.equal(h.calls.probe, 1);
    assert.deepEqual(h.calls.print, []);
    assert.equal(probeControls(h.controller.getState()).print, true);
    h.controller.invalidateConnection();
    assert.equal(probeControls(h.controller.getState()).print, false);
  });
  test("request ID is durably saved before invocation and sent does not mean printed", async () => {
    const h = harness();
    await h.controller.start();
    await h.controller.checkConnection();
    h.plugin.printSetup = async ({ requestId }) => {
      assert.deepEqual(JSON.parse(h.storage.getItem(REQUEST_STORAGE_KEY)!), {
        version: 1,
        requestId,
      });
      h.calls.print.push(requestId);
      h.native(result(requestId));
      return { test: result(requestId) };
    };
    await h.controller.print();
    assert.deepEqual(h.calls.print, [id(1)]);
    assert.equal(h.controller.getState().test?.status, "sent_unconfirmed");
    assert.equal(probeControls(h.controller.getState()).print, false);
    assert.equal(probeControls(h.controller.getState()).confirm, true);
    await h.controller.print();
    assert.equal(h.calls.print.length, 1);
    assert.equal(h.idsCreated(), 1);
  });
  test("double click and a concurrent check cannot start overlapping native operations", async () => {
    const h = harness();
    await h.controller.start();
    await h.controller.checkConnection();
    const waiting = deferred<unknown>();
    h.plugin.printSetup = ({ requestId }) => {
      h.calls.print.push(requestId);
      return waiting.promise;
    };
    const first = h.controller.print();
    await h.controller.print();
    await h.controller.checkConnection();
    await h.controller.recover();
    assert.deepEqual(h.calls.print, [id(1)]);
    assert.equal(h.calls.probe, 1);
    assert.equal(h.controller.getState().busy, "printing");
    waiting.resolve({ test: result() });
    await first;
    assert.equal(h.controller.getState().busy, null);
  });
  test("blocked, corrupt or silently failing storage prevents a print before hardware invocation", async () => {
    for (const storage of [
      {
        ...memory(),
        getItem: () => {
          throw new Error("blocked");
        },
      },
      {
        ...memory(),
        setItem: () => {
          throw new Error("full");
        },
      },
      { ...memory(), setItem: () => {} },
    ]) {
      const h = harness({ storage });
      await h.controller.start();
      await h.controller.checkConnection();
      await h.controller.print();
      assert.deepEqual(h.calls.print, []);
      assert.notEqual(h.controller.getState().storageError, "");
      assert.equal(probeControls(h.controller.getState()).print, false);
    }
    const storage = memory();
    storage.setItem(REQUEST_STORAGE_KEY, "corrupt");
    const h = harness({ storage });
    await h.controller.start();
    await h.controller.checkConnection();
    await h.controller.print();
    assert.deepEqual(h.calls.print, []);
    assert.equal(storage.getItem(REQUEST_STORAGE_KEY), "corrupt");
  });
  test("unavailable printer or unreadable journal blocks a new test", async () => {
    const h = harness();
    await h.controller.start();
    h.plugin.probe = async () => ({ ...available(), available: false, state: "unavailable" });
    await h.controller.checkConnection();
    await h.controller.print();
    assert.deepEqual(h.calls.print, []);
    h.plugin.probe = async () => available();
    h.plugin.getTestState = async () => {
      throw new Error("private native failure");
    };
    await h.controller.checkConnection();
    await h.controller.print();
    assert.deepEqual(h.calls.print, []);
    assert.ok(!h.controller.getState().error.includes("private native failure"));
  });
});

describe("uncertain result recovery", () => {
  test("a lost send result recovers the native journal without resending", async () => {
    const h = harness();
    await h.controller.start();
    await h.controller.checkConnection();
    h.plugin.printSetup = async ({ requestId }) => {
      h.calls.print.push(requestId);
      h.native(result(requestId, "held"));
      throw new Error("sensitive native error");
    };
    await h.controller.print();
    assert.deepEqual(h.calls.print, [id(1)]);
    assert.equal(h.controller.getState().test?.status, "held");
    assert.equal(h.controller.getState().pendingRequestId, id(1));
    assert.ok(!JSON.stringify(h.controller.getState()).includes("sensitive native error"));
    assert.equal(probeControls(h.controller.getState()).retrySame, false);
  });
  test("null after an uncertain invocation retains the ID; only an explicit same-ID retry can send", async () => {
    const h = harness();
    await h.controller.start();
    await h.controller.checkConnection();
    h.plugin.printSetup = async ({ requestId }) => {
      h.calls.print.push(requestId);
      throw new Error("bridge did not respond");
    };
    await h.controller.print();
    await h.controller.recover();
    await h.controller.print();
    assert.deepEqual(h.calls.print, [id(1)]);
    assert.equal(h.controller.getState().pendingRequestId, id(1));
    assert.equal(probeControls(h.controller.getState()).retrySame, true);
    h.plugin.printSetup = async ({ requestId }) => {
      h.calls.print.push(requestId);
      return { test: result(requestId) };
    };
    await h.controller.retrySame();
    assert.deepEqual(h.calls.print, [id(1), id(1)]);
    assert.equal(h.idsCreated(), 1);
  });
  test("reload recovers a saved in-progress test without automatic output or paper confirmation", async () => {
    const storage = memory();
    storage.setItem(REQUEST_STORAGE_KEY, JSON.stringify({ version: 1, requestId: id(8) }));
    const h = harness({ storage });
    h.native(result(id(8), "sending"));
    await h.controller.start();
    await h.controller.checkConnection();
    assert.equal(h.controller.getState().pendingRequestId, id(8));
    assert.deepEqual(h.calls.print, []);
    assert.deepEqual(h.calls.confirm, []);
    assert.equal(probeControls(h.controller.getState()).print, false);
    assert.equal(probeControls(h.controller.getState()).confirm, false);
  });
  test("a pre-existing native unresolved test is adopted even without a browser record", async () => {
    const h = harness();
    h.native(result(id(9), "held"));
    await h.controller.start();
    assert.equal(h.controller.getState().pendingRequestId, id(9));
    assert.equal(JSON.parse(h.storage.getItem(REQUEST_STORAGE_KEY)!).requestId, id(9));
    assert.equal(probeControls(h.controller.getState()).confirm, true);
    assert.deepEqual(h.calls.print, []);
  });
  test("a different historical native result cannot clear the uncertain saved request", async () => {
    const storage = memory();
    storage.setItem(REQUEST_STORAGE_KEY, JSON.stringify({ version: 1, requestId: id(8) }));
    const h = harness({ storage });
    h.native(result(id(7), "printed"));
    await h.controller.start();
    await h.controller.checkConnection();
    assert.equal(h.controller.getState().pendingRequestId, id(8));
    assert.equal(probeControls(h.controller.getState()).print, false);
    assert.equal(probeControls(h.controller.getState()).retrySame, true);
    assert.deepEqual(h.calls.print, []);
  });
  test("wrong-request or malformed print responses do not create a false result", async () => {
    for (const response of [
      { test: result(id(7), "printed") },
      { test: null },
      { test: { ...result(), status: "success" } },
    ]) {
      const h = harness();
      await h.controller.start();
      await h.controller.checkConnection();
      h.plugin.printSetup = async ({ requestId }) => {
        h.calls.print.push(requestId);
        return response;
      };
      await h.controller.print();
      assert.equal(h.controller.getState().test, null);
      assert.equal(h.controller.getState().pendingRequestId, id(1));
      assert.equal(h.calls.print.length, 1);
    }
  });
  test("late completion after disposal cannot restart the screen or cause another send", async () => {
    const h = harness();
    await h.controller.start();
    await h.controller.checkConnection();
    const waiting = deferred<unknown>();
    h.plugin.printSetup = ({ requestId }) => {
      h.calls.print.push(requestId);
      return waiting.promise;
    };
    const request = h.controller.print();
    h.controller.dispose();
    const emitted = h.emitted.length;
    waiting.resolve({ test: result() });
    await request;
    await h.controller.print();
    assert.equal(h.emitted.length, emitted);
    assert.deepEqual(h.calls.print, [id(1)]);
    assert.notEqual(h.storage.getItem(REQUEST_STORAGE_KEY), null);
  });
});

describe("explicit paper outcome", () => {
  test("only a verified matching paper result releases the saved request", async () => {
    for (const outcome of ["printed", "not_printed"] as const) {
      const h = harness();
      await h.controller.start();
      await h.controller.checkConnection();
      await h.controller.print();
      await h.controller.confirm(outcome);
      assert.deepEqual(h.calls.confirm, [{ requestId: id(1), outcome }]);
      assert.equal(h.controller.getState().test?.status, outcome);
      assert.equal(h.controller.getState().pendingRequestId, null);
      assert.equal(h.storage.getItem(REQUEST_STORAGE_KEY), null);
      assert.equal(h.calls.print.length, 1);
      assert.equal(probeControls(h.controller.getState()).print, true);
    }
  });
  test("a lost paper confirmation is recovered read-only and never automatically repeated", async () => {
    const h = harness();
    await h.controller.start();
    await h.controller.checkConnection();
    await h.controller.print();
    h.plugin.confirmPaper = async ({ requestId, outcome }) => {
      h.calls.confirm.push({ requestId, outcome });
      h.native(result(requestId, outcome));
      throw new Error("lost reply");
    };
    await h.controller.confirm("printed");
    assert.equal(h.controller.getState().test?.status, "printed");
    assert.equal(h.controller.getState().pendingRequestId, null);
    assert.equal(h.calls.confirm.length, 1);
    assert.equal(h.calls.print.length, 1);
  });
  test("failed journal verification after confirmation keeps recovery and blocks a new test", async () => {
    const h = harness();
    await h.controller.start();
    await h.controller.checkConnection();
    await h.controller.print();
    h.plugin.confirmPaper = async () => ({ test: result(id(2), "printed") });
    h.plugin.getTestState = async () => {
      throw new Error("unavailable");
    };
    await h.controller.confirm("printed");
    assert.equal(h.controller.getState().pendingRequestId, id(1));
    assert.notEqual(h.storage.getItem(REQUEST_STORAGE_KEY), null);
    assert.equal(probeControls(h.controller.getState()).print, false);
  });
});
