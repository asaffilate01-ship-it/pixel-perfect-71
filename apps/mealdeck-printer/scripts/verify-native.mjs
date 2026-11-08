import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";

const root = fileURLToPath(new URL("../", import.meta.url));
const read = (name) => readFile(path.join(root, name), "utf8");
const config = JSON.parse(await read("capacitor.config.json"));
assert.equal(config.appId, "uk.co.mealdeck.printer");
assert.equal(config.appName, "MealDeck Printer");
assert.equal(config.webDir, "www");
assert.deepEqual(config.server, { hostname: "localhost", androidScheme: "https" });
assert.equal(config.android.webContentsDebuggingEnabled, false);
assert.equal(config.android.allowMixedContent, false);
assert.equal(config.android.loggingBehavior, "none");
const manifest = await read("android/app/src/main/AndroidManifest.xml");
for (const required of [
  'android:allowBackup="false"', 'android:fullBackupContent="false"',
  'android:dataExtractionRules="@xml/data_extraction_rules"', 'android:usesCleartextTraffic="false"',
  '<package android:name="recieptservice.com.recieptservice"',
  'android:foregroundServiceType="specialUse"', 'android:name="android.permission.FOREGROUND_SERVICE_SPECIAL_USE"',
  'android:name=".ReceiptForegroundService" android:exported="false"',
]) assert.ok(manifest.includes(required), required);
assert.doesNotMatch(manifest, /BOOT_COMPLETED|RECEIVE_BOOT_COMPLETED|<receiver|android\.permission\.(CAMERA|NFC|BLUETOOTH|READ_EXTERNAL_STORAGE)/);
const backup = await read("android/app/src/main/res/xml/data_extraction_rules.xml");
for (const section of ["cloud-backup", "device-transfer"]) {
  const body = backup.split(`<${section}>`)[1]?.split(`</${section}>`)[0];
  assert.ok(body);
  for (const domain of ["root", "file", "database", "sharedpref", "external", "device_root", "device_file", "device_database", "device_sharedpref"])
    assert.ok(body.includes(`<exclude domain="${domain}" path="." />`));
}
const bundled = await read("android/app/src/main/assets/public/index.html");
for (const directive of ["connect-src 'none'", "frame-src 'none'", "object-src 'none'"]) assert.ok(bundled.includes(directive));
assert.doesNotMatch(bundled, /(?:src|href)=["']https?:\/\//i);
assert.deepEqual(JSON.parse(await read("android/app/src/main/assets/capacitor.config.json")), config);
const source = path.resolve(root, "../../tools/receipt-bridge/assets/mealdeck-thermal-logo.png");
const packaged = path.join(root, "android/app/src/main/res/drawable-nodpi/mealdeck_thermal_logo.png");
const digest = async (file) => createHash("sha256").update(await readFile(file)).digest("hex");
assert.equal(await digest(source), await digest(packaged));
const lock = JSON.parse(await read("package-lock.json"));
assert.equal(lock.packages["node_modules/@capacitor/android"].version, "8.6.0");
const gradle = await read("android/app/build.gradle");
assert.match(gradle, /versionCode 4/); assert.match(gradle, /versionName "0\.2\.2"/);
assert.doesNotMatch(gradle, /signingConfig|storePassword|keyPassword/);
const binder = await read("native/src/main/java/uk/co/mealdeck/printer/PrinterBinderWire.java");
assert.match(binder, /bitmap\.getWidth\(\) != ReceiptRenderer\.WIDTH/);
assert.match(binder, /bitmap\.getHeight\(\) > ReceiptRenderer\.MAX_HEIGHT/);
assert.match(binder, /request\.dataSize\(\) > 750_000/);
assert.match(binder, /!request\.hasFileDescriptors\(\)/);
const renderer = await read("native/src/main/java/uk/co/mealdeck/printer/ReceiptRenderer.java");
assert.match(renderer, /\.asShared\(\)/);
const runtime = await read("native/src/main/java/uk/co/mealdeck/printer/ReceiptRuntime.java");
assert.ok(runtime.indexOf("PrinterBinderWire.prepareReceipt") < runtime.indexOf('api.rpc("mealdeck_printer_begin_send"'));
assert.doesNotMatch(runtime, /printReceiptStrip|output\.strips/);
console.log("Native bundle, identity, foreground service, backup exclusions, bounded Binder protocol and unsigned release checks passed.");
