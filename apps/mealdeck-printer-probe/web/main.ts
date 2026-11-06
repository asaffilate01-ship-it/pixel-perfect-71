import { Capacitor, registerPlugin } from "@capacitor/core";
import {
  createProbeController,
  diagnosticText,
  hasUnknownRequest,
  isResolved,
  probeControls,
  type PaperOutcome,
  type PrinterProbePlugin,
  type ProbeState,
  type ProbeStorage,
} from "./probe-state";
import "./styles.css";

function element<T extends HTMLElement>(id: string): T {
  const found = document.getElementById(id);
  if (!found) throw new Error("Printer setup screen is incomplete.");
  return found as T;
}
const ui = {
  browser: element("browser-notice"),
  error: element("error-message"),
  storage: element("storage-message"),
  connectionBadge: element("connection-badge"),
  connectionMessage: element("connection-message"),
  check: element<HTMLButtonElement>("check-connection"),
  print: element<HTMLButtonElement>("print-setup"),
  printHelp: element("print-help"),
  testBadge: element("test-badge"),
  testHeading: element("test-heading"),
  testMessage: element("test-message"),
  recovery: element("recovery-actions"),
  recover: element<HTMLButtonElement>("check-result"),
  retry: element<HTMLButtonElement>("retry-same"),
  retryHelp: element("retry-help"),
  confirmation: element("paper-confirmation"),
  printed: element<HTMLButtonElement>("paper-printed"),
  notPrinted: element<HTMLButtonElement>("paper-not-printed"),
  diagnostic: element<HTMLTextAreaElement>("diagnostic-text"),
  copy: element<HTMLButtonElement>("copy-details"),
  copyMessage: element("copy-message"),
};
const plugin = registerPlugin<PrinterProbePlugin>("MealDeckPrinterProbe");
const native =
  Capacitor.isNativePlatform() &&
  Capacitor.getPlatform() === "android" &&
  Capacitor.isPluginAvailable("MealDeckPrinterProbe");
// Access storage lazily: blocked storage must leave the read-only screen usable.
const storage: ProbeStorage = {
  getItem: (key) => window.localStorage.getItem(key),
  setItem: (key, value) => window.localStorage.setItem(key, value),
  removeItem: (key) => window.localStorage.removeItem(key),
};
let lastError = "";
let latest: ProbeState;
function message(target: HTMLElement, value: string) {
  target.textContent = value;
  target.hidden = !value;
}
function badge(
  target: HTMLElement,
  value: string,
  tone: "neutral" | "ready" | "warning" = "neutral",
) {
  target.textContent = value;
  target.dataset["tone"] = tone;
}
function render(state: ProbeState) {
  latest = state;
  const controls = probeControls(state);
  const unknown = hasUnknownRequest(state);
  const unresolved = !!state.test && !isResolved(state.test);
  ui.browser.hidden = state.native;
  message(ui.error, state.error);
  message(ui.storage, state.storageError);
  ui.check.disabled = !controls.check;
  ui.check.textContent =
    state.busy === "checking" ? "Checking printer…" : "Check printer connection";
  ui.print.disabled = !controls.print;
  ui.print.textContent =
    state.busy === "printing"
      ? "Sending saved setup request…"
      : isResolved(state.test) && !unknown
        ? "Print another setup ticket"
        : "Print one setup ticket";
  ui.recover.disabled = !controls.recover;
  ui.recover.textContent =
    state.busy === "recovering" ? "Checking saved result…" : "Check saved result";
  ui.retry.hidden = !unknown || unresolved;
  ui.retry.disabled = !controls.retrySame;
  ui.retryHelp.hidden = ui.retry.hidden;
  ui.recovery.hidden =
    !state.native || (!state.pendingRequestId && !state.test && state.journalChecked);
  ui.confirmation.hidden = !state.test || !["sent_unconfirmed", "held"].includes(state.test.status);
  ui.printed.disabled = !controls.confirm;
  ui.notPrinted.disabled = !controls.confirm;

  if (!state.native) {
    badge(ui.connectionBadge, "APK required", "warning");
    ui.connectionMessage.textContent =
      "The native Android printer connector is not available in this environment.";
  } else if (state.busy === "checking") {
    badge(ui.connectionBadge, "Checking");
    ui.connectionMessage.textContent =
      "Reading the installed printer service. No ticket is being printed.";
  } else if (state.probe) {
    badge(
      ui.connectionBadge,
      state.probe.available ? "Connected" : "Unavailable",
      state.probe.available ? "ready" : "warning",
    );
    ui.connectionMessage.textContent = state.probe.message;
  } else {
    badge(ui.connectionBadge, "Not checked");
    ui.connectionMessage.textContent =
      "Check the installed printer service before sending a setup ticket.";
  }

  ui.printHelp.textContent = !state.native
    ? "Open the installed H10S setup APK to continue."
    : state.storageError
      ? "Starting another test is blocked until recovery storage is available."
      : state.busy
        ? "Please wait. Another request cannot start at the same time."
        : unresolved || state.pendingRequestId
          ? "Resolve the saved setup test before starting another."
          : !state.journalChecked
            ? "Check the saved result before starting a test."
            : !state.probe?.available
              ? "Check the printer connection first."
              : "One fixed setup ticket. You will confirm the paper afterwards.";

  if (!state.native) {
    badge(ui.testBadge, "Not run");
    ui.testHeading.textContent = "No native printer check has run";
    ui.testMessage.textContent = "This screen cannot send a setup ticket from a website or PWA.";
  } else if (unknown && !unresolved) {
    badge(ui.testBadge, "Saved request", "warning");
    ui.testHeading.textContent = "The original request needs checking";
    ui.testMessage.textContent =
      "Its result is not confirmed. Check the paper and saved result. If needed, explicitly retry the same request; do not start a new one.";
  } else if (!state.journalChecked && !state.test) {
    badge(ui.testBadge, "Not confirmed", "warning");
    ui.testHeading.textContent = state.busy
      ? "Checking the saved result…"
      : "The saved result needs checking";
    ui.testMessage.textContent = "No new ticket is sent when this screen opens.";
  } else if (state.test) {
    const copy = {
      sending: [
        "In progress",
        "The send is in progress",
        "Check the saved result. Do not start another test while this request is unresolved.",
      ],
      sent_unconfirmed: [
        "Check paper",
        "Sent — check the paper",
        "The send was acknowledged. Confirm whether one complete setup ticket came out of the printer.",
      ],
      held: [
        "Needs inspection",
        "The print result is uncertain",
        "Inspect the printer and paper before recording an outcome. The app will not send this test again automatically.",
      ],
      printed: [
        "Paper confirmed",
        "You confirmed the ticket printed",
        "One completed setup test is recorded. This is the operator’s paper confirmation.",
      ],
      not_printed: [
        "Paper confirmed",
        "You confirmed no ticket printed",
        "This test is resolved. You can explicitly start another setup test when the printer is ready.",
      ],
    }[state.test.status];
    badge(ui.testBadge, copy[0]!, isResolved(state.test) ? "ready" : "warning");
    ui.testHeading.textContent = copy[1]!;
    ui.testMessage.textContent = copy[2]!;
  } else {
    badge(ui.testBadge, "Ready for setup");
    ui.testHeading.textContent = "No setup ticket has been sent";
    ui.testMessage.textContent = "Check the connection, then use Print one setup ticket.";
  }
  ui.diagnostic.value = diagnosticText(state);
  const nextError = state.error || state.storageError;
  if (nextError && nextError !== lastError) {
    const target = state.error ? ui.error : ui.storage;
    target.focus({ preventScroll: true });
    target.scrollIntoView({ block: "nearest", behavior: "instant" });
  }
  lastError = nextError;
}

const controller = createProbeController({
  native,
  plugin,
  storage,
  createRequestId: () => crypto.randomUUID(),
  onChange: render,
});
render(controller.getState());
ui.check.addEventListener("click", () => {
  void controller.checkConnection();
});
ui.print.addEventListener("click", () => {
  void controller.print();
});
ui.recover.addEventListener("click", () => {
  void controller.recover();
});
ui.retry.addEventListener("click", () => {
  void controller.retrySame();
});
async function confirmPaper(outcome: PaperOutcome) {
  const requestId = controller.getState().test?.requestId;
  await controller.confirm(outcome);
  const state = controller.getState();
  if (
    !state.error &&
    !state.storageError &&
    state.test?.requestId === requestId &&
    state.test?.status === outcome
  ) {
    // The paper buttons disappear after confirmation; leave focus on its result.
    ui.testHeading.focus({ preventScroll: true });
    ui.testHeading.scrollIntoView({ block: "nearest", behavior: "instant" });
  }
}
ui.printed.addEventListener("click", () => {
  void confirmPaper("printed");
});
ui.notPrinted.addEventListener("click", () => {
  void confirmPaper("not_printed");
});
ui.copy.addEventListener("click", () => {
  void (async () => {
    try {
      await navigator.clipboard.writeText(diagnosticText(latest));
      ui.copyMessage.textContent = "Details copied.";
    } catch {
      ui.diagnostic.focus();
      ui.diagnostic.select();
      ui.copyMessage.textContent = "Details selected. Use your device’s Copy action.";
    }
  })();
});
document.addEventListener("visibilitychange", () => {
  if (document.hidden) controller.invalidateConnection();
  else if (!controller.getState().busy) void controller.recover();
});
window.addEventListener("pagehide", () => controller.dispose(), { once: true });
// Keep this bundled utility on its local screen, including dropped URLs.
window.addEventListener("dragover", (event) => event.preventDefault());
window.addEventListener("drop", (event) => event.preventDefault());
void controller.start();
