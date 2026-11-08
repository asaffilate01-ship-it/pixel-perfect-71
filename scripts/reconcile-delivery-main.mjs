import assert from "node:assert/strict";
import { readFileSync, writeFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";

// Resolve only already-reviewed, delivery-vs-opening-offer overlaps after a
// normal Git merge has staged every nonconflicting new main change. Never use
// a generic -X ours merge: that could drop the live milkcake promotion.
const git = (...args) => execFileSync("git", args, { encoding: "utf8" }).trim();
assert.equal(git("branch", "--show-current"), "feat/own-driver-luton-delivery");
assert.equal(
  git("rev-parse", "origin/main"),
  "0632c9b11275c491f590096c8544f0af6f12ab37",
  "main advanced since conflict review: inspect its new changes before resolving",
);
const required = new Map([
  [".github/workflows/verify.yml", ["milkcake", "own-driver"]],
  ["src/components/launch-checkout.tsx", [
    "export function CheckoutPriceSummary", "milkcakeQuoteDisplayTotals",
    "One milkcake is 99p", "deliveryAddress", "Free delivery when £15+ after discount.",
  ]],
  ["src/components/menus/launch-basket.tsx", [
    "launchMenuOfferBasketDisplayPrice", "hasMilkcakeOffer", "eligible free local delivery",
  ]],
  ["src/components/menus/launch-menu-browser.tsx", [
    "launchMenuOfferBasketDisplayPrice", "hasMilkcakeOffer",
    "One milkcake per order is 99p", "deliveryLive",
  ]],
  ["src/lib/mealdeck-stripe.server.ts", ["milkcake", "delivery"]],
  ["src/components/ops/kds-panel.tsx", [
    "kdsSouvanoMainState", "kdsFlavourHighlight", "deliveryDeadlineAt",
  ]],
  ["src/components/ops/kds-completed-card.tsx", [
    "kdsSouvanoMainState", "driverHandoverAt", "deliveryAddress",
  ]],
  ["src/lib/mealdeck-kds-dish-clarity.ts", ["kdsSouvanoMainState", "Included side"]],
  ["src/lib/mealdeck-kds-flavour.ts", ["kdsFlavourHighlight", "FLAVOUR & PORTION"]],
  ["tests/mealdeck-kds-dish-clarity.test.ts", ["kdsSouvanoMainState", "Souvano"]],
  ["tests/mealdeck-kds-flavour.test.ts", ["kdsFlavourHighlight", "FLAVOUR"]],
  ["tests/mealdeck-kds-view.test.ts", ["FLAVOUR", "kds"]],
]);
const unresolved = git("diff", "--name-only", "--diff-filter=U")
  .split("\n").filter(Boolean);
if (!unresolved.length) {
  console.log("No conflicts remain; native Git merge preserves both branches.");
  process.exit(0);
}
for (const path of unresolved) {
  const invariants = required.get(path);
  if (!invariants) throw new Error("Unreviewed merge conflict: " + path);
  const ours = execFileSync("git", ["show", ":2:" + path], { encoding: "utf8" });
  const theirs = execFileSync("git", ["show", ":3:" + path], { encoding: "utf8" });
  for (const requiredText of invariants) {
    if (!ours.includes(requiredText))
      throw new Error("Reviewed source does not retain required " + requiredText + " in " + path);
  }
  // This branch has already integrated main's checkout/milkcake content into
  // the full source, not just the conflicting hunk. The Git merge itself
  // supplies all other files and every independent edit from current main.
  writeFileSync(path, ours);
  execFileSync("git", ["add", "--", path], { stdio: "inherit" });
  const digest = createHash("sha256").update(ours).digest("hex").slice(0, 16);
  console.log("Resolved reviewed main/delivery overlap: " + path + " [" + digest +
    "] (other version " + createHash("sha256").update(theirs).digest("hex").slice(0,16) + ")");
}
assert.equal(git("diff", "--name-only", "--diff-filter=U"), "",
  "Unreviewed merge conflicts remain");
console.log("Reviewed merged source keeps milkcake economics, KDS clarity and delivery.");
