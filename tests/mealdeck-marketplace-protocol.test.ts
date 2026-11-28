import { describe, expect, test } from "bun:test";
import {
  marketplaceBridgeRequestSchema,
  marketplaceBridgeResponseSchemas,
  marketplaceObservationSchema,
} from "../src/lib/mealdeck-marketplace-protocol";

const connectorId = "00000000-0000-4000-8000-000000000001";
const commandId = "00000000-0000-4000-8000-000000000002";
const leaseToken = "00000000-0000-4000-8000-000000000003";
const observedAt = "2026-11-28T06:00:00Z";
const evidence = { profileId: "offline-fixture", profileVersion: "1" };
const identity = { externalStoreId: "store-01", externalOrderId: "order-001", displayReference: "00Ab-19" };
const capabilities = { accept: true, preparing: false, ready: true, handover: false };
const item = {
  externalLineId: "line-01", name: "Fixture burger", quantity: 2,
  unitPricePence: null, modifiers: [{ name: "Extra cheese", quantity: 1 }],
  notes: "No onions\nPack separately",
};
const observation = {
  platform: "uber_eats", ...identity, state: "new",
  fulfilment: "platform_delivery", paymentResponsibility: "platform",
  currency: "GBP", totalPence: 1599, placedAt: observedAt, observedAt,
  items: [item], evidence,
};

describe("Marketplace machine wire contract (no live endpoint)", () => {
  test("preserves exact identities, complete modifiers and unknown prices", () => {
    expect(marketplaceObservationSchema.parse(observation)).toEqual(observation);
    expect(marketplaceObservationSchema.safeParse({ ...observation, platform: "just_eat" }).success).toBe(true);
  });

  test("rejects ambiguous store/order references without normalising them", () => {
    for (const key of ["externalStoreId", "externalOrderId", "displayReference"] as const) {
      for (const value of [" " + identity[key], identity[key] + " ", "00\u2028Ab", "00\u2029Ab", "00\u200bAb", 123, ""]) {
        expect(marketplaceObservationSchema.safeParse({ ...observation, [key]: value }).success).toBe(false);
      }
    }
    expect(marketplaceObservationSchema.safeParse({ ...observation, displayReference: "a".repeat(81) }).success).toBe(false);
  });

  test("rejects customer-supplied payment or scope, duplicate lines and invalid quantities", () => {
    for (const changed of [
      { ...observation, paid: true }, { ...observation, tenantId: connectorId },
      { ...observation, paymentResponsibility: "cash" }, { ...observation, currency: "USD" },
      { ...observation, totalPence: 15.99 }, { ...observation, totalPence: -1 },
      { ...observation, items: [] }, { ...observation, items: [item, item] },
      { ...observation, items: [{ ...item, quantity: 0 }] },
      { ...observation, items: [{ ...item, quantity: 1000 }] },
      { ...observation, items: [{ ...item, customerPhone: "fixture" }] },
      { ...observation, notes: "hidden\u202einstruction" },
    ]) expect(marketplaceObservationSchema.safeParse(changed).success).toBe(false);
  });

  test("confirmation requires a complete exact-order readback and a non-cancelled observed state", () => {
    const payload = { commandId, leaseToken, evidence, outcome: "confirmed" };
    const parse = (value: unknown) => marketplaceBridgeRequestSchema.safeParse({ op: "result", connectorId, payload: value }).success;
    expect(parse(payload)).toBe(false);
    const complete = { ...payload, ...identity, observedAt, observedState: "accepted" };
    expect(parse(complete)).toBe(true);
    expect(parse({ ...complete, observedState: "unknown" })).toBe(false);
    expect(parse({ ...complete, observedState: "cancelled" })).toBe(false);
    expect(parse({ ...complete, displayReference: undefined })).toBe(false);
    expect(parse({ ...complete, commandId: [commandId] })).toBe(false);
    expect(parse({ ...payload, outcome: "uncertain" })).toBe(true);
  });

  test("heartbeat and claim envelopes reject unsupported operations and extra authority", () => {
    const heartbeat = { op: "heartbeat", connectorId, payload: { evidence, observedAt, status: "healthy", capabilities } };
    expect(marketplaceBridgeRequestSchema.safeParse(heartbeat).success).toBe(true);
    expect(marketplaceBridgeRequestSchema.safeParse({ ...heartbeat, payload: { ...heartbeat.payload, errorCode: "bridge_error" } }).success).toBe(false);
    const claim = { op: "claim", connectorId, payload: { evidence } };
    expect(marketplaceBridgeRequestSchema.safeParse(claim).success).toBe(true);
    expect(marketplaceBridgeRequestSchema.safeParse({ ...claim, tenantId: connectorId }).success).toBe(false);
    expect(marketplaceBridgeRequestSchema.safeParse({ ...claim, op: "refund" }).success).toBe(false);
  });

  test("strict response contracts refuse hidden credential fields and malformed commands", () => {
    expect(marketplaceBridgeResponseSchemas.claim.safeParse({ command: null }).success).toBe(true);
    expect(marketplaceBridgeResponseSchemas.claim.safeParse({ command: null, token_hash: "fixture-secret" }).success).toBe(false);
    const command = { commandId, leaseToken, leaseExpiresAt: observedAt, mode: "reconcile",
      platform: "uber_eats", ...identity, action: "ready", expectedState: "preparing" };
    expect(marketplaceBridgeResponseSchemas.claim.safeParse({ command }).success).toBe(true);
    expect(marketplaceBridgeResponseSchemas.claim.safeParse({ command: { ...command, leaseToken: [leaseToken] } }).success).toBe(false);
    expect(marketplaceBridgeResponseSchemas.claim.safeParse({ command: { ...command, action: "refund" } }).success).toBe(false);
    expect(marketplaceBridgeResponseSchemas.result.safeParse({ ok: true, commandId, status: "confirmed" }).success).toBe(true);
    expect(marketplaceBridgeResponseSchemas.result.safeParse({ ok: true, commandId, status: "delivered" }).success).toBe(false);
  });
});
