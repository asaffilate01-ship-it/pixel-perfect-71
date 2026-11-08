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

// The active priced-wing ticket deliberately displays flavours in capitals.
// Keep legacy fallback and completed-history tests unchanged, as well as every
// assertion about prices, choices, quantities, checklists and input immutability.
const testPath = "tests/mealdeck-kds-view.test.ts";
const test = read(testPath);
const start = test.indexOf('  test("Tavo portion and flavour show the full dish price without the internal 51p adjustment"');
const end = test.indexOf('  test("legacy choices without kind keep food and extra quantities', start);
assert.ok(start >= 0 && end > start, "Expected the bounded priced-wing regression test");
let section = test.slice(start, end);
const replacements = [
  ['expect(html).toContain("Portion &amp; flavour:");', 'expect(html).toContain("FLAVOUR &amp; PORTION");'],
  ['expect(html).toContain("Korean BBQ · 3 pcs");', 'expect(html).toContain("KOREAN BBQ · 3 PCS");'],
  ['expect(html).toContain("Fiery Sweet Chilli · 3 pcs");', 'expect(html).toContain("FIERY SWEET CHILLI · 3 PCS");'],
];
for (const [oldText, newText] of replacements) {
  if (section.includes(newText)) continue;
  assert.equal(section.split(oldText).length, 2, "Expected one reviewed active-ticket assertion");
  section = section.replace(oldText, () => newText);
}
save(testPath, test.slice(0, start) + section + test.slice(end));
console.log("Prepared printer v0.2.3/build 5 and intended uppercase flavour assertions. No secrets or production changes.");
