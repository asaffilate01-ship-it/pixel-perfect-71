import assert from "node:assert/strict";
import { readFileSync, writeFileSync, readdirSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { join } from "node:path";

// Source-only release preparation. No credentials, hosted database, payment,
// printer queue, APK signing identity or production deployment is changed here.
const branch = execFileSync("git", ["branch", "--show-current"], { encoding: "utf8" }).trim();
assert.equal(branch, "feat/own-driver-luton-delivery", "Use the reviewed delivery branch");
const root = "apps/mealdeck-printer";
const read = (path) => readFileSync(path, "utf8");
const save = (path, value) => writeFileSync(path, value);
for (const name of ["package.json", "package-lock.json"]) {
  const path = join(root, name);
  const value = JSON.parse(read(path));
  assert.ok(["0.2.2", "0.2.3"].includes(value.version));
  value.version = "0.2.3";
  if (name === "package-lock.json") {
    assert.ok(value.packages?.[""]);
    value.packages[""].version = "0.2.3";
  }
  save(path, JSON.stringify(value, null, 2) + "\n");
}
const gradlePath = join(root, "android/app/build.gradle");
let gradle = read(gradlePath);
assert.match(gradle, /versionCode [45]\b/);
assert.match(gradle, /versionName "0\.2\.[23]"/);
gradle = gradle.replace(/versionCode 4\b/, "versionCode 5").replace('versionName "0.2.2"', 'versionName "0.2.3"');
save(gradlePath, gradle);
const verifyPath = join(root, "scripts/verify-native.mjs");
let verify = read(verifyPath);
verify = verify.replace("/versionCode 4/", "/versionCode 5/")
  .replace('/versionName "0\\.2\\.2"/', '/versionName "0\\.2\\.3"/');
assert.ok(verify.includes("/versionCode 5/") && verify.includes('/versionName "0\\.2\\.3"/'));
save(verifyPath, verify);
function updateWebVersions(directory) {
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) updateWebVersions(path);
    else if (/\.(?:ts|html|json)$/.test(entry.name)) {
      const original = read(path);
      const next = original.replaceAll("0.2.2", "0.2.3");
      if (next !== original) save(path, next);
    }
  }
}
updateWebVersions(join(root, "web"));

// The kitchen intentionally displays flavours in bold capitals. Preserve
// quantities, full paid prices, absence of internal adjustments and immutability
// assertions, but stop expecting the superseded mixed-case rendering.
const testPath = "tests/mealdeck-kds-view.test.ts";
let test = read(testPath);
const replacements = [
  ['expect(html).toContain("Portion &amp; flavour:");', 'expect(html).toContain("FLAVOUR &amp; PORTION");'],
  ['expect(html).toContain("Korean BBQ · 3 pcs");', 'expect(html).toContain("KOREAN BBQ · 3 PCS");'],
  ['expect(html).toContain("Fiery Sweet Chilli · 3 pcs");', 'expect(html).toContain("FIERY SWEET CHILLI · 3 PCS");'],
];
for (const [oldText, newText] of replacements) {
  if (test.includes(newText)) continue;
  assert.equal(test.split(oldText).length, 2, "Expected one reviewed KDS assertion");
  test = test.replace(oldText, () => newText);
}
save(testPath, test);
console.log("Prepared printer v0.2.3/build 5 and updated intended uppercase flavour assertions. No secrets or production changes.");
