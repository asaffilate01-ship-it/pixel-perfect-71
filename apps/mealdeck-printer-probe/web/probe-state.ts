export const REQUEST_STORAGE_KEY = "mealdeck-printer-probe-request-v1";
export const TEST_STATUSES = [
  "sending",
  "sent_unconfirmed",
  "held",
  "printed",
  "not_printed",
] as const;
export type TestStatus = (typeof TEST_STATUSES)[number];
export type PaperOutcome = "printed" | "not_printed";

export type ProbeResult = {
  available: boolean;
  state: "available" | "unavailable";
  message: string;
  device: { model: string; androidVersion: string; apiLevel: number; build: string };
  service: {
    packageName: string;
    componentName: string;
    packageVersion: string | null;
    descriptor: string | null;
    serviceVersion: string | null;
  };
};
export type SetupTest = {
  requestId: string;
  status: TestStatus;
  createdAt: string;
  updatedAt: string;
  message: string;
};
export interface PrinterProbePlugin {
  probe(): Promise<unknown>;
  getTestState(): Promise<unknown>;
  printSetup(options: { requestId: string }): Promise<unknown>;
  confirmPaper(options: { requestId: string; outcome: PaperOutcome }): Promise<unknown>;
}
export type ProbeStorage = Pick<Storage, "getItem" | "setItem" | "removeItem">;
export type BusyAction = "recovering" | "checking" | "printing" | "confirming" | null;
export type ProbeState = {
  native: boolean;
  busy: BusyAction;
  journalChecked: boolean;
  probe: ProbeResult | null;
  test: SetupTest | null;
  pendingRequestId: string | null;
  error: string;
  storageError: string;
};

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const unsafeText = /[\p{Cc}\p{Cf}]/u;
function invalid(): never {
  throw new Error("The saved printer result could not be verified.");
}
function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) invalid();
  return value as Record<string, unknown>;
}
function text(value: unknown, nullable = false): string | null {
  if (nullable && value === null) return null;
  if (typeof value !== "string" || !value.trim() || value.length > 512 || unsafeText.test(value))
    invalid();
  return value;
}
function instant(value: unknown): string {
  if (
    typeof value !== "string" ||
    value.length > 64 ||
    !/^\d{4}-\d{2}-\d{2}T/.test(value) ||
    !Number.isFinite(Date.parse(value))
  )
    invalid();
  return value;
}

export function parseProbeResult(raw: unknown): ProbeResult {
  const value = record(raw);
  const device = record(value["device"]);
  const service = record(value["service"]);
  if (
    typeof value["available"] !== "boolean" ||
    value["state"] !== (value["available"] ? "available" : "unavailable")
  )
    invalid();
  const apiLevel = device["apiLevel"];
  if (typeof apiLevel !== "number" || !Number.isInteger(apiLevel) || apiLevel < 1 || apiLevel > 100)
    invalid();
  return {
    available: value["available"],
    state: value["available"] ? "available" : "unavailable",
    message: text(value["message"])!,
    device: {
      model: text(device["model"])!,
      androidVersion: text(device["androidVersion"])!,
      apiLevel,
      build: text(device["build"])!,
    },
    service: {
      packageName: text(service["packageName"])!,
      componentName: text(service["componentName"])!,
      packageVersion: text(service["packageVersion"], true),
      descriptor: text(service["descriptor"], true),
      serviceVersion: text(service["serviceVersion"], true),
    },
  };
}

export function parseTestState(raw: unknown): SetupTest | null {
  const value = record(raw);
  if (value["test"] === null) return null;
  const test = record(value["test"]);
  const requestId = test["requestId"];
  if (
    typeof requestId !== "string" ||
    !uuid.test(requestId) ||
    !TEST_STATUSES.includes(test["status"] as TestStatus)
  )
    invalid();
  return {
    requestId: requestId.toLowerCase(),
    status: test["status"] as TestStatus,
    createdAt: instant(test["createdAt"]),
    updatedAt: instant(test["updatedAt"]),
    message: text(test["message"])!,
  };
}

export function isResolved(test: SetupTest | null) {
  return !!test && (test.status === "printed" || test.status === "not_printed");
}
export function hasUnknownRequest(state: ProbeState) {
  return !!state.pendingRequestId && state.test?.requestId !== state.pendingRequestId;
}
export function probeControls(state: ProbeState) {
  const idle = state.native && !state.busy;
  const unresolved = !!state.test && !isResolved(state.test);
  const ready =
    idle && state.journalChecked && state.probe?.available === true && !state.storageError;
  return {
    check: idle,
    recover: idle,
    print: ready && !state.pendingRequestId && !unresolved,
    retrySame: ready && !!state.pendingRequestId && !unresolved && hasUnknownRequest(state),
    confirm:
      idle &&
      state.journalChecked &&
      (state.test?.status === "sent_unconfirmed" || state.test?.status === "held"),
  };
}

function readRequest(storage: ProbeStorage): string | null {
  const raw = storage.getItem(REQUEST_STORAGE_KEY);
  if (raw === null) return null;
  const value = record(JSON.parse(raw));
  if (
    value["version"] !== 1 ||
    Object.keys(value).some((key) => key !== "version" && key !== "requestId") ||
    typeof value["requestId"] !== "string" ||
    !uuid.test(value["requestId"])
  )
    invalid();
  return value["requestId"].toLowerCase();
}
function saveRequest(storage: ProbeStorage, requestId: string) {
  const previous = readRequest(storage);
  if (previous && previous !== requestId)
    throw new Error("A different setup request is still saved.");
  const encoded = JSON.stringify({ version: 1, requestId });
  storage.setItem(REQUEST_STORAGE_KEY, encoded);
  if (storage.getItem(REQUEST_STORAGE_KEY) !== encoded)
    throw new Error("Setup recovery could not be saved.");
}
function clearRequest(storage: ProbeStorage, requestId: string) {
  const previous = readRequest(storage);
  if (previous && previous !== requestId)
    throw new Error("A different setup request is still saved.");
  storage.removeItem(REQUEST_STORAGE_KEY);
  if (storage.getItem(REQUEST_STORAGE_KEY) !== null)
    throw new Error("Setup recovery could not be updated.");
}

export function createProbeController(options: {
  native: boolean;
  plugin: PrinterProbePlugin;
  storage: ProbeStorage;
  createRequestId: () => string;
  onChange: (state: ProbeState) => void;
}) {
  let disposed = false;
  const state: ProbeState = {
    native: options.native,
    busy: null,
    journalChecked: false,
    probe: null,
    test: null,
    pendingRequestId: null,
    error: "",
    storageError: "",
  };
  const emit = () => {
    if (!disposed) options.onChange({ ...state });
  };
  const storageFailure = () => {
    state.storageError =
      "Setup recovery is unavailable on this device. Reopen the app before starting another test. Saved results can still be checked.";
  };
  function accept(test: SetupTest | null) {
    state.test = test;
    state.journalChecked = true;
    if (!test) return;
    try {
      if (!state.pendingRequestId && !isResolved(test)) {
        saveRequest(options.storage, test.requestId);
        state.pendingRequestId = test.requestId;
      } else if (state.pendingRequestId === test.requestId && isResolved(test)) {
        clearRequest(options.storage, test.requestId);
        state.pendingRequestId = null;
      }
    } catch {
      storageFailure();
    }
  }
  async function readNative() {
    const test = parseTestState(await options.plugin.getTestState());
    if (!disposed) accept(test);
  }
  async function run(action: Exclude<BusyAction, null>, task: () => Promise<void>) {
    if (disposed || !state.native || state.busy) return;
    state.busy = action;
    state.error = "";
    emit();
    try {
      await task();
    } catch {
      if (!disposed) {
        state.journalChecked = false;
        state.error =
          "The printer result could not be checked. Keep the saved request and use Check saved result. Do not assume a ticket printed.";
      }
    } finally {
      if (!disposed) {
        state.busy = null;
        emit();
      }
    }
  }
  async function dispatch(requestId: string) {
    try {
      saveRequest(options.storage, requestId);
      state.pendingRequestId = requestId;
    } catch {
      storageFailure();
      return;
    }
    state.journalChecked = false;
    emit();
    try {
      const test = parseTestState(await options.plugin.printSetup({ requestId }));
      if (!test || test.requestId !== requestId) invalid();
      if (!disposed) accept(test);
    } catch {
      if (disposed) return;
      state.error =
        "The send result was not confirmed. The original request is saved. Check the printer and the saved result before continuing.";
      await readNative();
    }
  }
  return {
    getState: () => ({ ...state }),
    async start() {
      if (!state.native) {
        emit();
        return;
      }
      try {
        state.pendingRequestId = readRequest(options.storage);
      } catch {
        storageFailure();
      }
      await run("recovering", readNative);
    },
    async checkConnection() {
      await run("checking", async () => {
        state.probe = null;
        const probe = parseProbeResult(await options.plugin.probe());
        if (disposed) return;
        state.probe = probe;
        await readNative();
      });
    },
    async recover() {
      await run("recovering", readNative);
    },
    async print() {
      if (!probeControls(state).print) return;
      await run("printing", async () => {
        const requestId = options.createRequestId().toLowerCase();
        if (!uuid.test(requestId)) invalid();
        await dispatch(requestId);
      });
    },
    async retrySame() {
      if (!probeControls(state).retrySame || !state.pendingRequestId) return;
      const requestId = state.pendingRequestId;
      await run("printing", () => dispatch(requestId));
    },
    async confirm(outcome: PaperOutcome) {
      if (
        !probeControls(state).confirm ||
        !state.test ||
        (outcome !== "printed" && outcome !== "not_printed")
      )
        return;
      const requestId = state.test.requestId;
      await run("confirming", async () => {
        try {
          const test = parseTestState(await options.plugin.confirmPaper({ requestId, outcome }));
          if (!test || test.requestId !== requestId || test.status !== outcome) invalid();
          if (!disposed) accept(test);
        } catch {
          if (disposed) return;
          state.error =
            "Paper confirmation could not be checked. Keep the saved test and check its result again.";
          await readNative();
        }
      });
    },
    invalidateConnection() {
      state.probe = null;
      emit();
    },
    dispose() {
      disposed = true;
    },
  };
}

export function diagnosticText(state: ProbeState): string {
  const lines = [
    "MealDeck Printer Setup",
    "Setup only — no customer or payment data",
    `Native Android app: ${state.native ? "yes" : "no"}`,
  ];
  if (state.probe) {
    const { device, service } = state.probe;
    lines.push(
      `Connection: ${state.probe.state}`,
      `Model: ${device.model}`,
      `Android: ${device.androidVersion} (API ${device.apiLevel})`,
      `Build: ${device.build}`,
      `Printer package: ${service.packageName}`,
      `Component: ${service.componentName}`,
      `Package version: ${service.packageVersion ?? "unavailable"}`,
      `Service descriptor: ${service.descriptor ?? "unavailable"}`,
      `Service version: ${service.serviceVersion ?? "unavailable"}`,
    );
  } else lines.push("Connection: not checked");
  if (state.test)
    lines.push(
      `Setup request: ${state.test.requestId}`,
      `Test status: ${state.test.status}`,
      `Created: ${state.test.createdAt}`,
      `Updated: ${state.test.updatedAt}`,
    );
  else
    lines.push(`Test status: ${state.journalChecked ? "no native test recorded" : "not checked"}`);
  if (hasUnknownRequest(state)) lines.push(`Unresolved saved request: ${state.pendingRequestId}`);
  if (state.storageError) lines.push("Recovery storage: unavailable");
  return lines.join("\n");
}
