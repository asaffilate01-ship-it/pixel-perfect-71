import { build } from "esbuild";
import { copyFile, mkdir, rm } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";

const appRoot = fileURLToPath(new URL("../", import.meta.url));
const output = path.join(appRoot, "www");
await rm(output, { recursive: true, force: true });
await mkdir(path.join(output, "assets"), { recursive: true });
await build({
  absWorkingDir: appRoot,
  entryPoints: ["web/main.ts"],
  outfile: "www/app.js",
  bundle: true,
  format: "esm",
  platform: "browser",
  target: ["chrome100"],
  minify: true,
  sourcemap: false,
  legalComments: "none",
});
await copyFile(path.join(appRoot, "web/index.html"), path.join(output, "index.html"));
await copyFile(
  path.resolve(appRoot, "../../src/assets/approved-logos/mealdeck.webp"),
  path.join(output, "assets/mealdeck.webp"),
);
console.log("Built the bundled, local receipt companion screen.");
