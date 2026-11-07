import { Capacitor, registerPlugin } from "@capacitor/core";
import {
  jobStatusLabel,
  paperAction,
  parsePrinterStatus,
  receiptLabel,
  safeError,
  type PrinterStatus,
  type ReceiptJob,
  type ReceiptPrinterPlugin,
} from "./contract";
import "./styles.css";

const printer = registerPlugin<ReceiptPrinterPlugin>("ReceiptPrinter");
const native = Capacitor.isNativePlatform() && Capacitor.getPlatform() === "android";
function element<T extends HTMLElement>(id: string): T {
  const found = document.getElementById(id);
  if (!found) throw new Error("screen_element_missing");
  return found as T;
}
const show = (id: string, visible: boolean) => {
  element(id).hidden = !visible;
};
const write = (id: string, text: string) => {
  element(id).textContent = text;
};
const dialog = element<HTMLDialogElement>("receipt-dialog");
let status: PrinterStatus | null = null;
let statusFresh = false;
let stateVersion = 0;
let busy = false;
let polling = false;
let selection = "";
let filter: "all" | "check" | "waiting" = "all";
let dialogJob: ReceiptJob | null = null;
let restoreFocus: HTMLElement | null = null;
let jobSignature = "";

function clock(value: string | null) {
  return value
    ? new Date(value).toLocaleTimeString("en-GB", {
        hour: "2-digit",
        minute: "2-digit",
        timeZone: "Europe/London",
      })
    : "";
}
function options(
  select: HTMLSelectElement,
  values: { value: string; label: string }[],
  wanted: string,
) {
  const signature = JSON.stringify(values);
  if (select.dataset.options !== signature) {
    const fragment = document.createDocumentFragment();
    for (const value of values) {
      const option = document.createElement("option");
      option.value = value.value;
      option.textContent = value.label;
      fragment.append(option);
    }
    select.replaceChildren(fragment);
    select.dataset.options = signature;
  }
  if (values.some((value) => value.value === wanted)) select.value = wanted;
}
function controls() {
  const signedIn = status?.signedIn === true;
  const ready = signedIn && !status?.needsMfa && statusFresh;
  const queueMatches =
    !!status?.selectedScope &&
    selection === `${status.selectedScope.tenantId}:${status.selectedScope.locationId}`;
  for (const button of document.querySelectorAll<HTMLButtonElement>("button")) {
    button.disabled = busy || !native;
  }
  for (const input of document.querySelectorAll<HTMLInputElement | HTMLSelectElement>(
    "input, select",
  )) {
    input.disabled = busy || !native;
  }
  element<HTMLButtonElement>("start").disabled =
    busy ||
    !native ||
    !ready ||
    !status?.connection.available ||
    !status.scopes.length ||
    status.serviceRunning;
  element<HTMLSelectElement>("kitchen").disabled =
    busy || !native || status?.serviceRunning === true;
  element<HTMLButtonElement>("stop").disabled = busy || !native || !status?.serviceRunning;
  element<HTMLButtonElement>("check-connection").disabled = busy || !native || !ready;
  for (const button of document.querySelectorAll<HTMLButtonElement>("[data-job-action]")) {
    const job = status?.jobs.find((job) => job.jobId === button.dataset.jobId);
    button.disabled =
      busy ||
      !native ||
      !ready ||
      !queueMatches ||
      !job ||
      (button.dataset.jobAction === "print" ? !job.canPrint : !job.canConfirm);
  }
}

function showQueueScope() {
  const scope = status?.selectedScope;
  const matches = !!scope && selection === `${scope.tenantId}:${scope.locationId}`;
  write(
    "queue-scope",
    scope
      ? `Receipts for ${scope.locationName} · ${scope.tenantName}`
      : "Select a kitchen and start auto-print to load its receipt queue.",
  );
  show("scope-notice", !!scope && !matches);
}

function showDialog(job: ReceiptJob, mode: "print" | "paper", trigger: HTMLElement) {
  if (busy) return;
  dialogJob = job;
  restoreFocus = trigger;
  write("dialog-order", receiptLabel(job));
  write(
    "dialog-title",
    mode === "print" ? "Print this waiting receipt?" : "Check the actual paper",
  );
  write(
    "dialog-copy",
    mode === "print"
      ? "Review this waiting receipt before printing it. It will be sent once to the built-in printer. Check that it is still needed and has not already been handled."
      : "Look at the H10S paper receipt for this order. Confirm only after inspecting it. If the result is uncertain, cancel and leave it for review.",
  );
  show("dialog-print", mode === "print");
  show("dialog-printed", mode === "paper");
  show("dialog-not-printed", mode === "paper");
  dialog.showModal();
  element("dialog-title").focus();
}
dialog.addEventListener("close", () => {
  dialogJob = null;
  if (restoreFocus?.isConnected) restoreFocus.focus();
  else element("jobs-heading").focus();
  restoreFocus = null;
});

function renderJobs(value: PrinterStatus) {
  const jobs = value.jobs.filter(
    (job) =>
      filter === "all" ||
      (filter === "waiting"
        ? job.status === "queued"
        : ["held", "sent_unconfirmed", "sending"].includes(job.status)),
  );
  write("job-count", String(jobs.length));
  show("empty-jobs", jobs.length === 0);
  write(
    "empty-jobs",
    filter === "check"
      ? "No receipts need a paper check."
      : filter === "waiting"
        ? "No receipts are waiting to print."
        : "New accepted orders will appear here.",
  );
  const signature = JSON.stringify(jobs);
  if (signature === jobSignature) return;
  jobSignature = signature;
  const list = document.createDocumentFragment();
  for (const job of jobs) {
    const row = document.createElement("li");
    row.className = `job ${job.status}`;
    const head = document.createElement("div");
    head.className = "job-head";
    const title = document.createElement("h3");
    title.textContent = receiptLabel(job);
    const time = document.createElement("span");
    time.className = "job-time";
    time.textContent = clock(job.createdAt);
    head.append(title, time);
    const state = document.createElement("p");
    state.className = "job-status";
    state.textContent = jobStatusLabel[job.status];
    row.append(head, state);
    if (job.canPrint || job.canConfirm) {
      const action = document.createElement("button");
      action.type = "button";
      action.className = "button secondary job-action";
      action.dataset.jobAction = job.canPrint ? "print" : "paper";
      action.dataset.jobId = job.jobId;
      action.textContent = job.canPrint ? "Review & print once" : "Confirm paper result";
      action.setAttribute("aria-label", `${action.textContent} for ${receiptLabel(job)}`);
      action.addEventListener("click", () => {
        const current = status?.jobs.find((current) => current.jobId === job.jobId);
        if (!current || (job.canPrint ? !current.canPrint : !current.canConfirm)) return;
        showDialog(current, job.canPrint ? "print" : "paper", action);
      });
      row.append(action);
    }
    list.append(row);
  }
  element("jobs").replaceChildren(list);
}

export function renderStatus(input: unknown) {
  const value = parsePrinterStatus(input);
  status = value;
  statusFresh = true;
  show("status-notice", false);
  show("loading", false);
  show("signin-card", !value.signedIn);
  show("mfa-card", value.signedIn && value.needsMfa);
  show("service-card", value.signedIn && !value.needsMfa);
  show("jobs-card", value.signedIn && !value.needsMfa);
  show("tools-card", value.signedIn);
  show("no-access", value.scopes.length === 0);
  show("notification-notice", !value.notificationsAllowed);
  show("start", !value.serviceRunning);
  show("stop", value.serviceRunning);
  const attention = value.jobs.some((job) => job.status === "held");
  write("service-badge", value.serviceRunning ? "Running" : attention ? "Check printer" : "Paused");
  element("service-badge").className =
    `badge ${value.serviceRunning ? "running" : attention ? "attention" : ""}`;
  write(
    "service-heading",
    value.serviceRunning
      ? "Listening for accepted orders"
      : attention
        ? "A receipt needs inspection"
        : "Ready for the next order",
  );
  write("service-message", value.serviceMessage);
  write("connection-message", value.connection.message);
  element("connection-dot").className = `dot ${value.connection.available ? "connected" : ""}`;
  element<HTMLInputElement>("sound").checked = value.soundEnabled;
  const currentScope = value.selectedScope
    ? `${value.selectedScope.tenantId}:${value.selectedScope.locationId}`
    : "";
  const kitchens = value.scopes.map((scope) => ({
    value: `${scope.tenantId}:${scope.locationId}`,
    label:
      new Set(value.scopes.map((s) => s.tenantId)).size > 1
        ? `${scope.locationName} · ${scope.tenantName}`
        : scope.locationName,
  }));
  if (value.serviceRunning || !kitchens.some((kitchen) => kitchen.value === selection))
    selection = currentScope || kitchens[0]?.value || "";
  options(element<HTMLSelectElement>("kitchen"), kitchens, selection);
  showQueueScope();
  options(
    element<HTMLSelectElement>("factor"),
    value.factors.map((factor) => ({ value: factor.id, label: factor.label || "Authenticator" })),
    element<HTMLSelectElement>("factor").value,
  );
  show("factor-label", value.factors.length > 1);
  write(
    "last-sync",
    value.lastPollAt ? `Queue checked ${clock(value.lastPollAt)}` : "Waiting for the queue",
  );
  write(
    "baseline-message",
    value.baselineAt
      ? "Your starting point is saved. Pause and resume keep receipts accepted since activation in the queue."
      : "First start receives new receipts from now. Review older waiting receipts individually below.",
  );
  renderJobs(value);
  controls();
}

function displayError(error: unknown) {
  write("error", safeError(error));
  show("error", true);
  element("error").focus();
}
function unavailable() {
  statusFresh = false;
  show("loading", false);
  show("status-notice", true);
  if (status?.signedIn && !status.needsMfa) {
    write("service-badge", "Status unavailable");
    element("service-badge").className = "badge attention";
    write("service-heading", "Refresh printer status");
    write(
      "service-message",
      "The screen could not verify the native worker. Check its status before sending another receipt.",
    );
  }
  controls();
}
async function action(run: () => Promise<PrinterStatus>) {
  if (busy || !native) return;
  stateVersion++;
  busy = true;
  show("error", false);
  controls();
  try {
    renderStatus(await run());
  } catch (error) {
    displayError(error);
    try {
      renderStatus(await printer.getStatus());
    } catch {
      unavailable();
    }
  } finally {
    busy = false;
    controls();
  }
}

element<HTMLFormElement>("signin-form").addEventListener("submit", (event) => {
  event.preventDefault();
  if (busy) return;
  const email = element<HTMLInputElement>("email").value.trim();
  const password = element<HTMLInputElement>("password").value;
  element<HTMLInputElement>("password").value = "";
  void action(() => printer.signIn({ email, password }));
});
element<HTMLFormElement>("mfa-form").addEventListener("submit", (event) => {
  event.preventDefault();
  if (busy) return;
  const code = element<HTMLInputElement>("mfa-code").value;
  const factorId = element<HTMLSelectElement>("factor").value;
  element<HTMLInputElement>("mfa-code").value = "";
  if (!/^\d{6}$/.test(code) || !factorId) return;
  void action(() => printer.verifyMfa({ factorId, code }));
});
element<HTMLSelectElement>("kitchen").addEventListener("change", (event) => {
  selection = (event.target as HTMLSelectElement).value;
  showQueueScope();
  controls();
});
element("start").addEventListener("click", () => {
  const scope = status?.scopes.find(
    (scope) => `${scope.tenantId}:${scope.locationId}` === selection,
  );
  if (scope)
    void action(() => printer.start({ tenantId: scope.tenantId, locationId: scope.locationId }));
});
element("stop").addEventListener("click", () => void action(() => printer.stop()));
element("check-connection").addEventListener(
  "click",
  () => void action(() => printer.checkConnection()),
);
element("refresh").addEventListener("click", () => void action(() => printer.getStatus()));
element("signout").addEventListener("click", () => {
  element<HTMLInputElement>("password").value = "";
  element<HTMLInputElement>("mfa-code").value = "";
  void action(() => printer.signOut());
});
element<HTMLInputElement>("sound").addEventListener("change", (event) => {
  const enabled = (event.target as HTMLInputElement).checked;
  void action(() => printer.setSound({ enabled }));
});
element("notifications").addEventListener(
  "click",
  () => void action(() => printer.requestNotifications()),
);
element("open-orders").addEventListener("click", () => {
  if (native && !busy) void printer.openPrinterScreen().catch(displayError);
});
element("dialog-print").addEventListener("click", () => {
  const job = dialogJob;
  if (!job?.canPrint) return;
  dialog.close();
  void action(() => printer.printQueuedJob({ jobId: job.jobId }));
});
for (const [id, outcome] of [
  ["dialog-printed", "printed"],
  ["dialog-not-printed", "not_printed"],
] as const) {
  element(id).addEventListener("click", () => {
    const job = dialogJob;
    if (!job) return;
    try {
      const input = paperAction(job, outcome);
      dialog.close();
      void action(() => printer.confirmPaper(input));
    } catch (error) {
      dialog.close();
      displayError(error);
    }
  });
}
for (const button of document.querySelectorAll<HTMLButtonElement>("[data-filter]")) {
  button.addEventListener("click", () => {
    const selected = button.dataset.filter;
    if (selected !== "all" && selected !== "check" && selected !== "waiting") return;
    filter = selected;
    for (const choice of document.querySelectorAll<HTMLButtonElement>("[data-filter]")) {
      choice.classList.toggle("selected", choice === button);
      choice.setAttribute("aria-pressed", String(choice === button));
    }
    jobSignature = "";
    if (status) {
      renderJobs(status);
      controls();
    }
  });
}

async function poll() {
  if (!native || polling || busy || dialog.open || document.hidden) return;
  polling = true;
  const version = stateVersion;
  try {
    const next = await printer.getStatus();
    if (version === stateVersion && !busy) renderStatus(next);
  } catch (error) {
    if (version === stateVersion && !busy) {
      if (!status) displayError(error);
      unavailable();
    }
  } finally {
    polling = false;
  }
}
document.addEventListener("visibilitychange", () => {
  if (!document.hidden) void poll();
});
if (native) {
  void poll();
  setInterval(() => void poll(), 3000);
} else {
  show("loading", false);
  show("browser-notice", true);
  show("signin-card", true);
  controls();
}
