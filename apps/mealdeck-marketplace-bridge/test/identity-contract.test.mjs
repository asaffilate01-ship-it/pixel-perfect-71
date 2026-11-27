import test from "node:test";
import assert from "node:assert/strict";
import { identity, sameIdentity, validateCommand } from "../src/contracts.mjs";

const id = {
  platform: "uber_eats",
  externalStoreId: "store-01",
  externalOrderId: "order-001",
  displayReference: "00Ab-19",
};

test("exact marketplace identity matches the server's bounded reference contract", () => {
  assert.deepEqual(identity(id), id);
  assert.equal(sameIdentity(id, { ...id, platform: "just_eat" }), false);
  assert.equal(sameIdentity(id, { ...id, displayReference: "00ab-19" }), false);
  for (const key of ["externalStoreId", "externalOrderId", "displayReference"]) {
    for (const value of [" " + id[key], id[key] + " ", id[key] + "\u2028X", id[key] + "\u2029X", id[key] + "\u200b", id[key] + "\n", 0, null, ""]) {
      assert.throws(() => identity({ ...id, [key]: value }), /identity_mismatch/);
    }
  }
  for (const value of [null, [], undefined]) {
    assert.throws(() => identity(value), /identity_mismatch/);
  }
});

test("command and lease IDs cannot be coerced from arrays", () => {
  const command = {
    ...id,
    commandId: "123e4567-e89b-42d3-a456-426614174000",
    leaseToken: "123e4567-e89b-42d3-a456-426614174001",
    leaseExpiresAt: "2026-11-27T22:00:00Z",
    mode: "execute",
    action: "accept",
    expectedState: "new",
  };
  assert.deepEqual(validateCommand(command), command);
  for (const key of ["commandId", "leaseToken"]) {
    assert.throws(() => validateCommand({ ...command, [key]: [command[key]] }), /bridge_error/);
  }
});
