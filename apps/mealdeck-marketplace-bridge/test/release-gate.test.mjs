import test from "node:test";
import assert from "node:assert/strict";
import { main } from "../src/cli.mjs";
import { readFile } from "node:fs/promises";

test("isolated release cannot launch or inspect live worker state", async () => {
  for (const action of ["run", "status", "observe", "live"]) {
    await assert.rejects(() => main([action, "--config", "missing-config.json"]), /profile_mismatch/);
  }
  await assert.rejects(() => main(["check", "--config", "missing-config.json", "--live"]), /profile_mismatch/);
});
test("all shipped configuration and selector profiles remain disabled", async () => {
  for (const filename of ["config.uber-eats.example.json","config.uber-eats-android.example.json","config.just-eat.example.json"]) {
    const cfg=JSON.parse(await readFile(new URL("../"+filename, import.meta.url),"utf8"));
    assert.equal(cfg.mode,"disabled");
    assert.equal(cfg.connectorId,null);
    assert.equal(cfg.externalStoreId,null);
  }
});
