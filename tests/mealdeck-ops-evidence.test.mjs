import assert from "node:assert/strict";
import test from "node:test";
import { operationalEvidenceFresh, marketplaceHealthLabel } from "../src/lib/mealdeck-ops-evidence.ts";
const now = Date.parse("2026-11-28T07:00:00Z");
const at = (age = 0) => new Date(now - age).toISOString();
const healthy = { enabled: true, commissioned_at: at(86_400_000), last_seen_at: at(10_000), health_status: "healthy", unresolved_commands: 0 };
const label = (patch = {}, runtime = true, report = at()) => marketplaceHealthLabel({ ...healthy, ...patch }, runtime, report, now);
test("freshness rejects stale, malformed and future evidence", () => {
  for (const age of [0, 59_999, -5_000]) assert.equal(operationalEvidenceFresh(at(age), now), true);
  for (const age of [60_000, 100_000, -5_001]) assert.equal(operationalEvidenceFresh(at(age), now), false);
  for (const stamp of [null, undefined, "bad", "2026-11-28", "0"]) assert.equal(operationalEvidenceFresh(stamp, now), false);
  assert.equal(operationalEvidenceFresh(at(), NaN), false);
  assert.equal(operationalEvidenceFresh(at(), now, 0), false);
});
test("paused and disabled bridges cannot appear operational", () => {
  assert.equal(label({}, false), "Bridge paused");
  assert.equal(label({ enabled: false }), "Disabled");
  assert.equal(label({ commissioned_at: null }), "Needs setup");
  assert.equal(label({ commissioned_at: at(-6_000) }), "Needs setup");
});
test("unresolved actions take priority over a healthy heartbeat", () => {
  assert.equal(label({ unresolved_commands: 2 }), "Actions need checking");
  for (const count of [-1, 1.5, NaN]) assert.equal(label({ unresolved_commands: count }), "Report not verified");
});
test("only fresh reports with a fresh heartbeat can show recent response evidence", () => {
  assert.equal(label(), "Recent heartbeat only");
  assert.equal(label({}, true, at(60_000)), "Report needs refresh");
  assert.equal(label({ last_seen_at: at(90_000) }), "Heartbeat not verified");
  assert.equal(label({ last_seen_at: null }), "Heartbeat not verified");
  assert.equal(label({ last_seen_at: at(-6_000) }), "Heartbeat not verified");
  assert.equal(label({ health_status: "degraded" }), "Check merchant device");
});
