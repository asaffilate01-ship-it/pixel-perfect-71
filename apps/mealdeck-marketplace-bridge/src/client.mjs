import { performance } from "node:perf_hooks";
import {
  ACTIONS,
  BridgeError,
  STATES,
  UUID,
  evidence,
  requireThat,
  timestamp,
  validateCommand,
} from "./contracts.mjs";

export class BridgeClient {
  constructor(config, { environment = process.env, fetchImpl = fetch, now = Date.now } = {}) {
    this.config = config;
    this.fetch = fetchImpl;
    this.now = now;
    this.clock = null;
    const base = new URL(config.serverUrl);
    requireThat(
      base.protocol === "https:" &&
        base.pathname === "/" &&
        !base.username &&
        !base.password &&
        !base.search &&
        !base.hash,
      "profile_mismatch",
    );
    this.url = new URL("/api/marketplace/bridge", base).toString();
    this.token = environment[config.tokenEnvironment];
    requireThat(
      typeof this.token === "string" && /^[A-Za-z0-9_-]{43,128}$/.test(this.token),
      "profile_mismatch",
    );
  }
  serverNow() {
    return this.clock
      ? this.clock.serverUpperBound + performance.now() - this.clock.receivedAt
      : this.now();
  }
  async call(op, payload) {
    requireThat(["heartbeat", "observe", "claim", "result"].includes(op), "bridge_error");
    let response;
    try {
      response = await this.fetch(this.url, {
        method: "POST",
        redirect: "error",
        cache: "no-store",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${this.token}` },
        body: JSON.stringify({ op, connectorId: this.config.connectorId, payload }),
        signal: AbortSignal.timeout(15_000),
      });
      requireThat(
        response.ok && response.headers.get("content-type")?.includes("application/json"),
        "bridge_error",
      );
      const raw = await response.text();
      requireThat(Buffer.byteLength(raw) < 100_000, "bridge_error");
      return JSON.parse(raw);
    } catch (error) {
      throw error instanceof BridgeError ? error : new BridgeError("bridge_error");
    }
  }
  async heartbeat(payload) {
    const started = performance.now();
    const reply = await this.call("heartbeat", payload);
    const profile = this.config.profile;
    requireThat(
      reply.ok === true &&
        reply.enabled === true &&
        reply.platform === profile.platform &&
        reply.externalStoreId === this.config.externalStoreId &&
        reply.profileId === profile.profileId &&
        reply.profileVersion === profile.profileVersion,
      "identity_mismatch",
    );
    requireThat(
      ACTIONS.every((action) => typeof reply.capabilities?.[action] === "boolean"),
      "profile_mismatch",
    );
    const serverTime = Date.parse(timestamp(reply.serverTime));
    // Fail closed on a bad local clock; leases and freshness cannot be judged safely.
    requireThat(Math.abs(this.now() - serverTime) <= 30_000, "bridge_error");
    const receivedAt = performance.now();
    // Add the full measured round trip, so slow delivery shortens rather than extends the usable lease.
    this.clock = { serverUpperBound: serverTime + receivedAt - started, receivedAt };
    return reply;
  }
  async observe(order) {
    const reply = await this.call("observe", order);
    requireThat(
      reply.ok === true &&
        UUID.test(reply.orderId) &&
        typeof reply.held === "boolean" &&
        typeof reply.replayed === "boolean" &&
        STATES.includes(reply.platformState),
      "bridge_error",
    );
    timestamp(reply.receivedAt);
    return reply;
  }
  async claim() {
    const reply = await this.call("claim", { evidence: evidence(this.config.profile) });
    requireThat(reply && Object.hasOwn(reply, "command"), "bridge_error");
    const command = reply.command === null ? null : validateCommand(reply.command);
    requireThat(
      command === null ||
        (command.platform === this.config.profile.platform &&
          command.externalStoreId === this.config.externalStoreId),
      "identity_mismatch",
    );
    return command;
  }
  async result(result) {
    const reply = await this.call("result", result);
    requireThat(
      reply.ok === true &&
        reply.commandId === result.commandId &&
        ["confirmed", "needs_checking", "unsupported"].includes(reply.status),
      "bridge_error",
    );
    requireThat(reply.status !== "confirmed" || result.outcome === "confirmed", "bridge_error");
    return reply;
  }
}
