import { createHmac, randomInt, timingSafeEqual } from "node:crypto";

/** SERVER-ONLY. Never put codes, secrets or number plates in URLs/logs. */
export type HandoffMode = "pickup" | "kerbside" | "delivery";
export type HandoffIdentity = {
  mode: HandoffMode;
  orderId: string;
  code: string;
  vehiclePlate?: string | null;
};
const safeId = (value: string) => /^[A-Za-z0-9_-]{1,80}$/.test(value);
const validSecret = (secret: string) => Buffer.byteLength(secret, "utf8") >= 32;
const plateKey = (plate: string | null | undefined) => (plate ?? "")
  .replace(/[\s-]/g, "").toUpperCase();

export function issueHandoffCode(): string {
  return randomInt(0, 1_000_000).toString().padStart(6, "0");
}
/** HMAC binds the code to order, fulfilment mode and kerbside registration. */
export function hashHandoffProof(proof: HandoffIdentity, secret: string): string | null {
  if (!validSecret(secret) || !safeId(proof.orderId) || !/^\d{6}$/.test(proof.code)) return null;
  if (!["pickup", "kerbside", "delivery"].includes(proof.mode)) return null;
  const plate = plateKey(proof.vehiclePlate);
  if (proof.mode === "kerbside" ? !/^[A-Z0-9]{2,10}$/.test(plate) : plate.length !== 0) return null;
  const message = ["mealdeck-proof-v1", proof.orderId, proof.mode, proof.code, plate].join("|");
  return createHmac("sha256", secret).update(message).digest("hex");
}
export type HandoffDecision = { verified: boolean; reason: "verified" | "invalid" | "expired" | "locked" };
export type VerifyHandoffInput = {
  proof: HandoffIdentity;
  expectedHash: string;
  secret: string;
  nowIso: string;
  expiresAt: string;
  failedAttempts: number; // must be read & incremented under a database row lock
};
export function verifyHandoffProof(input: VerifyHandoffInput): HandoffDecision {
  const no = (reason: HandoffDecision["reason"]): HandoffDecision => ({ verified: false, reason });
  if (!Number.isSafeInteger(input.failedAttempts) || input.failedAttempts < 0) return no("invalid");
  if (input.failedAttempts >= 5) return no("locked");
  const now = Date.parse(input.nowIso);
  const expiry = Date.parse(input.expiresAt);
  if (!Number.isFinite(now) || !Number.isFinite(expiry)) return no("invalid");
  if (expiry <= now) return no("expired");
  if (!/^[a-f0-9]{64}$/.test(input.expectedHash)) return no("invalid");
  const actual = hashHandoffProof(input.proof, input.secret);
  if (actual === null) return no("invalid");
  return timingSafeEqual(Buffer.from(actual, "hex"), Buffer.from(input.expectedHash, "hex"))
    ? { verified: true, reason: "verified" }
    : no("invalid");
}
