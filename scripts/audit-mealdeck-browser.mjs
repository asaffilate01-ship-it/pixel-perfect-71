/** Isolated browser QA, never a production browser, customer session or payment test. */
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { mkdir, writeFile } from "node:fs/promises";
import { resolve, join } from "node:path";

const origin = "http://127.0.0.1:4173";
const packageDir = process.env.MEALDECK_BROWSER_QA_PACKAGES;
if (!packageDir) throw new Error("Set MEALDECK_BROWSER_QA_PACKAGES to the isolated tool directory.");
const require = createRequire(join(resolve(packageDir), "package.json"));
const { chromium, webkit } = require("playwright");
const axePath = require.resolve("axe-core/axe.min.js");
const output = resolve("browser-qa-results");
await mkdir(output, { recursive: true });

const profiles = [
  { name: "small-mobile", width: 320, height: 568, touch: true },
  { name: "mobile", width: 390, height: 844, touch: true },
  { name: "tablet-portrait", width: 768, height: 1024, touch: true },
  { name: "tablet-landscape", width: 1180, height: 600, touch: true },
  { name: "compact-desktop", width: 1280, height: 800, touch: false },
  { name: "desktop", width: 1440, height: 900, touch: false },
];
const routes = [
  { name: "home", path: "/" },
  { name: "menus", path: "/menus" },
  { name: "offers", path: "/offers" },
  { name: "account", path: "/account" },
  { name: "play", path: "/play" },
  { name: "strategy-game", path: "/play/tray-tactics" },
  { name: "checkout", path: "/checkout" },
];
const results = [];
const diagnostics = [];
function safeLabel(value) { return String(value).slice(0, 160).replace(/[^a-zA-Z0-9 _.,:/-]/g, "?"); }
const waitFor = async (condition, label, timeout = 7000) => {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    if (await condition()) return;
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  throw new Error(label);
};

async function privacy(page) {
  const consent = page.getByRole("button", { name: "Reject optional", exact: true });
  // The control only exists after hydration. A fresh context starts with no consent.
  if (await consent.isVisible()) await consent.click();
}
async function navigation(page, profile) {
  if (profile.width <= 1180) {
    const trigger = page.getByRole("button", { name: "Open menu", exact: true });
    const menu = page.getByRole("navigation", { name: "Mobile navigation", exact: true });
    await trigger.click();
    await menu.waitFor({ state: "visible" });
    assert.equal(await page.getByRole("button", { name: "Close menu", exact: true }).getAttribute("aria-expanded"), "true");
    assert.equal(await menu.getByRole("link", { name: "My account & preferences" }).count(), 1);
    await waitFor(() => menu.evaluate(el => el.contains(document.activeElement)), "Opening menu should focus a link");
    assert.equal(await menu.evaluate(el => el.clientHeight <= innerHeight * 0.71), true, "Menu exceeds short-screen height");
    await page.keyboard.press("Escape");
    await menu.waitFor({ state: "hidden" });
    await waitFor(() => trigger.evaluate(el => el === document.activeElement), "Escape should restore trigger focus");
    await trigger.click();
    await menu.waitFor({ state: "visible" });
    await page.setViewportSize({ width: 1440, height: 900 });
    await menu.waitFor({ state: "hidden" });
    await page.setViewportSize({ width: profile.width, height: profile.height });
    await trigger.waitFor({ state: "visible" });
    assert.equal(await trigger.getAttribute("aria-expanded"), "false");
  } else {
    const menu = page.getByRole("navigation", { name: "Main navigation", exact: true });
    await menu.getByRole("link", { name: "My account", exact: true }).waitFor({ state: "visible" });
    await menu.getByRole("link", { name: "Play games", exact: true }).waitFor({ state: "visible" });
  }
  if (profile.width < 1024) {
    const nav = page.getByRole("navigation", { name: "Primary", exact: true });
    const order = nav.getByRole("link", { name: "Click Here to Order — browse MealDeck menus" });
    await order.waitFor({ state: "visible" });
    const box = await order.boundingBox();
    assert.ok(box && box.width >= 44 && box.height >= 44, "Order button must have an adequate touch target");
  }
}
async function auditPage(page, route, profile, engine) {
  const id = engine + "-" + profile.name + "-" + route.name;
  const entry = { id, route: route.path, width: profile.width, height: profile.height, engine, structural: "passed", accessibility: [], layout: null, metrics: null };
  try {
    const response = await page.goto(origin + route.path, { waitUntil: "domcontentloaded", timeout: 30000 });
    assert.ok(response && response.status() < 400, "Page response was not successful");
    await page.locator("#mealdeck-main").waitFor({ state: "visible" });
    await page.locator("h1").first().waitFor({ state: "visible", timeout: 15000 });
    await privacy(page);
    // No reliance on networkidle: the app may legitimately poll local availability.
    await page.evaluate(async () => { await document.fonts.ready; });
    await waitFor(() => page.locator(".md-skip-link").count().then(n => n === 1), "One skip link is required");
    assert.equal(await page.locator(".md-skip-link").getAttribute("href"), "#mealdeck-main");
    if (route.name === "home") await navigation(page, profile);
    if (route.name === "play") {
      const summary = page.locator(".md-playbook > summary");
      if (await summary.isVisible()) {
        await summary.click();
        await page.getByRole("heading", { name: "Your arcade statistics", exact: true }).waitFor({ state: "visible" });
        await summary.click();
      }
    }
    entry.layout = await page.evaluate(() => ({
      viewportWidth: document.documentElement.clientWidth,
      documentWidth: document.documentElement.scrollWidth,
      bodyWidth: document.body.scrollWidth,
      horizontalOverflow: Math.max(document.documentElement.scrollWidth, document.body.scrollWidth) - document.documentElement.clientWidth,
      visibleHeadings: Array.from(document.querySelectorAll("h1")).filter(el => el.getClientRects().length > 0).length,
    }));
    // Record broad existing layout/accessibility issues for triage, rather than
    // pretending a brand-new baseline has zero violations.
    await page.addScriptTag({ path: axePath });
    const a11y = await page.evaluate(async () => {
      const report = await window.axe.run(document, { runOnly: { type: "tag", values: ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"] } });
      return report.violations.map(v => ({ id: v.id, impact: v.impact, nodeCount: v.nodes.length, help: v.help }));
    });
    entry.accessibility = a11y;
    entry.metrics = await page.evaluate(() => {
      const n = performance.getEntriesByType("navigation")[0];
      return n ? { domContentLoadedMs: Math.round(n.domContentLoadedEventEnd), loadMs: Math.round(n.loadEventEnd), responseMs: Math.round(n.responseEnd - n.requestStart) } : null;
    });
    await page.screenshot({ path: join(output, id + ".png"), animations: "disabled", fullPage: false });
  } catch (error) {
    entry.structural = "failed";
    entry.error = safeLabel(error instanceof Error ? error.message : error);
    try { await page.screenshot({ path: join(output, id + "-failure.png"), animations: "disabled" }); } catch {}
  }
  results.push(entry);
  console.log(entry.structural.toUpperCase() + " " + id + " | accessibility rules: " + entry.accessibility.length + " | horizontal overflow: " + (entry.layout?.horizontalOverflow ?? "unknown"));
}

// Chromium covers the full layout matrix. WebKit independently exercises
// small-phone and landscape-tablet viewport behavior. These are emulations,
// not evidence from actual iPhones/Android phones or installed PWAs.
for (const [engine, browserType, matrix] of [
  ["chromium", chromium, profiles],
  ["webkit", webkit, profiles.filter(p => p.name === "mobile" || p.name === "tablet-landscape")],
]) {
  const browser = await browserType.launch({ headless: true });
  try {
    for (const profile of matrix) {
      const context = await browser.newContext({
        viewport: { width: profile.width, height: profile.height },
        deviceScaleFactor: 1, hasTouch: profile.touch, reducedMotion: "reduce",
        locale: "en-GB", timezoneId: "Europe/London", serviceWorkers: "block",
      });
      // Only a localhost origin is allowed. No production credentials, sign-in,
      // purchase, provider calls or outbound tracking.
      await context.route("**/*", route => {
        const url = new URL(route.request().url());
        return url.origin === origin ? route.continue() : route.abort();
      });
      const page = await context.newPage();
      page.on("pageerror", error => diagnostics.push({ engine, profile: profile.name, kind: safeLabel(error.name) }));
      try { for (const route of routes) await auditPage(page, route, profile, engine); }
      finally { await context.close(); }
    }
  } finally { await browser.close(); }
}
const failed = results.filter(r => r.structural !== "passed");
const summary = { schemaVersion: 1, mode: "localhost-disposable", engineCases: results.length, passed: results.length - failed.length, failed: failed.length, results, diagnostics };
await writeFile(join(output, "report.json"), JSON.stringify(summary, null, 2) + "\n");
await writeFile(join(output, "summary.md"), [
  "# MealDeck browser acceptance",
  "Local development render; synthetic anonymous state; no production payments or credentials.",
  "Structural checks passed: " + summary.passed + "/" + summary.engineCases,
  "",
  "| Case | Structural | Overflow px | Axe rule violations |",
  "|---|---|---:|---:|",
  ...results.map(r => "| " + r.id + " | " + r.structural + " | " + (r.layout?.horizontalOverflow ?? "—") + " | " + r.accessibility.length + " |"),
  "",
  "Navigation timings are local diagnostic timings, not Core Web Vitals or a production speed score. Axe and overflow counts require triage; they do not certify accessibility.",
].join("\n") + "\n");
if (failed.length) process.exitCode = 1;
