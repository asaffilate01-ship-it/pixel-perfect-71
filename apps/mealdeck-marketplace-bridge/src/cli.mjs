import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { errorCode, requireThat } from "./contracts.mjs";
import { loadConfig } from "./profile.mjs";

/**
 * Isolated QA release. Real merchant connection startup is intentionally not
 * shipped at this phase. Keep the old runtime source available for fixture
 * tests and the later reviewed server/KDS integration; neither a changed
 * config nor an environment flag enables a merchant connection here.
 */
export async function main(argv = process.argv.slice(2)) {
  const [operation, flag, path, ...rest] = argv;
  requireThat(operation === "check" && flag === "--config" && path && rest.length === 0, "profile_mismatch");
  const config = await loadConfig(resolve(path), { permitDisabled: true });
  requireThat(config.mode === "disabled", "profile_mismatch");
  console.log(JSON.stringify({
    status: "unconfigured",
    mode: "disabled",
    liveConnectionVerified: false,
    message: "Fixture-only QA release. Live merchant connections are unavailable.",
  }));
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  main().catch(error => {
    console.error(JSON.stringify({ status: "stopped", errorCode: errorCode(error) }));
    process.exitCode = 1;
  });
}
