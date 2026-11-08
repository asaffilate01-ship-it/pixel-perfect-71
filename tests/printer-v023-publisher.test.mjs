import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const release = readFileSync(
  new URL("../.github/workflows/publish-printer-v023.yml", import.meta.url),
  "utf8",
);
const validation = readFileSync(
  new URL("../.github/workflows/delivery-release-validation.yml", import.meta.url),
  "utf8",
);

test("H10S v0.2.3 reuses original Android signer, never creates a new key", () => {
  assert.match(release, /MEALDECK_PRINTER_ORIGINAL_KEYSTORE_BASE64/);
  assert.match(release, /MEALDECK_PRINTER_ORIGINAL_STORE_PASSWORD/);
  assert.doesNotMatch(release, /keytool -genkeypair|openssl req -newkey/);
  assert.match(release, /Signer #1 certificate SHA-256 digest:/);
  assert.match(release, /old_signer.*!=.*new_signer/);
  assert.match(release, /release-certificate\.pem/);
  assert.match(release, /versionCode='5' versionName='0\.2\.3'/);
});

test("apksigner reads separate newline-terminated store and key password files", () => {
  const writes = release.split("\n").filter((line) =>
    line.includes("printf ") && line.includes('"$STORE_PASSWORD"'),
  );
  assert.equal(writes.length, 2);
  for (const line of writes)
    assert.ok(line.includes("printf '%s" + String.fromCharCode(92) + "n'"));
  assert.ok(writes[0].includes("mealdeck-printer-original-storepass.txt"));
  assert.ok(writes[1].includes("mealdeck-printer-original-keypass.txt"));
  assert.match(release, /--ks-pass "file:\$RUNNER_TEMP\/mealdeck-printer-original-storepass\.txt"/);
  assert.match(release, /--key-pass "file:\$RUNNER_TEMP\/mealdeck-printer-original-keypass\.txt"/);
});

test("release validation checks immutable source without pushing PR edits", () => {
  assert.match(validation, /contents: read/);
  assert.match(validation, /persist-credentials: false/);
  assert.match(validation, /github\.event\.pull_request\.head\.sha \|\| github\.sha/);
  assert.doesNotMatch(validation, /git push origin|git add src tests|git commit -m/);
});
