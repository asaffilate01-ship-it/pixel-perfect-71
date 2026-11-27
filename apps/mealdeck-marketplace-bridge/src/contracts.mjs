import { createHash } from "node:crypto";

export const PLATFORMS = ["uber_eats", "just_eat"];
export const STATES = ["new", "accepted", "preparing", "ready", "handed_over", "cancelled"];
export const ACTIONS = ["accept", "preparing", "ready", "handover"];
export const FULFILMENTS = ["collection", "platform_delivery", "merchant_delivery"];
export const ERROR_CODES = [
  "ui_unavailable",
  "identity_mismatch",
  "profile_mismatch",
  "session_required",
  "device_unavailable",
  "observation_incomplete",
  "command_uncertain",
  "bridge_error",
];
export const PROVES_ACTION = Object.freeze({
  accept: ["accepted", "preparing", "ready", "handed_over"],
  preparing: ["preparing", "ready", "handed_over"],
  ready: ["ready", "handed_over"],
  handover: ["handed_over"],
});
export const ACTION_FROM = Object.freeze({
  accept: ["new"],
  preparing: ["accepted"],
  ready: ["accepted", "preparing"],
  handover: ["ready"],
});
export const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/** Fixed public codes only. Never put a page, customer, token or server error in telemetry. */
export class BridgeError extends Error {
  constructor(code = "bridge_error") {
    super(ERROR_CODES.includes(code) ? code : "bridge_error");
    this.name = "BridgeError";
    this.code = this.message;
  }
}

export function requireThat(condition, code = "observation_incomplete") {
  if (!condition) throw new BridgeError(code);
}
export function errorCode(error) {
  return error instanceof BridgeError ? error.code : "bridge_error";
}
export function text(value, limit, { empty = false, notes = false } = {}) {
  requireThat(
    typeof value === "string" && (empty || value.trim().length > 0) && [...value].length <= limit,
  );
  requireThat(
    !(notes ? /[\p{Cf}\u0000-\u0008\u000b-\u001f\u007f-\u009f]/u : /[\p{Cc}\p{Cf}]/u).test(value),
  );
  return value;
}
export function integer(value, minimum = 0, maximum = 10_000_000) {
  requireThat(Number.isSafeInteger(value) && value >= minimum && value <= maximum);
  return value;
}
export function timestamp(value) {
  requireThat(
    typeof value === "string" &&
      /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d+)?(?:Z|[+-]\d\d:\d\d)$/.test(value),
  );
  requireThat(Number.isFinite(Date.parse(value)));
  return value;
}
export function evidence(profile) {
  return {
    profileId: text(profile.profileId, 120),
    profileVersion: text(profile.profileVersion, 80),
  };
}
export function hash(value) {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}
export function identity(value) {
  requireThat(PLATFORMS.includes(value.platform), "identity_mismatch");
  return {
    platform: value.platform,
    externalStoreId: text(value.externalStoreId, 200),
    externalOrderId: text(value.externalOrderId, 200),
    displayReference: text(value.displayReference, 80),
  };
}
export function sameIdentity(a, b) {
  return ["platform", "externalStoreId", "externalOrderId", "displayReference"].every(
    (key) => a[key] === b[key],
  );
}
export function validateCommand(value) {
  requireThat(value && typeof value === "object", "bridge_error");
  const id = identity(value);
  requireThat(UUID.test(value.commandId) && UUID.test(value.leaseToken), "bridge_error");
  requireThat(
    ACTIONS.includes(value.action) && STATES.includes(value.expectedState),
    "bridge_error",
  );
  requireThat(["execute", "reconcile"].includes(value.mode), "bridge_error");
  return {
    commandId: value.commandId,
    leaseToken: value.leaseToken,
    leaseExpiresAt: timestamp(value.leaseExpiresAt),
    mode: value.mode,
    ...id,
    action: value.action,
    expectedState: value.expectedState,
  };
}
export function commandFingerprint(command) {
  // expectedState is a current lease precondition; it can advance while an uncertain command is reconciled.
  return hash({ ...identity(command), commandId: command.commandId, action: command.action });
}
export function validateObservation(value) {
  const id = identity(value);
  requireThat(STATES.includes(value.state) && FULFILMENTS.includes(value.fulfilment));
  requireThat(value.currency === "GBP" && value.paymentResponsibility === "platform");
  requireThat(Array.isArray(value.items) && value.items.length >= 1 && value.items.length <= 200);
  const items = value.items.map((item) => {
    requireThat(Array.isArray(item.modifiers) && item.modifiers.length <= 100);
    return {
      externalLineId: text(item.externalLineId, 200),
      name: text(item.name, 300),
      quantity: integer(item.quantity, 1, 999),
      unitPricePence: item.unitPricePence === null ? null : integer(item.unitPricePence),
      modifiers: item.modifiers.map((modifier) => ({
        name: text(modifier.name, 300),
        quantity: integer(modifier.quantity, 1, 999),
      })),
      notes: item.notes == null ? null : text(item.notes, 1000, { empty: true, notes: true }),
    };
  });
  requireThat(new Set(items.map((item) => item.externalLineId)).size === items.length);
  return {
    ...id,
    state: value.state,
    fulfilment: value.fulfilment,
    paymentResponsibility: "platform",
    currency: "GBP",
    totalPence: integer(value.totalPence),
    placedAt: timestamp(value.placedAt),
    observedAt: timestamp(value.observedAt),
    items,
    notes: value.notes == null ? null : text(value.notes, 1000, { empty: true, notes: true }),
    evidence: evidence(value.evidence),
  };
}
