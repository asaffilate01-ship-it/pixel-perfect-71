import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { errorCode, requireThat } from "./contracts.mjs";
import { loadConfig } from "./profile.mjs";
import { Journal, readHealth } from "./journal.mjs";
import { BridgeClient } from "./client.mjs";
import { openUberBrowser } from "./playwright-transport.mjs";
import { openJustEatDevice } from "./appium-transport.mjs";
import { JustEatAdapter, UberEatsAdapter } from "./adapters.mjs";
import { BridgeWorker } from "./worker.mjs";

export async function main(argv = process.argv.slice(2)) {
  const [operation, flag, path, ...rest] = argv;
  requireThat(
    ["check", "status", "run"].includes(operation) &&
      flag === "--config" &&
      path &&
      rest.length === 0,
    "profile_mismatch",
  );
  const configPath = resolve(path);
  const config = await loadConfig(configPath, { permitDisabled: operation !== "run" });
  if (operation === "status") {
    requireThat(typeof config.stateDirectory === "string", "profile_mismatch");
    const directory = resolve(configPath, "..", config.stateDirectory);
    const health = await readHealth(directory);
    console.log(
      JSON.stringify({ ...health, stale: Date.now() - Date.parse(health.lastTickAt) > 90_000 }),
    );
    return;
  }
  if (operation === "check") {
    if (config.mode === "disabled") {
      console.log(
        JSON.stringify({
          status: "unconfigured",
          mode: "disabled",
          message:
            "A reviewed UI profile and separately commissioned store connection are required.",
        }),
      );
    } else {
      new BridgeClient(config); // Validate the secret's presence and shape without displaying it or connecting.
      console.log(
        JSON.stringify({
          status: "configuration_valid",
          platform: config.profile.platform,
          mode: config.mode,
          liveConnectionVerified: false,
        }),
      );
    }
    return;
  }
  process.umask(0o077);
  const journal = await Journal.open(config.stateDirectory, {
    connectorId: config.connectorId,
    platform: config.profile.platform,
    externalStoreId: config.externalStoreId,
  });
  let transport;
  const abort = new AbortController();
  const stop = () => abort.abort();
  process.once("SIGINT", stop);
  process.once("SIGTERM", stop);
  try {
    const client = new BridgeClient(config);
    transport =
      config.profile.platform === "uber_eats"
        ? await openUberBrowser(config)
        : await openJustEatDevice(config);
    const Adapter = config.profile.platform === "uber_eats" ? UberEatsAdapter : JustEatAdapter;
    const adapter = new Adapter(transport, config.profile, config.externalStoreId, {
      now: () => client.serverNow(),
    });
    const worker = new BridgeWorker({ config, adapter, client, journal });
    let previous = "";
    await worker.run(abort.signal, (health) => {
      const status = JSON.stringify({
        status: health.status,
        platform: health.platform,
        mode: health.mode,
        errorCode: health.errorCode ?? null,
        commandStatus: health.commandStatus,
      });
      // State changes only; no order numbers, customer details, credentials or raw page errors.
      if (status !== previous) {
        console.log(status);
        previous = status;
      }
    });
  } finally {
    process.removeListener("SIGINT", stop);
    process.removeListener("SIGTERM", stop);
    try {
      await transport?.close();
    } finally {
      await journal.close();
    }
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  main().catch((error) => {
    console.error(JSON.stringify({ status: "stopped", errorCode: errorCode(error) }));
    process.exitCode = 1;
  });
}
