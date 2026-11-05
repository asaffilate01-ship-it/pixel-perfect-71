import { mkdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { spawnSync } from "node:child_process";

// Use the lockfile-installed SDK 56 template, not an evolving registry tag or bundled fallback.
const template = resolve("node_modules/expo-template-bare-minimum");
const version = JSON.parse(readFileSync(resolve(template, "package.json"), "utf8")).version;
if (version !== "56.0.24")
  throw new Error("Review the native template version before prebuilding.");
mkdirSync(".expo", { recursive: true });
const packed = spawnSync(
  "npm",
  ["pack", template, "--pack-destination", ".expo", "--ignore-scripts", "--json"],
  { encoding: "utf8" },
);
if (packed.status !== 0) {
  process.stderr.write(packed.stderr);
  process.exit(packed.status ?? 1);
}
const archive = JSON.parse(packed.stdout)[0].filename;
const built = spawnSync(
  process.execPath,
  [
    resolve("node_modules/expo/bin/cli"),
    "prebuild",
    "--template",
    resolve(".expo", archive),
    ...process.argv.slice(2),
  ],
  { stdio: "inherit" },
);
process.exit(built.status ?? 1);
