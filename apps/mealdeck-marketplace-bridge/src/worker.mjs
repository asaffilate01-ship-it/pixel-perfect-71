import { setTimeout as delay } from "node:timers/promises";
import { ACTIONS, errorCode, evidence, requireThat } from "./contracts.mjs";
import { CommandEngine } from "./engine.mjs";

export class BridgeWorker {
  constructor({
    config,
    adapter,
    client,
    journal,
    now = () => client.serverNow?.() ?? Date.now(),
  }) {
    this.config = config;
    this.adapter = adapter;
    this.client = client;
    this.journal = journal;
    this.now = now;
    this.engine = new CommandEngine({
      adapter,
      journal,
      observe: (order) => client.observe(order),
      now,
    });
    this.busy = false;
    this.lastHealthyAt = null;
  }
  heartbeat(status = "healthy", code) {
    return {
      evidence: evidence(this.config.profile),
      status,
      capabilities: this.adapter.capabilities(),
      observedAt: new Date(this.now()).toISOString(),
      ...(code ? { errorCode: code } : {}),
    };
  }
  async tick(signal) {
    requireThat(!this.busy, "bridge_error");
    this.busy = true;
    let ordersObserved = 0;
    let heldOrders = 0;
    let commandStatus = null;
    try {
      requireThat(!signal?.aborted, "bridge_error");
      await this.adapter.guard();
      const handshake = await this.client.heartbeat(this.heartbeat());
      const capabilities = this.adapter.capabilities();
      requireThat(
        ACTIONS.every((action) => !handshake.capabilities[action] || capabilities[action]),
        "profile_mismatch",
      );
      const orders = await this.adapter.scan();
      for (const order of orders) {
        requireThat(!signal?.aborted, "bridge_error");
        const admission = await this.client.observe(order);
        if (admission.held) heldOrders++;
        ordersObserved++;
      }
      // Observe-only mode never claims work or sends a merchant action.
      requireThat(!signal?.aborted, "bridge_error");
      if (this.config.mode === "live") {
        const command = await this.client.claim();
        if (command !== null) {
          const result = handshake.capabilities[command.action]
            ? await this.engine.run(command, { signal })
            : {
                commandId: command.commandId,
                leaseToken: command.leaseToken,
                outcome: "unsupported",
                evidence: evidence(this.config.profile),
              };
          const acknowledged = await this.client.result(result);
          commandStatus = acknowledged.status;
          requireThat(result.outcome !== "uncertain", "command_uncertain");
        }
      }
      requireThat(!signal?.aborted, "bridge_error");
      this.lastHealthyAt = new Date(this.now()).toISOString();
      const health = {
        status: "healthy",
        platform: this.config.profile.platform,
        mode: this.config.mode,
        lastTickAt: this.lastHealthyAt,
        lastHealthyAt: this.lastHealthyAt,
        ordersObserved,
        heldOrders,
        commandStatus,
      };
      await this.journal.health(health);
      return health;
    } catch (error) {
      if (signal?.aborted) {
        const health = {
          status: "stopped",
          platform: this.config.profile.platform,
          mode: this.config.mode,
          lastTickAt: new Date(this.now()).toISOString(),
          lastHealthyAt: this.lastHealthyAt,
          ordersObserved,
          heldOrders,
          commandStatus,
        };
        await this.journal.health(health);
        return health;
      }
      const code = errorCode(error);
      try {
        await this.client.heartbeat(this.heartbeat("degraded", code));
      } catch {
        /* Keep the local failure visible even when the server is unavailable. */
      }
      const health = {
        status: "degraded",
        platform: this.config.profile.platform,
        mode: this.config.mode,
        lastTickAt: new Date(this.now()).toISOString(),
        lastHealthyAt: this.lastHealthyAt,
        ordersObserved,
        heldOrders,
        commandStatus,
        errorCode: code,
      };
      await this.journal.health(health);
      return health;
    } finally {
      this.busy = false;
    }
  }
  async run(signal, report = () => {}) {
    while (!signal.aborted) {
      report(await this.tick(signal));
      try {
        await delay(this.config.pollIntervalMs, undefined, { signal });
      } catch {
        if (!signal.aborted) throw new Error("bridge_error");
      }
    }
  }
}
