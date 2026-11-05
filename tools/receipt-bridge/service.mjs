import { randomBytes, timingSafeEqual } from "node:crypto";
import { BridgeError, hash } from "./journal.mjs";
import { validateReceipt, encodeReceipt } from "./receipt.mjs";
import { TransportError } from "./transport.mjs";

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const now = () => new Date().toISOString();
function publicJob(job, replayed = false) {
  return {
    jobId: job.jobId,
    orderId: job.orderId,
    copyNumber: job.copyNumber,
    status: job.status,
    resolution: job.resolution ?? null,
    updatedAt: job.updatedAt,
    replayed,
    warnings: job.warnings ?? [],
  };
}
function reason(value) {
  if (
    typeof value !== "string" ||
    value.trim().length < 3 ||
    value.length > 240 ||
    /[\p{Cc}\p{Cf}]/u.test(value)
  )
    throw new BridgeError("operator_reason_required");
  return value.trim();
}

export class ReceiptBridge {
  constructor({ journal, writer, profile = {}, allowedOrigins, fetchClaimedReceipt }) {
    if (typeof fetchClaimedReceipt !== "function")
      throw new BridgeError("canonical_receipt_verifier_required", 503);
    this.journal = journal;
    this.writer = writer;
    this.profile = profile;
    this.allowedOrigins = new Set(allowedOrigins);
    this.fetchClaimedReceipt = fetchClaimedReceipt;
    this.current = null;
    this.pairing = null;
  }
  openPairing() {
    const code = randomBytes(12).toString("base64url");
    this.pairing = { digest: hash(code), expires: Date.now() + 300000, attempts: 0 };
    return code;
  }
  async pair(origin, code) {
    if (!this.allowedOrigins.has(origin)) throw new BridgeError("origin_not_allowed", 403);
    const pairing = this.pairing;
    if (!pairing || Date.now() > pairing.expires || pairing.attempts >= 5)
      throw new BridgeError("pairing_closed", 403);
    pairing.attempts++;
    if (
      typeof code !== "string" ||
      code.length > 100 ||
      !timingSafeEqual(Buffer.from(hash(code), "hex"), Buffer.from(pairing.digest, "hex"))
    )
      throw new BridgeError("pairing_code_invalid", 403);
    this.pairing = null;
    const token = await this.journal.pair(origin);
    return { bridgeId: this.journal.bridgeId, origin, token };
  }
  authorize(origin, authorization) {
    if (!this.allowedOrigins.has(origin)) throw new BridgeError("origin_not_allowed", 403);
    const match =
      typeof authorization === "string" ? /^Bearer ([A-Za-z0-9_-]{43})$/.exec(authorization) : null;
    const pairId = this.journal.authenticate(match?.[1], origin);
    if (!pairId) throw new BridgeError("pairing_required", 401);
    return pairId;
  }
  get(jobId) {
    if (!uuid.test(jobId)) throw new BridgeError("invalid_job_id");
    const job = this.journal.get(jobId);
    if (!job) throw new BridgeError("job_not_found", 404);
    return publicJob(job, true);
  }
  recovery() {
    return {
      jobs: this.journal
        .all()
        .filter((job) => job.status === "held")
        .sort((a, b) => a.createdAt.localeCompare(b.createdAt))
        .slice(0, 100)
        .map((job) => publicJob(job, true)),
    };
  }
  async submit(input, pairId, accessToken) {
    if (
      !input ||
      typeof input !== "object" ||
      Array.isArray(input) ||
      Object.keys(input).length !== 3 ||
      !["jobId", "receipt", "claimToken"].every((key) => Object.hasOwn(input, key)) ||
      !uuid.test(input.jobId) ||
      !uuid.test(input.claimToken)
    )
      throw new BridgeError("invalid_print_job");
    const browserReceipt = validateReceipt(input.receipt);
    const browserHash = hash(JSON.stringify(browserReceipt));
    const previous = this.journal.get(input.jobId);
    if (previous) {
      if (previous.payloadHash !== browserHash) throw new BridgeError("job_payload_conflict", 409);
      return publicJob(previous, true);
    }
    if (this.current) throw new BridgeError("bridge_busy_no_job_sent", 409);
    if (this.journal.all().some((job) => job.status === "held"))
      throw new BridgeError("printer_recovery_required", 409);
    this.current = input.jobId;
    try {
      // Pairing authorizes a device connection; it is not order/receipt
      // authority. Obtain the immutable claimed snapshot independently using
      // this request's short-lived staff JWT. Never persist or log that JWT.
      const receipt = validateReceipt(
        await this.fetchClaimedReceipt({
          jobId: input.jobId,
          claimToken: input.claimToken,
          accessToken,
        }),
      );
      const payloadHash = hash(JSON.stringify(receipt));
      if (browserHash !== payloadHash) throw new BridgeError("canonical_receipt_mismatch", 409);
      const rendered = encodeReceipt(receipt, this.profile);
      await this.journal.mutate((state) => {
        if (Object.keys(state.jobs).length >= 50000)
          throw new BridgeError("journal_capacity_reached", 507);
        const copies = Object.values(state.jobs).filter((job) => job.orderId === receipt.orderId);
        if (copies.some((job) => job.copyNumber === receipt.copyNumber))
          throw new BridgeError("receipt_copy_already_attempted", 409);
        if (receipt.copyNumber > 1) {
          const parent = state.jobs[receipt.reprintOf];
          const previousCopy = copies.reduce(
            (highest, job) => Math.max(highest, job.copyNumber),
            0,
          );
          if (
            !parent ||
            parent.orderId !== receipt.orderId ||
            !["printed", "not_printed"].includes(parent.resolution) ||
            receipt.copyNumber !== previousCopy + 1 ||
            copies.some((job) => !["printed", "not_printed"].includes(job.resolution))
          )
            throw new BridgeError("reprint_requires_resolved_original", 409);
        }
        const at = now();
        state.jobs[input.jobId] = {
          jobId: input.jobId,
          orderId: receipt.orderId,
          copyNumber: receipt.copyNumber,
          payloadHash,
          status: "reserved",
          resolution: null,
          createdAt: at,
          updatedAt: at,
          warnings: rendered.warnings,
          history: [
            {
              at,
              event: "reserved",
              pairId,
              reprintOf: receipt.reprintOf,
              reprintReason: receipt.reprintReason,
            },
          ],
        };
      });
      try {
        await this.writer(rendered.bytes, async () => {
          await this.transition(input.jobId, "sending", { event: "send_started", pairId });
        });
        await this.transition(input.jobId, "sent_unconfirmed", {
          event: "socket_write_finished",
          pairId,
        });
      } catch (error) {
        if (error instanceof TransportError) {
          await this.transition(input.jobId, error.attempted ? "held" : "failed", {
            event: error.code,
            pairId,
          });
        } else {
          // Any non-transport failure may include a durable-write failure. Do
          // not resend. Persist a hold if the journal is still writable;
          // otherwise its existing reserved/sending state becomes held on restart.
          if (!this.journal.failed)
            await this.transition(input.jobId, "held", {
              event: "unexpected_send_failure",
              pairId,
            });
          throw new BridgeError("print_outcome_uncertain", 503);
        }
      }
      return publicJob(this.journal.get(input.jobId));
    } finally {
      this.current = null;
    }
  }
  async transition(jobId, status, event) {
    await this.journal.mutate((state) => {
      const job = state.jobs[jobId];
      if (!job) throw new BridgeError("job_not_found", 404);
      job.status = status;
      job.updatedAt = now();
      job.history.push({ at: job.updatedAt, ...event });
    });
  }
  async resolve(jobId, input, pairId) {
    if (
      !uuid.test(jobId) ||
      !input ||
      typeof input !== "object" ||
      Object.keys(input).length !== 2 ||
      !["printed", "not_printed"].includes(input.outcome)
    )
      throw new BridgeError("invalid_print_resolution");
    const explanation = reason(input.reason);
    if (this.current === jobId) throw new BridgeError("print_send_in_progress", 409);
    await this.journal.mutate((state) => {
      const job = state.jobs[jobId];
      if (!job) throw new BridgeError("job_not_found", 404);
      if (job.resolution !== null) {
        if (job.resolution === input.outcome) return;
        throw new BridgeError("print_resolution_already_recorded", 409);
      }
      if (
        !["sent_unconfirmed", "held", "failed"].includes(job.status) ||
        (job.status === "failed" && input.outcome === "printed")
      )
        throw new BridgeError("print_resolution_not_allowed", 409);
      job.resolution = input.outcome;
      job.status = input.outcome === "printed" ? "printed" : "failed";
      job.updatedAt = now();
      job.history.push({
        at: job.updatedAt,
        event: "operator_resolution",
        pairId,
        outcome: input.outcome,
        reason: explanation,
      });
    });
    return this.get(jobId);
  }
}
