import type { CashScope } from "./mealdeck-cash-orders";

export type CashAttempt = {
  version: 1;
  quoteId: string;
  attemptId: string;
  createdAt: string;
};
type AttemptStorage = Pick<Storage, "getItem" | "setItem" | "removeItem">;
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function cashAttemptKey(scope: CashScope, staffUserId: string) {
  if (![scope.tenantId, scope.locationId, staffUserId].every((value) => uuid.test(value)))
    throw new Error("Choose your authorised kitchen before recording cash.");
  return `mealdeck-cash-attempt-v1:${staffUserId}:${scope.tenantId}:${scope.locationId}`;
}

/** Only recovery identifiers are stored. Customer details and the basket stay in memory. */
export function readCashAttempt(storage: AttemptStorage, key: string): CashAttempt | null {
  let raw: string | null;
  try {
    raw = storage.getItem(key);
  } catch {
    throw new Error(
      "This browser cannot read cash-order recovery. Enable site storage before collecting cash.",
    );
  }
  if (raw === null) return null;
  try {
    const value = JSON.parse(raw) as CashAttempt;
    if (
      !value ||
      typeof value !== "object" ||
      Array.isArray(value) ||
      value.version !== 1 ||
      Object.keys(value).some(
        (name) => !["version", "quoteId", "attemptId", "createdAt"].includes(name),
      ) ||
      !uuid.test(value.quoteId) ||
      !uuid.test(value.attemptId) ||
      typeof value.createdAt !== "string" ||
      !Number.isFinite(Date.parse(value.createdAt))
    )
      throw new Error("invalid");
    return value;
  } catch {
    throw new Error(
      "An unfinished cash-order record could not be read. Check order history with your administrator before creating another cash order.",
    );
  }
}

export function saveCashAttempt(storage: AttemptStorage, key: string, attempt: CashAttempt) {
  const current = readCashAttempt(storage, key);
  if (current && (current.attemptId !== attempt.attemptId || current.quoteId !== attempt.quoteId))
    throw new Error("Check the unfinished cash order before starting another one.");
  const raw = JSON.stringify(attempt);
  try {
    storage.setItem(key, raw);
    if (storage.getItem(key) !== raw) throw new Error("not_saved");
  } catch {
    throw new Error(
      "This browser cannot save cash-order recovery. Enable site storage before collecting cash.",
    );
  }
}

/** A late response must never remove a different saved cash attempt. */
export function clearCashAttempt(storage: AttemptStorage, key: string, attempt: CashAttempt) {
  const current = readCashAttempt(storage, key);
  if (!current) return;
  if (current.attemptId !== attempt.attemptId || current.quoteId !== attempt.quoteId)
    throw new Error("Another cash order is awaiting confirmation. Check it before continuing.");
  storage.removeItem(key);
  if (storage.getItem(key) !== null)
    throw new Error(
      "The cash order is recorded, but this browser could not clear its recovery record. Refresh to check the same order.",
    );
}
