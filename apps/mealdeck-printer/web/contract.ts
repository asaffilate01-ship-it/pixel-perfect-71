export type JobStatus =
  "queued" | "claimed" | "sending" | "sent_unconfirmed" | "printed" | "held" | "failed";

export type KitchenScope = {
  tenantId: string;
  locationId: string;
  tenantName: string;
  locationName: string;
};

export type ReceiptJob = {
  jobId: string;
  orderNumber: string | null;
  copyNumber: number;
  status: JobStatus;
  createdAt: string;
  canConfirm: boolean;
  canPrint: boolean;
};

export type PrinterStatus = {
  schemaVersion: 1;
  signedIn: boolean;
  needsMfa: boolean;
  factors: { id: string; label: string }[];
  scopes: KitchenScope[];
  selectedScope: KitchenScope | null;
  serviceRunning: boolean;
  serviceMessage: string;
  connection: { available: boolean; message: string };
  jobs: ReceiptJob[];
  lastPollAt: string | null;
  baselineAt: string | null;
  notificationsAllowed: boolean;
  soundEnabled: boolean;
};

export interface ReceiptPrinterPlugin {
  getStatus(): Promise<PrinterStatus>;
  signIn(input: { email: string; password: string }): Promise<PrinterStatus>;
  verifyMfa(input: { factorId: string; code: string }): Promise<PrinterStatus>;
  signOut(): Promise<PrinterStatus>;
  checkConnection(): Promise<PrinterStatus>;
  start(input: { tenantId: string; locationId: string }): Promise<PrinterStatus>;
  stop(): Promise<PrinterStatus>;
  printQueuedJob(input: { jobId: string }): Promise<PrinterStatus>;
  confirmPaper(input: {
    jobId: string;
    outcome: "printed" | "not_printed";
    reason: string;
  }): Promise<PrinterStatus>;
  setSound(input: { enabled: boolean }): Promise<PrinterStatus>;
  requestNotifications(): Promise<PrinterStatus>;
  openPrinterScreen(): Promise<void>;
}

const statuses: ReadonlySet<string> = new Set([
  "queued",
  "claimed",
  "sending",
  "sent_unconfirmed",
  "printed",
  "held",
  "failed",
]);
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const record = (value: unknown): value is Record<string, unknown> =>
  !!value && typeof value === "object" && !Array.isArray(value);
const text = (value: unknown, max = 300): value is string =>
  typeof value === "string" && value.length <= max;
const stamp = (value: unknown): value is string | null =>
  value === null || (text(value, 40) && Number.isFinite(Date.parse(value)));
function scope(value: unknown): value is KitchenScope {
  return (
    record(value) &&
    typeof value.tenantId === "string" &&
    uuid.test(value.tenantId) &&
    typeof value.locationId === "string" &&
    uuid.test(value.locationId) &&
    text(value.tenantName, 140) &&
    text(value.locationName, 140)
  );
}

/** Only bounded status metadata reaches the operator DOM. Credentials and full
 * receipts remain in native code; native RPC/journal checks remain authority. */
export function parsePrinterStatus(value: unknown): PrinterStatus {
  if (
    !record(value) ||
    value.schemaVersion !== 1 ||
    typeof value.signedIn !== "boolean" ||
    typeof value.needsMfa !== "boolean" ||
    typeof value.serviceRunning !== "boolean" ||
    typeof value.notificationsAllowed !== "boolean" ||
    typeof value.soundEnabled !== "boolean" ||
    !text(value.serviceMessage) ||
    !record(value.connection) ||
    typeof value.connection.available !== "boolean" ||
    !text(value.connection.message) ||
    !stamp(value.lastPollAt) ||
    !stamp(value.baselineAt) ||
    !Array.isArray(value.scopes) ||
    value.scopes.length > 100 ||
    !value.scopes.every(scope) ||
    !(value.selectedScope === null || scope(value.selectedScope)) ||
    !Array.isArray(value.factors) ||
    value.factors.length > 20 ||
    !value.factors.every(
      (f) => record(f) && typeof f.id === "string" && uuid.test(f.id) && text(f.label, 100),
    ) ||
    !Array.isArray(value.jobs) ||
    value.jobs.length > 100 ||
    !value.jobs.every(
      (job) =>
        record(job) &&
        typeof job.jobId === "string" &&
        uuid.test(job.jobId) &&
        (job.orderNumber === null ||
          (text(job.orderNumber, 20) && /^\d{1,20}$/.test(job.orderNumber))) &&
        Number.isInteger(job.copyNumber) &&
        Number(job.copyNumber) >= 1 &&
        Number(job.copyNumber) <= 100 &&
        typeof job.status === "string" &&
        statuses.has(job.status) &&
        typeof job.createdAt === "string" &&
        stamp(job.createdAt) &&
        typeof job.canConfirm === "boolean" &&
        typeof job.canPrint === "boolean",
    )
  )
    throw new Error("printer_status_invalid");
  const parsed = value as unknown as PrinterStatus;
  if (
    new Set(parsed.jobs.map((j) => j.jobId)).size !== parsed.jobs.length ||
    new Set(parsed.scopes.map((s) => `${s.tenantId}:${s.locationId}`)).size !==
      parsed.scopes.length ||
    (parsed.selectedScope !== null &&
      !parsed.scopes.some(
        (s) =>
          s.tenantId === parsed.selectedScope?.tenantId &&
          s.locationId === parsed.selectedScope.locationId,
      )) ||
    (parsed.serviceRunning && (!parsed.signedIn || parsed.needsMfa || !parsed.selectedScope))
  )
    throw new Error("printer_status_invalid");
  const copyScope = ({
    tenantId,
    locationId,
    tenantName,
    locationName,
  }: KitchenScope): KitchenScope => ({ tenantId, locationId, tenantName, locationName });
  return {
    schemaVersion: 1,
    signedIn: parsed.signedIn,
    needsMfa: parsed.needsMfa,
    factors: parsed.factors.map(({ id, label }) => ({ id, label })),
    scopes: parsed.scopes.map(copyScope),
    selectedScope: parsed.selectedScope ? copyScope(parsed.selectedScope) : null,
    serviceRunning: parsed.serviceRunning,
    serviceMessage: parsed.serviceMessage,
    connection: { available: parsed.connection.available, message: parsed.connection.message },
    jobs: parsed.jobs.map(
      ({ jobId, orderNumber, copyNumber, status, createdAt, canConfirm, canPrint }) => ({
        jobId,
        orderNumber,
        copyNumber,
        status,
        createdAt,
        canConfirm,
        canPrint,
      }),
    ),
    lastPollAt: parsed.lastPollAt,
    baselineAt: parsed.baselineAt,
    notificationsAllowed: parsed.notificationsAllowed,
    soundEnabled: parsed.soundEnabled,
  };
}

export const jobStatusLabel: Record<JobStatus, string> = {
  queued: "Waiting to print",
  claimed: "Claimed by a terminal",
  sending: "Sending — please wait",
  sent_unconfirmed: "Sent · check paper",
  printed: "Paper confirmed",
  held: "Needs inspection",
  failed: "Confirmed not printed",
};

export function receiptLabel(job: Pick<ReceiptJob, "orderNumber" | "copyNumber">) {
  return `${job.orderNumber ? `Order ${job.orderNumber.padStart(4, "0")}` : "Receipt"}${job.copyNumber > 1 ? ` · Copy ${job.copyNumber}` : ""}`;
}

export function paperAction(job: ReceiptJob, outcome: "printed" | "not_printed") {
  if (!job.canConfirm || !["sent_unconfirmed", "held", "sending"].includes(job.status))
    throw new Error("paper_inspection_unavailable");
  return {
    jobId: job.jobId,
    outcome,
    reason:
      outcome === "printed"
        ? "Operator inspected one complete paper receipt on the H10S."
        : "Operator inspected the H10S and no complete receipt was printed.",
  };
}

/** Do not show raw native/network error strings: they may contain private data. */
export function safeError(error: unknown): string {
  const code = record(error) && typeof error.code === "string" ? error.code : "";
  const messages: Record<string, string> = {
    sign_in_required: "Sign in again to reconnect the receipt queue.",
    invalid_credentials: "Sign-in was not confirmed. Check your email address and password.",
    verified_account_required: "Verify this account’s email before using the printer.",
    mfa_required: "Enter the code from your authenticator to continue.",
    invalid_mfa_code: "That authenticator code was not confirmed. Try the current code.",
    printer_access_denied: "This account does not have printer access for this kitchen.",
    printer_unavailable: "The built-in printer is not connected. Check its connection and paper.",
    network_unavailable: "The receipt service could not be reached. Check Wi-Fi and try again.",
    receipt_held: "A receipt needs inspection. Check its paper before continuing.",
    journal_unavailable:
      "Receipt history could not be verified. Keep printing paused and ask for support.",
    operation_in_progress: "A receipt action is still in progress. Wait for its result.",
  };
  return (
    messages[code] ??
    "This action was not confirmed. Refresh the status and inspect any receipt already sent before trying again."
  );
}
