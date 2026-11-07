import { setTimeout as delay } from "node:timers/promises";
import {
  PROVES_ACTION,
  commandFingerprint,
  evidence,
  requireThat,
  sameIdentity,
  validateCommand,
} from "./contracts.mjs";
import { orderFingerprint } from "./adapters.mjs";

/** One command at a time. A durable dispatch record can only be reconciled, never clicked again. */
export class CommandEngine {
  constructor({
    adapter,
    journal,
    observe,
    now = Date.now,
    wait = delay,
    readbackTimeoutMs = 8000,
  }) {
    this.adapter = adapter;
    this.journal = journal;
    this.observe = observe;
    this.now = now;
    this.wait = wait;
    this.readbackTimeoutMs = readbackTimeoutMs;
    this.busy = false;
  }
  result(command, outcome, observed) {
    return {
      commandId: command.commandId,
      leaseToken: command.leaseToken,
      outcome,
      ...(observed
        ? {
            externalStoreId: observed.externalStoreId,
            externalOrderId: observed.externalOrderId,
            displayReference: observed.displayReference,
            observedState: observed.state,
            observedAt: observed.observedAt,
          }
        : {}),
      evidence: evidence(this.adapter.profile),
    };
  }
  proves(command, observed) {
    return (
      sameIdentity(command, observed) && PROVES_ACTION[command.action].includes(observed.state)
    );
  }
  async confirmationObservation(command) {
    const order = await this.adapter.readOrder(command);
    requireThat(this.proves(command, order), "command_uncertain");
    const admission = await this.observe(order);
    requireThat(admission?.ok === true && admission.held === false, "observation_incomplete");
    return order;
  }
  async run(rawCommand, { signal } = {}) {
    requireThat(!this.busy, "bridge_error");
    this.busy = true;
    try {
      return await this.runOnce(validateCommand(rawCommand), signal);
    } finally {
      this.busy = false;
    }
  }
  async runOnce(command, signal) {
    requireThat(
      command.platform === this.adapter.profile.platform &&
        command.externalStoreId === this.adapter.externalStoreId,
      "identity_mismatch",
    );
    const fingerprint = commandFingerprint(command);
    const previous = this.journal.get(command.commandId);
    requireThat(!previous || previous.fingerprint === fingerprint, "identity_mismatch");
    let observed;
    let dispatched = previous?.dispatched === true || command.mode === "reconcile";
    try {
      if (!dispatched && signal?.aborted)
        return await this.finish(command, fingerprint, "not_applied", undefined, false);
      // A fresh read is also required when a successful result acknowledgement was lost.
      observed = await this.adapter.readState(command);
      requireThat(sameIdentity(command, observed), "identity_mismatch");
      if (this.proves(command, observed)) {
        return await this.finish(
          command,
          fingerprint,
          "confirmed",
          await this.confirmationObservation(command),
          dispatched,
        );
      }
      if (dispatched) return await this.finish(command, fingerprint, "uncertain", observed, true);
      if (previous)
        return await this.finish(
          command,
          fingerprint,
          ["not_applied", "unsupported"].includes(previous.outcome)
            ? previous.outcome
            : "uncertain",
          observed,
          false,
        );
      if (
        Date.parse(command.leaseExpiresAt) - this.now() < 5000 ||
        observed.state === "cancelled"
      ) {
        return await this.finish(command, fingerprint, "not_applied", observed, false);
      }
      const rule = this.adapter.profile.actions[command.action];
      if (rule == null)
        return await this.finish(command, fingerprint, "unsupported", observed, false);
      if (observed.state !== command.expectedState || !rule.fromStates.includes(observed.state)) {
        return await this.finish(command, fingerprint, "not_applied", observed, false);
      }
      const order = await this.adapter.readOrder(command);
      requireThat(
        sameIdentity(command, order) && order.state === command.expectedState,
        "identity_mismatch",
      );
      if (!rule.fulfilments.includes(order.fulfilment))
        return await this.finish(command, fingerprint, "unsupported", observed, false);
      // Re-submit the complete frozen snapshot before dispatch. A changed or held order cannot be acted on.
      const admission = await this.observe(order);
      requireThat(admission?.ok === true && admission.held === false, "observation_incomplete");
      requireThat(!signal?.aborted, "command_uncertain");
      requireThat(Date.parse(command.leaseExpiresAt) - this.now() >= 5000, "command_uncertain");
      await this.journal.put(command.commandId, {
        fingerprint,
        dispatched: true,
        outcome: "uncertain",
        updatedAt: new Date(this.now()).toISOString(),
      });
      dispatched = true;
      await this.adapter.perform(command, orderFingerprint(order), { signal });
      const stop = Math.min(
        this.now() + this.readbackTimeoutMs,
        Date.parse(command.leaseExpiresAt) - 1000,
      );
      do {
        observed = await this.adapter.readState(command);
        requireThat(sameIdentity(command, observed), "identity_mismatch");
        if (this.proves(command, observed)) {
          return await this.finish(
            command,
            fingerprint,
            "confirmed",
            await this.confirmationObservation(command),
            true,
          );
        }
        if (observed.state === "cancelled" || this.now() >= stop) break;
        await this.wait(Math.min(400, Math.max(1, stop - this.now())));
      } while (this.now() <= stop);
      return await this.finish(command, fingerprint, "uncertain", observed, true);
    } catch {
      // A timeout, stale element, lost device or failed readback is not permission to click again.
      // Omit stale/partial identities from the error result.
      return await this.finish(
        command,
        fingerprint,
        dispatched ? "uncertain" : "not_applied",
        undefined,
        dispatched,
      );
    }
  }
  async finish(command, fingerprint, outcome, observed, dispatched) {
    await this.journal.put(command.commandId, {
      fingerprint,
      dispatched,
      outcome,
      updatedAt: new Date(this.now()).toISOString(),
    });
    return this.result(command, outcome, observed);
  }
}
