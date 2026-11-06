import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";

const root = fileURLToPath(new URL("../", import.meta.url));
const read = (name) => readFile(path.join(root, name), "utf8");
const config = JSON.parse(await read("capacitor.config.json"));
assert.equal(config.appId, "uk.co.mealdeck.printerprobe");
assert.equal(config.webDir, "www");
assert.deepEqual(config.server, { hostname: "localhost", androidScheme: "https" });
assert.equal(config.android.webContentsDebuggingEnabled, false);
assert.equal(config.android.allowMixedContent, false);

const manifest = await read("android/app/src/main/AndroidManifest.xml");
assert.match(manifest, /android:allowBackup="false"/);
assert.match(manifest, /android:fullBackupContent="false"/);
assert.match(manifest, /android:dataExtractionRules="@xml\/data_extraction_rules"/);
assert.match(manifest, /android:usesCleartextTraffic="false"/);
assert.match(manifest, /<package android:name="recieptservice\.com\.recieptservice"/);
assert.match(manifest, /android:name="android\.permission\.INTERNET" tools:node="remove"/);
assert.doesNotMatch(manifest, /android\.intent\.action\.VIEW|<service|<receiver|<provider/);

const backup = await read("android/app/src/main/res/xml/data_extraction_rules.xml");
for (const section of ["cloud-backup", "device-transfer"]) {
  const body = backup.split(`<${section}>`)[1]?.split(`</${section}>`)[0];
  assert.ok(body);
  for (const domain of [
    "root",
    "file",
    "database",
    "sharedpref",
    "external",
    "device_root",
    "device_file",
    "device_database",
    "device_sharedpref",
  ]) {
    assert.ok(body.includes(`<exclude domain="${domain}" path="." />`));
  }
}

const bundled = await read("android/app/src/main/assets/public/index.html");
assert.match(bundled, /connect-src 'none'/);
assert.match(bundled, /frame-src 'none'/);
assert.match(bundled, /object-src 'none'/);
assert.doesNotMatch(bundled, /(?:src|href)=["']https?:\/\//i);
assert.deepEqual(
  JSON.parse(await read("android/app/src/main/assets/capacitor.config.json")),
  config,
);

const source = path.resolve(root, "../../tools/receipt-bridge/assets/mealdeck-thermal-logo.png");
const packaged = path.join(
  root,
  "android/app/src/main/res/drawable-nodpi/mealdeck_thermal_logo.png",
);
const digest = async (file) =>
  createHash("sha256")
    .update(await readFile(file))
    .digest("hex");
assert.equal(await digest(source), await digest(packaged));
assert.equal(
  JSON.parse(await read("package-lock.json")).packages["node_modules/@capacitor/core"].version,
  "8.6.0",
);
console.log(
  "Verified local-only Android configuration, excluded recovery backups, and exact approved thermal artwork.",
);
