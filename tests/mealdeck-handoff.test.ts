import { describe, expect, test } from "bun:test";
import { hashHandoffProof, issueHandoffCode, verifyHandoffProof, type HandoffIdentity } from "../src/lib/mealdeck-handoff";
const secret = "long_server_only_cryptographic_secret_32_chars_or_more";
const proof = (change: Partial<HandoffIdentity> = {}): HandoffIdentity => ({
  orderId: "ord_1", mode: "kerbside", code: "076320", vehiclePlate: "AB12 CDE", ...change,
});
const verify = (change: Partial<Parameters<typeof verifyHandoffProof>[0]> = {}) => {
  const current = proof();
  return verifyHandoffProof({
    proof: current, expectedHash: hashHandoffProof(current, secret) ?? "",
    secret, nowIso: "2026-11-02T22:00:00Z", expiresAt: "2026-11-02T23:00:00Z",
    failedAttempts: 0, ...change,
  });
};
describe("Phase 18 proof-of-handoff safety", () => {
  test("issues six-digit cryptographically random code", () => {
    expect(issueHandoffCode()).toMatch(/^\d{6}$/);
  });
  test("binds order, mode, code and kerbside number plate", () => {
    expect(verify().verified).toBe(true);
    expect(verify({ proof: proof({ code: "999999" }) }).verified).toBe(false);
    expect(verify({ proof: proof({ orderId: "other" }) }).verified).toBe(false);
    expect(verify({ proof: proof({ mode: "pickup", vehiclePlate: null }) }).verified).toBe(false);
    expect(verify({ proof: proof({ vehiclePlate: "ZZ99ZZZ" }) }).verified).toBe(false);
  });
  test("normalises whitespace and hyphens in kerbside plate", () => {
    expect(hashHandoffProof(proof({ vehiclePlate: "ab12-cde" }), secret))
      .toBe(hashHandoffProof(proof(), secret));
  });
  test("pickup and delivery have distinct proof scopes", () => {
    const pickup = proof({ mode: "pickup", vehiclePlate: null });
    const delivery = proof({ mode: "delivery", vehiclePlate: null });
    expect(hashHandoffProof(pickup, secret)).not.toBe(hashHandoffProof(delivery, secret));
    expect(hashHandoffProof(pickup, secret)).toMatch(/^[a-f0-9]{64}$/);
  });
  test("expires and locks after five failed attempts", () => {
    expect(verify({ nowIso: "2026-11-02T23:00:00Z" }).reason).toBe("expired");
    expect(verify({ failedAttempts: 5 }).reason).toBe("locked");
    expect(verify({ failedAttempts: -1 }).reason).toBe("invalid");
  });
  test("rejects malformed code, plate, order ID and weak server secret", () => {
    expect(hashHandoffProof(proof({ code: "12345" }), secret)).toBeNull();
    expect(hashHandoffProof(proof({ vehiclePlate: "*" }), secret)).toBeNull();
    expect(hashHandoffProof(proof({ orderId: "../bad" }), secret)).toBeNull();
    expect(hashHandoffProof(proof(), "weak")).toBeNull();
  });
});
