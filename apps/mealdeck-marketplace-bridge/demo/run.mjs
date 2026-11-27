import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { FixtureTransport, fixtureProfile } from "./fixture.mjs";
import { UberEatsAdapter, JustEatAdapter } from "../src/adapters.mjs";
import { CommandEngine } from "../src/engine.mjs";
import { Journal } from "../src/journal.mjs";

console.log(
  "OFFLINE DEMONSTRATION: synthetic orders, no account, network, customer, payment or merchant action.",
);
const directory = await mkdtemp(join(tmpdir(), "mealdeck-marketplace-demo-"));
try {
  for (const [platform, transport, Adapter] of [
    ["uber_eats", "appium", UberEatsAdapter],
    ["just_eat", "appium", JustEatAdapter],
    ["uber_eats", "playwright", UberEatsAdapter],
  ]) {
    const fixture = new FixtureTransport(platform);
    const profile = fixtureProfile(platform, undefined, { transport });
    const adapter = new Adapter(fixture, profile, "fixture-store");
    const journal = await Journal.open(join(directory, `${platform}-${transport}`), {
      fixture: true,
      platform,
      transport,
    });
    try {
      const engine = new CommandEngine({
        adapter,
        journal,
        observe: async () => ({ ok: true, held: false }),
      });
      const [order] = await adapter.scan();
      console.log(
        JSON.stringify({
          fixture: true,
          platform,
          transport,
          importedReference: order.displayReference,
          preservedLines: order.items.length,
        }),
      );
      for (const action of ["accept", "preparing", "ready", "handover"]) {
        const current = await adapter.readState(order);
        const command = {
          commandId: randomUUID(),
          leaseToken: randomUUID(),
          leaseExpiresAt: new Date(Date.now() + 30_000).toISOString(),
          mode: "execute",
          platform,
          externalStoreId: order.externalStoreId,
          externalOrderId: order.externalOrderId,
          displayReference: order.displayReference,
          action,
          expectedState: current.state,
        };
        const result = await engine.run(command);
        console.log(
          JSON.stringify({
            fixture: true,
            platform,
            transport,
            action,
            outcome: result.outcome,
            observedState: result.observedState,
          }),
        );
      }
    } finally {
      await journal.close();
    }
  }
} finally {
  await rm(directory, { recursive: true, force: true });
}
