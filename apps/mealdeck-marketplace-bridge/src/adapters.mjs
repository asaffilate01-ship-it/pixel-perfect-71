import { setTimeout as delay } from "node:timers/promises";
import {
  ACTIONS,
  evidence,
  hash,
  identity,
  requireThat,
  sameIdentity,
  validateObservation,
} from "./contracts.mjs";
import { one, readField, readItems } from "./extraction.mjs";

export function orderFingerprint(order) {
  const { state, observedAt, evidence: _evidence, ...frozen } = order;
  return hash(frozen);
}

/** Selectors live in reviewed profiles; no merchant selectors are guessed in source. */
export class MerchantUiAdapter {
  constructor(transport, profile, externalStoreId, { now = Date.now } = {}) {
    this.transport = transport;
    this.profile = profile;
    this.externalStoreId = externalStoreId;
    this.now = now;
  }
  capabilities() {
    return Object.fromEntries(
      ACTIONS.map((action) => [action, this.profile.actions[action] != null]),
    );
  }
  async guard() {
    if (this.profile.environment !== "fixture" && this.profile.commissioning.expiresAt != null) {
      requireThat(
        Date.parse(this.profile.commissioning.expiresAt) > this.now(),
        "profile_mismatch",
      );
    }
    await this.transport.assertContext();
    const actualStore = await readField(this.transport, this.profile.screen.storeId);
    requireThat(actualStore === this.externalStoreId, "identity_mismatch");
    for (const guard of this.profile.screen.guards) {
      requireThat(
        (await readField(this.transport, guard.field)) === guard.equals,
        "profile_mismatch",
      );
    }
  }
  async readIdentity(root, fields = this.profile.screen.identity) {
    return identity({
      platform: this.profile.platform,
      externalStoreId: this.externalStoreId,
      externalOrderId: await readField(this.transport, fields.externalOrderId, root),
      displayReference: await readField(this.transport, fields.displayReference, root),
    });
  }
  views() {
    const screen = this.profile.screen;
    return screen.views ? screen.views.map((view) => ({ ...screen, ...view })) : [screen];
  }
  async selectView(view) {
    await this.guard();
    if (!view.navigate) return;
    let current;
    try {
      current = await readField(this.transport, view.guard.field);
    } catch {
      current = null;
    }
    if (current !== view.guard.equals) {
      const navigation = await one(this.transport, view.navigate);
      try {
        await this.transport.click(navigation);
      } finally {
        await this.transport.dispose([navigation]);
      }
      let matched = false;
      for (let attempt = 0; attempt < 20; attempt++) {
        try {
          matched = (await readField(this.transport, view.guard.field)) === view.guard.equals;
        } catch {
          matched = false;
        }
        if (matched) break;
        await delay(100);
      }
      requireThat(matched, "profile_mismatch");
    }
    await this.guard();
  }
  async list() {
    const all = new Map();
    for (const view of this.views()) {
      await this.selectView(view);
      const roots = await this.transport.find(view.orders);
      try {
        const count = await readField(this.transport, view.orderCount);
        requireThat(count === roots.length && roots.length <= 200);
        if (roots.length === 0) {
          const empty = await one(this.transport, view.empty);
          await this.transport.dispose([empty]);
        }
        const identities = [];
        for (const root of roots) identities.push(await this.readIdentity(root, view.identity));
        requireThat(
          new Set(identities.map((order) => order.externalOrderId)).size === identities.length,
          "identity_mismatch",
        );
        for (const order of identities) {
          const previous = all.get(order.externalOrderId);
          requireThat(!previous || sameIdentity(previous, order), "identity_mismatch");
          all.set(order.externalOrderId, order);
        }
        await this.guard();
      } finally {
        await this.transport.dispose(roots);
      }
    }
    requireThat(all.size <= 200);
    return [...all.values()];
  }
  async withOrder(expected, action) {
    requireThat(
      expected.platform === this.profile.platform &&
        expected.externalStoreId === this.externalStoreId,
      "identity_mismatch",
    );
    for (const view of this.views()) {
      await this.selectView(view);
      const roots = await this.transport.find(view.orders);
      let detailRoot = null;
      try {
        const matches = [];
        for (const root of roots) {
          const observed = await this.readIdentity(root, view.identity);
          if (observed.externalOrderId === expected.externalOrderId) {
            requireThat(sameIdentity(observed, expected), "identity_mismatch");
            matches.push(root);
          }
        }
        requireThat(matches.length <= 1, "identity_mismatch");
        if (matches.length === 0) continue;
        let root = matches[0];
        const detail = view.detail;
        if (detail) {
          const button = await one(this.transport, detail.open, root);
          try {
            await this.transport.click(button);
          } finally {
            await this.transport.dispose([button]);
          }
          detailRoot = await one(this.transport, detail.root);
          root = detailRoot;
        }
        const identityFields = detail?.identity ?? view.identity;
        requireThat(
          sameIdentity(await this.readIdentity(root, identityFields), expected),
          "identity_mismatch",
        );
        const result = await action(root, identityFields);
        await this.guard();
        return result;
      } finally {
        if (detailRoot !== null) {
          try {
            const close = await one(this.transport, view.detail.close);
            try {
              await this.transport.click(close);
            } finally {
              await this.transport.dispose([close]);
            }
          } finally {
            await this.transport.dispose([detailRoot]);
          }
        }
        await this.transport.dispose(roots);
      }
    }
    // Disappearance is never interpreted as acceptance, readiness, cancellation or handover.
    requireThat(false, "identity_mismatch");
  }
  async snapshot(root, identityFields) {
    const fields = this.profile.fields;
    const before = await this.readIdentity(root, identityFields);
    const observation = validateObservation({
      ...before,
      state: await readField(this.transport, fields.state, root),
      fulfilment: await readField(this.transport, fields.fulfilment, root),
      paymentResponsibility: await readField(this.transport, fields.paymentResponsibility, root),
      currency: await readField(this.transport, fields.currency, root),
      totalPence: await readField(this.transport, fields.totalPence, root),
      placedAt: await readField(this.transport, fields.placedAt, root),
      observedAt: new Date(this.now()).toISOString(),
      items: await readItems(this.transport, fields.items, root),
      notes: await readField(this.transport, fields.notes, root),
      evidence: evidence(this.profile),
    });
    requireThat(
      sameIdentity(before, await this.readIdentity(root, identityFields)),
      "identity_mismatch",
    );
    return observation;
  }
  async readOrder(expected) {
    return this.withOrder(expected, async (root, fields) => {
      const before = await this.snapshot(root, fields);
      const after = await this.snapshot(root, fields);
      requireThat(
        orderFingerprint(before) === orderFingerprint(after) && before.state === after.state,
      );
      return after;
    });
  }
  async scan() {
    const identities = await this.list();
    const orders = [];
    for (const expected of identities) orders.push(await this.readOrder(expected));
    return orders;
  }
  async readState(expected) {
    return this.withOrder(expected, async (root, fields) => {
      const before = await this.readIdentity(root, fields);
      const state = await readField(this.transport, this.profile.fields.state, root);
      requireThat(sameIdentity(before, await this.readIdentity(root, fields)), "identity_mismatch");
      return { ...before, state, observedAt: new Date(this.now()).toISOString() };
    });
  }
  async perform(command, expectedFingerprint, { signal } = {}) {
    requireThat(!signal?.aborted, "command_uncertain");
    const rule = this.profile.actions[command.action];
    requireThat(rule != null, "profile_mismatch");
    const deadline = Date.parse(command.leaseExpiresAt) - 1500;
    await this.withOrder(command, async (root, fields) => {
      const current = await this.snapshot(root, fields);
      requireThat(orderFingerprint(current) === expectedFingerprint, "observation_incomplete");
      requireThat(
        current.state === command.expectedState &&
          rule.fromStates.includes(current.state) &&
          rule.fulfilments.includes(current.fulfilment),
        "command_uncertain",
      );
      requireThat(this.now() < deadline, "command_uncertain");
      const button = await one(this.transport, rule.button, root);
      try {
        await this.guard();
        requireThat(
          sameIdentity(await this.readIdentity(root, fields), command),
          "identity_mismatch",
        );
        requireThat(
          (await readField(this.transport, this.profile.fields.state, root)) ===
            command.expectedState,
          "command_uncertain",
        );
        requireThat(!signal?.aborted, "command_uncertain");
        await this.transport.click(button, Date.now() + deadline - this.now());
      } finally {
        await this.transport.dispose([button]);
      }
      if (rule.confirmation) {
        const dialog = await one(this.transport, rule.confirmation.root);
        try {
          requireThat(
            sameIdentity(await this.readIdentity(dialog, rule.confirmation.identity), command),
            "identity_mismatch",
          );
          await this.guard();
          requireThat(this.now() < deadline, "command_uncertain");
          const confirm = await one(this.transport, rule.confirmation.button, dialog);
          try {
            requireThat(!signal?.aborted, "command_uncertain");
            await this.transport.click(confirm, Date.now() + deadline - this.now());
          } finally {
            await this.transport.dispose([confirm]);
          }
        } finally {
          await this.transport.dispose([dialog]);
        }
      }
    });
  }
}

export class UberEatsAdapter extends MerchantUiAdapter {
  constructor(transport, profile, externalStoreId, options) {
    requireThat(
      profile.platform === "uber_eats" && profile.transport === "playwright",
      "profile_mismatch",
    );
    super(transport, profile, externalStoreId, options);
  }
}
export class JustEatAdapter extends MerchantUiAdapter {
  constructor(transport, profile, externalStoreId, options) {
    requireThat(
      profile.platform === "just_eat" && profile.transport === "appium",
      "profile_mismatch",
    );
    super(transport, profile, externalStoreId, options);
  }
}
